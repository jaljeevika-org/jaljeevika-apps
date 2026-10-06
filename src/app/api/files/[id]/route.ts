import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "@/server/files";
import { getSessionUser } from "@/server/session";

/**
 * Serves uploaded logos from the private bucket (or the database).
 * The portal logo is public (the sign-in page shows it); application logos
 * are only served to signed-in users. File ids are random UUIDs and a new
 * upload always gets a new id, so responses can be cached forever.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let file;
  try {
    file = await readFile(id);
  } catch (err) {
    console.error("[files] read failed:", (err as Error).message);
    return new NextResponse("Unavailable", { status: 503 });
  }
  if (!file) return new NextResponse("Not found", { status: 404 });
  if (file.purpose !== "portal_logo" && !(await getSessionUser())) {
    return new NextResponse("Not found", { status: 404 });
  }
  const etag = `"${file.sha256.slice(0, 32)}"`;
  const cacheControl = file.purpose === "portal_logo" ? "public, max-age=31536000, immutable" : "private, max-age=31536000, immutable";
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }
  return new NextResponse(Buffer.from(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.length),
      "Cache-Control": cacheControl,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      // An SVG opened directly cannot run scripts or load anything.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
