-- What each AI call cost, so spending can be seen in the app instead of guessed.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  kind text not null, -- analyse | ask | triage
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12, 6), -- null when the model's price is not known to the bot
  created_at timestamptz not null default now()
);
create index ai_usage_time_idx on public.ai_usage (created_at);
alter table public.ai_usage enable row level security;
create policy owner_read on public.ai_usage for select to authenticated using (public.is_owner());
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;
grant usage on all sequences in schema public to service_role;

-- Totals for the settings screen, in the owner's time zone.
create or replace function public.ai_usage_summary()
returns table (period text, calls bigint, cost_usd numeric, input_tokens bigint, output_tokens bigint)
language sql stable security invoker set search_path = public as $$
  with tz as (select timezone as name from app_config where id = 1),
  u as (select a.*, (a.created_at at time zone (select name from tz)) as local_at from ai_usage a
        where a.created_at > now() - interval '40 days'),
  today as (select (now() at time zone (select name from tz))::date as d)
  select 'today', count(*), coalesce(sum(u.cost_usd), 0), coalesce(sum(u.input_tokens), 0), coalesce(sum(u.output_tokens), 0)
    from u, today where u.local_at::date = today.d
  union all
  select 'last_7_days', count(*), coalesce(sum(u.cost_usd), 0), coalesce(sum(u.input_tokens), 0), coalesce(sum(u.output_tokens), 0)
    from u, today where u.local_at::date > today.d - 7
  union all
  select 'this_month', count(*), coalesce(sum(u.cost_usd), 0), coalesce(sum(u.input_tokens), 0), coalesce(sum(u.output_tokens), 0)
    from u, today where date_trunc('month', u.local_at) = date_trunc('month', today.d::timestamp);
$$;
grant execute on function public.ai_usage_summary() to authenticated;

-- Optional saver: a small, cheap model first decides whether new messages contain
-- anything for the tracker; only then is the main model called.
alter table public.app_config add column economy_mode boolean not null default false;
grant update (economy_mode) on public.app_config to authenticated;
