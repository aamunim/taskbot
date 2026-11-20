import { tg } from "./telegram.ts";
import { db, errorText } from "./util.ts";

/**
 * Posts the queued "done" / "sent" messages in the group, each as a reply to the
 * boss's original message so it is clear which task is meant.
 */
export async function flushBossNotices(): Promise<number> {
  const supabase = db();
  const { data: due, error } = await supabase.rpc("claim_boss_notices");
  if (error) throw error;
  const notices = (due ?? []) as { id: string; item_id: string; kind: "done" | "waiting" }[];
  if (!notices.length) return 0;

  const { data: cfg } = await supabase.from("app_config").select("*").eq("id", 1).single();
  let sent = 0;
  for (const notice of notices) {
    try {
      const { data: item } = await supabase.from("items")
        .select("title,status,chat_id,source_sender_tg_id,source_message_id").eq("id", notice.item_id).single();
      const enabled = notice.kind === "done" ? cfg?.notify_boss_done : cfg?.notify_boss_waiting;
      // Skip quietly when the task changed again, is the owner's own, or the setting was turned off meanwhile.
      const stillTrue = item && item.status === notice.kind;
      const fromSomeoneElse = item && item.source_sender_tg_id !== cfg?.owner_tg_id;
      if (!enabled || !stillTrue || !fromSomeoneElse || !item.chat_id) {
        await supabase.from("boss_notices").delete().eq("id", notice.id);
        continue;
      }
      const { data: source } = item.source_message_id
        ? await supabase.from("messages").select("chat_id,tg_message_id").eq("id", item.source_message_id).maybeSingle()
        : { data: null };
      const template: string = (notice.kind === "done" ? cfg.boss_done_message : cfg.boss_waiting_message) || "{task}";
      const text = (template.includes("{task}") ? template.replaceAll("{task}", item.title) : `${template} ${item.title}`).slice(0, 1000);
      await tg("sendMessage", {
        chat_id: source?.chat_id ?? item.chat_id,
        text,
        ...(source
          ? { reply_parameters: { message_id: source.tg_message_id, allow_sending_without_reply: true } }
          : {}),
      });
      await supabase.from("boss_notices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", notice.id);
      sent++;
    } catch (e) {
      await supabase.from("boss_notices").update({ status: "failed", error: errorText(e).slice(0, 500) }).eq("id", notice.id);
    }
  }
  return sent;
}
