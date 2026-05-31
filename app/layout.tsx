import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mixea.io";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Mixea — Audit complet de site web : SEO, Performance, Sécurité",
    template: "%s | Mixea",
  },
  description:
    "Auditez votre site web en 15 secondes sur 6 dimensions : SEO technique, Core Web Vitals, UX, Contenu, Sécurité et Présence sociale. Corrections IA prêtes à copier. Comparaison concurrent en temps réel.",
  keywords: [
    "audit site web",
    "audit SEO",
    "performance web",
    "Core Web Vitals",
    "sécurité web",
    "GTmetrix alternative",
    "Screaming Frog alternative",
    "corrections IA",
  ],
  authors: [{ name: "Mixea" }],
  creator: "Mixea",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: APP_URL,
    siteName: "Mixea",
    title: "Mixea — Audit complet de site web en 15 secondes",
    description:
      "SEO · Performance · UX · Sécurité · Contenu · Social. Corrections IA prêtes à copier. Comparez avec votre concurrent.",
    images: [
      {
        url: `${APP_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Mixea — Audit complet de site web",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mixea — Audit complet de site web en 15 secondes",
    description:
      "SEO · Performance · UX · Sécurité · Contenu · Social. Corrections IA. Comparez avec votre concurrent.",
    images: [`${APP_URL}/og-image.png`],
    creator: "@mixea_io",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const schemaOrg = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Mixea",
  description:
    "Outil d'audit complet de site web : SEO technique, Core Web Vitals, accessibilité, sécurité, contenu et présence sociale. Corrections IA incluses.",
  url: APP_URL,
  applicationCategory: "WebApplication",
  operatingSystem: "Any",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
    },
    {
      "@type": "Offer",
      name: "Starter",
      price: "19",
      priceCurrency: "USD",
      billingIncrement: "P1M",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "49",
      priceCurrency: "USD",
      billingIncrement: "P1M",
    },
  ],
  featureList: [
    "Audit SEO technique",
    "Core Web Vitals (LCP, INP, CLS, TTFB)",
    "Audit UX et accessibilité",
    "Analyse de contenu et keyword",
    "Audit sécurité (headers, fichiers exposés)",
    "Présence sur les réseaux sociaux",
    "Corrections IA prêtes à copier",
    "Comparaison concurrent en temps réel",
    "Export PDF",
    "Suivi de progression",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: { colorBackground: "#0a0a0a", colorText: "#ffffff" },
      }}
    >
      <html
        lang="fr"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <head>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
          />
        </head>
        <body className="min-h-full flex flex-col bg-[#0a0a0a] text-white">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
