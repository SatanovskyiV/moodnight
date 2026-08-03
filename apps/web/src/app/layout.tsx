import type { Metadata, Viewport } from "next";
import {
  Cinzel,
  Cormorant_Garamond,
  IM_Fell_English_SC,
  UnifrakturMaguntia,
} from "next/font/google";

import "./globals.css";

/**
 * Replaces the render-blocking Google Fonts <link> in the prototype's
 * prototype/MoodNight.html:10. Only Cormorant Garamond — the body face, and the one
 * that actually sets Ukrainian text — ships a Cyrillic subset upstream; the
 * three display faces are Latin-only at the source.
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  variable: "--font-cormorant",
  display: "swap",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});

const imFell = IM_Fell_English_SC({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-im-fell",
  display: "swap",
});

const unifraktur = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-unifraktur",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MoodNight",
  description: "Тиха сцена для темної поезії",
};

export const viewport: Viewport = {
  themeColor: "#0a0805",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="uk"
      data-accent="gold"
      className={`${cormorant.variable} ${cinzel.variable} ${imFell.variable} ${unifraktur.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
