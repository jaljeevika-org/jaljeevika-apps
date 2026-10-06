import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Laptop } from "lucide-react";
import { requireUser } from "@/server/session";
import { query } from "@/server/db";
import { Badge, Card, buttonClass } from "@/components/ui";
import { formatDate, timeAgo } from "@/lib/cn";
import { ProfileForm, SignOutOthersForm } from "./profile-forms";

export const metadata: Metadata = { title: "Profile" };

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function ProfilePage() {
  const user = await requireUser();
  const [details] = await query<{ created_at: Date; password_changed_at: Date | null; last_login_at: Date | null }>(
    "SELECT created_at, password_changed_at, last_login_at FROM users WHERE id = $1",
    [user.id],
  );
  const sessions = await query<{ id: string; created_at: Date; last_seen_at: Date; ip: string | null; user_agent: string | null; remember: boolean }>(
    "SELECT id, created_at, last_seen_at, ip, user_agent, remember FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY last_seen_at DESC LIMIT 20",
    [user.id],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Your profile</h1>
        <p className="mt-1 text-sm text-ink-2">Member since {formatDate(details?.created_at)}</p>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-ink">Account</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-3">Email</dt><dd className="mt-0.5 font-medium text-ink break-all">{user.email}</dd></div>
          <div><dt className="text-ink-3">Role</dt><dd className="mt-0.5"><Badge tone="brand">{user.role.name}</Badge></dd></div>
        </dl>
        <div className="mt-6 border-t border-line pt-6">
          <ProfileForm name={user.name} />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><KeyRound className="size-4 text-ink-3" aria-hidden />Password</h2>
            <p className="mt-1 text-sm text-ink-2">Last changed {details?.password_changed_at ? timeAgo(details.password_changed_at) : "—"}.</p>
          </div>
          <Link href="/change-password" className={buttonClass({ variant: "secondary" })}>Change password</Link>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Signed-in devices</h2>
            <p className="mt-1 text-sm text-ink-2">If you see a device you don&apos;t recognise, sign it out and change your password.</p>
          </div>
          {sessions.length > 1 ? <SignOutOthersForm /> : null}
        </div>
        <ul className="mt-5 divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
              <Laptop className="size-5 shrink-0 text-ink-3" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {describeAgent(s.user_agent)}{" "}
                  {s.id === user.sessionId ? <Badge tone="green" className="ml-1">This device</Badge> : null}
                </p>
                <p className="text-xs text-ink-3">
                  Active {timeAgo(s.last_seen_at)}{s.ip ? ` · ${s.ip}` : ""} · signed in {formatDate(s.created_at)}{s.remember ? " · remembered" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
