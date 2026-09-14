import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Les tests unitaires (chantier audit et production-ready, étape 3) : la
 * logique PURE de `src/lib` (analyse d'emails, critères, rendu, formats,
 * CSV, chiffrement…), sans base ni navigateur — ce que `next build` ne
 * vérifie pas. `npm test` en local et dans l'intégration continue.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Aucune variable d'environnement n'est lue par un test : un test qui en aurait besoin la pose lui-même.
    clearMocks: true,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
