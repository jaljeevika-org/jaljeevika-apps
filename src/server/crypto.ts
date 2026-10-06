import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPasswordHash } from "@/lib/password-hash";

export { hashPassword };

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When there is no stored hash (unknown email, or an
 * invited user who has not set one yet) a dummy hash is checked instead so
 * the response time does not reveal whether the account exists.
 */
export async function verifyPassword(storedHash: string | null | undefined, password: string): Promise<boolean> {
  if (!storedHash) {
    dummyHash ??= hashPassword("jaljeevika-timing-equaliser");
    await verifyPasswordHash(await dummyHash, password);
    return false;
  }
  return verifyPasswordHash(storedHash, password);
}

/** 256-bit random token, URL-safe. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens are stored only as SHA-256 digests. */
export function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Tokens we issue are 43 base64url characters; reject anything else early. */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
