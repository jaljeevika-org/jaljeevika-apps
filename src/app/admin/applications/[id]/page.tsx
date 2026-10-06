import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminPage, Forbidden } from "../../guard";
import { getApplication, listApplications } from "@/server/applications";
import { listRoles } from "@/server/roles";
import { PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/cn";
import { AppForm } from "../app-form";

export const metadata: Metadata = { title: "Edit application" };

export default async function EditApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { allowed } = await adminPage("applications.manage");
  if (!allowed) return <Forbidden />;
  const app = await getApplication(id);
  if (!app) notFound();
  const [roles, apps] = await Promise.all([listRoles(), listApplications()]);
  const categories = [...new Set(apps.map((a) => a.category).filter((c): c is string => Boolean(c)))];
  return (
    <div>
      <Link href="/admin/applications" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Applications
      </Link>
      <PageHeader title={app.name} description={`Created ${formatDateTime(app.createdAt)} · last updated ${formatDateTime(app.updatedAt)} · ${app.userCount} user(s) with access`} />
      <AppForm
        mode="edit"
        app={{
          id: app.id, slug: app.slug, name: app.name, description: app.description, url: app.url, logoUrl: app.logoUrl, icon: app.icon,
          accentColor: app.accentColor, category: app.category, requiredRoleId: app.requiredRoleId, isActive: app.isActive,
          openInNewTab: app.openInNewTab, autoGrant: app.autoGrant,
        }}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        categories={categories}
      />
    </div>
  );
}
