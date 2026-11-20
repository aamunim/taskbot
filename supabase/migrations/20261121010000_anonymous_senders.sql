-- Messages posted as the group itself (an admin with "remain anonymous" on) or as a
-- channel used to be filed under Telegram's placeholder bot and skipped. Re-file
-- them under the chat that really sent them and queue them for analysis.
update public.messages m
set sender_tg_id = (m.raw -> 'sender_chat' ->> 'id')::bigint,
    sender_name = case
      when (m.raw -> 'sender_chat' ->> 'id')::bigint = m.chat_id
        then coalesce(m.raw -> 'sender_chat' ->> 'title', 'Group') || ' (anonymous admin)'
      else coalesce(m.raw -> 'sender_chat' ->> 'title', 'Channel')
    end,
    process_status = case
      when m.kind = 'service' then m.process_status
      when (select c.approved from public.chats c where c.id = m.chat_id) then 'pending'
      else 'held'
    end,
    attempts = 0,
    queued_at = now()
where m.raw ? 'sender_chat' and m.process_status = 'skipped';
