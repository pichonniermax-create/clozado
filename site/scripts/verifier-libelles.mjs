#!/usr/bin/env node
/**
 * LE GARDE-FOU DES LIBELLÉS — il fait ÉCHOUER LA CONSTRUCTION quand un
 * texte destiné à l'écran contient encore un crochet ouvrant suivi d'une
 * lettre : « [prix] », « [à compléter] », « [raison sociale] ».
 *
 * Pourquoi un script et pas une relecture : un crochet passe inaperçu dans
 * une page longue, et il ne se voit qu'une fois EN LIGNE, là où il coûte le
 * plus cher. Ici, il coûte une construction.
 *
 * DEUX FICHIERS SONT EXEMPTÉS, et c'est délibéré : les pages légales
 * portent les valeurs que seul l'éditeur connaît (dénomination, capital,
 * RCS, adresse). Elles sont comptées et affichées à chaque construction —
 * l'exemption est bruyante, pas silencieuse. Le jour où ces valeurs sont
 * fournies, on retire les deux lignes ci-dessous et le garde-fou couvre
 * tout le site.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = "content";
const EXEMPTS = new Set(["content/fr/mentions-legales.ts", "content/fr/confidentialite.ts"]);
const MOTIF = /\[\p{L}/u;

/** Les littéraux de chaîne d'un fichier TypeScript : guillemets doubles et gabarits. */
function chaines(source) {
  const trouvees = [];
  const motif = /"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/gs;
  let m;
  while ((m = motif.exec(source)) !== null) {
    const valeur = m[1] ?? m[2] ?? "";
    const ligne = source.slice(0, m.index).split("\n").length;
    trouvees.push({ valeur, ligne });
  }
  return trouvees;
}

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return chemin.endsWith(".ts") ? [chemin] : [];
  });
}

const fautes = [];
let exemptes = 0;

for (const chemin of fichiers(RACINE)) {
  const source = readFileSync(chemin, "utf8");
  for (const { valeur, ligne } of chaines(source)) {
    if (!MOTIF.test(valeur)) continue;
    if (EXEMPTS.has(chemin)) exemptes += 1;
    else fautes.push({ chemin, ligne, valeur: valeur.length > 70 ? valeur.slice(0, 70) + "…" : valeur });
  }
}

if (exemptes > 0) {
  console.log(`libellés : ${exemptes} valeur(s) entre crochets dans les pages légales, exemptées et à fournir.`);
}

if (fautes.length > 0) {
  console.error(`\n✗ ${fautes.length} libellé(s) contiennent encore un crochet — la construction s'arrête.\n`);
  for (const faute of fautes) console.error(`  ${faute.chemin}:${faute.ligne}  « ${faute.valeur} »`);
  console.error("\nUn crochet dans un libellé signifie une valeur jamais fournie. Complétez-la, ou retirez la phrase.\n");
  process.exit(1);
}

console.log("libellés : aucun crochet à compléter hors pages légales.");
