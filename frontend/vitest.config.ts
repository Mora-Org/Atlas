import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // `.tsx` entrou no M8.5 F2.2: teste de componente precisa de JSX. Roda em
    // `node` de propósito — o que interessa é `renderToStaticMarkup`, que é o
    // caminho do RSC público e do export script-free (e é exatamente onde o
    // recharts falha).
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
