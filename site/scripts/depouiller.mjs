#!/usr/bin/env node
/**
 * LE DÉPOUILLEMENT — il retire du site construit ce qui n'aurait servi qu'à
 * l'hydrater.
 *
 * `next build` rend chaque page en HTML complet, PUIS il y ajoute de quoi
 * la reprendre côté navigateur : les morceaux de React et du routeur, et la
 * charge `self.__next_f` qui redit en JavaScript ce que le HTML dit déjà.
 * Sur ce site-ci, cela pesait 214 Kio sur 293 pour quatre comportements —
 * et aucune des quatorze pages ne tenait le plafond de 160 Kio.
 *
 * Alors on les retire. React reste l'outil qui CONSTRUIT les pages ; il ne
 * part plus chez le visiteur. Les comportements sont repris par
 * `public/comportements.js`, qui est écrit à la main et qu'on peut lire.
 *
 * CE QUI EST RETIRÉ, et rien d'autre :
 *   — toute balise `<script>` dont le `src` commence par `/_next/` ;
 *   — toute balise `<script>` dont le corps contient `self.__next_f` ;
 *   — tout `<link>` qui précharge un de ces fichiers.
 * Ce qui est GARDÉ : notre script, les deux lignes écrites en clair dans la
 * coquille, et le `application/ld+json` des données structurées.
 *
 * Puis les fichiers JavaScript de `_next` sont effacés du dossier servi :
 * plus personne ne les demande, ils n'ont pas à être publiés.
 *
 * `scripts/verifier-poids.mjs` vérifie ensuite qu'il n'en reste rien — et
 * il fait échouer la construction si un octet a échappé.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SORTIE = "out";

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
  let resultat = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (balise) => {
    if (!estHydratation(balise)) return balise;
    retire += Buffer.byteLength(balise);
    return "";
  });
  // Les préchargements de ces mêmes fichiers n'ont plus d'objet.
  // ATTENTION : le motif ne vise que les `.js`. Les feuilles de style
  // vivent dans le MÊME dossier `_next/static/chunks/` — viser le dossier
  // emportait le `<link rel="stylesheet">` avec, et les quatorze pages
  // sortaient sans une ligne de CSS (constaté le 2026-09-21 : la colonne
  // « css » du tableau des poids annonçait 0,0 Kio, ce qui était vrai).
  resultat = resultat.replace(/<link\b[^>]*\/_next\/static\/[^"]*\.js[^>]*>/g, (balise) => {
    retire += Buffer.byteLength(balise);
    return "";
  });
  return { resultat, retire };
}

const pages = fichiers(SORTIE).filter((chemin) => chemin.endsWith(".html"));
if (pages.length === 0) {
  console.error("Dépouillement : aucun fichier HTML dans « out/ ». La construction n'a rien exporté.");
  process.exit(1);
}

let total = 0;
for (const page of pages) {
  const avant = readFileSync(page, "utf8");
  const { resultat, retire } = depouille(avant);
  if (retire === 0) continue;
  writeFileSync(page, resultat);
  total += retire;
}

/*
 * CE QUI N'A PLUS DE LECTEUR QUITTE LE DOSSIER SERVI :
 *   — les fichiers JavaScript de `_next` (le socle, les morceaux de page) ;
 *   — les `.txt` que Next pose à côté de chaque page, et qui sont la même
 *     page redite en charge de navigation client — il n'y a plus de
 *     navigation client. `robots.txt` n'en est pas un : on ne retire un
 *     `.txt` que s'il a un `.html` du même nom à côté de lui.
 * Les feuilles de style et les polices restent, évidemment.
 */
let efface = 0;
for (const chemin of fichiers(SORTIE)) {
  const estJsDeNext = chemin.startsWith(join(SORTIE, "_next")) && chemin.endsWith(".js");
  const estChargeDeNavigation =
    chemin.endsWith(".txt") &&
    (existsSync(chemin.replace(/\.txt$/, ".html")) || chemin.split(/[/\\]/).pop().startsWith("__next."));
  if (!estJsDeNext && !estChargeDeNavigation) continue;
  efface += statSync(chemin).size;
  rmSync(chemin);
}

const kio = (octets) => `${(octets / 1024).toFixed(1)} Kio`;
console.log(
  `\n  Dépouillement : ${kio(total)} retirés de ${pages.length} pages, ${kio(efface)} de JavaScript effacés du dossier servi.\n`
);
