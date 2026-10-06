"use client";

import { useEffect } from "react";
import { CloudOff } from "lucide-react";
import { buttonClass } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
        <CloudOff className="size-7" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-[15px] text-ink-2">
        The portal could not complete your request. This is usually temporary — please try again in a moment.
      </p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-ink-3">Reference: {error.digest}</p> : null}
      <div className="mt-8 flex gap-2">
        <button type="button" onClick={reset} className={buttonClass()}>Try again</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload on purpose */}
        <a href="/" className={buttonClass({ variant: "secondary" })}>Home</a>
      </div>
    </div>
  );
}
