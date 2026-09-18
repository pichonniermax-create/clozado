import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Les EN-TÊTES DE SÉCURITÉ de toutes les réponses (chantier audit et
 * production-ready, étape 2, constat S4) — posés ici, à la source, pour que
 * pages, routes et fichiers statiques les portent sans qu'aucun écran n'y
 * pense :
 * - `frame-ancestors 'none'` : aucune page du produit ne s'affiche dans une
 *   iframe d'un autre site — le détournement de clic sur `/partage/<jeton>`
 *   (un partenaire « accepte » une commission derrière un cadre invisible)
 *   n'a plus de surface. Une CSP complète (script-src avec nonce) est un
 *   chantier à part : next-intl et les styles inline de la marque l'exigent
 *   autrement — pas ici.
 * - `nosniff` : le navigateur ne devine jamais un type de contenu.
 * - `Referrer-Policy` : l'adresse complète ne part qu'à notre propre
 *   origine ; `/api/partage` garde son `no-referrer`, plus strict (le jeton
 *   est dans l'URL) — la règle spécifique ci-dessous l'emporte, en plus de
 *   l'en-tête que la route pose elle-même.
 * - `Permissions-Policy` : ni caméra, ni micro, ni géolocalisation.
 * - HSTS explicite (deux ans, sous-domaines compris) : Vercel le pose déjà,
 *   il ne dépend plus de l'hébergeur.
 * `s.js` (le script posé sur les sites des clients) garde son
 * `Access-Control-Allow-Origin: *` : ces en-têtes n'y touchent pas.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Le logo et sa SOURCE (cadrage, 2026-09-17) voyagent en PNG base64 dans une action serveur : jusqu'à deux sources
    // de 1 Mo et trois rendus de 400 Ko — au-delà du 1 Mo par défaut. Aucun autre formulaire n'approche cette taille.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/partage/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      /**
       * Le raccordement à l'agenda : le rappel porte un code d'autorisation dans son adresse et la page de
       * retour porte un jeton. Aucun référent n'en sort, et la politique de sécurité y est FERMÉE — la règle
       * la plus spécifique l'emporte sur `frame-ancestors 'none'` posé plus haut pour tout le produit (les
       * en-têtes de la configuration gagnent contre ceux que pose la route : c'est ici qu'il faut l'écrire).
       */
      {
        source: "/api/google/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'" },
        ],
      },
    ];
  },
};

// La configuration de langue de chaque requête vit dans src/i18n/request.ts.
export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
