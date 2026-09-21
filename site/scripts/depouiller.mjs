#!/usr/bin/env node
/**
 * LE DÉPOUILLEMENT — il retire du site construit ce qui n'aurait servi qu'à
 * l'hydrater, ET IL CASSE BRUYAMMENT LE JOUR OÙ IL NE RECONNAÎT PLUS RIEN.
 *
 * `next build` rend chaque page en HTML complet, PUIS il y ajoute de quoi
 * la reprendre côté navigateur : les morceaux de React et du routeur, et la
 * charge `self.__next_f` qui redit en JavaScript ce que le HTML dit déjà.
 * Sur ce site-ci, cela pesait 214 Kio sur 293 pour quatre comportements —
 * et aucune des pages ne tenait le plafond de 160 Kio.
 *
 * Alors on les retire. React reste l'outil qui CONSTRUIT les pages ; il ne
 * part plus chez le visiteur. Les comportements sont repris par
 * `public/comportements.js`, qui est écrit à la main et qu'on peut lire.
 *
 * CE SCRIPT TOUCHE DES INTERNES DE NEXT. Ils ne sont pas un contrat : une
 * montée de version peut renommer `self.__next_f`, déplacer les chunks ou
 * changer la forme des balises, et un script qui se contente de « remplacer
 * si ça matche » passerait alors à côté SANS RIEN DIRE — le site
 * repartirait avec ses 293 Kio, et personne ne le verrait avant la
 * prochaine mesure. C'est le pire des échecs : silencieux et lent.
 *
 * D'où CINQ VÉRIFICATIONS, toutes bloquantes :
 *   1. la version de Next installée est celle pour laquelle ce script a été
 *      écrit — sinon on s'arrête et on demande une relecture ;
 *   2. chaque page portait bien un script `_next` À RETIRER ;
 *   3. chaque page portait bien une charge `self.__next_f` À RETIRER ;
 *   4. après passage, plus AUCUNE page ne cite un script `_next` ;
 *   5. après passage, chaque page a TOUJOURS sa feuille de style — les
 *      styles vivent dans le même dossier `chunks/` que les scripts, et ce
 *      piège s'est refermé une fois : les quatorze pages sont sorties sans
 *      une ligne de CSS, et seule la colonne « css » du tableau des poids
 *      l'a dit.
 *
 * `scripts/verifier-poids.mjs` refait la cinquième et la quatrième depuis
 * l'autre bout, sur le dossier servi : deux garde-fous valent mieux qu'un
 * quand ce qu'on garde n'est pas documenté par son auteur.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const SORTIE = "out";

/**
 * LA VERSION POUR LAQUELLE CE SCRIPT A ÉTÉ RELU. `package.json` épingle la
 * même, sans plage : une montée de Next est un geste délibéré, et elle doit
 * passer par ici. Pour l'accompagner : construire, ouvrir une page de
 * `out/`, vérifier que les scripts retirés sont bien ceux de l'hydratation,
 * puis changer ces deux lignes ensemble.
 */
const VERSION_RELUE = "16.3.5";

/** Tous les fichiers d'un dossier, en profondeur. */
function fichiers(dossier) {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

/** Une balise `<script>` est-elle celle de l'hydratation ? */
function estHydratation(balise) {
  const source = balise.match(/\bsrc="([^"]*)"/)?.[1];
  if (source) return source.startsWith("/_next/");
  return balise.includes("self.__next_f");
}

function depouille(html) {
  let retire = 0;
  let scripts = 0;
  let charges = 0;
  let resultat = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (balise) => {
    if (!estHydratation(balise)) return balise;
    if (balise.includes("self.__next_f")) charges += 1;
    else scripts += 1;
    retire += Buffer.byteLength(balise);
    return "";
  });
  // Les préchargements de ces mêmes fichiers n'ont plus d'objet.
  // ATTENTION : le motif ne vise que les `.js`. Les feuilles de style
  // vivent dans le MÊME dossier `_next/static/chunks/` — viser le dossier
  // emportait le `<link rel="stylesheet">` avec.
  resultat = resultat.replace(/<link\b[^>]*\/_next\/static\/[^"]*\.js[^>]*>/g, (balise) => {
    retire += Buffer.byteLength(balise);
    return "";
  });
  return { resultat, retire, scripts, charges };
}

/** Un arrêt : il nomme ce qui a changé, et par où commencer. */
const arrets = [];
function arret(quoi, details) {
  arrets.push({ quoi, details });
}

// --- 1. La version ---------------------------------------------------------
const exigeRequire = createRequire(import.meta.url);
const version = exigeRequire("next/package.json").version;
if (version !== VERSION_RELUE) {
  console.error(
    `\n  ARRÊT — ce script dépouille des internes de Next, et il n'a été relu que pour la version ${VERSION_RELUE}.\n` +
      `  Version installée : ${version}.\n\n` +
      `  Une montée de version peut renommer « self.__next_f », déplacer les morceaux de page\n` +
      `  ou changer la forme des balises : le dépouillement passerait alors à côté sans rien dire,\n` +
      `  et le site repartirait avec la charge d'hydratation complète.\n\n` +
      `  À faire : construire, ouvrir une page de « out/ », vérifier que ce qui est retiré est bien\n` +
      `  l'hydratation et rien d'autre, puis mettre VERSION_RELUE et package.json d'accord.\n`
  );
  process.exit(1);
}

