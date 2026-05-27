import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Serif, EB_Garamond, Inter } from 'next/font/google'
import "./globals.css";
import { AuthProvider } from "@/components/AuthContext";
import { ThemeProvider } from "@/components/ThemeContext";
import { TweaksProvider } from "@/contexts/TweaksContext";

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz', 'SOFT'],
  variable: '--font-display',
})

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono',
})

// Fontes adicionais para os presets do Publish Studio (M6 Fase 2).
// Necessárias pra que os 4 presets (editorial/moderno/monastico/academico)
// renderizem corretamente quando aplicados pelo admin.
const plexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-plex-serif',
})

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-garamond',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: "Dynamic CMS — Powered by Next.js + FastAPI",
  description: "Headless CMS dinâmico com multi-tenancy e temas customizáveis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-theme="light"
      data-accent="goldenrod"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${plexSerif.variable} ${ebGaramond.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <AuthProvider>
          <ThemeProvider>
            <TweaksProvider>
              {children}
            </TweaksProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
