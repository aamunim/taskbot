import { tg } from "../_shared/telegram.ts";
import { db, env, isAdmin, json, webhookSecret } from "../_shared/util.ts";

// One-time (re-runnable) setup: registers the Telegram webhook and tells the
// database where the functions live so pg_cron can call them.
Deno.serve(async (req) => {
  if (!isAdmin(req)) return json({ error: "forbidden" }, 403);
  const functionsUrl = `${env("SUPABASE_URL")}/functions/v1`;

  const { error } = await db().from("internal_config").upsert([
    { key: "functions_url", value: functionsUrl },
    { key: "admin_secret", value: env("ADMIN_SECRET") },
  ]);
  if (error) return json({ error: error.message }, 500);

  await tg("setWebhook", {
    url: `${functionsUrl}/telegram-webhook`,
    secret_token: await webhookSecret(),
    allowed_updates: ["message", "edited_message", "my_chat_member"],
  });
  const me = await tg<{ username: string; can_read_all_group_messages?: boolean }>("getMe");
  const info = await tg<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo");

  return json({
    diagnostics: await diagnostics(),
    ok: true,
    bot: `@${me.username}`,
    // false means Privacy Mode is still on: the bot would miss ordinary group messages.
    can_read_all_group_messages: me.can_read_all_group_messages ?? false,
    webhook: info.url,
    pending_updates: info.pending_update_count,
    last_webhook_error: info.last_error_message ?? null,
  });
});

/**
 * Counts only: no names, ids or message text, because this output lands in a
 * workflow log that may be public.
 */
async function diagnostics(): Promise<Record<string, unknown>> {
  const supabase = db();
  const minutesAgo = (iso: string | null | undefined) =>
    iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null;
  const { data: cfg } = await supabase.from("app_config").select("*").eq("id", 1).single();
  const { data: chats } = await supabase.from("chats").select("id,type,approved");
  const { data: msgs } = await supabase.from("messages")
    .select("chat_id,sender_tg_id,process_status,kind,sent_at,created_at,forwarded_by_tg_id")
    .order("created_at", { ascending: false }).limit(3000);
  const rows = msgs ?? [];
  const count = (key: (r: (typeof rows)[number]) => string) =>
    rows.reduce<Record<string, number>>((acc, r) => ((acc[key(r)] = (acc[key(r)] ?? 0) + 1), acc), {});
  const role = (id: number | null) =>
    id === null ? "unknown" : id === cfg?.owner_tg_id ? "owner" : id === cfg?.boss_tg_id ? "boss" : id < 0 ? "chat" : "other";
  return {
    owner_set: !!cfg?.owner_tg_id,
    boss_set: !!cfg?.boss_tg_id,
    last_webhook_minutes_ago: minutesAgo(cfg?.last_webhook_at),
    last_processed_minutes_ago: minutesAgo(cfg?.last_processed_at),
    last_error_minutes_ago: minutesAgo(cfg?.last_error_at),
    last_error_where: cfg?.last_error ? String(cfg.last_error).split(":")[0] : null,
    chats: (chats ?? []).map((c, i) => {
      const mine = rows.filter((r) => r.chat_id === c.id);
      return {
        chat: i + 1,
        type: c.type,
        approved: c.approved,
        messages: mine.length,
        distinct_senders: new Set(mine.map((r) => r.sender_tg_id)).size,
        newest_message_minutes_ago: minutesAgo(mine[0]?.created_at),
        by_sender_role: mine.reduce<Record<string, number>>((acc, r) => {
          const k = role(r.sender_tg_id);
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
      };
    }),
    messages_by_status: count((r) => r.process_status),
    messages_by_kind: count((r) => r.kind),
    forwarded_messages: rows.filter((r) => r.forwarded_by_tg_id !== null).length,
  };
}
