import { analyse, IMAGE_MEDIA_TYPES, type Operation } from "./claude.ts";
import { transcribe } from "./elevenlabs.ts";
import { proposeDraft } from "./drafts.ts";
import { fetchLinkMeta } from "./linkmeta.ts";
import { flushBossNotices } from "./notices.ts";
import { downloadFile, MAX_DOWNLOAD_BYTES, sendMessage } from "./telegram.ts";
import { db, errorText, escapeHtml, localStamp, recordError } from "./util.ts";

const QUIET_SECONDS = 10;
const MAX_ATTEMPTS = 5;
const REVIEW_BELOW = 0.7;
/** Images larger than this are stored but not shown to the model. */
const MAX_IMAGE_BYTES = 3_500_000;
const TRANSCRIBE_KINDS = ["voice", "audio", "video_note"];

interface MessageRow {
  id: string;
  chat_id: number;
  tg_message_id: number;
  sender_tg_id: number | null;
  sender_name: string | null;
  sent_at: string;
  edited_at: string | null;
  kind: string;
  text: string | null;
  transcript: string | null;
  reply_to_tg_message_id: number | null;
  forwarded_by_tg_id: number | null;
  forwarded_by_name: string | null;
  attempts: number;
}
interface FileRow {
  id: string;
  message_id: string;
  kind: string;
  tg_file_id: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  status: string;
}
interface ItemRow {
  id: string;
  type: string;
  title: string;
  details: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  due_text: string | null;
  tags: string[];
}
type Image = { mediaType: string; base64: string };

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "file";
}

/** Processes every approved chat that has messages waiting. */
export async function processAll(): Promise<{ chats: number; messages: number }> {
  const { data, error } = await db().rpc("chats_with_pending");
  if (error) throw error;
  let messages = 0;
  const chats = (data ?? []) as number[];
  for (const chatId of chats) messages += await processChat(chatId);
  await flushBossNotices().catch((e) => console.error("boss notices failed", e));
  await fillLinkPreviews().catch((e) => console.error("link previews failed", e));
  return { chats: chats.length, messages };
}

/** Looks up title, description, image and icon for a few saved links per run. */
async function fillLinkPreviews(): Promise<void> {
  const supabase = db();
  const { data } = await supabase.from("links").select("id,url").eq("meta_status", "pending")
    .order("created_at", { ascending: false }).limit(5);
  await Promise.all((data ?? []).map(async (l) => {
    const meta = await fetchLinkMeta(l.url as string);
    await supabase.from("links").update(meta ? { ...meta, meta_status: "done" } : { meta_status: "failed" }).eq("id", l.id);
  }));
}

/** Claims and processes one chat's waiting messages. Returns how many were handled. */
export async function processChat(chatId: number): Promise<number> {
  const supabase = db();
  const { data, error } = await supabase.rpc("claim_messages", {
    p_chat: chatId,
    p_quiet_seconds: QUIET_SECONDS,
  });
  if (error) throw error;
  const batch = ((data ?? []) as MessageRow[]).sort((a, b) => a.tg_message_id - b.tg_message_id);
  if (!batch.length) return 0;

  try {
    await runBatch(chatId, batch);
    await supabase.from("messages").update({ process_status: "done", error: null })
      .in("id", batch.map((m) => m.id));
    await supabase.from("app_config").update({ last_processed_at: new Date().toISOString() }).eq("id", 1);
  } catch (e) {
    await recordError("process", e);
    // Back to the queue; the cron run retries until MAX_ATTEMPTS, then it stays visible as failed.
    for (const m of batch) {
      await supabase.from("messages").update({
        process_status: m.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        queued_at: new Date().toISOString(),
        error: errorText(e).slice(0, 1000),
      }).eq("id", m.id);
    }
  }
  return batch.length;
}

