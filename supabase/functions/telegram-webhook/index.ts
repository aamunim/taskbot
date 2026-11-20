import { handleButton } from "../_shared/actions.ts";
import { answerQuestion } from "../_shared/ask.ts";
import { processChat } from "../_shared/pipeline.ts";
import { todayOverview } from "../_shared/overview.ts";
import {
  answerCallback, displayName, extractFiles, extractLinks, forwardOrigin, messageKind, messageSender, sendMessage, tg, type TgMessage, type TgUpdate,
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

const sameName = (a: string | null | undefined, b: string) =>
  !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

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

  if (update.callback_query) {
    const q = update.callback_query;
    // Always answer, or the button keeps spinning in Telegram.
    let flash = "Something went wrong";
    try {
      flash = await handleButton(q);
    } catch (e) {
      await recordError("button", e);
    }
    await answerCallback(q.id, flash).catch(() => {});
    return null;
  }

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

  // When the owner forwards a message the boss sent somewhere else, file it under
  // its original author so it is treated exactly like a message the boss wrote here.
  const author = messageSender(m);
  let senderId: number | null = author.id;
  let senderName = author.name;
  let forwardedBy: { id: number; name: string } | null = null;
  const origin = forwardOrigin(m);
  if (origin && m.from && owner !== null && m.from.id === owner && origin.id !== owner) {
    forwardedBy = { id: m.from.id, name: displayName(m.from) };
    senderId = origin.id;
    senderName = origin.name;
    if (senderId === null) {
      // The author hides their account when forwarded: recognise the boss by name.
      const { data: cfg } = await supabase.from("app_config").select("boss_tg_id, boss_name").eq("id", 1).single();
      if (cfg?.boss_tg_id && sameName(cfg.boss_name, origin.name)) senderId = cfg.boss_tg_id;
    }
  }

  const files = extractFiles(m);
  const kind = messageKind(m, files);
  const analysable = kind !== "service" && !author.isBot;
  const status = !analysable ? "skipped" : approved ? "pending" : "held";

  const { data: saved, error } = await supabase.from("messages").upsert({
    chat_id: m.chat.id,
    tg_message_id: m.message_id,
    sender_tg_id: senderId,
    sender_name: senderName,
    forwarded_by_tg_id: forwardedBy?.id ?? null,
    forwarded_by_name: forwardedBy?.name ?? null,
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
  const links = extractLinks(m);
  if (links.length) {
    const { error: linkErr } = await supabase.from("links").upsert(
      links.map((l) => ({ ...l, message_id: saved.id })),
      { onConflict: "message_id,url", ignoreDuplicates: true },
    );
    if (linkErr) throw linkErr;
  }

  // Until the owner chooses otherwise in the app, the first other person
  // seen in the owner's group is taken to be the boss.
  if (approved && analysable && owner !== null && !forwardedBy && author.id !== null && author.id !== owner) {
    await supabase.from("app_config")
      .update({ boss_tg_id: author.id, boss_name: author.name })
      .eq("id", 1).is("boss_tg_id", null);
  }
  // A forwarded message from a known account also tells us who the boss is, even if they never write here.
  if (approved && forwardedBy && senderId !== null) {
    await supabase.from("app_config")
      .update({ boss_tg_id: senderId, boss_name: senderName })
      .eq("id", 1).is("boss_tg_id", null);
  }
  return status === "pending" ? m.chat.id : null;
}

async function handlePrivate(m: TgMessage): Promise<void> {
  if (!m.from) return;
  const supabase = db();
  const match = /^\/start login_([a-f0-9]{16,64})$/.exec(m.text ?? "");
  if (!match) {
    const known = await ownerId();
    const text = (m.text ?? "").trim();
    if (known === null || m.from.id !== known || !text) {
      await sendMessage(m.chat.id, "I organise the work messages from your group. To sign in, tap “Continue with Telegram” in the app.");
      return;
    }
    if (/^\/(start|help)\b/.test(text)) {
      await sendMessage(m.chat.id, "Ask me anything about your tasks, for example “what is due this week?” or “what did my boss say about the budget?”.\n\n/today shows today's list.");
      return;
    }
    if (/^\/today\b/.test(text)) {
      await sendMessage(m.chat.id, await todayOverview());
      return;
    }
    // Answering takes a few seconds; reply to Telegram first and finish in the background.
    EdgeRuntime.waitUntil((async () => {
      try {
        await tg("sendChatAction", { chat_id: m.chat.id, action: "typing" }).catch(() => {});
        await tg("sendMessage", { chat_id: m.chat.id, text: (await answerQuestion(text)).slice(0, 4000) });
      } catch (e) {
        await recordError("ask", e);
        await sendMessage(m.chat.id, "Sorry, I could not answer that just now. Please try again.").catch(() => {});
      }
    })());
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
    await sendMessage(m.chat.id, "Sorry, this bot is for someone else's private use.");
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
      ? "✅ Sign-in confirmed. You can go back to the app now."
      : "This sign-in link has expired. Please try again from the app.",
  );
}
