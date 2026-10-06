import { hash, verify } from "@node-rs/argon2";

// Argon2id (the library default) with the OWASP Password Storage Cheat Sheet
// minimum: 19 MiB memory, 2 iterations, 1 lane. The algorithm is not passed
// explicitly because the package exports it as a const enum, which
// isolatedModules forbids. Used by the server and by the CLI scripts.
export const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPasswordHash(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
