import type { Metadata } from "next";
import localFont from 'next/font/local'
import "./globals.css";
import { AuthProvider } from "@/components/AuthContext";
import { ThemeProvider } from "@/components/ThemeContext";
import { TweaksProvider } from "@/contexts/TweaksContext";

/* B14 — as fontes eram `next/font/google` e o build BAIXAVA cada arquivo da
 * fonts.gstatic.com. Em 14/08/2026 a CDN entregou ao build URLs que ela mesma
 * responde com 404 (`UcCB3Fwr…` → 404, enquanto o CSS do mesmo minuto servia
 * `UcC73Fwr…` → 200) e o `next build` morreu com 21 erros de módulo — no commit
 * que tinha passado 6 minutos antes. O deploy da Vercel roda o MESMO build.
 *
 * Agora os `.woff2` moram em `src/fonts/` e o build não fala com a rede. Os
 * arquivos vieram do próprio Google, com a configuração idêntica à de antes —
 * `scripts/fetch-fonts.mjs` guarda a receita, e mudar peso/subset lá é mudança
 * VISUAL, não manutenção.
 *
 * `adjustFontFallback` é explícito em toda família: em `next/font/local` o
 * default é `'Arial'`, então as três serifadas herdariam métrica de sans e
 * mudariam o salto de layout enquanto a fonte carrega. No `next/font/google`
 * isso vinha calculado da métrica real e ninguém precisava declarar. */

const fraunces = localFont({
  // Variável de verdade, com os eixos `opsz` e `SOFT` que o projeto usa em 7
  // lugares (`globals.css` chega a fixar `wght` junto). Conferido por tamanho:
  // 120.788 bytes com opsz+wght+SOFT contra 36.620 bytes na versão só-`wght`.
  src: [{ path: '../fonts/fraunces-100-900.woff2', weight: '100 900', style: 'normal' }],
  display: 'swap',
  variable: '--font-display',
  adjustFontFallback: 'Times New Roman',
})

const plexSans = localFont({
  src: [
    { path: '../fonts/plex-sans-300.woff2', weight: '300', style: 'normal' },
    { path: '../fonts/plex-sans-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/plex-sans-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/plex-sans-600.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/plex-sans-700.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-sans',
  adjustFontFallback: 'Arial',
})

const plexMono = localFont({
  src: [
    { path: '../fonts/plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/plex-mono-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/plex-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-mono',
  // Não há opção monoespaçada — o Next só oferece Arial e Times New Roman.
  adjustFontFallback: 'Arial',
})

// Fontes adicionais para os presets do Publish Studio (M6 Fase 2).
// Necessárias pra que os 4 presets (editorial/moderno/monastico/academico)
// renderizem corretamente quando aplicados pelo admin.
const plexSerif = localFont({
  src: [
    { path: '../fonts/plex-serif-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/plex-serif-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/plex-serif-400-italic.woff2', weight: '400', style: 'italic' },
    { path: '../fonts/plex-serif-500-italic.woff2', weight: '500', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-plex-serif',
  adjustFontFallback: 'Times New Roman',
})

const ebGaramond = localFont({
  src: [
    { path: '../fonts/eb-garamond-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/eb-garamond-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/eb-garamond-400-italic.woff2', weight: '400', style: 'italic' },
    { path: '../fonts/eb-garamond-500-italic.woff2', weight: '500', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-garamond',
  adjustFontFallback: 'Times New Roman',
})

const inter = localFont({
  src: [
    { path: '../fonts/inter-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/inter-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/inter-600.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-inter',
  adjustFontFallback: 'Arial',
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