const pages = fichiers(SORTIE).filter((chemin) => chemin.endsWith(".html"));
if (pages.length === 0) {
  console.error("\n  ARRÊT — aucun fichier HTML dans « out/ ». La construction n'a rien exporté.\n");
  process.exit(1);
}

// --- 2 à 5. Page par page --------------------------------------------------
let total = 0;
let totalScripts = 0;
let totalCharges = 0;
const sansScript = [];
const sansCharge = [];
const restes = [];
const sansStyle = [];

for (const page of pages) {
  const avant = readFileSync(page, "utf8");
  const { resultat, retire, scripts, charges } = depouille(avant);

  if (scripts === 0) sansScript.push(page);
  if (charges === 0) sansCharge.push(page);
  if (/<script\b[^>]*\bsrc="\/_next\//.test(resultat) || resultat.includes("self.__next_f")) restes.push(page);
  if (!/<link\b[^>]*rel="stylesheet"/.test(resultat)) sansStyle.push(page);

  totalScripts += scripts;
  totalCharges += charges;
  if (retire > 0) {
    writeFileSync(page, resultat);
    total += retire;
  }
}

if (sansScript.length > 0) {
  arret(
    `${sansScript.length} page(s) ne portaient AUCUN script « /_next/ » à retirer`,
    "Soit Next ne les sert plus ainsi (le motif de ce script est périmé), soit ces pages n'étaient pas hydratées. Dans les deux cas, il faut regarder avant de continuer."
  );
}
if (sansCharge.length > 0) {
  arret(
    `${sansCharge.length} page(s) ne portaient AUCUNE charge « self.__next_f » à retirer`,
    "C'est le nom qui change le plus souvent d'une version à l'autre. Ouvrir une page de « out/ » avant dépouillement et lire ce que Next y écrit."
  );
}
if (restes.length > 0) {
  arret(
    `${restes.length} page(s) citent ENCORE un script de « _next » après dépouillement`,
    "Le retrait n'a pas tout pris : la forme des balises a changé. Ces pages partiraient avec leur hydratation."
  );
}
if (sansStyle.length > 0) {
  arret(
    `${sansStyle.length} page(s) n'ont PLUS de feuille de style après dépouillement`,
    "Les styles vivent dans le même dossier « chunks/ » que les scripts : le motif de retrait a mordu dessus. C'est arrivé le 2026-09-21."
  );
}

if (arrets.length > 0) {
  console.error("\n  ARRÊT — le dépouillement ne reconnaît plus ce qu'il retire.\n");
  for (const { quoi, details } of arrets) {
    console.error(`  · ${quoi}`);
    console.error(`    ${details}\n`);
  }
  for (const [titre, liste] of [
    ["sans script _next", sansScript],
    ["sans charge __next_f", sansCharge],
    ["avec des restes", restes],
    ["sans feuille de style", sansStyle],
  ]) {
    if (liste.length === 0) continue;
    console.error(`  ${titre} : ${liste.slice(0, 6).join(", ")}${liste.length > 6 ? `, … (${liste.length})` : ""}`);
  }
  console.error("\n  Rien n'est publié tant que ce script ne sait pas ce qu'il retire.\n");
  process.exit(1);
}

/*
 * CE QUI N'A PLUS DE LECTEUR QUITTE LE DOSSIER SERVI :
 *   — les fichiers JavaScript de `_next` (le socle, les morceaux de page) ;
 *   — les `.txt` que Next pose à côté de chaque page, et qui sont la même
 *     page redite en charge de navigation client — il n'y a plus de
 *     navigation client. `robots.txt` n'en est pas un : on ne retire un
 *     `.txt` que s'il a un `.html` du même nom à côté de lui, ou s'il porte
 *     le préfixe `__next.`.
 * Les feuilles de style et les polices restent, évidemment.
 */
let efface = 0;
let comptes = 0;
for (const chemin of fichiers(SORTIE)) {
  const estJsDeNext = chemin.startsWith(join(SORTIE, "_next")) && chemin.endsWith(".js");
  const estChargeDeNavigation =
    chemin.endsWith(".txt") &&
    (existsSync(chemin.replace(/\.txt$/, ".html")) || chemin.split(/[/\\]/).pop().startsWith("__next."));
  if (!estJsDeNext && !estChargeDeNavigation) continue;
  efface += statSync(chemin).size;
  comptes += 1;
  rmSync(chemin);
}

const reste = fichiers(SORTIE).filter((chemin) => chemin.startsWith(join(SORTIE, "_next")) && chemin.endsWith(".js"));
if (reste.length > 0) {
  console.error(`\n  ARRÊT — ${reste.length} fichier(s) JavaScript de « _next » sont restés dans le dossier servi.\n`);
  process.exit(1);
}

const kio = (octets) => `${(octets / 1024).toFixed(1)} Kio`;
console.log(
  `\n  Dépouillement (Next ${version}) : ${totalScripts} scripts et ${totalCharges} charges d'hydratation retirés\n` +
    `  de ${pages.length} pages, soit ${kio(total)} ; ${comptes} fichiers effacés du dossier servi (${kio(efface)}).\n` +
    `  Chaque page garde sa feuille de style, aucune ne cite plus « _next ».\n`
);
