import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "CIMG Portfolio",
    template: "%s · CIMG Portfolio",
  },
  description: "Live portfolio dashboard for the Culverhouse Investment Management Group.",
  applicationName: "CIMG Portfolio",
  openGraph: {
    title: "CIMG Portfolio",
    description: "Live portfolio dashboard for the Culverhouse Investment Management Group.",
    type: "website",
    siteName: "CIMG Portfolio",
  },
  twitter: {
    card: "summary",
    title: "CIMG Portfolio",
    description: "Live portfolio dashboard for the Culverhouse Investment Management Group.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Default to dark; only switch to light if the user has explicitly
  // chosen it via the theme toggle (which sets the cookie).
  const theme = (await cookies()).get("theme")?.value === "light" ? "" : "dark";

  return (
    <html lang="en" className={theme}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
