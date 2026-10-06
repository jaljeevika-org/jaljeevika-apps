import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { pgConfig } from "@/lib/pg-config";

/** Anything that can run a query: the pool or a client inside a transaction. */
export type Db = Pick<Pool, "query"> | PoolClient;

const globalForDb = globalThis as unknown as { __jjPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See README: Connect Neon PostgreSQL.");
  }
  const pool = new Pool({
    ...pgConfig(connectionString),
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    // Neon computes that scaled to zero take a moment to wake up.
    connectionTimeoutMillis: 15_000,
  });
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });
  // On Vercel Fluid compute this keeps the instance alive long enough to
  // close idle connections cleanly; elsewhere it is a no-op.
  attachDatabasePool(pool);
  return pool;
}

export function getPool(): Pool {
  globalForDb.__jjPool ??= createPool();
  return globalForDb.__jjPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Db = getPool(),
): Promise<T[]> {
  const result = await db.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Db = getPool(),
): Promise<T | null> {
  const rows = await query<T>(text, params, db);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The original error matters more than a failed rollback.
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres error code helper (e.g. 23505 unique_violation). */
export function pgErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "constraint" in err
    ? String((err as { constraint: unknown }).constraint)
    : undefined;
}
