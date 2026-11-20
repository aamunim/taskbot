-- Telling the boss in the group when the owner finishes (or sends) one of their tasks.

alter table public.app_config
  add column notify_boss_done boolean not null default true,
  add column notify_boss_waiting boolean not null default false,
  add column boss_done_message text not null default '✅ Done: {task}',
  add column boss_waiting_message text not null default '📨 Sent for your review: {task}';
grant update (notify_boss_done, notify_boss_waiting, boss_done_message, boss_waiting_message)
  on public.app_config to authenticated;

-- A short queue instead of sending at once, so a mistaken tap can be undone.
create table public.boss_notices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  kind text not null check (kind in ('done', 'waiting')),
  send_after timestamptz not null default now() + interval '8 seconds',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
-- At most one message waiting per task.
create unique index boss_notices_one_pending on public.boss_notices (item_id) where status = 'pending';

alter table public.boss_notices enable row level security;
create policy owner_read on public.boss_notices for select to authenticated using (public.is_owner());
create policy owner_queue on public.boss_notices for insert to authenticated
  with check (public.is_owner() and status = 'pending');
-- Undo: only a message that has not gone out yet can be removed.
create policy owner_undo on public.boss_notices for delete to authenticated
  using (public.is_owner() and status = 'pending');
grant select, insert, delete on public.boss_notices to authenticated;
grant all on public.boss_notices to service_role;

-- Hands out the messages that are due, each exactly once.
create or replace function public.claim_boss_notices()
returns setof public.boss_notices
language sql security definer set search_path = public as $$
  update boss_notices set status = 'sending'
  where status = 'pending' and send_after <= now()
  returning *;
$$;
revoke execute on function public.claim_boss_notices() from public, anon, authenticated;
grant execute on function public.claim_boss_notices() to service_role;