async function runBatch(chatId: number, batch: MessageRow[]): Promise<void> {
  const supabase = db();
  const ids = batch.map((m) => m.id);

  // 1. Files: copy to Storage, transcribe audio, collect images for the model.
  const { data: fileRows, error: fileErr } = await supabase.from("files").select("*").in("message_id", ids);
  if (fileErr) throw fileErr;
  const images = new Map<string, Image[]>();
  const filesByMessage = new Map<string, FileRow[]>();
  for (const f of (fileRows ?? []) as FileRow[]) {
    filesByMessage.set(f.message_id, [...(filesByMessage.get(f.message_id) ?? []), f]);
    const message = batch.find((m) => m.id === f.message_id)!;
    await handleFile(message, f, images);
  }

  // 2. Context for the model.
  const { data: cfg } = await supabase.from("app_config").select("*").eq("id", 1).single();
  const timeZone: string = cfg?.timezone ?? "Asia/Dhaka";
  const ownerTgId: number | null = cfg?.owner_tg_id ?? null;
  const bossTgId: number | null = cfg?.boss_tg_id ?? null;

  const { data: linked } = await supabase.from("item_messages").select("item_id, message_id").in("message_id", ids);
  const linkedIds = [...new Set((linked ?? []).map((l) => l.item_id as string))];
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data: recentItems, error: itemsErr } = await supabase.from("items")
    .select("id,type,title,details,status,priority,due_at,due_text,tags")
    .eq("dismissed", false)
    .or(`and(type.eq.task,status.neq.done),updated_at.gte.${since}`)
    .order("updated_at", { ascending: false }).limit(60);
  if (itemsErr) throw itemsErr;
  const items = [...((recentItems ?? []) as ItemRow[])];
  const missing = linkedIds.filter((id) => !items.some((i) => i.id === id));
  if (missing.length) {
    const { data: extra } = await supabase.from("items")
      .select("id,type,title,details,status,priority,due_at,due_text,tags").in("id", missing);
    items.push(...((extra ?? []) as ItemRow[]));
  }
  const itemRef = new Map(items.map((it, i) => [it.id, `i${i + 1}`]));
  const itemByRef = new Map(items.map((it, i) => [`i${i + 1}`, it]));

  const { data: earlier } = await supabase.from("messages")
    .select("tg_message_id,sender_tg_id,sender_name,sent_at,text,transcript,kind")
    .eq("chat_id", chatId).lt("tg_message_id", batch[0].tg_message_id)
    .not("id", "in", `(${ids.join(",")})`)
    .order("tg_message_id", { ascending: false }).limit(15);

  const who = (m: { sender_tg_id: number | null; sender_name: string | null }) =>
    `${m.sender_name ?? "Unknown"}${roleLabel(m.sender_tg_id, ownerTgId, bossTgId)}`;
  const body = (m: { text: string | null; transcript: string | null; kind: string }) =>
    [m.text, m.transcript ? `(voice transcript) ${m.transcript}` : null].filter(Boolean).join(" ") || `(${m.kind})`;

  const messageByRef = new Map(batch.map((m, i) => [`m${i + 1}`, m]));
  const tgIdToRef = new Map(batch.map((m, i) => [m.tg_message_id, `m${i + 1}`]));

  const operations = await analyse({
    nowLocal: localStamp(new Date(), timeZone),
    timeZone,
    ownerName: batch.find((m) => m.sender_tg_id === ownerTgId)?.sender_name ?? null,
    items: items.map((it) => ({
      ref: itemRef.get(it.id)!,
      summary: {
        type: it.type, title: it.title, details: it.details, status: it.status, priority: it.priority,
        due: it.due_at ? localStamp(new Date(it.due_at), timeZone) : null, tags: it.tags,
      },
    })),
    history: ((earlier ?? []) as (MessageRow)[]).reverse().map((m) =>
      `#${m.tg_message_id} ${localStamp(new Date(m.sent_at), timeZone)} ${who(m)}: ${body(m)}`
    ),
    messages: [...messageByRef].map(([ref, m]) => {
      const meta = [
        `#${m.tg_message_id}`,
        localStamp(new Date(m.sent_at), timeZone),
        who(m),
        m.edited_at ? "EDITED" : null,
        m.forwarded_by_tg_id !== null ? "forwarded by the owner" : null,
        m.reply_to_tg_message_id
          ? `reply to ${tgIdToRef.get(m.reply_to_tg_message_id) ?? `#${m.reply_to_tg_message_id}`}`
          : null,
      ].filter(Boolean).join(" | ");
      const attachments = (filesByMessage.get(m.id) ?? [])
        .map((f) => `[attached ${f.kind}: ${f.file_name ?? "unnamed"}]`).join(" ");
      const linkedItems = (linked ?? []).filter((l) => l.message_id === m.id)
        .map((l) => itemRef.get(l.item_id as string)).filter(Boolean);
      return {
        ref,
        text: [
          meta,
          linkedItems.length ? `already linked to ${linkedItems.join(", ")}` : null,
          `${body(m)} ${attachments}`.trim(),
        ].filter(Boolean).join("\n"),
        images: images.get(m.id) ?? [],
      };
    }),
  });

  // 3. Apply.
  const created: { title: string; type: string; due: string | null; review: boolean }[] = [];
  for (const op of operations) {
    const sources = op.message_refs.map((r) => messageByRef.get(r)).filter((m): m is MessageRow => !!m);
    const source = sources[0] ?? batch[0];
    const existing = op.action === "update" && op.item_ref ? itemByRef.get(op.item_ref) : undefined;
    let itemId: string;

    if (existing) {
      itemId = existing.id;
      const changes = pickChanges(op);
      if (Object.keys(changes).length) {
        const { error: upErr } = await supabase.from("items").update(changes).eq("id", itemId);
        if (upErr) throw upErr;
      }
      await supabase.from("item_events").insert({
        item_id: itemId, actor: "ai", message_id: source.id, changes,
        summary: op.change_summary ?? "Updated from a new message",
      });
    } else {
      // A create, or an update whose target could not be resolved: keep it rather than drop it.
      const unresolved = op.action === "update";
      const review = unresolved || !(op.confidence >= REVIEW_BELOW);
      const row = {
        type: op.type ?? "note",
        title: (op.title ?? op.change_summary ?? body(source)).slice(0, 300),
        details: op.details,
        status: op.status ?? "todo",
        priority: op.priority ?? "normal",
        due_at: validDate(op.due_at),
        due_all_day: op.due_all_day ?? false,
        due_text: op.due_text,
        tags: op.tags ?? [],
        keywords: op.keywords,
        confidence: op.confidence,
        needs_review: review,
        chat_id: chatId,
        source_message_id: source.id,
        source_sender_tg_id: source.sender_tg_id,
        source_sender_name: source.sender_name,
      };
      const { data: ins, error: insErr } = await supabase.from("items").insert(row).select("id").single();
      if (insErr) throw insErr;
      itemId = ins.id;
      await supabase.from("item_events").insert({
        item_id: itemId, actor: "ai", message_id: source.id, summary: "Created from a message",
      });
      const steps = row.type === "task" ? (op.subtasks ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8) : [];
      if (steps.length) {
        await supabase.from("subtasks").insert(steps.map((title, position) => ({ item_id: itemId, title: title.slice(0, 200), position })));
      }
      created.push({ title: row.title, type: row.type, due: row.due_at, review });
      const question = op.question?.trim();
      const fromBoss = source.sender_tg_id !== null && source.sender_tg_id !== ownerTgId;
      if (question && fromBoss && row.type === "task" && ownerTgId && cfg?.clarify_enabled) {
        await proposeDraft(ownerTgId, {
          kind: "clarify", itemId, itemTitle: row.title, chatId, replyTo: source.tg_message_id, text: question.slice(0, 500),
        }).catch((e) => console.error("clarify draft failed", e));
      }
    }

    const links = (sources.length ? sources : [source]).map((m) => ({ item_id: itemId, message_id: m.id }));
    await supabase.from("item_messages").upsert(links, { onConflict: "item_id,message_id", ignoreDuplicates: true });
  }

  // 4. Tell the owner privately (never in the group).
  if (created.length && ownerTgId && cfg?.notify_new_items) {
    const lines = created.map((c) => {
      const icon = c.review ? "❓" : c.type === "task" ? "📌" : "📝";
      const due = c.due ? ` — ⏰ ${localStamp(new Date(c.due), timeZone).slice(0, 16)}` : "";
      return `${icon} ${escapeHtml(c.title)}${due}`;
    });
    await sendMessage(ownerTgId, `<b>Newly added</b>\n${lines.join("\n")}`)
      .catch((e) => console.error("notify failed", e));
  }
}

