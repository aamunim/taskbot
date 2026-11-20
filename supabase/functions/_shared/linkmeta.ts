// Fetches what is needed to show a link nicely: title, description, image, icon.

export interface LinkMeta {
  title: string | null;
  description: string | null;
  image_url: string | null;
  favicon_url: string | null;
}

const MAX_BYTES = 300_000;
/** Pages that only show a login or bot wall say nothing about the link. */
const USELESS_TITLE = /^(sign in|log ?in|login|access denied|just a moment|attention required|403|404|error)\b/i;

/** Only ordinary public web hosts: no IP addresses, local names or odd ports. */
function isPublicUrl(u: URL): boolean {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":")) return false;
  return !/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid)$/.test(h);
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

/** Content of the first <meta> whose property/name is one of `keys`. */
function meta(html: string, keys: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    if (keys.includes(key)) {
      const content = attr(tag, "content");
      if (content) return decode(content);
    }
  }
  return null;
}

function absolute(value: string | null, base: URL): string | null {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    return isPublicUrl(u) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseLinkMeta(html: string, base: URL): LinkMeta {
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  let title = meta(html, ["og:title", "twitter:title"]) ?? (titleTag ? decode(titleTag) : null);
  if (title && USELESS_TITLE.test(title)) title = null;
  const iconTag = (html.match(/<link\b[^>]*>/gi) ?? [])
    .find((tag) => /\bicon\b/i.test(attr(tag, "rel") ?? ""));
  return {
    title: title ? title.slice(0, 200) : null,
    description: title ? (meta(html, ["og:description", "description", "twitter:description"])?.slice(0, 300) ?? null) : null,
    image_url: title ? absolute(meta(html, ["og:image", "og:image:secure_url", "twitter:image"]), base) : null,
    favicon_url: absolute(iconTag ? attr(iconTag, "href") : null, base) ?? `${base.origin}/favicon.ico`,
  };
}

/** Returns null when the page cannot be read; never throws. */
export async function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  try {
    const target = new URL(url);
    if (!isPublicUrl(target)) return null;
    const res = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkPreview/1.0)", Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const finalUrl = new URL(res.url || url);
    if (!isPublicUrl(finalUrl)) return null;
    const fallback: LinkMeta = { title: null, description: null, image_url: null, favicon_url: `${finalUrl.origin}/favicon.ico` };
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) {
      await res.body?.cancel();
      return fallback;
    }
    // The tags we need are in <head>; stop reading after the first chunk of the page.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    return parseLinkMeta(new TextDecoder().decode(bytes), finalUrl);
  } catch {
    return null;
  }
}
