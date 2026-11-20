import { db, escapeHtml, localDate, localStamp } from "./util.ts";

/** Today's list for the /today command: overdue, due today, and what is waiting on the boss. */
export async function todayOverview(): Promise<string> {
  const supabase = db();
  const { data: cfg } = await supabase.from("app_config").select("timezone").eq("id", 1).single();
  const tz: string = cfg?.timezone ?? "Asia/Dhaka";
  const { data } = await supabase.from("items")
    .select("title,due_at,due_all_day,status")
    .eq("type", "task").eq("dismissed", false).neq("status", "done")
    .order("due_at", { ascending: true, nullsFirst: false }).limit(200);
  const tasks = data ?? [];
  const now = new Date();
  const today = localDate(now, tz);
  const due = (t: { due_at: string | null; due_all_day: boolean }) =>
    t.due_at ? localStamp(new Date(t.due_at), tz).slice(0, t.due_all_day ? 10 : 16) : "";
  const line = (t: { title: string; due_at: string | null; due_all_day: boolean }) =>
    `• ${escapeHtml(t.title)}${t.due_at ? ` (${due(t)})` : ""}`;
  const active = tasks.filter((t) => t.status !== "waiting");
  const overdue = active.filter((t) => t.due_at && new Date(t.due_at) < now);
  const dueToday = active.filter((t) => t.due_at && new Date(t.due_at) >= now && localDate(new Date(t.due_at), tz) === today);
  const waiting = tasks.filter((t) => t.status === "waiting");
  const parts = [`📋 <b>Today</b> — ${today}`];
  if (overdue.length) parts.push(`🔴 <b>Overdue (${overdue.length})</b>\n${overdue.slice(0, 15).map(line).join("\n")}`);
  if (dueToday.length) parts.push(`📌 <b>Due today (${dueToday.length})</b>\n${dueToday.slice(0, 15).map(line).join("\n")}`);
  if (waiting.length) parts.push(`⏳ <b>Waiting on your boss (${waiting.length})</b>\n${waiting.slice(0, 10).map(line).join("\n")}`);
  if (parts.length === 1) parts.push("Nothing is due today.");
  parts.push(`Open tasks in total: ${tasks.length}`);
  return parts.join("\n\n");
}
