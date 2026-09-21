#!/usr/bin/env node
/**
 * LE GARDE-FOU DE L'ESPACEMENT — il fait ÉCHOUER LA CONSTRUCTION quand une
 * marge, un remplissage ou une gouttière sort de l'échelle du site.
 *
 * L'ÉCHELLE, ARRÊTÉE LE 2026-09-21 : 4, 8, 12, 16, 24, 48, 96, 144 px.
 * Huit valeurs, et c'est tout. Le site en comptait vingt, réparties sur
 * 443 usages : entre 20 et 24 px, entre 28 et 32, entre 56 et 64, personne
 * ne voyait la différence — mais chacun devait CHOISIR, et deux blocs
 * voisins finissaient à 28 et 32 px sans que rien ne le justifie. Une
 * échelle courte ne rend pas le site plus beau d'un coup : elle rend
 * IMPOSSIBLE le presque-pareil.
 *
 * TROIS VALEURS RESTENT ADMISES en dehors : `0` (pas d'espace), `px`
 * (un pixel — le rattrapage d'un filet de 1 px, ce n'est pas un espace)
 * et `auto` (le centrage, qui n'est pas une mesure).
 *
 * LES QUATRE AUTRES CONTRÔLES GARDENT LE FOND (les libellés, les
 * collisions, les additions, les textes en dur). Celui-ci est le premier
 * qui garde la FORME — c'était le quinzième constat de la revue du
 * 2026-09-19 : aucun garde-fou ne défendait le rayon, le filet ni
 * l'espacement, et c'est par là qu'un système se défait.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINES = ["app", "components"];
/** En unités Tailwind : une unité vaut 4 px. */
const ECHELLE = new Set(["0", "1", "2", "3", "4", "6", "12", "24", "36", "px", "auto"]);
const PROPRIETES = "(?:-?(?:m|p)[trblxy]?|gap(?:-[xy])?|space-[xy])";
const MOTIF = new RegExp(`(?<![\\w-])(${PROPRIETES})-(\\[[^\\]]+\\]|[\\d.]+|px|auto)(?![\\w-])`, "g");

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return chemin.endsWith(".tsx") ? [chemin] : [];
  });
}

const fautes = [];
let usages = 0;

for (const racine of RACINES) {
  for (const fichier of fichiers(racine)) {
    const lignes = readFileSync(fichier, "utf8").split("\n");
    lignes.forEach((ligne, rang) => {
      for (const trouve of ligne.matchAll(MOTIF)) {
        usages += 1;
        const valeur = trouve[2];
        if (ECHELLE.has(valeur)) continue;
        const px = /^[\d.]+$/.test(valeur) ? ` (${Number(valeur) * 4} px)` : "";
        fautes.push({ fichier, ligne: rang + 1, classe: `${trouve[1]}-${valeur}`, px });
      }
    });
  }
}

if (fautes.length > 0) {
  console.error(`\n  ARRÊT — ${fautes.length} espacements hors échelle (4, 8, 12, 16, 24, 48, 96, 144 px) :\n`);
  for (const faute of fautes) {
    console.error(`    ${faute.fichier}:${faute.ligne}  ${faute.classe}${faute.px}`);
  }
  console.error("");
  process.exit(1);
}

console.log(`  Espacement : ${usages} usages, tous dans l'échelle des huit valeurs.`);
