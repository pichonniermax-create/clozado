import path from "node:path";
import type { NextConfig } from "next";

/**
 * Le site marketing est ENTIÈREMENT STATIQUE : chaque page est rendue au
 * build et servie par le CDN. Aucune route d'API, aucun proxy, aucun accès
 * à une base — rien ne s'exécute à la requête. C'est ce qui garantit le
 * LCP et l'indépendance vis-à-vis de l'application (un incident de l'app
 * ne peut pas atteindre le site).
 *
 * Les redirections des anciennes adresses Framer et les en-têtes vivent
 * dans `vercel.json`, pas ici : Vercel les applique au bord, avant toute
 * fonction, et `vercel.json` sait poser un VRAI 301 (Next ne produit que
 * des 308 avec `permanent: true`).
 */
const nextConfig: NextConfig = {
  /**
   * ET IL EST EXPORTÉ EN FICHIERS. `next build` écrit un dossier `out/`
   * qui contient un `.html` par adresse, les feuilles de style, les
   * polices et les images de partage — rien d'autre. C'est ce dossier que
   * Vercel sert, et c'est lui que `scripts/depouiller.mjs` dépouille de la
   * charge d'hydratation avant de le laisser partir : le navigateur reçoit
   * du HTML, du CSS et NOTRE seul script.
   *
   * Ce que l'export interdit (ISR, réécritures, en-têtes, routes qui
   * lisent la requête) n'a jamais servi ici : les redirections et les
   * en-têtes vivent dans `vercel.json` depuis le premier jour.
   */
  output: "export",

  /**
   * LA FRONTIÈRE ENTRE LE SITE ET L'APPLICATION, posée ici et pas
   * ailleurs. Sans cette ligne, Turbopack remonte jusqu'au fichier de
   * verrouillage de la racine du dépôt, se croit à la racine, et compile
   * `src/proxy.ts` et `src/instrumentation.ts` de l'APPLICATION dans le
   * build du site (constaté au premier build : cinq erreurs de résolution).
   * Le site ne résout plus rien au-dessus de `site/`.
   */
  turbopack: { root: path.join(__dirname) },

  // L'en-tête `x-powered-by: Next.js` n'apprend rien à personne d'utile.
  poweredByHeader: false,
  experimental: {
    // `app/global-not-found.tsx` : la 404 des adresses qui ne correspondent
    // à AUCUNE route. La coquille racine du site vit sous un segment
    // dynamique (`app/[locale]/layout.tsx`) — c'est le cas que la
    // documentation de Next 16 désigne nommément pour cette option.
    globalNotFound: true,
  },
};

export default nextConfig;
