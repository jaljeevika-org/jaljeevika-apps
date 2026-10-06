import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/session";
import { Alert, Card } from "@/components/ui";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
      {!user.mustChangePassword ? (
        <Link href="/profile" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back to profile
        </Link>
      ) : null}
      <h1 className="text-2xl font-bold tracking-tight text-ink">{user.mustChangePassword ? "Choose your own password" : "Change password"}</h1>
      {user.mustChangePassword ? (
        <Alert tone="info" className="mt-4">
          You signed in with a temporary password from your administrator. Choose a new password to continue.
        </Alert>
      ) : (
        <p className="mt-1.5 text-[15px] text-ink-2">You&apos;ll stay signed in here; other devices will be signed out.</p>
      )}
      <Card className="mt-6 p-6">
        <ChangePasswordForm email={user.email} currentLabel={user.mustChangePassword ? "Temporary password" : "Current password"} />
      </Card>
    </div>
  );
}
