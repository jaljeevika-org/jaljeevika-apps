import { cn } from "@/lib/cn";

/** The portal logo on a white tile, so JPG logos with white backgrounds look right in dark mode too. */
export function PortalLogo({ src, alt, size = 40, className }: { src: string; alt: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5", className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo served by our own API */}
      <img src={src} alt={alt} width={size} height={size} className="h-full w-full object-contain p-[8%]" />
    </span>
  );
}

/** Soft water waves used as decoration on the sign-in panel and dashboard header. */
export function Waves({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden>
      <path d="M0 80 C 200 20, 400 140, 600 80 S 1000 20, 1200 80 V160 H0 Z" fill="currentColor" opacity="0.18" />
      <path d="M0 105 C 220 55, 420 155, 640 105 S 1020 55, 1200 105 V160 H0 Z" fill="currentColor" opacity="0.22" />
      <path d="M0 130 C 240 95, 460 165, 680 130 S 1040 95, 1200 130 V160 H0 Z" fill="currentColor" opacity="0.3" />
    </svg>
  );
}
