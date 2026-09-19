import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noVisibleText from "./eslint-rules/no-visible-text.mjs";

/**
 * L'ESLINT DU SITE — il n'existait pas jusqu'ici.
 *
 * Le dépôt porte deux règles locales, et elles étaient toutes deux câblées
 * sur `src/**` : le site n'était donc linté par RIEN, et « aucun texte dans
 * le code » ne tenait que par la relecture.
 *
 * UNE SEULE des deux règles se transporte ici. `client-namespaces` lit
 * `src/i18n/messages.ts` et surveille `useTranslations` : le site n'a ni
 * `next-intl`, ni espaces de messages — ses dictionnaires descendent en
 * propriétés depuis `content/<langue>/`. La règle n'aurait rien à dire, et
 * une règle qui ne peut pas échouer donne une fausse garantie.
 *
 * `no-visible-text` est recopiée plutôt qu'importée de `../eslint-rules/` :
 * le site est un projet Vercel dont la racine EST `site/`, il ne voit pas
 * ce qui vit au-dessus. Le doublon est le prix de l'étanchéité, et il est
 * assumé — les deux fichiers sont identiques, et le jour où l'un bouge,
 * l'autre se compare en une ligne de `diff`.
 */
const local = { rules: { "no-visible-text": noVisibleText.rules["no-visible-text"] } };

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "eslint-rules/**", "scripts/**"]),

  /*
   * LA RÈGLE S'APPLIQUE AUX ÉCRANS, pas au système de libellés.
   *
   * `content/**` est EXEMPTÉ parce qu'il est la destination : c'est là que
   * les textes doivent être, les y interdire n'aurait aucun sens — de la
   * même manière que `src/messages/` n'est pas lu par la règle dans
   * l'application.
   *
   * `lib/**` est exempté aussi, et pour une raison qui se vérifie : les
   * seules phrases qu'il contient sont les messages d'`ErreurArticle`, lus
   * par la personne qui construit le site dans un terminal quand un article
   * est mal formé. Ce ne sont pas des textes d'interface — personne ne les
   * verra jamais dans une page. C'est l'exemption que l'application accorde
   * déjà à `src/lib/ai`.
   */
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    plugins: { local },
    rules: { "local/no-visible-text": "error" },
  },
]);

export default eslintConfig;
