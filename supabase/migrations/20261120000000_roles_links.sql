-- Who said it (boss vs. me), links shared in the chat, and favourites.

-- The boss is a Telegram user; Telegram never shows bots a phone number, so the
-- owner confirms who the boss is in the app (pre-filled with the first other sender).
alter table public.app_config add column boss_tg_id bigint, add column boss_name text;
grant update (boss_tg_id, boss_name) on public.app_config to authenticated;

-- Each item remembers who sent the message it came from.
alter table public.items add column source_sender_tg_id bigint, add column source_sender_name text;
update public.items i
  set source_sender_tg_id = m.sender_tg_id, source_sender_name = m.sender_name
  from public.messages m where m.id = i.source_message_id;
create index items_sender_idx on public.items (source_sender_tg_id);

alter table public.files add column starred boolean not null default false;
grant update (starred) on public.files to authenticated;
create policy owner_star on public.files for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create table public.links (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  url text not null,
  domain text,
  starred boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id, url)
);
alter table public.links enable row level security;
create policy owner_read on public.links for select to authenticated using (public.is_owner());
create policy owner_star on public.links for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant select on public.links to authenticated;
grant update (starred) on public.links to authenticated;
grant all on public.links to service_role;
alter default privileges in schema public grant all on tables to service_role;

-- Links in messages that were stored before this table existed.
insert into public.links (message_id, url, domain, created_at)
select m.id, u.m[1], substring(u.m[1] from '^https?://(?:www\.)?([^/:?#]+)'), m.sent_at
from public.messages m
cross join lateral regexp_matches(m.text, 'https?://[^\s<>"]+', 'g') as u(m)
where m.text is not null
on conflict do nothing;

-- People seen in the group, for choosing the boss in settings.
create or replace function public.list_senders()
returns table (tg_id bigint, name text, message_count bigint, last_seen timestamptz)
language sql stable security invoker set search_path = public as $$
  select m.sender_tg_id, (array_agg(m.sender_name order by m.sent_at desc))[1], count(*), max(m.sent_at)
  from messages m
  where m.sender_tg_id is not null and m.kind <> 'service'
  group by m.sender_tg_id
  order by count(*) desc;
$$;
grant execute on function public.list_senders() to authenticated, service_role;

alter publication supabase_realtime add table public.links;
