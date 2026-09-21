#!/usr/bin/env node
/**
 * LE SERVEUR LOCAL DU SITE CONSTRUIT — celui qui ressemble à Vercel.
 *
 * Depuis que le site est exporté en fichiers, `next start` n'a plus d'objet.
 * Mais servir `out/` avec n'importe quel serveur de fichiers ne permettait
 * pas de vérifier grand-chose : les redirections et les en-têtes vivent
 * dans `vercel.json`, et `scripts/verifier.sh` était donc INJOUABLE en
 * local — un des quinze constats de la revue du 2026-09-19.
 *
 * Ce serveur-ci LIT `vercel.json` : mêmes redirections, mêmes en-têtes,
 * même politique de sécurité. Et il comprime en brotli quand le navigateur
 * l'accepte, comme le CDN — sans quoi tout poids mesuré au navigateur
 * serait faux de 70 %.
 *
 * Aucune dépendance : il doit pouvoir tourner sur une machine où rien n'est
 * installé.
 *
 *   node scripts/servir.mjs [port]
 */
import { createServer } from "node:http";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const SORTIE = "out";
const PORT = Number(process.argv[2] ?? 4000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".xml", ".txt", ".svg"]);

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const REDIRECTIONS = new Map((config.redirects ?? []).map((r) => [r.source, r]));
/**
 * Les groupes d'en-têtes, avec leur motif — `/(.*)`, `/(.*)/rss.xml`… La
 * syntaxe de Vercel est assez proche d'une expression régulière pour que
 * les motifs du site s'y ramènent tels quels ; le jour où l'un d'eux ne
 * s'y ramènera plus, ce serveur le dira en ne posant pas l'en-tête, et le
 * contrôle en ligne le verra.
 */
const GROUPES_EN_TETES = (config.headers ?? []).map((groupe) => ({
  motif: new RegExp(`^${groupe.source}/?$`),
  entetes: groupe.headers,
}));

/** Le fichier qui répond à une adresse, comme le ferait un hébergeur statique. */
function resoudre(chemin) {
  const propre = normalize(decodeURIComponent(chemin)).replace(/^(\.\.[/\\])+/, "");
  const base = join(SORTIE, propre);
  for (const candidat of [base, `${base}.html`, join(base, "index.html")]) {
    if (existsSync(candidat) && statSync(candidat).isFile()) return candidat;
  }
  return null;
}

const serveur = createServer((requete, reponse) => {
  const adresse = new URL(requete.url, `http://localhost:${PORT}`);
  const chemin = adresse.pathname.replace(/\/+$/, "") || "/";

  const entetesDuChemin = [];
  for (const groupe of GROUPES_EN_TETES) {
    if (!groupe.motif.test(adresse.pathname)) continue;
    for (const entete of groupe.entetes) {
      reponse.setHeader(entete.key, entete.value);
      entetesDuChemin.push(entete.key.toLowerCase());
    }
  }

  const redirection = REDIRECTIONS.get(chemin) ?? REDIRECTIONS.get(adresse.pathname);
  if (redirection) {
    reponse.writeHead(redirection.statusCode ?? 308, { Location: redirection.destination });
    reponse.end();
    return;
  }

  const fichier = resoudre(chemin) ?? (chemin === "/" ? null : null);
  if (!fichier) {
    const absente = resoudre("/404") ?? resoudre("/fr/404");
    reponse.writeHead(404, { "Content-Type": TYPES[".html"] });
    reponse.end(absente ? readFileSync(absente) : "404");
    return;
  }

  const extension = extname(fichier);
  let contenu = readFileSync(fichier);
  const entetes = {};
  // Un `Content-Type` déclaré dans `vercel.json` l'emporte sur l'extension :
  // c'est ainsi que le flux RSS garde son type, une fois qu'il n'est plus
  // rendu par une route mais posé comme un fichier.
  if (!entetesDuChemin.includes("content-type")) {
    entetes["Content-Type"] = TYPES[extension] ?? "application/octet-stream";
  }

  if (COMPRESSIBLE.has(extension)) {
    const accepte = String(requete.headers["accept-encoding"] ?? "");
    if (accepte.includes("br")) {
      contenu = brotliCompressSync(contenu, {
        params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
      });
      entetes["Content-Encoding"] = "br";
    } else if (accepte.includes("gzip")) {
      contenu = gzipSync(contenu);
      entetes["Content-Encoding"] = "gzip";
    }
  }
  entetes["Content-Length"] = contenu.byteLength;
  reponse.writeHead(200, entetes);
  reponse.end(requete.method === "HEAD" ? undefined : contenu);
});

serveur.listen(PORT, () => {
  console.log(`  Le site construit est servi sur http://localhost:${PORT} — redirections et en-têtes de vercel.json compris.`);
});
