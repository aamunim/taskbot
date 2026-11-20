-- Automation: questions and follow-ups proposed to the owner, weekly report, snoozed reminders.

alter table public.app_config
  add column clarify_enabled boolean not null default true,
  add column followup_mode text not null default 'ask' check (followup_mode in ('off', 'ask', 'auto')),
  add column followup_days int not null default 2 check (followup_days between 1 and 14),
  add column followup_message text not null default '⏳ A gentle reminder about this: {task}',
  add column weekly_report_enabled boolean not null default true,
  add column weekly_report_day int not null default 4 check (weekly_report_day between 0 and 6), -- 0 = Sunday
  add column weekly_report_time time not null default '17:00';
grant update (clarify_enabled, followup_mode, followup_days, followup_message,
              weekly_report_enabled, weekly_report_day, weekly_report_time)
  on public.app_config to authenticated;

-- "Remind me again at this time", set from the buttons under a Telegram reminder.
alter table public.items add column remind_at timestamptz;

-- A message the bot proposes to post in the group. Nothing is posted until the
-- owner approves it (or, for follow-ups, has chosen automatic sending).
create table public.bot_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('clarify', 'followup', 'weekly')),
  item_id uuid references public.items (id) on delete cascade,
  chat_id bigint not null,
  reply_to_tg_message_id bigint,
  text text not null,
  status text not null default 'proposed' check (status in ('proposed', 'sent', 'skipped')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.bot_drafts enable row level security;
create policy owner_read on public.bot_drafts for select to authenticated using (public.is_owner());
grant select on public.bot_drafts to authenticated;
grant all on public.bot_drafts to service_role;
