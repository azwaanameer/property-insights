// The signed entitlement cookie. It names purchases (never prices, plans or addresses) and is HMAC-signed with ENTITLEMENT_SECRET.
// A bad signature, a malformed value or a past expiry all mean anonymous. Purchase state is always read from the database,
// so a refund ends access even while the cookie is still valid.
import { z } from "zod";
import { base64UrlDecode, base64UrlEncode, hmacSha256, hmacSha256Verify } from "../crypto";

export const COOKIE_NAME = "vp_entitlement";
/** Browsers cap cookie life at about 400 days. */
export const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
export const MAX_PURCHASES_IN_COOKIE = 20;

const Payload = z.object({
  v: z.literal(1),
  ids: z.array(z.string().min(1).max(64)).max(MAX_PURCHASES_IN_COOKIE),
  /** Seconds since the epoch. */
  exp: z.number().int(),
});
export type CookiePayload = z.infer<typeof Payload>;

const enc = new TextEncoder();

export async function signEntitlementCookie(ids: string[], secret: string, now: Date, maxAgeSeconds = COOKIE_MAX_AGE_SECONDS): Promise<string> {
  const payload: CookiePayload = {
    v: 1,
    ids: [...new Set(ids)].slice(-MAX_PURCHASES_IN_COOKIE),
    exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
  };
  const body = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${base64UrlEncode(await hmacSha256(secret, body))}`;
}

/** The payload when the signature is right and the cookie has not expired, otherwise null. */
export async function verifyEntitlementCookie(value: string, secret: string, now: Date): Promise<CookiePayload | null> {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const sigBytes = base64UrlDecode(sig);
  const bodyBytes = base64UrlDecode(body);
  if (!sigBytes || !bodyBytes || sigBytes.length === 0) return null;
  if (!(await hmacSha256Verify(secret, body, sigBytes))) return null;
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return null;
  }
  const parsed = Payload.safeParse(json);
  if (!parsed.success) return null;
  if (parsed.data.exp <= Math.floor(now.getTime() / 1000)) return null;
  return parsed.data;
}

export function readCookie(request: Request, name: string = COOKIE_NAME): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** HttpOnly, SameSite=Lax, Secure everywhere except plain-http localhost. */
export function buildSetCookie(value: string, opts: { secure: boolean; maxAgeSeconds?: number }): string {
  const attrs = [`${COOKIE_NAME}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${opts.maxAgeSeconds ?? COOKIE_MAX_AGE_SECONDS}`];
  if (opts.secure) attrs.push("Secure");
  return attrs.join("; ");
}

/** Secure unless the request is plain http to localhost (local development). */
export function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  return !(local && url.protocol === "http:");
}
