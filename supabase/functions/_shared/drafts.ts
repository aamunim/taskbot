import { editMessage, postInGroup, sendMessage, sendWithButtons } from "./telegram.ts";
import { db, escapeHtml } from "./util.ts";

export type DraftKind = "clarify" | "followup" | "weekly";

interface DraftInput {
  kind: DraftKind;
  itemId?: string | null;
  itemTitle?: string | null;
  chatId: number;
  replyTo?: number | null;
  text: string;
  /** Extra line for the owner, e.g. how long the task has been waiting. */
  note?: string;
}

const HEADING: Record<DraftKind, string> = {
  clarify: "❓ <b>This instruction is not clear</b>",
  followup: "⏳ <b>No reply from your boss yet</b>",
  weekly: "📊 <b>Weekly report is ready</b>",
};
const QUESTION: Record<DraftKind, string> = {
  clarify: "Ask your boss this in the group?",
  followup: "Send this reminder in the group?",
  weekly: "Post this in the group?",
};

/** Saves a message the bot could post in the group and asks the owner, privately, whether to post it. */
export async function proposeDraft(ownerTgId: number, input: DraftInput): Promise<void> {
  const { data, error } = await db().from("bot_drafts").insert({
    kind: input.kind,
    item_id: input.itemId ?? null,
    chat_id: input.chatId,
    reply_to_tg_message_id: input.replyTo ?? null,
    text: input.text,
  }).select("id").single();
  if (error) throw error;
  const lines = [
    HEADING[input.kind],
    input.itemTitle ? escapeHtml(input.itemTitle) : null,
    input.note ? escapeHtml(input.note) : null,
    "",
    QUESTION[input.kind],
    `<blockquote>${escapeHtml(input.text)}</blockquote>`,
  ].filter((l) => l !== null);
  await sendWithButtons(ownerTgId, lines.join("\n"), [[
    { text: "Send to group", data: `ds:${data.id}` },
    { text: "Skip", data: `dx:${data.id}` },
  ]]);
}

/** Posts a message in the group straight away and tells the owner it was sent (automatic mode). */
export async function sendDraftNow(ownerTgId: number, input: DraftInput): Promise<void> {
  await postInGroup(input.chatId, input.text, input.replyTo);
  await db().from("bot_drafts").insert({
    kind: input.kind,
    item_id: input.itemId ?? null,
    chat_id: input.chatId,
    reply_to_tg_message_id: input.replyTo ?? null,
    text: input.text,
    status: "sent",
    decided_at: new Date().toISOString(),
  });
  await sendMessage(ownerTgId, `📤 <b>Sent to the group for you</b>\n<blockquote>${escapeHtml(input.text)}</blockquote>`);
}

/** The owner pressed a button under a proposed draft. Returns the short text to flash in Telegram. */
export async function decideDraft(draftId: string, send: boolean, dm: { chatId: number; messageId: number } | null): Promise<string> {
  const supabase = db();
  // Only a still-proposed draft can be decided, so a double tap never posts twice.
  const { data } = await supabase.from("bot_drafts")
    .update({ status: send ? "sent" : "skipped", decided_at: new Date().toISOString() })
    .eq("id", draftId).eq("status", "proposed").select("*");
  const draft = data?.[0];
  if (!draft) return "Already handled";
  if (send) {
    try {
      await postInGroup(draft.chat_id, draft.text, draft.reply_to_tg_message_id);
    } catch (e) {
      await supabase.from("bot_drafts").update({ status: "proposed", decided_at: null }).eq("id", draftId);
      throw e;
    }
  }
  if (dm) {
    const result = send ? "📤 <b>Sent to the group</b>" : "🚫 <b>Skipped</b>";
    await editMessage(dm.chatId, dm.messageId, `${result}\n<blockquote>${escapeHtml(draft.text)}</blockquote>`).catch(() => {});
  }
  return send ? "Sent" : "Skipped";
}
