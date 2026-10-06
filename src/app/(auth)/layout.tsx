import { KeyRound, LayoutGrid, ShieldCheck } from "lucide-react";
import { getSettings, portalLogoUrl } from "@/server/settings";
import { PortalLogo, Waves } from "@/components/brand";
import { ThemeToggle } from "@/components/client";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const logo = portalLogoUrl(settings);
  return (
    <div className="flex min-h-dvh">
      <aside className="relative hidden w-[44%] max-w-[640px] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-water-600 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <PortalLogo src={logo} alt={`${settings.organization_name} logo`} size={48} />
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand-100">{settings.organization_name}</p>
            <p className="text-lg font-semibold">{settings.portal_name}</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-[34px] font-bold leading-tight tracking-tight">One sign-in for every {settings.organization_name} application.</h2>
          <ul className="mt-8 space-y-4 text-[15px] text-brand-50/90">
            <li className="flex gap-3"><LayoutGrid className="mt-0.5 size-5 shrink-0 text-water-400" aria-hidden />All your tools — GIS, planning, dashboards and reports — in one place.</li>
            <li className="flex gap-3"><KeyRound className="mt-0.5 size-5 shrink-0 text-water-400" aria-hidden />One password to remember, reset by email whenever you need.</li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-water-400" aria-hidden />You only see the applications your administrator has given you.</li>
          </ul>
        </div>
        <p className="relative text-sm text-brand-100/80">© {new Date().getFullYear()} {settings.organization_name}</p>
        <Waves className="absolute inset-x-0 bottom-0 h-40 w-full text-white" />
      </aside>

      <main className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="flex items-center gap-2.5 lg:invisible">
            <PortalLogo src={logo} alt={`${settings.organization_name} logo`} size={36} />
            <span className="text-sm font-semibold text-ink">{settings.portal_name}</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
          <div className="w-full max-w-[420px] animate-rise">{children}</div>
        </div>
      </main>
    </div>
  );
}
