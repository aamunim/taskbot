import { decideDraft } from "./drafts.ts";
import { type Button, editMessage, type TgCallbackQuery } from "./telegram.ts";
import { db, escapeHtml, localStamp } from "./util.ts";

/** Buttons under a reminder: finish the task or be reminded again later. */
export const taskButtons = (itemId: string): Button[][] => [[
  { text: "✅ Done", data: `done:${itemId}` },
  { text: "⏰ In 1 hour", data: `sn1:${itemId}` },
  { text: "📅 Tomorrow", data: `snt:${itemId}` },
]];

/** How long a "done" pressed in Telegram waits before the boss is told, leaving time for Undo. */
const UNDO_SECONDS = 45;

/** 09:00 tomorrow in the owner's time zone, as an instant. */
function tomorrowMorning(timeZone: string): Date {
  const now = new Date();
  const local = localStamp(now, timeZone); // "YYYY-MM-DD HH:MM (...)"
  const minutesNow = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  return new Date(now.getTime() + (24 * 60 - minutesNow + 9 * 60) * 60_000);
}

/**
 * Handles a button pressed under one of the bot's private messages.
 * Returns the short text Telegram flashes to the owner.
 */
export async function handleButton(q: TgCallbackQuery): Promise<string> {
  const supabase = db();
  const { data: cfg } = await supabase.from("app_config").select("*").eq("id", 1).single();
  if (!cfg?.owner_tg_id || q.from.id !== cfg.owner_tg_id) return "This button is not for you";
  const [action, id, extra] = (q.data ?? "").split(":");
  const dm = q.message ? { chatId: q.message.chat.id, messageId: q.message.message_id } : null;
  if (!id) return "Nothing to do";

  if (action === "ds" || action === "dx") return decideDraft(id, action === "ds", dm);

  const { data: item } = await supabase.from("items")
    .select("id,title,status,type,source_sender_tg_id").eq("id", id).maybeSingle();
  if (!item) return "This task no longer exists";
  const title = escapeHtml(item.title);
  const edit = (html: string, rows: Button[][] = []) =>
    dm ? editMessage(dm.chatId, dm.messageId, html, rows).catch(() => {}) : Promise.resolve();
  const log = (summary: string) =>
    supabase.from("item_events").insert({ item_id: id, actor: "user", summary });

  if (action === "done") {
    if (item.status === "done") {
      await edit(`✅ <b>Already done</b>\n${title}`);
      return "Already done";
    }
    const { error } = await supabase.from("items").update({ status: "done", remind_at: null }).eq("id", id);
    if (error) throw error;
    await log("Marked done from Telegram");
    const tellBoss = cfg.notify_boss_done && item.type === "task" &&
      item.source_sender_tg_id !== null && item.source_sender_tg_id !== cfg.owner_tg_id;
    if (tellBoss) {
      await supabase.from("boss_notices").delete().eq("item_id", id).eq("status", "pending");
      await supabase.from("boss_notices").insert({
        item_id: id, kind: "done", send_after: new Date(Date.now() + UNDO_SECONDS * 1000).toISOString(),
      });
    }
    await edit(
      `✅ <b>Done</b>\n${title}${tellBoss ? "\nYour boss will be told in about a minute." : ""}`,
      [[{ text: "↩️ Undo", data: `undo:${id}:${item.status}` }]],
    );
    return "Marked done";
  }

  if (action === "undo") {
    const previous = ["todo", "doing", "waiting"].includes(extra ?? "") ? extra : "todo";
    await supabase.from("boss_notices").delete().eq("item_id", id).eq("status", "pending");
    const { error } = await supabase.from("items").update({ status: previous }).eq("id", id);
    if (error) throw error;
    await log("Undid the status change from Telegram");
    await edit(`↩️ <b>Undone</b>\n${title}`);
    return "Undone";
  }

  if (action === "sn1" || action === "snt") {
    const at = action === "sn1" ? new Date(Date.now() + 3600_000) : tomorrowMorning(cfg.timezone);
    const { error } = await supabase.from("items").update({ remind_at: at.toISOString() }).eq("id", id);
    if (error) throw error;
    await edit(`⏰ <b>I will remind you</b> ${localStamp(at, cfg.timezone).slice(0, 16)}\n${title}`);
    return "Reminder set";
  }
  return "Nothing to do";
}
