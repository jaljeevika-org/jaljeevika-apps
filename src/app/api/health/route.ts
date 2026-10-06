import { NextResponse } from "next/server";
import { getPool } from "@/server/db";

/** Uptime check: reports whether the database answers. Reveals no configuration. */
export async function GET() {
  const started = Date.now();
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ ok: true, database: "ok", ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
