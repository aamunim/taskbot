import { tg } from "../_shared/telegram.ts";
import { db, json, randomToken, recordError, sha256Hex, timingSafeEqual } from "../_shared/util.ts";

// Login through the bot:
//   start -> app gets {code, secret, url}; the user opens url and presses Start in Telegram
//   poll  -> once the bot has confirmed the code, the app receives a one-time token_hash
//            and exchanges it for a Supabase session with auth.verifyOtp.
// The code travels through Telegram; the secret never leaves the app, so seeing
// the link is not enough to log in.
// The web app calls this from a browser on another origin. Nothing here relies on
// cookies, and a login still needs the one-time secret, so any origin may call it.
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
  let body: { action?: string; code?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  try {
    if (body.action === "start") return await start();
    if (body.action === "poll" && typeof body.code === "string" && typeof body.secret === "string") {
      return await poll(body.code, body.secret);
    }
    return json({ error: "bad request" }, 400);
  } catch (e) {
    await recordError("auth", e);
    return json({ error: "failed" }, 500);
  }
}

async function start(): Promise<Response> {
  const supabase = db();
  await supabase.from("login_requests").delete().lt("expires_at", new Date().toISOString());
  const { count } = await supabase.from("login_requests").select("code", { count: "exact", head: true });
  if ((count ?? 0) > 50) return json({ error: "too many login attempts, try again later" }, 429);

  const code = randomToken(16);
  const secret = randomToken(32);
  const { error } = await supabase.from("login_requests").insert({ code, secret_hash: await sha256Hex(secret) });
  if (error) throw error;
  const me = await tg<{ username: string }>("getMe");
  return json({ code, secret, url: `https://t.me/${me.username}?start=login_${code}` });
}

async function poll(code: string, secret: string): Promise<Response> {
  const supabase = db();
  const { data: reqRow } = await supabase.from("login_requests").select("*").eq("code", code).maybeSingle();
  if (!reqRow || !timingSafeEqual(reqRow.secret_hash, await sha256Hex(secret))) return json({ status: "expired" });
  if (new Date(reqRow.expires_at).getTime() < Date.now() || reqRow.status === "used") return json({ status: "expired" });
  if (reqRow.status !== "confirmed") return json({ status: "pending" });

  const { data: cfg, error: cfgErr } = await supabase.from("app_config").select("owner_tg_id").eq("id", 1).single();
  if (cfgErr) throw cfgErr;
  if (!cfg.owner_tg_id || cfg.owner_tg_id !== reqRow.tg_user_id) return json({ status: "denied" });

  // Single use: only one poll can flip confirmed -> used.
  const { data: used } = await supabase.from("login_requests")
    .update({ status: "used" }).eq("code", code).eq("status", "confirmed").select("code");
  if (!used?.length) return json({ status: "expired" });

  const email = `tg${reqRow.tg_user_id}@taskbot.invalid`;
  const { error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { telegram_id: reqRow.tg_user_id, name: reqRow.tg_name },
  });
  // 422 / email_exists just means this owner has logged in before.
  if (createErr && createErr.code !== "email_exists" && createErr.status !== 422) throw createErr;

  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) throw linkErr;
  const { error: ownErr } = await supabase.from("app_config").update({ owner_user_id: link.user.id }).eq("id", 1);
  if (ownErr) throw ownErr;

  return json({ status: "ok", token_hash: link.properties.hashed_token });
}
