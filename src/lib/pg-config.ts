import type { ClientConfig } from "pg";

/**
 * node-postgres options for a connection string such as the one Neon gives:
 *   ...?sslmode=require&channel_binding=require
 *
 * - sslmode=require/prefer/verify-ca are already treated as verify-full by
 *   node-postgres 8 (certificate and host name checked) and log a warning;
 *   we spell out verify-full so that stays true when pg 9 changes the meaning.
 * - channel_binding=require is not read from the URL by node-postgres, so it
 *   is turned into its enableChannelBinding option (SCRAM-SHA-256-PLUS).
 */
export function pgConfig(connectionString: string): ClientConfig {
  let url = connectionString;
  let enableChannelBinding = false;
  try {
    const parsed = new URL(connectionString);
    const mode = parsed.searchParams.get("sslmode");
    if (mode === "require" || mode === "prefer" || mode === "verify-ca") parsed.searchParams.set("sslmode", "verify-full");
    if (parsed.searchParams.get("channel_binding") === "require") enableChannelBinding = true;
    parsed.searchParams.delete("channel_binding");
    url = parsed.toString();
  } catch {
    // Leave unusual strings to node-postgres to report.
  }
  return { connectionString: url, enableChannelBinding } as ClientConfig;
}
