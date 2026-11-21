-- Messages that could not be analysed in the last few days (for example while the
-- AI account had no credit) get another chance now that the bot waits out such
-- outages instead of giving up.
update public.messages
set process_status = 'pending', attempts = 0, queued_at = now(), error = null
where process_status = 'failed' and created_at > now() - interval '5 days';

-- Let the owner be told again if one of them still cannot be analysed.
delete from public.notifications_sent where key like 'failed:%';
