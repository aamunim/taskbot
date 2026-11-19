import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret: ${name}`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

let client: SupabaseClient | undefined;
/** Service-role client: bypasses RLS, only ever used inside edge functions. */
export function db(): SupabaseClient {
  client ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAdmin(req: Request): boolean {
  const given = req.headers.get("x-admin-secret") ?? "";
  return timingSafeEqual(given, env("ADMIN_SECRET"));
}

/** Secret token Telegram echoes back on every webhook call. */
export function webhookSecret(): Promise<string> {
  return sha256Hex(`telegram-webhook:${env("ADMIN_SECRET")}`);
}

export function randomToken(bytes = 16): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function recordError(where: string, e: unknown): Promise<void> {
  console.error(where, e);
  try {
    await db().from("app_config").update({
      last_error: `${where}: ${errorText(e)}`.slice(0, 1000),
      last_error_at: new Date().toISOString(),
    }).eq("id", 1);
  } catch (_) {
    // Reporting must never mask the original failure.
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Formats an instant in the given IANA time zone, e.g. "2026-11-19 14:05 (Thursday)". */
export function localStamp(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "long",
  }).formatToParts(d);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")} (${p("weekday")})`;
}

export function localDate(d: Date, timeZone: string): string {
  return localStamp(d, timeZone).slice(0, 10);
}

export function localTime(d: Date, timeZone: string): string {
  return localStamp(d, timeZone).slice(11, 16);
}
