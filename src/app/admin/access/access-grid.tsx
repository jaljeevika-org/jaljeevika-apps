"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { setAccessAction, setAccessForAllAction } from "./actions";
import { AppTile } from "@/components/app-tile";
import { Avatar, Card } from "@/components/ui";
import { cn } from "@/lib/cn";

type UserRow = { id: string; name: string; email: string; isActive: boolean; roleKey: string; roleName: string; appIds: string[] };
type AppCol = { id: string; name: string; logoUrl: string | null; icon: string; accentColor: string; isActive: boolean };

export function AccessGrid({ users, apps }: { users: UserRow[]; apps: AppCol[] }) {
  const [grants, setGrants] = useState(() => new Set(users.flatMap((u) => u.appIds.map((a) => `${u.id}:${a}`))));
  const [, start] = useTransition();
  useEffect(() => setGrants(new Set(users.flatMap((u) => u.appIds.map((a) => `${u.id}:${a}`)))), [users]);

  const toggle = (user: UserRow, app: AppCol) => {
    const key = `${user.id}:${app.id}`;
    const next = !grants.has(key);
    setGrants((g) => {
      const n = new Set(g);
      if (next) n.add(key);
      else n.delete(key);
      return n;
    });
    start(async () => {
      const res = await setAccessAction(user.id, app.id, next);
      if (res.error) {
        toast.error(res.error);
        setGrants((g) => {
          const n = new Set(g);
          if (next) n.delete(key);
          else n.add(key);
          return n;
        });
      } else {
        toast.success(`${next ? "Gave" : "Removed"} ${app.name} ${next ? "to" : "from"} ${user.name}`, { id: "access", duration: 1600 });
      }
    });
  };

  const bulk = (app: AppCol, granted: boolean) => {
    if (!confirm(granted ? `Give ${app.name} to every user?` : `Remove ${app.name} from every user?`)) return;
    start(async () => {
      const res = await setAccessForAllAction(app.id, granted);
      if (res.error) toast.error(res.error);
      else if (res.message) toast.success(res.message);
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[220px] border-b border-line bg-surface px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">User</th>
              {apps.map((app) => (
                <th key={app.id} className="min-w-[104px] border-b border-line px-2 py-3 align-bottom">
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <AppTile name={app.name} logoUrl={app.logoUrl} icon={app.icon} accentColor={app.accentColor} size={32} className="rounded-lg" />
                    <span className={cn("line-clamp-2 text-xs font-semibold", app.isActive ? "text-ink" : "text-ink-3 line-through")}>{app.name}</span>
                    <span className="flex gap-1.5 text-[11px] font-medium">
                      <button type="button" onClick={() => bulk(app, true)} className="text-brand-600 hover:underline dark:text-brand-300">all</button>
                      <span className="text-ink-3">·</span>
                      <button type="button" onClick={() => bulk(app, false)} className="text-ink-2 hover:underline">none</button>
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSuper = user.roleKey === "super_admin";
              return (
                <tr key={user.id} className="group">
                  <td className="sticky left-0 z-10 border-b border-line bg-surface px-4 py-2.5 group-hover:bg-surface-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={user.name} className="size-8 text-xs" />
                      <div className="min-w-0">
                        <p className={cn("truncate font-medium", user.isActive ? "text-ink" : "text-ink-3 line-through")}>{user.name}</p>
                        <p className="truncate text-xs text-ink-3">{user.roleName}{!user.isActive ? " · disabled" : ""}</p>
                      </div>
                    </div>
                  </td>
                  {apps.map((app) => {
                    const on = grants.has(`${user.id}:${app.id}`);
                    return (
                      <td key={app.id} className="border-b border-line px-2 py-2.5 text-center group-hover:bg-surface-2/60">
                        {isSuper ? (
                          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15" title="Super Admins can open every application">
                            <Check className="size-4" aria-label="Always (Super Admin)" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            aria-label={`${user.name} can open ${app.name}`}
                            onClick={() => toggle(user, app)}
                            className={cn(
                              "inline-flex size-7 items-center justify-center rounded-lg border transition-all",
                              on ? "border-brand-600 bg-brand-600 text-white shadow-sm" : "border-line bg-surface text-transparent hover:border-brand-400",
                            )}
                          >
                            <Check className="size-4" aria-hidden />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
