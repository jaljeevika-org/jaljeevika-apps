import { spawnSync } from "node:child_process";
import pg from "pg";

/**
 * When TEST_DATABASE_URL is set (a local throwaway database), wipe it and
 * apply the migrations so the integration tests start from a known state.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("TEST_DATABASE_URL must be a local throwaway database.");
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.end();
  const r = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: url, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("Migration failed");
}
