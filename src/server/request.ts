import "server-only";
import { headers } from "next/headers";

export type RequestMeta = { ip: string | null; userAgent: string | null };

/**
 * Client IP and user agent of the current request. On Vercel `x-real-ip` and
 * `x-forwarded-for` are set by the platform. Behind another proxy make sure it
 * overwrites (not appends to) these headers. Rate limits are also keyed by
 * email, so a spoofed IP does not bypass them.
 */
export async function requestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = (h.get("x-real-ip")?.trim() || forwarded || null)?.slice(0, 64) ?? null;
    const userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
    return { ip, userAgent };
  } catch {
    // Outside a request (CLI scripts).
    return { ip: null, userAgent: null };
  }
}
