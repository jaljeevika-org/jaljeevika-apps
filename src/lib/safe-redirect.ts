/**
 * Accepts only same-site relative paths ("/admin/users?x=1"). Anything that
 * could send the browser to another origin ("//evil.com", "/\\evil.com",
 * "https://...", control characters) is rejected, preventing open redirects.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.length > 2048) return null;
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return null;
  try {
    const url = new URL(path, "http://portal.invalid");
    if (url.origin !== "http://portal.invalid") return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** Where to send someone after signing in. Never back to auth pages. */
export function postLoginPath(next: unknown): string {
  const path = safeNextPath(next);
  if (!path) return "/";
  const bare = path.split(/[?#]/)[0];
  if (["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"].includes(bare)) return "/";
  return path;
}
