import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { adminPage, Forbidden } from "../../guard";
import { listRoles } from "@/server/roles";
import { listApplications } from "@/server/applications";
import { PageHeader } from "@/components/ui";
import { AppForm } from "../app-form";

export const metadata: Metadata = { title: "Add application" };

export default async function NewApplicationPage() {
  const { allowed } = await adminPage("applications.manage");
  if (!allowed) return <Forbidden />;
  const [roles, apps] = await Promise.all([listRoles(), listApplications()]);
  const categories = [...new Set(apps.map((a) => a.category).filter((c): c is string => Boolean(c)))];
  return (
    <div>
      <Link href="/admin/applications" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Applications
      </Link>
      <PageHeader title="Add application" description="It is added at the end of the list. Then give users access from their profile or the Access page." />
      <AppForm mode="create" roles={roles.map((r) => ({ id: r.id, name: r.name }))} categories={categories} />
    </div>
  );
}
