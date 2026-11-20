import { db, json, recordError } from "../_shared/util.ts";

// The boss's page: given a valid share link token, returns the whole library of the
// group (files and links from everyone, each labelled with who sent it), and never
// tasks, notes or anything else. No sign-in; the token is the whole credential.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
/** How long the download links in one response keep working. */
const URL_SECONDS = 3600;
const MAX_ROWS = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const res = await handle(req);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  res.headers.set("Cache-Control", "no-store");
  return res;
});

interface MessageInfo { sender_tg_id: number | null; sender_name: string | null; sent_at: string; text: string | null; transcript: string | null }

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let token = "";
  try {
    token = String((await req.json())?.token ?? "");
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "invalid" }, 404);

  try {
    const supabase = db();
    const { data: link } = await supabase.from("share_links")
      .select("id,expires_at,revoked_at,open_count").eq("token", token).maybeSingle();
    const expired = link?.expires_at && new Date(link.expires_at).getTime() < Date.now();
    // One answer for "wrong", "revoked" and "expired", so a guess learns nothing.
    if (!link || link.revoked_at || expired) return json({ error: "invalid" }, 404);

    const { data: cfg } = await supabase.from("app_config").select("owner_tg_id,boss_tg_id,boss_name").eq("id", 1).single();
    if (!cfg?.owner_tg_id) return json({ error: "invalid" }, 404);
    // Same rule as the app: the chosen boss, or everyone except the owner while none is chosen.
    const roleOf = (m: MessageInfo): "boss" | "owner" | "other" =>
      m.sender_tg_id === cfg.owner_tg_id ? "owner"
        : m.sender_tg_id !== null && (cfg.boss_tg_id === null || m.sender_tg_id === cfg.boss_tg_id) ? "boss" : "other";

    const { data: fileRows, error: fileErr } = await supabase.from("files")
      .select("id,kind,file_name,mime_type,size_bytes,duration_seconds,storage_path,status,created_at,messages!inner(sender_tg_id,sender_name,sent_at,text,transcript)")
      .order("created_at", { ascending: false }).limit(MAX_ROWS);
    if (fileErr) throw fileErr;
    const { data: linkRows, error: linkErr } = await supabase.from("links")
      .select("id,url,domain,title,description,image_url,favicon_url,created_at,messages!inner(sender_tg_id,sender_name,sent_at,text)")
      .order("created_at", { ascending: false }).limit(MAX_ROWS);
    if (linkErr) throw linkErr;

    const one = <T>(m: T | T[] | null): T | null => (Array.isArray(m) ? (m[0] ?? null) : m);
    const files = (fileRows ?? [])
      .map((f) => ({ ...f, message: one(f.messages as unknown as MessageInfo | MessageInfo[] | null) }))
      .filter((f): f is typeof f & { message: MessageInfo } => f.message !== null);
    const links = (linkRows ?? [])
      .map((l) => ({ ...l, message: one(l.messages as unknown as MessageInfo | MessageInfo[] | null) }))
      .filter((l): l is typeof l & { message: MessageInfo } => l.message !== null);

    const paths = files.filter((f) => f.status === "stored" && f.storage_path).map((f) => f.storage_path as string);
    const urls = new Map<string, string>();
    for (let i = 0; i < paths.length; i += 100) {
      const { data: signed } = await supabase.storage.from("files").createSignedUrls(paths.slice(i, i + 100), URL_SECONDS);
      for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }

    await supabase.from("share_links")
      .update({ last_opened_at: new Date().toISOString(), open_count: (link.open_count ?? 0) + 1 }).eq("id", link.id);

    return json({
      boss_name: cfg.boss_name,
      url_seconds: URL_SECONDS,
      files: files.map((f) => ({
        id: f.id,
        kind: f.kind,
        file_name: f.file_name,
        mime_type: f.mime_type,
        size_bytes: f.size_bytes,
        duration_seconds: f.duration_seconds,
        sent_at: f.message.sent_at,
        sender_name: f.message.sender_name,
        from: roleOf(f.message),
        caption: f.message.text,
        transcript: f.message.transcript,
        // Absent when the file was too large for the bot to keep, or failed to store.
        url: f.storage_path ? (urls.get(f.storage_path) ?? null) : null,
      })),
      links: links.map((l) => ({
        id: l.id, url: l.url, domain: l.domain, title: l.title, description: l.description,
        image_url: l.image_url, favicon_url: l.favicon_url, sent_at: l.message.sent_at, said: l.message.text,
        sender_name: l.message.sender_name, from: roleOf(l.message),
      })),
    });
  } catch (e) {
    await recordError("share", e);
    return json({ error: "failed" }, 500);
  }
}
