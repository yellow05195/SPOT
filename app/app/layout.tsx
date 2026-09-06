import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Modak } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { PaperFilters } from "@/components/PaperFilters";
import { StyledJsxRegistry } from "@/components/StyledJsxRegistry";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const balloon = Modak({ weight: "400", subsets: ["latin"], variable: "--font-balloon", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://spot.example";
const DESCRIPTION = "Photograph a listed company in the wild. Receive a fragment of its stock.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "SPOT · every street owns a piece", template: "%s · SPOT" },
  description: DESCRIPTION,
  openGraph: { title: "SPOT · every street owns a piece", description: DESCRIPTION, siteName: "SPOT", type: "website" },
  twitter: { card: "summary_large_image", title: "SPOT · every street owns a piece", description: DESCRIPTION },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SPOT" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${geist.variable} ${geistMono.variable} ${balloon.variable}`} suppressHydrationWarning>
      <body>
        <StyledJsxRegistry>
          <PaperFilters />
          <Providers>
            <Nav />
            <main>{children}</main>
          </Providers>
        </StyledJsxRegistry>
      </body>
    </html>
  );
}
