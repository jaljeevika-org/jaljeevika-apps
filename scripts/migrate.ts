/**
 * Applies db/migrations/*.sql in order, each inside its own transaction, and
 * records them in schema_migrations. Safe to run repeatedly and from several
 * machines at once (an advisory lock serialises runs).
 *
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --status
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, flag, loadEnv } from "./lib";

const LOCK_ID = 730_2025;

async function main() {
  loadEnv();
  const { client, target } = await connect();
  console.log(`Database: ${target}`);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);

    const dir = join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    const applied = new Map(
      (await client.query<{ version: string; checksum: string; applied_at: Date }>("SELECT version, checksum, applied_at FROM schema_migrations")).rows.map((r) => [r.version, r]),
    );

    if (flag("status")) {
      for (const f of files) {
        const row = applied.get(f);
        console.log(`${row ? "applied " : "pending "} ${f}${row ? `  (${row.applied_at.toISOString()})` : ""}`);
      }
      return;
    }

    let count = 0;
    for (const file of files) {
      const sql = readFileSync(join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const row = applied.get(file);
      if (row) {
        if (row.checksum !== checksum) {
          throw new Error(`${file} was changed after it was applied. Never edit an applied migration; add a new one instead.`);
        }
        continue;
      }
      process.stdout.write(`Applying ${file} … `);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.log("failed");
        throw err;
      }
      console.log("done");
      count++;
    }
    console.log(count ? `Applied ${count} migration(s).` : "Database is up to date.");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
    await client.end();
  }
}

main().catch((err) => {
  console.error(`Migration failed: ${(err as Error).message}`);
  process.exit(1);
});
