import type { Metadata } from "next";

// The section's page is a client component, which can't export metadata, so its
// tab title lives here (the root layout's template adds "· PitWall").
export const metadata: Metadata = { title: "Live" };

export default function LiveLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
