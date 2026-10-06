import "server-only";
import { getPool, queryOne, type Db } from "./db";
import { looksLikeToken, randomToken, sha256 } from "./crypto";
import { emailVerificationUrl, passwordResetUrl, tokenLifetimes } from "./config";

export type PasswordTokenPurpose = "reset" | "invite";

/**
 * Issues a password reset / invitation token. Any earlier unused token of the
 * same user is invalidated, so only the newest link works. Returns the link;
 * the raw token is never stored.
 */
export async function issuePasswordToken(
  userId: string,
  purpose: PasswordTokenPurpose,
  requestedIp: string | null,
  db: Db = getPool(),
): Promise<{ url: string; minutes: number }> {
  const minutes = purpose === "invite" ? tokenLifetimes.inviteHours() * 60 : tokenLifetimes.passwordResetMinutes();
  const token = randomToken();
  await db.query(
    "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
    [userId],
  );
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, purpose, expires_at, requested_ip)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4), $5)`,
    [userId, sha256(token), purpose, Math.round(minutes), requestedIp],
  );
  return { url: `${passwordResetUrl()}?token=${token}`, minutes };
}

export type PasswordTokenInfo = {
  tokenId: string;
  userId: string;
  purpose: PasswordTokenPurpose;
  email: string;
  name: string;
};

/** Looks a token up without using it (for showing the form). */
export async function findValidPasswordToken(token: unknown): Promise<PasswordTokenInfo | null> {
  if (!looksLikeToken(token)) return null;
  const row = await queryOne<{ id: string; user_id: string; purpose: PasswordTokenPurpose; email: string; name: string }>(
    `SELECT t.id, t.user_id, t.purpose, u.email, u.name
     FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.is_active`,
    [sha256(token)],
  );
  return row ? { tokenId: row.id, userId: row.user_id, purpose: row.purpose, email: row.email, name: row.name } : null;
}

/**
 * Marks the token used, atomically. Only one concurrent caller can succeed,
 * which makes every link strictly single-use.
 */
export async function consumePasswordToken(token: string, db: Db): Promise<{ userId: string; purpose: PasswordTokenPurpose } | null> {
  if (!looksLikeToken(token)) return null;
  const row = await queryOne<{ user_id: string; purpose: PasswordTokenPurpose }>(
    `UPDATE password_reset_tokens t SET used_at = now()
     FROM users u
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
       AND u.id = t.user_id AND u.is_active
     RETURNING t.user_id, t.purpose`,
    [sha256(token)],
    db,
  );
  return row ? { userId: row.user_id, purpose: row.purpose } : null;
}

export async function issueEmailVerificationToken(userId: string, email: string, db: Db = getPool()): Promise<{ url: string; hours: number }> {
  const hours = tokenLifetimes.emailVerificationHours();
  const token = randomToken();
  await db.query("UPDATE email_verification_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await db.query(
    `INSERT INTO email_verification_tokens (user_id, email, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [userId, email, sha256(token), hours],
  );
  return { url: `${emailVerificationUrl()}?token=${token}`, hours };
}

export async function findValidVerificationToken(token: unknown): Promise<{ userId: string; email: string; name: string } | null> {
  if (!looksLikeToken(token)) return null;
  return queryOne<{ userId: string; email: string; name: string }>(
    `SELECT t.user_id AS "userId", u.email, u.name
     FROM email_verification_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.email = t.email`,
    [sha256(token)],
  );
}

/** Uses a verification token and marks the user's email verified. */
export async function consumeVerificationToken(token: string): Promise<{ userId: string; email: string } | null> {
  if (!looksLikeToken(token)) return null;
  const row = await queryOne<{ user_id: string; email: string }>(
    `WITH used AS (
       UPDATE email_verification_tokens t SET used_at = now()
       FROM users u
       WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
         AND u.id = t.user_id AND u.email = t.email
       RETURNING t.user_id, t.email
     )
     UPDATE users SET email_verified = true, email_verified_at = COALESCE(email_verified_at, now())
     FROM used WHERE users.id = used.user_id
     RETURNING users.id AS user_id, users.email`,
    [sha256(token)],
  );
  return row ? { userId: row.user_id, email: row.email } : null;
}
