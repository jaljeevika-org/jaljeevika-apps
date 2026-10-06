import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPool, queryOne, type Db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { secureCookiesEnabled } from "./config";
import { requestMeta } from "./request";
import { getSettings } from "./settings";
import { sessionCookieName } from "@/lib/session-cookie";
import { can, canAccessAdmin, isSuperAdmin, type Permission, type RoleRef } from "@/lib/permissions";
import { safeNextPath } from "@/lib/safe-redirect";

export type SessionUser = {
  sessionId: string;
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  role: RoleRef;
  permissions: string[];
  isSuperAdmin: boolean;
};

const ABSOLUTE_MAX_SESSION_DAYS = 7; // cap for sessions without "remember me"
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function cookieName(): string {
  return sessionCookieName(secureCookiesEnabled());
}

export async function createSession(userId: string, remember: boolean, db: Db = getPool()): Promise<void> {
  const settings = await getSettings();
  const token = randomToken();
  const meta = await requestMeta();
  const lifetimeSeconds = remember
    ? settings.remember_me_days * 24 * 3600
    : settings.session_idle_hours * 3600;
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, remember, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4), $5, $6)`,
    [userId, sha256(token), remember, lifetimeSeconds, meta.ip, meta.userAgent],
  );
  const jar = await cookies();
  jar.set(cookieName(), token, {
    httpOnly: true,
    secure: secureCookiesEnabled(),
    sameSite: "lax",
    path: "/",
    // Without "remember me" the cookie lasts for the browser session and the
    // server-side idle timeout applies.
    ...(remember ? { maxAge: lifetimeSeconds } : {}),
  });
}

async function readToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(cookieName())?.value;
}

type SessionRow = {
  session_id: string;
  remember: boolean;
  last_seen_at: Date;
  created_at: Date;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  email_verified: boolean;
  must_change_password: boolean;
  role_id: number;
  role_key: string;
  role_name: string;
  role_rank: number;
  permissions: string[];
};

async function loadSession(): Promise<SessionUser | null> {
  const token = await readToken();
  if (!token || token.length > 100) return null;
  const row = await queryOne<SessionRow>(
    `SELECT s.id AS session_id, s.remember, s.last_seen_at, s.created_at,
            u.id AS user_id, u.name, u.email, u.is_active, u.email_verified, u.must_change_password,
            r.id AS role_id, r.key AS role_key, r.name AS role_name, r.rank AS role_rank,
            COALESCE(ARRAY(SELECT rp.permission_key FROM role_permissions rp WHERE rp.role_id = r.id), '{}') AS permissions
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  if (!row) return null;
  if (!row.is_active) {
    // Disabled while signed in: end the session immediately.
    await getPool().query("DELETE FROM sessions WHERE id = $1", [row.session_id]);
    return null;
  }

  if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_INTERVAL_MS) {
    const settings = await getSettings();
    // Sliding idle timeout for normal sessions (capped); "remember me"
    // sessions keep their fixed expiry.
    await getPool()
      .query(
        row.remember
          ? `UPDATE sessions SET last_seen_at = now() WHERE id = $1`
          : `UPDATE sessions SET last_seen_at = now(),
               expires_at = LEAST(now() + make_interval(hours => $2), created_at + make_interval(days => $3))
             WHERE id = $1`,
        row.remember ? [row.session_id] : [row.session_id, settings.session_idle_hours, ABSOLUTE_MAX_SESSION_DAYS],
      )
      .catch((err) => console.error("[session] touch failed:", err.message));
  }

  const role: RoleRef = { id: row.role_id, key: row.role_key, name: row.role_name, rank: row.role_rank };
  return {
    sessionId: row.session_id,
    id: row.user_id,
    name: row.name,
    email: row.email,
    emailVerified: row.email_verified,
    mustChangePassword: row.must_change_password,
    role,
    permissions: row.permissions,
    isSuperAdmin: isSuperAdmin({ role }),
  };
}

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getSessionUser = cache(loadSession);

export async function destroyCurrentSession(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  const token = await readToken();
  if (token) {
    await getPool().query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  }
  const jar = await cookies();
  jar.delete({ name: cookieName(), path: "/", secure: secureCookiesEnabled(), httpOnly: true, sameSite: "lax" });
  return user;
}

/** Ends every session of a user, optionally keeping one (the current device). */
export async function revokeUserSessions(userId: string, exceptSessionId?: string, db: Db = getPool()): Promise<number> {
  const result = exceptSessionId
    ? await db.query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [userId, exceptSessionId])
    : await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  return result.rowCount ?? 0;
}

async function currentPath(): Promise<string> {
  const h = await headers();
  return safeNextPath(h.get("x-jj-path")) ?? "/";
}

/**
 * For pages: the signed-in user, or a redirect to the login page. Users who
 * must change a temporary password are sent to do that first.
 */
export async function requireUser(options: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const path = await currentPath();
    redirect(path === "/" ? "/login" : `/login?next=${encodeURIComponent(path)}`);
  }
  if (user.mustChangePassword && !options.allowPasswordChange) {
    redirect("/change-password");
  }
  return user;
}

export class AuthError extends Error {
  constructor(message = "You are not allowed to do that.") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * For Server Actions: the signed-in user holding `permission`, or an
 * AuthError. Hiding buttons in the UI is never relied on; every action calls
 * this (or requireActionUser) first.
 */
export async function requireActionUser(permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Your session has ended. Please sign in again.");
  if (user.mustChangePassword) throw new AuthError("Please change your temporary password first.");
  if (permission && !can(user, permission)) throw new AuthError();
  return user;
}

export { can, canAccessAdmin };
