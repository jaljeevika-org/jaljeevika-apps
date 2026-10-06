/**
 * Session cookie name. Shared by the proxy (optimistic redirects) and the
 * server (real validation). Over https the __Host- prefix makes the browser
 * refuse the cookie unless it is Secure, host-only and Path=/.
 */
export function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-jj_session" : "jj_session";
}

export const SESSION_COOKIE_NAMES = ["__Host-jj_session", "jj_session"] as const;
