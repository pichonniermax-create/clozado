#!/usr/bin/env node
/**
 * LE GARDE-FOU DU POIDS — il fait ÉCHOUER LA CONSTRUCTION quand une page
 * dépasse 160 Kio transférés, ou quand un morceau de l'hydratation a
 * échappé au dépouillement.
 *
 * POURQUOI UN SCRIPT. Le plafond de 160 Kio était écrit dans la doctrine
 * depuis le premier jour, et il n'a jamais été tenu : mesuré au navigateur
 * le 2026-09-19, le site pesait de 283 à 295 Kio par page. Un plafond que
 * personne ne mesure n'est pas un plafond, c'est un vœu. Celui-ci est
 * mesuré à chaque construction, et il arrête la construction.
 *
 * CE QUI EST COMPTÉ : la page, ses feuilles de style, ses scripts, et les
 * polices qu'elle PRÉCHARGE — c'est-à-dire tout ce qu'un navigateur tire du
 * réseau pour afficher la page, et rien d'autre. Les images de partage
 * (Open Graph) ne le sont pas : elles ne sont demandées que par les réseaux
 * sociaux, jamais par un visiteur.
 *
 * COMMENT IL EST COMPTÉ : en BROTLI, qualité maximale, parce que c'est ce
 * que le CDN envoie — mesurer le fichier brut donnerait un chiffre qui
 * n'existe sur aucune ligne. Les polices `woff2` sont déjà comprimées : on
 * les compte telles quelles.
 */
import { brotliCompressSync, constants } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";

const SORTIE = "out";
const PLAFOND = 160 * 1024;
/** Une police, une image : déjà comprimées, les recomprimer mentirait. */
const DEJA_COMPRIME = /\.(woff2?|png|jpe?g|webp|avif|gif|ico)$/i;
/**
 * UN SCRIPT qui vient de `_next`, et rien d'autre : les feuilles de style
 * vivent dans le même dossier `_next/static/chunks/`, et chercher le nom du
 * dossier accusait les quatorze pages de porter une hydratation qu'elles
 * n'avaient plus.
 */
const TRACE_HYDRATATION = /<script\b[^>]*\bsrc="\/_next\//;

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const cache = new Map();
/** Le poids d'un fichier tel qu'il part sur le réseau. */
function poids(chemin) {
  if (cache.has(chemin)) return cache.get(chemin);
  let valeur;
  try {
    const contenu = readFileSync(chemin);
    valeur = DEJA_COMPRIME.test(chemin)
      ? contenu.byteLength
      : brotliCompressSync(contenu, {
          params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
        }).byteLength;
  } catch {
    valeur = null; // le fichier n'existe pas : signalé plus bas
  }
  cache.set(chemin, valeur);
  return valeur;
}

/** Les adresses locales que la page demande au réseau. */
function ressources(html) {
  const trouvees = new Set();
  const ajoute = (adresse) => {
    if (adresse && adresse.startsWith("/")) trouvees.add(adresse.split(/[?#]/)[0]);
  };
  for (const balise of html.match(/<link\b[^>]*>/g) ?? []) {
    const relation = balise.match(/\brel="([^"]*)"/)?.[1] ?? "";
    const commeQuoi = balise.match(/\bas="([^"]*)"/)?.[1] ?? "";
    if (relation !== "stylesheet" && !(relation.includes("preload") && (commeQuoi === "font" || commeQuoi === "style"))) continue;
    ajoute(balise.match(/\bhref="([^"]*)"/)?.[1]);
  }
  for (const balise of html.match(/<script\b[^>]*>/g) ?? []) {
    ajoute(balise.match(/\bsrc="([^"]*)"/)?.[1]);
  }
  return [...trouvees];
}

/**
 * Les polices qu'une feuille de style va chercher.
 *
 * Une page ne PRÉCHARGE pas toujours ses polices — la 404 globale, par
 * exemple, les laisse venir par le `@font-face`. Ne compter que les
 * préchargements aurait donné 8 Kio pour une page qui en tire 60 : un
 * garde-fou qui sous-compte est pire que pas de garde-fou.
 */
function avecLesPolicesDesStyles(adresses) {
  const toutes = new Set(adresses);
  for (const adresse of adresses) {
    if (!adresse.endsWith(".css")) continue;
    let feuille;
    try {
      feuille = readFileSync(join(SORTIE, ...posix.normalize(adresse).split("/")), "utf8");
    } catch {
      continue;
    }
    // Les adresses y sont RELATIVES au fichier de style (`url(../media/…)`) :
    // les lire telles quelles ne trouvait aucune police, et la 404 globale
    // s'annonçait à 8 Kio quand elle en tire soixante.
    const dossier = posix.dirname(adresse);
    for (const trouve of feuille.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)) {
      const cible = trouve[1];
      if (cible.startsWith("data:") || /^https?:/.test(cible)) continue;
      toutes.add(cible.startsWith("/") ? cible : posix.normalize(posix.join(dossier, cible)));
    }
  }
  return [...toutes];
}

