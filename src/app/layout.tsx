import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, THEME_NO_FLASH_SCRIPT } from "./ThemeProvider";
import AnalyticsBeacon from "./AnalyticsBeacon";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://mycultivate.app"),
  title: "Cultivate",
  description: "One place for your homeschool records, your garden and animals, and the work around your house.",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: "Cultivate",
    title: "Cultivate — for the homeschool family that never separated school from life",
    description: "One place for your homeschool records, your garden and animals, and the work around your house.",
    url: "/",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Cultivate — homeschool records, garden and animals, and the house, in one place",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cultivate — for the homeschool family that never separated school from life",
    description: "One place for your homeschool records, your garden and animals, and the work around your house.",
    images: ["/og-image.png"],
  },
  verification: {
    google: "4uh8TBGcmSJwc_rcSfoUSyoyfNORUh8NCYlKwtxjCa0",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cultivate",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before first paint so the saved theme is applied with no flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }} />
        <meta name="theme-color" content="#0c0a09" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <AnalyticsBeacon />
        <ThemeProvider>{children}</ThemeProvider>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js');
            });
          }
        `}} />
      </body>
    </html>
  );
}
