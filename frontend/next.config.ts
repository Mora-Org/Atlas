import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Ficou `true` (o default do scaffold) até o 0.9.2, e foi ele que deixou o
    // B1 chegar em produção: o toggle de "coluna opcional" não fazia nada, e
    // os 2 erros de tipo que denunciavam isso viviam na lista dos "3 erros
    // pré-existentes de tsc" que o build engolia. A dívida acabou no 0.8.1 —
    // `tsc --noEmit` mede 0, e o CI gateia. Manter o escape hatch aberto agora
    // só serviria pra ele voltar.
    ignoreBuildErrors: false,
  },
  // A chave `eslint` foi REMOVIDA do NextConfig no Next 16 (`next lint` saiu).
  // Mantê-la fazia o servidor logar "Invalid next.config.ts options detected"
  // a cada boot e era 1 dos 3 erros do `tsc --noEmit`. Lint em PR é papel do CI.
};

export default nextConfig;
