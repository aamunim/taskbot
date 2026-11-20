-- Checklists, "waiting on boss", link previews, voice word timings, forwarded messages.

-- A task can now be waiting for the boss's reply after the owner has delivered it.
alter table public.items drop constraint items_status_check;
alter table public.items add constraint items_status_check
  check (status in ('todo', 'doing', 'waiting', 'done'));
alter table public.items add column waiting_since timestamptz;

create or replace function public.items_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and old.status <> 'done' then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  if new.status = 'waiting' and old.status <> 'waiting' then new.waiting_since := now(); end if;
  if new.status <> 'waiting' then new.waiting_since := null; end if;
  return new;
end $$;

-- Checklist steps inside a task.
create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index subtasks_item_idx on public.subtasks (item_id, position);
alter table public.subtasks enable row level security;
create policy owner_all on public.subtasks for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.subtasks to authenticated;
grant all on public.subtasks to service_role;

-- Link previews, filled in by the bot after the link is saved.
alter table public.links
  add column title text,
  add column description text,
  add column image_url text,
  add column favicon_url text,
  add column meta_status text not null default 'pending'; -- pending | done | failed

-- Word timings of a voice transcript: [{ "w": "word", "s": 0.0, "e": 0.4 }, ...]
alter table public.messages add column transcript_words jsonb;

-- When the owner forwards someone's message into the group, sender_* holds the
-- original author and these hold who forwarded it.
alter table public.messages add column forwarded_by_tg_id bigint, add column forwarded_by_name text;

alter publication supabase_realtime add table public.subtasks;
