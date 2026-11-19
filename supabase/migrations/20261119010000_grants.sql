-- New Supabase projects no longer grant table access to the API roles
-- automatically, so every privilege is spelled out here. Row level security
-- still applies on top of these grants.

grant usage on schema public to service_role, authenticated;

-- Edge functions (service role): full access.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- The app (logged-in owner): read everything it shows, edit items and settings.
grant select on public.app_config, public.chats, public.messages, public.files,
  public.items, public.item_messages, public.item_events to authenticated;
grant insert, update, delete on public.items to authenticated;
grant insert on public.item_events to authenticated;
grant update (timezone, morning_time, remind_before_minutes, digest_enabled, notify_new_items)
  on public.app_config to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.search_all(text) to authenticated;
