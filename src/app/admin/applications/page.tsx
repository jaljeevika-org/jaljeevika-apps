import type { Metadata } from "next";
import Link from "next/link";
import { AppWindow, Plus } from "lucide-react";
import { adminPage, Forbidden } from "../guard";
import { listApplications } from "@/server/applications";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { SortableApps, type SortableApp } from "./sortable-apps";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { allowed } = await adminPage("applications.manage");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const apps = await listApplications();
  const items: SortableApp[] = apps.map((a) => ({
    id: a.id, slug: a.slug, name: a.name, url: a.url, description: a.description, logoUrl: a.logoUrl, icon: a.icon,
    accentColor: a.accentColor, category: a.category, isActive: a.isActive, openInNewTab: a.openInNewTab,
    requiredRoleName: a.requiredRoleName, userCount: a.userCount, autoGrant: a.autoGrant,
  }));

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Drag the handle to change the order users see on their dashboard. Changes save automatically."
        actions={<Link href="/admin/applications/new" className={buttonClass()}><Plus className="size-4" aria-hidden />Add application</Link>}
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<AppWindow className="size-7" aria-hidden />}
          title="No applications yet"
          action={<Link href="/admin/applications/new" className={buttonClass()}><Plus className="size-4" aria-hidden />Add the first application</Link>}
        >
          Add Jaljeevika GIS, reports or any other tool. It will appear on the dashboard of every user you give access to.
        </EmptyState>
      ) : (
        <SortableApps initial={items} highlight={typeof sp.highlight === "string" ? sp.highlight : undefined} />
      )}
    </div>
  );
}
