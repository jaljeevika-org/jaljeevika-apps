import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { postLoginPath } from "@/lib/safe-redirect";
import { Alert } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, { tone: "success" | "info"; text: string }> = {
  signed_out: { tone: "info", text: "You have been signed out." },
  password_reset: { tone: "success", text: "Your password has been reset. Sign in with your new password." },
  password_set: { tone: "success", text: "Your password is set. Welcome! Sign in to continue." },
  email_verified: { tone: "success", text: "Your email address is confirmed. You can sign in now." },
  session_expired: { tone: "info", text: "Your session has ended. Please sign in again." },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const user = await getSessionUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : postLoginPath(next));

  const settings = await getSettings();
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Welcome to {settings.organization_name}</h1>
      <p className="mt-1.5 text-[15px] text-ink-2">Sign in to open your applications.</p>
      {notice ? <Alert tone={notice.tone} className="mt-6">{notice.text}</Alert> : null}
      <LoginForm next={next} allowRegistration={settings.allow_registration} supportEmail={settings.support_email} />
    </div>
  );
}
