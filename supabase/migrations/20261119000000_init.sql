-- TaskBot schema. Principle: every Telegram message is stored verbatim first,
-- AI analysis happens afterwards and never replaces the original.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- config
-- Single-row app settings. The owner is the first Telegram user who logs in.
create table public.app_config (
  id int primary key default 1 check (id = 1),
  owner_tg_id bigint,
  owner_user_id uuid,
  timezone text not null default 'Asia/Dhaka',
  morning_time time not null default '09:00',
  remind_before_minutes int not null default 120,
  digest_enabled boolean not null default true,
  notify_new_items boolean not null default true,
  last_webhook_at timestamptz,
  last_processed_at timestamptz,
  last_error text,
  last_error_at timestamptz
);
insert into public.app_config default values;

-- Service-role only (RLS on, no policies): function URL + cron secret.
create table public.internal_config (
  key text primary key,
  value text not null
);

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_config where owner_user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- telegram
create table public.chats (
  id bigint primary key,
  title text,
  type text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null references public.chats (id) on delete cascade,
  tg_message_id bigint not null,
  sender_tg_id bigint,
  sender_name text,
  sent_at timestamptz not null,
  edited_at timestamptz,
  kind text not null default 'text',
  text text,
  transcript text,
  reply_to_tg_message_id bigint,
  raw jsonb not null,
  -- held: chat not approved yet | pending | processing | done | failed | skipped
  process_status text not null default 'pending',
  attempts int not null default 0,
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (chat_id, tg_message_id)
);
create index messages_status_idx on public.messages (process_status, chat_id);
create index messages_chat_sent_idx on public.messages (chat_id, sent_at desc);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  kind text not null, -- photo | document | voice | audio | video | video_note | animation
  tg_file_id text not null,
  tg_file_unique_id text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  duration_seconds int,
  storage_path text,
  status text not null default 'pending', -- pending | stored | too_large | failed
  error text,
  created_at timestamptz not null default now(),
  unique (message_id, tg_file_unique_id)
);

