import type { Metadata } from "next";
import localFont from "next/font/local";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

// The three fonts ship in app/fonts/ (Google Fonts' latin subsets, SIL OFL), so a
// build never downloads them: an offline build works, and a Google update can't move
// the screenshot baselines. Weights match what next/font/google declared.
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
});

// One variable file serves all four weights, as Google serves it. next/font needs
// literal options, so the four entries are written out.
const ibmPlexSans = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ibm-plex",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  style: "normal",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "PitWall — AI Race Engineer",
  description:
    "AI-powered Formula 1 intelligence platform with predictions, live data, and race companion.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-f1-dark text-f1-text">
        <Providers>
          {/* Sidebar: fixed on desktop, bottom tab bar on mobile (rendered inside Sidebar) */}
          <Sidebar />
          {/* Main content: offset by sidebar on desktop, bottom tab bar on mobile */}
          <main className="ml-0 md:ml-56 min-h-screen pb-14 md:pb-0 flex flex-col">
            <Topbar />
            <div className="flex-1">
              {children}
            </div>
            <SiteFooter />
          </main>
        </Providers>
      </body>
    </html>
  );
}
