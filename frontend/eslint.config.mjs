import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Código de terceiro minificado servido como asset (1.3): o SheetJS que o
    // botão de Excel do site público usa. Lintar bundle minificado só produz
    // ruído — sozinho ele levou a catraca de 6 pra 47 warnings.
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
