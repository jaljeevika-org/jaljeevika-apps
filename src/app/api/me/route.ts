import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { accessibleApplications } from "@/server/applications";

/**
 * The signed-in user and the applications they may open (same-origin only:
 * the session cookie is host-only). A building block for the portal's own
 * front end and for the future OIDC "userinfo" endpoint.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const apps = user.mustChangePassword ? [] : await accessibleApplications(user);
  return NextResponse.json(
    {
      user: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, role: user.role.key, mustChangePassword: user.mustChangePassword },
      applications: apps.map((a) => ({ id: a.id, slug: a.slug, name: a.name, description: a.description, launchUrl: `/launch/${a.slug}`, category: a.category })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
