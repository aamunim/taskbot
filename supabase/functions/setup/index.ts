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
    allowed_updates: ["message", "edited_message", "my_chat_member", "callback_query"],
  });
  const me = await tg<{ username: string; can_read_all_group_messages?: boolean }>("getMe");
  const info = await tg<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo");

  return json({
    ok: true,
    bot: `@${me.username}`,
    // false means Privacy Mode is still on: the bot would miss ordinary group messages.
    can_read_all_group_messages: me.can_read_all_group_messages ?? false,
    webhook: info.url,
    pending_updates: info.pending_update_count,
    last_webhook_error: info.last_error_message ?? null,
  });
});
