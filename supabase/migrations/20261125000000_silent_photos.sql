-- Photos sent with no message (for example screenshots passed from phone to
-- computer through the group) are only filed in the library; the AI does not read
-- them unless this is turned on.
alter table public.app_config add column read_silent_photos boolean not null default false;
grant update (read_silent_photos) on public.app_config to authenticated;
