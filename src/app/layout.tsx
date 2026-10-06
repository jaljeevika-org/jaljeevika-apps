import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Toaster } from "@/components/client";
import { getSettings } from "@/server/settings";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  // Request-time only: never query the database while building.
  await connection();
  let name = "Jaljeevika App Portal";
  try {
    name = (await getSettings()).portal_name;
  } catch {
    // Database unavailable: keep the default title; the page shows the error.
  }
  return {
    title: { default: name, template: `%s · ${name}` },
    description: "One sign-in for every Jaljeevika application.",
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f1d" },
  ],
};

// Applies the saved theme before the first paint (no light/dark flash).
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('jj-theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
