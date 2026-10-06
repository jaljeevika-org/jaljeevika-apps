import { appIcon, accentTile } from "@/lib/app-icons";
import { cn } from "@/lib/cn";

/** An application's uploaded logo, or its built-in icon on a coloured tile. */
export function AppTile({
  name, logoUrl, icon, accentColor, size = 56, className,
}: { name: string; logoUrl: string | null; icon: string; accentColor: string; size?: number; className?: string }) {
  if (logoUrl) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-black/5", className)} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logos are served by /api/files */}
        <img src={logoUrl} alt={`${name} logo`} width={size} height={size} className="h-full w-full object-contain p-[10%]" loading="lazy" />
      </span>
    );
  }
  const Icon = appIcon(icon);
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-2xl", accentTile(accentColor), className)} style={{ width: size, height: size }}>
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} aria-hidden strokeWidth={1.8} />
    </span>
  );
}
