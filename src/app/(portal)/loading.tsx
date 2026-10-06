import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center" role="status" aria-live="polite">
      <LoaderCircle className="size-7 animate-spin text-brand-500" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
