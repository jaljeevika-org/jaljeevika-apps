import { requireUser } from "@/server/session";
import { AppHeader } from "@/components/app-header";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // /change-password lives here too and must stay reachable for users with a temporary password.
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
