import "./globals.css";
import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import {
  SITE_DESCRIPTION,
  SITE_LOCALE,
  SITE_NAME,
  SITE_TAGLINE,
  isIndexableHost,
  siteUrl,
} from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  // metadataBase is what turns every relative image path below into the
  // absolute URL crawlers require. Without it Next emits a build warning and
  // social/AI previews silently fall back to no image at all.
  metadataBase: new URL(siteUrl()),

  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    // Child pages set only their own title; this appends the brand once, so
    // no page has to hardcode it and none ends up double-branded.
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,

  applicationName: SITE_NAME,
  referrer: "strict-origin-when-cross-origin",
  authors: [{ name: SITE_NAME, url: siteUrl() }],
  creator: SITE_NAME,
  publisher: SITE_NAME,

  // Terms real buyers type. Modern Google ignores this tag outright; it is
  // here because some AI crawlers and smaller engines still read it, and it
  // costs nothing. The ranking work is done by the on-page copy and JSON-LD.
  keywords: [
    "restaurant management software Nepal",
    "restaurant POS Nepal",
    "IRD compliant billing software",
    "VAT billing Nepal",
    "KOT system",
    "restaurant billing software Kathmandu",
    "cafe management system Nepal",
    "table QR ordering",
    "Resthru",
  ],

  alternates: { canonical: "/" },

  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    url: siteUrl(),
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },

  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },

  robots: {
    index: isIndexableHost(),
    follow: isIndexableHost(),
    googleBot: {
      index: isIndexableHost(),
      follow: isIndexableHost(),
      // Let Google show full-size image and full-length video previews, and
      // an unlimited text snippet. The default caps the snippet, which is
      // exactly the text AI answer engines quote back to a user.
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  category: "business software",
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-NP">
      <body className={`${inter.variable} ${playfair.variable} font-sans`}>
        <QueryProvider>
          {children}
          <Toaster position="top-right" richColors />
        </QueryProvider>
      </body>
    </html>
  );
}
