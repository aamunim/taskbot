import { flushBossNotices } from "../_shared/notices.ts";
import { db, json, recordError } from "../_shared/util.ts";

// Called by the app a few seconds after the owner marks a boss's task done, once the
// undo window has passed. The cron run sends anything this call did not reach.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const res = await handle(req);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  // Only the signed-in owner may trigger a message in the group.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: user } = await db().auth.getUser(token);
  const { data: cfg } = await db().from("app_config").select("owner_user_id").eq("id", 1).single();
  if (!user?.user || !cfg?.owner_user_id || user.user.id !== cfg.owner_user_id) return json({ error: "forbidden" }, 403);
  try {
    return json({ sent: await flushBossNotices() });
  } catch (e) {
    await recordError("notify", e);
    return json({ error: "failed" }, 500);
  }
}
