import { processChat } from "../_shared/pipeline.ts";
import {
  displayName, extractFiles, messageKind, sendMessage, type TgMessage, type TgUpdate,
} from "../_shared/telegram.ts";
import { db, json, optionalEnv, recordError, timingSafeEqual, webhookSecret } from "../_shared/util.ts";

/** Wait this long after a message before analysing, so follow-up messages join the same batch. */
const BATCH_DELAY_MS = 12_000;

Deno.serve(async (req) => {
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!timingSafeEqual(given, await webhookSecret())) return json({ error: "forbidden" }, 403);

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return json({ ok: true });
  }

  try {
    const chatToProcess = await handleUpdate(update);
    if (chatToProcess !== null) {
      EdgeRuntime.waitUntil(
        new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
          .then(() => processChat(chatToProcess))
          .catch((e) => recordError("webhook-process", e)),
      );
    }
    return json({ ok: true });
  } catch (e) {
    // Saving failed: answer 500 so Telegram delivers this update again.
    await recordError("webhook", e);
    return json({ error: "failed" }, 500);
  }
});

async function ownerId(): Promise<number | null> {
  const { data, error } = await db().from("app_config").select("owner_tg_id").eq("id", 1).single();
  if (error) throw error;
  return data.owner_tg_id ?? null;
}

async function approveChat(chatId: number): Promise<void> {
  const supabase = db();
  await supabase.from("chats").update({ approved: true }).eq("id", chatId);
  const { error } = await supabase.from("messages")
    .update({ process_status: "pending", queued_at: new Date().toISOString() })
    .eq("chat_id", chatId).eq("process_status", "held");
  if (error) throw error;
}

/** Stores the update. Returns a chat id when there is something to analyse. */
async function handleUpdate(update: TgUpdate): Promise<number | null> {
  const supabase = db();
  await supabase.from("app_config").update({ last_webhook_at: new Date().toISOString() }).eq("id", 1);

  if (update.my_chat_member) {
    const { chat, from, new_chat_member } = update.my_chat_member;
    if (chat.type === "private" || ["left", "kicked"].includes(new_chat_member.status)) return null;
    const owner = await ownerId();
    await supabase.from("chats").upsert(
      { id: chat.id, title: chat.title ?? null, type: chat.type },
      { onConflict: "id" },
    );
    if (owner && from.id === owner) await approveChat(chat.id);
    return null;
  }

  const message = update.edited_message ?? update.message;
  if (!message) return null;
  if (message.chat.type === "private") {
    await handlePrivate(message);
    return null;
  }
  if (message.chat.type !== "group" && message.chat.type !== "supergroup") return null;
  return await saveGroupMessage(message, !!update.edited_message);
}

async function saveGroupMessage(m: TgMessage, edited: boolean): Promise<number | null> {
  const supabase = db();
  const owner = await ownerId();

  const { error: chatErr } = await supabase.from("chats").upsert(
    { id: m.chat.id, title: m.chat.title ?? null, type: m.chat.type },
    { onConflict: "id" },
  );
  if (chatErr) throw chatErr;
  const { data: chat, error: readErr } = await supabase.from("chats").select("approved").eq("id", m.chat.id).single();
  if (readErr) throw readErr;
  let approved: boolean = chat.approved;

  // A chat is trusted once the owner is seen in it, or when it is the supergroup
  // an already-trusted group was upgraded to.
  if (!approved) {
    let trust = owner !== null && m.from?.id === owner;
    if (!trust && m.migrate_from_chat_id) {
      const { data: old } = await supabase.from("chats").select("approved").eq("id", m.migrate_from_chat_id).maybeSingle();
      trust = !!old?.approved;
    }
    if (trust) {
      await approveChat(m.chat.id);
      approved = true;
    }
  }

  const files = extractFiles(m);
  const kind = messageKind(m, files);
  const analysable = kind !== "service" && !m.from?.is_bot;
  const status = !analysable ? "skipped" : approved ? "pending" : "held";

  const { data: saved, error } = await supabase.from("messages").upsert({
    chat_id: m.chat.id,
    tg_message_id: m.message_id,
    sender_tg_id: m.from?.id ?? null,
    sender_name: displayName(m.from),
    sent_at: new Date(m.date * 1000).toISOString(),
    edited_at: edited && m.edit_date ? new Date(m.edit_date * 1000).toISOString() : null,
    kind,
    text: m.text ?? m.caption ?? null,
    reply_to_tg_message_id: m.reply_to_message?.message_id ?? null,
    raw: m,
    process_status: status,
    attempts: 0,
    queued_at: new Date().toISOString(),
    error: null,
  }, { onConflict: "chat_id,tg_message_id" }).select("id").single();
  if (error) throw error;

  if (files.length) {
    const { error: fileErr } = await supabase.from("files").upsert(
      files.map((f) => ({ ...f, message_id: saved.id })),
      { onConflict: "message_id,tg_file_unique_id", ignoreDuplicates: true },
    );
    if (fileErr) throw fileErr;
  }
  return status === "pending" ? m.chat.id : null;
}

async function handlePrivate(m: TgMessage): Promise<void> {
  if (!m.from) return;
  const supabase = db();
  const match = /^\/start login_([a-f0-9]{16,64})$/.exec(m.text ?? "");
  if (!match) {
    await sendMessage(m.chat.id, "আমি গ্রুপের কাজের মেসেজ গুছিয়ে রাখি। লগইন করতে অ্যাপ থেকে “Telegram দিয়ে লগইন” চাপুন।");
    return;
  }

  // Ownership: the configured id if set, otherwise the first person to log in.
  const { data: cfg, error: cfgErr } = await supabase.from("app_config").select("owner_tg_id").eq("id", 1).single();
  if (cfgErr) throw cfgErr;
  const configured = optionalEnv("OWNER_TELEGRAM_ID");
  let owner: number | null = cfg.owner_tg_id ?? null;
  if (owner === null && (!configured || configured === String(m.from.id))) {
    const { data: claimed } = await supabase.from("app_config")
      .update({ owner_tg_id: m.from.id }).eq("id", 1).is("owner_tg_id", null).select("owner_tg_id");
    if (claimed?.length) owner = m.from.id;
    else owner = (await ownerId());
  }
  if (owner !== m.from.id) {
    await sendMessage(m.chat.id, "দুঃখিত, এই বটটি অন্য একজনের ব্যক্তিগত ব্যবহারের জন্য।");
    return;
  }

  const { data: confirmed, error } = await supabase.from("login_requests")
    .update({ status: "confirmed", tg_user_id: m.from.id, tg_name: displayName(m.from) })
    .eq("code", match[1]).eq("status", "pending").gt("expires_at", new Date().toISOString())
    .select("code");
  if (error) throw error;
  await sendMessage(
    m.chat.id,
    confirmed?.length
      ? "✅ লগইন নিশ্চিত হয়েছে। এখন অ্যাপে ফিরে যান।"
      : "এই লগইন লিংকের মেয়াদ শেষ। অ্যাপ থেকে আবার চেষ্টা করুন।",
  );
}
