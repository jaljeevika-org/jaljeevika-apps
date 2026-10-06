import { loadEnvConfig } from "@next/env";
import { Client } from "pg";
import { pgConfig } from "../src/lib/pg-config";

/** Loads .env, .env.local etc. the same way Next.js does. */
export function loadEnv(): void {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => undefined, error: console.error });
}

/** Host and database of a connection string, without credentials, for log lines. */
export function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/**
 * Connects with the first variable that is set. Migrations prefer the direct
 * (non-pooled) Neon connection, as Neon recommends.
 */
export async function connect(order: string[] = ["MIGRATION_DATABASE_URL", "DATABASE_URL_UNPOOLED", "DATABASE_URL"]): Promise<{ client: Client; target: string }> {
  const name = order.find((n) => process.env[n]?.trim());
  if (!name) throw new Error(`Set one of ${order.join(", ")} (see README).`);
  const url = process.env[name]!.trim();
  const client = new Client({ ...pgConfig(url), connectionTimeoutMillis: 20_000 });
  await client.connect();
  return { client, target: `${describeTarget(url)} (via ${name})` };
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  const pref = process.argv.find((a) => a.startsWith(`--${name}=`));
  return pref ? pref.slice(name.length + 3) : undefined;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
