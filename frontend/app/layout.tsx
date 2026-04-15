import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
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
          </main>
        </Providers>
      </body>
    </html>
  );
}
