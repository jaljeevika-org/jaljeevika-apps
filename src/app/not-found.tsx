import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Compass className="size-7" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-[15px] text-ink-2">The page you are looking for does not exist or has moved.</p>
      <Link href="/" className={buttonClass({ className: "mt-8" })}>Go to my applications</Link>
    </div>
  );
}
