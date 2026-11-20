-- A private link that lets the boss browse and download the files and links they
-- sent, without signing in. The owner creates it, can see when it was opened, and
-- can revoke it at any time.

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  -- 244 random bits; whoever holds it can open the page until it is revoked or expires.
  token text not null unique
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_opened_at timestamptz,
  open_count int not null default 0
);

alter table public.share_links enable row level security;
create policy owner_read on public.share_links for select to authenticated using (public.is_owner());
create policy owner_create on public.share_links for insert to authenticated with check (public.is_owner());
create policy owner_change on public.share_links for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant select on public.share_links to authenticated;
-- The token always comes from the database default; the owner chooses only the expiry.
grant insert (expires_at) on public.share_links to authenticated;
grant update (expires_at, revoked_at) on public.share_links to authenticated;
grant all on public.share_links to service_role;
