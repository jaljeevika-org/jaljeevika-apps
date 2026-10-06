import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/session";
import { resolveLaunch } from "@/server/applications";
import { audit } from "@/server/audit";

/**
 * GET /launch/<slug> — the only way the dashboard opens an application.
 * Every click is re-authorised here against the database:
 *   1. signed in, 2. account active (checked when the session loads),
 *   3. application active, 4. user has access.
 * Only then is the browser redirected to the application's URL. No
 * credentials or tokens are ever added to that URL.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `/launch/${slug}`);
    return NextResponse.redirect(login, 303);
  }
  if (user.mustChangePassword) return NextResponse.redirect(new URL("/change-password", request.url), 303);

  const decision = await resolveLaunch(user, slug.toLowerCase());
  if (!decision.ok) {
    await audit({ actorId: user.id, action: "application.launch_denied", targetType: "application", metadata: { slug, reason: decision.reason } });
    const denied = new URL("/launch-denied", request.url);
    denied.searchParams.set("reason", decision.reason);
    if (decision.appName) denied.searchParams.set("app", decision.appName);
    return NextResponse.redirect(denied, 303);
  }

  await audit({ actorId: user.id, action: "application.launched", targetType: "application", targetId: decision.app.id, metadata: { application: decision.app.name, slug } });
  const response = NextResponse.redirect(decision.target, 303);
  response.headers.set("Cache-Control", "no-store");
  // Do not tell the destination which portal page the user came from.
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
