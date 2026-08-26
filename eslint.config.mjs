import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import clientNamespaces from "./eslint-rules/client-namespaces.mjs";
import noVisibleText from "./eslint-rules/no-visible-text.mjs";

const local = { rules: { "no-visible-text": noVisibleText.rules?.["no-visible-text"] ?? noVisibleText, "client-namespaces": clientNamespaces } };

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
  ]),
  // Aucune chaîne visible dans le code (chantier marque blanche et
  // internationalisation, étape 4) : la règle et ses exceptions sont
  // documentées dans eslint-rules/no-visible-text.mjs. Les prompts du
  // modèle (src/lib/ai) ne sont pas des textes d'interface : exclus.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/ai/**"],
    plugins: { local },
    rules: { "local/no-visible-text": "error", "local/client-namespaces": "error" },
  },
]);

export default eslintConfig;