/** Tells the model who is speaking. With no boss chosen yet, everyone else counts as the boss. */
function roleLabel(sender: number | null, owner: number | null, boss: number | null): string {
  if (sender === null || owner === null) return "";
  if (sender === owner) return " (owner)";
  if (boss === null || sender === boss) return " (boss)";
  return " (colleague)";
}

function validDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickChanges(op: Operation): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (op.type) c.type = op.type;
  if (op.title) c.title = op.title.slice(0, 300);
  if (op.details) c.details = op.details;
  if (op.status) c.status = op.status;
  if (op.priority) c.priority = op.priority;
  const due = validDate(op.due_at);
  if (due) {
    c.due_at = due;
    c.due_all_day = op.due_all_day ?? false;
  }
  if (op.due_text) c.due_text = op.due_text;
  if (op.tags?.length) c.tags = op.tags;
  if (op.keywords) c.keywords = op.keywords;
  return c;
}

async function handleFile(message: MessageRow, f: FileRow, images: Map<string, Image[]>): Promise<void> {
  const supabase = db();
  const isImage = f.kind === "photo" || IMAGE_MEDIA_TYPES.includes(f.mime_type ?? "");
  const needsTranscript = TRANSCRIBE_KINDS.includes(f.kind) && !message.transcript;
  if (f.status === "too_large") return;
  if (f.status === "stored" && !isImage && !needsTranscript) return;

  if ((f.size_bytes ?? 0) > MAX_DOWNLOAD_BYTES) {
    await supabase.from("files").update({ status: "too_large" }).eq("id", f.id);
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = await downloadFile(f.tg_file_id);
  } catch (e) {
    // The message itself is still analysed; the file row shows what went wrong.
    await supabase.from("files").update({ status: "failed", error: errorText(e).slice(0, 500) }).eq("id", f.id);
    return;
  }

  if (f.status !== "stored") {
    const path = `${message.chat_id}/${message.tg_message_id}/${safeName(f.file_name ?? f.id)}`;
    const { error } = await supabase.storage.from("files").upload(path, bytes, {
      contentType: f.mime_type ?? "application/octet-stream",
      upsert: true,
    });
    if (error) throw error;
    await supabase.from("files").update({ status: "stored", storage_path: path, error: null }).eq("id", f.id);
  }

  if (needsTranscript) {
    // A failure here throws, so the batch is retried rather than analysed without the voice content.
    const { text: transcript, words } = await transcribe(bytes, f.file_name ?? "audio.ogg", f.mime_type ?? "audio/ogg");
    message.transcript = transcript;
    await supabase.from("messages").update({ transcript, transcript_words: words.length ? words : null }).eq("id", message.id);
  }

  const mediaType = f.kind === "photo" ? "image/jpeg" : f.mime_type ?? "";
  if (isImage && IMAGE_MEDIA_TYPES.includes(mediaType) && bytes.length <= MAX_IMAGE_BYTES) {
    images.set(message.id, [...(images.get(message.id) ?? []), { mediaType, base64: toBase64(bytes) }]);
  }
}
