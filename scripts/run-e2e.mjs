/**
 * Prepares a THROWAWAY database and runs the Playwright end-to-end suite.
 *
 *   E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:5455/portal_e2e npm run test:e2e
 *
 * The database is wiped (schema "public" dropped and re-created), migrated,
 * and given a Super Admin with a random password. To protect real data it
 * refuses to run against the database configured in .env.local (the Neon
 * production branch) and against any non-local host unless
 * E2E_ALLOW_REMOTE_DB=1 is set (e.g. for a disposable Neon branch).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";

const url = process.env.E2E_DATABASE_URL?.trim();
if (!url) {
  console.error("Set E2E_DATABASE_URL to a throwaway database (see README → Testing).");
  process.exit(1);
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace("-pooler", "").toLowerCase();
  } catch {
    return "";
  }
}

const target = hostOf(url);
const protectedHosts = new Set();
for (const file of [".env.local", ".env", ".env.production.local", ".env.production"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(DATABASE_URL|DATABASE_URL_UNPOOLED)\s*=\s*(.+)\s*$/);
    if (m) protectedHosts.add(hostOf(m[2].replace(/^["']|["']$/g, "")));
  }
}
if (protectedHosts.has(target)) {
  console.error(`Refusing: E2E_DATABASE_URL points at ${target}, the database configured for the app (.env.local). Use a throwaway database or Neon branch.`);
  process.exit(1);
}
const local = target === "127.0.0.1" || target === "localhost" || target === "::1";
if (!local && process.env.E2E_ALLOW_REMOTE_DB !== "1") {
  console.error(`Refusing to wipe remote database ${target}. Set E2E_ALLOW_REMOTE_DB=1 if it is a disposable branch.`);
  process.exit(1);
}

// Optional direct (non-pooled) URL for wiping and migrating, as Neon recommends.
const setupUrl = process.env.E2E_DATABASE_URL_UNPOOLED?.trim() || url;
if (hostOf(setupUrl) !== target) {
  console.error("E2E_DATABASE_URL_UNPOOLED must point at the same database host as E2E_DATABASE_URL.");
  process.exit(1);
}

const node = process.execPath;
const childEnv = {
  ...process.env,
  // Every script must use the throwaway database, never .env.local's.
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: setupUrl,
  MIGRATION_DATABASE_URL: setupUrl,
};

function run(args, input) {
  const r = spawnSync(node, args, { env: childEnv, input, stdio: input ? ["pipe", "inherit", "inherit"] : "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`E2E database: ${target}${new URL(url).pathname}`);
// Same normalisation as src/lib/pg-config.ts (plain JS here, no TypeScript loader).
const parsed = new URL(setupUrl);
if (["require", "prefer", "verify-ca"].includes(parsed.searchParams.get("sslmode") ?? "")) parsed.searchParams.set("sslmode", "verify-full");
const channelBinding = parsed.searchParams.get("channel_binding") === "require";
parsed.searchParams.delete("channel_binding");
const client = new pg.Client({ connectionString: parsed.toString(), enableChannelBinding: channelBinding });
await client.connect();
await client.query("DROP SCHEMA IF EXISTS public CASCADE");
await client.query("CREATE SCHEMA public");
await client.end();
console.log("Database wiped.");

const tsx = "node_modules/tsx/dist/cli.mjs";
run([tsx, "scripts/migrate.ts"]);
const adminEmail = "superadmin@e2e.jaljeevika.local";
const adminPassword = `E2e-${randomBytes(12).toString("base64url")}`;
run([tsx, "scripts/create-admin.ts", "--email", adminEmail, "--name", "Asha Superadmin", "--password-stdin"], adminPassword);

if (!existsSync(".next/BUILD_ID") || process.env.E2E_BUILD === "1") {
  run(["node_modules/next/dist/bin/next", "build"]);
}

const result = spawnSync(node, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...childEnv, E2E_DATABASE_URL: url, E2E_ADMIN_EMAIL: adminEmail, E2E_ADMIN_PASSWORD: adminPassword, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
});
process.exit(result.status ?? 1);
