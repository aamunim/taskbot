import { taskButtons } from "../_shared/actions.ts";
import { proposeDraft, sendDraftNow } from "../_shared/drafts.ts";
import { messageLink, sendMessage, sendWithButtons } from "../_shared/telegram.ts";
import { db, escapeHtml, isAdmin, json, localDate, localStamp, localTime, recordError } from "../_shared/util.ts";

interface Task {
  waiting_since: string | null;
  remind_at: string | null;
  chat_id: number | null;
  source_sender_tg_id: number | null;
  source_message_id: string | null;
  completed_at?: string | null;
  id: string;
  title: string;
  due_at: string | null;
  due_all_day: boolean;
  priority: string;
  status: string;
}

// Called every 5 minutes by pg_cron. Sends the owner (privately) deadline
// warnings and the morning summary. Each notification is sent at most once.
Deno.serve(async (req) => {
  if (!isAdmin(req)) return json({ error: "forbidden" }, 403);
  try {
    return json(await run());
  } catch (e) {
    await recordError("reminders", e);
    return json({ error: "failed" }, 500);
  }
});

/** True only for the first caller with this key. */
async function firstTime(key: string): Promise<boolean> {
  const { error } = await db().from("notifications_sent").insert({ key });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

async function run(): Promise<Record<string, number>> {
  const supabase = db();
  const { data: cfg, error: cfgErr } = await supabase.from("app_config").select("*").eq("id", 1).single();
  if (cfgErr) throw cfgErr;
  if (!cfg.owner_tg_id) return { sent: 0 };
  const owner: number = cfg.owner_tg_id;
  const tz: string = cfg.timezone;
  const now = new Date();
  let sent = 0;

  const { data, error } = await supabase.from("items")
    .select("id,title,due_at,due_all_day,priority,status,waiting_since,remind_at,chat_id,source_sender_tg_id,source_message_id")
    .eq("type", "task").eq("dismissed", false).neq("status", "done")
    .order("due_at", { ascending: true, nullsFirst: false }).limit(200);
  if (error) throw error;
  const tasks = (data ?? []) as Task[];
  const fmtDue = (t: Task) => {
    const s = localStamp(new Date(t.due_at!), tz);
    return t.due_all_day ? s.slice(0, 10) : s.slice(0, 16);
  };

  // Deadline approaching / just passed.
  const soon = now.getTime() + cfg.remind_before_minutes * 60_000;
  for (const t of tasks) {
    // "Remind me again" set from a reminder's buttons.
    if (t.remind_at && new Date(t.remind_at).getTime() <= now.getTime()) {
      await supabase.from("items").update({ remind_at: null }).eq("id", t.id);
      await sendWithButtons(owner, `⏰ <b>Reminder</b>\n${escapeHtml(t.title)}${t.due_at ? `\nDue: ${fmtDue(t)}` : ""}`, taskButtons(t.id));
      sent++;
    }
    if (t.status === "waiting") {
      // Delivered, but the boss has not replied for a while.
      const days: number = cfg.followup_days;
      const since = t.waiting_since ? new Date(t.waiting_since).getTime() : now.getTime();
      if (now.getTime() - since >= days * 86400_000 && await firstTime(`waiting:${t.id}:${t.waiting_since}`)) {
        const fromBoss = t.source_sender_tg_id !== null && t.source_sender_tg_id !== owner;
        const { data: source } = t.source_message_id
          ? await supabase.from("messages").select("chat_id,tg_message_id").eq("id", t.source_message_id).maybeSingle()
          : { data: null };
        const chatId: number | null = source?.chat_id ?? t.chat_id;
        if (cfg.followup_mode === "off" || !fromBoss || chatId === null) {
          await sendMessage(owner, `⏳ <b>Still waiting on your boss</b>\n${escapeHtml(t.title)}\nNo reply for ${days} days. You may want to follow up.`);
        } else {
          const template: string = cfg.followup_message || "{task}";
          const draft = {
            kind: "followup" as const, itemId: t.id, itemTitle: t.title, chatId, replyTo: source?.tg_message_id ?? null,
            text: (template.includes("{task}") ? template.replaceAll("{task}", t.title) : `${template} ${t.title}`).slice(0, 1000),
            note: `Waiting for ${days} days.`,
          };
          if (cfg.followup_mode === "auto") await sendDraftNow(owner, draft);
          else await proposeDraft(owner, draft);
        }
        sent++;
      }
      continue;
    }
    if (!t.due_at) continue;
    const due = new Date(t.due_at).getTime();
    if (due > now.getTime() && due <= soon) {
      if (await firstTime(`due:${t.id}:${t.due_at}`)) {
        await sendWithButtons(owner, `⏰ <b>Deadline approaching</b>\n${escapeHtml(t.title)}\nDue: ${fmtDue(t)}`, taskButtons(t.id));
        sent++;
      }
    } else if (due <= now.getTime() && due > now.getTime() - 86400_000) {
      if (await firstTime(`overdue:${t.id}:${t.due_at}`)) {
        await sendWithButtons(owner, `🔴 <b>Deadline passed</b>\n${escapeHtml(t.title)}\nWas due: ${fmtDue(t)}`, taskButtons(t.id));
        sent++;
      }
    }
  }

  // Morning summary, within two hours after the configured time.
  const today = localDate(now, tz);
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const sinceMorning = minutes(localTime(now, tz)) - minutes(String(cfg.morning_time));
  if (cfg.digest_enabled && sinceMorning >= 0 && sinceMorning < 120 && await firstTime(`digest:${today}`)) {
    const active = tasks.filter((t) => t.status !== "waiting");
    const overdue = active.filter((t) => t.due_at && new Date(t.due_at) < now);
    const dueToday = active.filter((t) => t.due_at && new Date(t.due_at) >= now && localDate(new Date(t.due_at), tz) === today);
    const { count: inbox } = await supabase.from("items")
      .select("id", { count: "exact", head: true }).eq("needs_review", true).eq("dismissed", false);
    const list = (ts: Task[]) => ts.slice(0, 15).map((t) => `• ${escapeHtml(t.title)} (${fmtDue(t)})`).join("\n");
    const parts = [`☀️ <b>Today's summary</b> — ${today}`];
    if (overdue.length) parts.push(`🔴 <b>Overdue (${overdue.length})</b>\n${list(overdue)}`);
    if (dueToday.length) parts.push(`📌 <b>Due today (${dueToday.length})</b>\n${list(dueToday)}`);
    if (!overdue.length && !dueToday.length) parts.push("No deadlines today.");
    parts.push(`Open tasks: ${tasks.length}${inbox ? ` · Waiting for review: ${inbox}` : ""}`);
    await sendMessage(owner, parts.join("\n\n"));
    sent++;
  }

  // Weekly report for the boss: proposed to the owner first, never posted unasked.
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const sinceReportTime = minutes(localTime(now, tz)) - minutes(String(cfg.weekly_report_time));
  if (cfg.weekly_report_enabled && weekday === cfg.weekly_report_day && sinceReportTime >= 0 && sinceReportTime < 120 && await firstTime(`weekly:${today}`)) {
    const report = await weeklyReport(owner, tasks, tz);
    if (report) {
      await proposeDraft(owner, { kind: "weekly", chatId: report.chatId, text: report.text });
      sent++;
    }
  }

  // Messages that could not be processed after every retry: say so instead of failing silently.
  const { data: failed } = await supabase.from("messages")
    .select("id,chat_id,tg_message_id").eq("process_status", "failed").limit(20);
  for (const f of failed ?? []) {
    if (await firstTime(`failed:${f.id}`)) {
      const link = messageLink(f.chat_id, f.tg_message_id);
      await sendMessage(owner, `⚠️ One message could not be analysed. The original message is saved${link ? `: ${link}` : "."}`);
      sent++;
    }
  }
  return { sent };
}

/** Plain-text summary of the week's work on the boss's tasks, and the group it belongs in. */
async function weeklyReport(owner: number, open: Task[], tz: string): Promise<{ chatId: number; text: string } | null> {
  const supabase = db();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: finished } = await supabase.from("items")
    .select("id,title,chat_id,source_sender_tg_id,completed_at")
    .eq("type", "task").eq("dismissed", false).eq("status", "done").gte("completed_at", weekAgo)
    .order("completed_at", { ascending: true }).limit(100);
  const fromBoss = <T extends { source_sender_tg_id: number | null }>(t: T) =>
    t.source_sender_tg_id !== null && t.source_sender_tg_id !== owner;
  const done = (finished ?? []).filter(fromBoss);
  const mine = open.filter(fromBoss);
  const doing = mine.filter((t) => t.status === "doing");
  const waiting = mine.filter((t) => t.status === "waiting");
  const todo = mine.filter((t) => t.status === "todo");
  if (!done.length && !mine.length) return null;
  const chatId = [...done, ...mine].map((t) => t.chat_id).find((c): c is number => c !== null);
  if (chatId === undefined) return null;

  const list = (rows: { title: string }[]) => rows.slice(0, 12).map((t) => `• ${t.title}`).join("\n") +
    (rows.length > 12 ? `\n… and ${rows.length - 12} more` : "");
  const from = localDate(new Date(Date.now() - 6 * 86400_000), tz);
  const parts = [`📊 Weekly update (${from} to ${localDate(new Date(), tz)})`];
  if (done.length) parts.push(`✅ Done (${done.length})\n${list(done)}`);
  if (doing.length) parts.push(`🔄 In progress (${doing.length})\n${list(doing)}`);
  if (waiting.length) parts.push(`⏳ Waiting for your reply (${waiting.length})\n${list(waiting)}`);
  if (todo.length) parts.push(`📌 Not started yet (${todo.length})\n${list(todo)}`);
  return { chatId, text: parts.join("\n\n") };
}
