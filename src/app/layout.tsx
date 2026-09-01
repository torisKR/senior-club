import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SiteShell } from "@/components/site-shell";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${SITE_NAME} | 같은 관심사로 이어지는 시니어 모임`,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME, url: getSiteUrl() }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "community",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  icons: {
    icon: "/images/senior-club-mark-v3.png",
    apple: "/images/senior-club-maskable-v2.png",
  },
  openGraph: {
    title: `${SITE_NAME} | 같은 관심사로 이어지는 시니어 모임`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    url: "/",
    images: [
      {
        url: "/images/club-senior-hero.jpg",
        width: 1812,
        height: 868,
        alt: `${SITE_NAME}에서 관심사가 같은 사람들과 모임을 갖는 모습`,
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | 같은 관심사로 이어지는 시니어 모임`,
    description: SITE_DESCRIPTION,
    images: ["/images/club-senior-hero.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#edf4f4",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          본문으로 바로가기
        </a>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