-- ---------------------------------------------------------------- items
create table public.items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('task', 'note')),
  title text not null,
  details text,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  due_all_day boolean not null default false,
  due_text text,
  tags text[] not null default '{}',
  keywords text,
  needs_review boolean not null default false,
  confidence real,
  dismissed boolean not null default false,
  pinned boolean not null default false,
  user_note text,
  chat_id bigint references public.chats (id) on delete set null,
  source_message_id uuid references public.messages (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_list_idx on public.items (type, dismissed, status, due_at);

create table public.item_messages (
  item_id uuid not null references public.items (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  primary key (item_id, message_id)
);

create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  actor text not null check (actor in ('ai', 'user')),
  summary text not null,
  changes jsonb,
  message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);
create index item_events_item_idx on public.item_events (item_id, created_at);

create or replace function public.items_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and old.status <> 'done' then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger items_touch before update on public.items
  for each row execute function public.items_touch();

-- ---------------------------------------------------------------- auth / reminders
create table public.login_requests (
  code text primary key,
  secret_hash text not null,
  status text not null default 'pending', -- pending | confirmed | used
  tg_user_id bigint,
  tg_name text,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

create table public.notifications_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- queue
-- Atomically claims a chat's pending messages, but only once the chat has been
-- quiet for p_quiet_seconds, so a burst of short messages is analysed together.
create or replace function public.claim_messages(p_chat bigint, p_quiet_seconds int default 10)
returns setof public.messages
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from messages
    where chat_id = p_chat and process_status = 'pending'
      and queued_at > now() - make_interval(secs => p_quiet_seconds)
  ) then
    return;
  end if;
  return query
    update messages
    set process_status = 'processing', attempts = attempts + 1, claimed_at = now()
    where chat_id = p_chat and attempts < 5
      and (process_status = 'pending'
           or (process_status = 'processing' and claimed_at < now() - interval '5 minutes'))
    returning *;
end $$;

create or replace function public.chats_with_pending()
returns setof bigint
language sql security definer set search_path = public as $$
  select distinct m.chat_id from messages m join chats c on c.id = m.chat_id
  where c.approved and m.attempts < 5
    and (m.process_status = 'pending'
         or (m.process_status = 'processing' and m.claimed_at < now() - interval '5 minutes'));
$$;

-- Search across items and the original messages (incl. voice transcripts).
create or replace function public.search_all(q text)
returns table (
  kind text, item_id uuid, message_id uuid, title text, snippet text, at timestamptz
)
language sql stable security invoker set search_path = public as $$
  with p as (select '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat)
  select i.type, i.id, i.source_message_id, i.title, i.details, i.created_at
  from items i, p
  where not i.dismissed
    and (i.title ilike p.pat or i.details ilike p.pat or i.keywords ilike p.pat
         or i.user_note ilike p.pat or array_to_string(i.tags, ' ') ilike p.pat)
  union all
  select 'message', (select im.item_id from item_messages im where im.message_id = m.id limit 1),
         m.id, coalesce(m.sender_name, ''), coalesce(m.text, m.transcript), m.sent_at
  from messages m, p
  where m.text ilike p.pat or m.transcript ilike p.pat
  union all
  select 'file', (select im.item_id from item_messages im where im.message_id = f.message_id limit 1),
         f.message_id, f.file_name, f.kind, f.created_at
  from files f, p
  where f.file_name ilike p.pat
  order by 6 desc
  limit 100;
$$;

-- ---------------------------------------------------------------- cron
create or replace function public.invoke_function(fn text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  base text;
  secret text;
begin
  select value into base from internal_config where key = 'functions_url';
  select value into secret from internal_config where key = 'admin_secret';
  if base is null or secret is null then return; end if;
  perform net.http_post(
    url := base || '/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-admin-secret', secret),
    body := '{}'::jsonb
  );
end $$;

revoke execute on function public.invoke_function(text) from public, anon, authenticated;
revoke execute on function public.claim_messages(bigint, int) from public, anon, authenticated;
revoke execute on function public.chats_with_pending() from public, anon, authenticated;
grant execute on function public.claim_messages(bigint, int) to service_role;
grant execute on function public.chats_with_pending() to service_role;

select cron.schedule('taskbot-process', '* * * * *', $$select public.invoke_function('process')$$);
select cron.schedule('taskbot-reminders', '*/5 * * * *', $$select public.invoke_function('reminders')$$);

-- ---------------------------------------------------------------- RLS
alter table public.app_config enable row level security;
alter table public.internal_config enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;
alter table public.items enable row level security;
alter table public.item_messages enable row level security;
alter table public.item_events enable row level security;
alter table public.login_requests enable row level security;
alter table public.notifications_sent enable row level security;

create policy owner_read on public.app_config for select to authenticated using (public.is_owner());
create policy owner_update on public.app_config for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
revoke update on public.app_config from authenticated, anon;
grant update (timezone, morning_time, remind_before_minutes, digest_enabled, notify_new_items)
  on public.app_config to authenticated;

create policy owner_read on public.chats for select to authenticated using (public.is_owner());
create policy owner_read on public.messages for select to authenticated using (public.is_owner());
create policy owner_read on public.files for select to authenticated using (public.is_owner());
create policy owner_read on public.item_messages for select to authenticated using (public.is_owner());
create policy owner_all on public.items for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy owner_read on public.item_events for select to authenticated using (public.is_owner());
create policy owner_insert on public.item_events for insert to authenticated
  with check (public.is_owner() and actor = 'user');

-- ---------------------------------------------------------------- storage + realtime
insert into storage.buckets (id, name, public) values ('files', 'files', false)
  on conflict (id) do nothing;
create policy taskbot_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.is_owner());

alter publication supabase_realtime add table public.items, public.messages, public.files;