const pages = fichiers(SORTIE).filter((chemin) => chemin.endsWith(".html"));
if (pages.length === 0) {
  console.error("Poids : aucun fichier HTML dans « out/ ».");
  process.exit(1);
}

const restes = [];
const lignes = [];
let manquants = [];

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  if (TRACE_HYDRATATION.test(html) || html.includes("self.__next_f")) restes.push(page);

  const adresse = "/" + relative(SORTIE, page).replace(/\\/g, "/").replace(/(index)?\.html$/, "").replace(/\/$/, "");
  const octetsPage = poids(page);
  let total = octetsPage;
  const detail = { page: octetsPage, css: 0, js: 0, polices: 0 };
  for (const ressource of avecLesPolicesDesStyles(ressources(html))) {
    const chemin = join(SORTIE, ...posix.normalize(ressource).split("/"));
    const octets = poids(chemin);
    if (octets === null) {
      manquants.push(`${adresse} → ${ressource}`);
      continue;
    }
    total += octets;
    if (ressource.endsWith(".css")) detail.css += octets;
    else if (ressource.endsWith(".js")) detail.js += octets;
    else detail.polices += octets;
  }
  lignes.push({ adresse: adresse || "/", total, ...detail });
}

const kio = (octets) => (octets / 1024).toFixed(1);
lignes.sort((a, b) => b.total - a.total);

console.log("\n  POIDS TRANSFÉRÉ PAR PAGE (brotli, plafond 160 Kio)\n");
console.log(`  ${"adresse".padEnd(34)}${"page".padStart(8)}${"css".padStart(8)}${"js".padStart(8)}${"polices".padStart(9)}${"total".padStart(9)}`);
for (const ligne of lignes) {
  const marque = ligne.total > PLAFOND ? "  DÉPASSE" : "";
  console.log(
    `  ${ligne.adresse.padEnd(34)}${kio(ligne.page).padStart(8)}${kio(ligne.css).padStart(8)}${kio(ligne.js).padStart(8)}${kio(ligne.polices).padStart(9)}${kio(ligne.total).padStart(9)}${marque}`
  );
}

const pire = lignes[0];
console.log(`\n  ${lignes.length} pages, la plus lourde à ${kio(pire.total)} Kio (${pire.adresse}).`);

let arret = false;
if (restes.length > 0) {
  console.error(`\n  ARRÊT — ${restes.length} pages portent encore la charge d'hydratation :`);
  restes.slice(0, 10).forEach((page) => console.error(`    ${page}`));
  arret = true;
}
if (manquants.length > 0) {
  console.error(`\n  ARRÊT — ${manquants.length} ressources demandées et absentes du dossier servi :`);
  manquants.slice(0, 10).forEach((ligne) => console.error(`    ${ligne}`));
  arret = true;
}
const trop = lignes.filter((ligne) => ligne.total > PLAFOND);
if (trop.length > 0) {
  console.error(`\n  ARRÊT — ${trop.length} pages dépassent le plafond de 160 Kio.`);
  arret = true;
}
if (arret) process.exit(1);
console.log("  Aucune page ne dépasse le plafond, aucune trace d'hydratation.\n");
