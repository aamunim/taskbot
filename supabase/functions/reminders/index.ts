import { messageLink, sendMessage } from "../_shared/telegram.ts";
import { db, escapeHtml, isAdmin, json, localDate, localStamp, localTime, recordError } from "../_shared/util.ts";

interface Task {
  waiting_since: string | null;
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
    .select("id,title,due_at,due_all_day,priority,status,waiting_since")
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
    if (t.status === "waiting") {
      // Delivered but no reply from the boss for two days: worth a nudge.
      const since = t.waiting_since ? new Date(t.waiting_since).getTime() : now.getTime();
      if (now.getTime() - since >= 2 * 86400_000 && await firstTime(`waiting:${t.id}:${t.waiting_since}`)) {
        await sendMessage(owner, `⏳ <b>Still waiting on your boss</b>\n${escapeHtml(t.title)}\nNo reply for 2 days. You may want to follow up.`);
        sent++;
      }
      continue;
    }
    if (!t.due_at) continue;
    const due = new Date(t.due_at).getTime();
    if (due > now.getTime() && due <= soon) {
      if (await firstTime(`due:${t.id}:${t.due_at}`)) {
        await sendMessage(owner, `⏰ <b>Deadline approaching</b>\n${escapeHtml(t.title)}\nDue: ${fmtDue(t)}`);
        sent++;
      }
    } else if (due <= now.getTime() && due > now.getTime() - 86400_000) {
      if (await firstTime(`overdue:${t.id}:${t.due_at}`)) {
        await sendMessage(owner, `🔴 <b>Deadline passed</b>\n${escapeHtml(t.title)}\nWas due: ${fmtDue(t)}`);
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
