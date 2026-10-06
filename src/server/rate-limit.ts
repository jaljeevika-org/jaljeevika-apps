import "server-only";
import { getPool, queryOne } from "./db";

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
};

/**
 * Fixed-window counter stored in Postgres so every server instance shares it
 * (serverless functions have no shared memory). `hit` counts one attempt and
 * reports whether the caller is still within `limit` for the window.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const row = await queryOne<{ count: number; retry_after: number }>(
    `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => $2)
                    THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => $2)
                    THEN now() ELSE rate_limits.window_start END
     RETURNING count,
       GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(secs => $2) - now()))))::int AS retry_after`,
    [key, windowSeconds],
  );
  maybeCleanup();
  const count = row?.count ?? 1;
  return { allowed: count <= limit, count, retryAfterSeconds: row?.retry_after ?? windowSeconds };
}

/** Reports the current state without counting an attempt. */
export async function peek(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const row = await queryOne<{ count: number; retry_after: number }>(
    `SELECT count,
       GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(secs => $2) - now()))))::int AS retry_after
     FROM rate_limits
     WHERE key = $1 AND window_start > now() - make_interval(secs => $2)`,
    [key, windowSeconds],
  );
  if (!row) return { allowed: true, count: 0, retryAfterSeconds: 0 };
  return { allowed: row.count < limit, count: row.count, retryAfterSeconds: row.retry_after };
}

/** Gives back one attempt (e.g. after a successful sign-in). */
export async function release(key: string): Promise<void> {
  await getPool().query("UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1", [key]);
}

export async function clear(key: string): Promise<void> {
  await getPool().query("DELETE FROM rate_limits WHERE key = $1", [key]);
}

function maybeCleanup() {
  if (Math.random() > 0.02) return;
  getPool()
    .query("DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'")
    .catch(() => undefined);
}

export function minutesText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Limits used across the app, in one place so they are easy to tune. */
export const LIMITS = {
  // Failed sign-ins only: a whole office behind one IP can still sign in normally.
  loginFailuresPerIp: { limit: 50, window: 15 * 60 },
  loginFailuresPerEmail: { limit: 8, window: 15 * 60 },
  resetRequestPerIp: { limit: 10, window: 60 * 60 },
  resetRequestPerEmail: { limit: 3, window: 60 * 60 },
  tokenSubmitPerIp: { limit: 20, window: 60 * 60 },
  registerPerIp: { limit: 5, window: 60 * 60 },
  verificationResendPerEmail: { limit: 3, window: 60 * 60 },
  verificationResendPerIp: { limit: 10, window: 60 * 60 },
  testEmailPerUser: { limit: 5, window: 60 * 60 },
  passwordChangePerUser: { limit: 10, window: 15 * 60 },
} as const;
