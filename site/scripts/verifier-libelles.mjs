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

/**
 * LES ARTICLES SONT DU MARKDOWN, et le Markdown écrit ses liens entre
 * crochets : `[le texte](l'adresse)`. Les lire tels quels aurait accusé
 * chaque lien d'être une valeur à compléter — et c'est pour cette raison
 * que `content/articles/` n'était pas contrôlé du tout. C'était un TROU :
 * un « [à compléter] » dans un article passait en ligne sans que rien ne
 * l'arrête, alors que le même mot dans un contenu `.ts` arrêtait la
 * construction.
 *
 * On retire donc DEUX formes avant de chercher, et deux seulement :
 *   — le lien `[texte](adresse)` ;
 *   — l'appel de bloc `[!note]`, qui ouvre une note ou une citation.
 * Tout le reste des crochets est suspect, comme ailleurs.
 */
function lignesDeMarkdown(source) {
  return source.split("\n").map((ligne, rang) => ({
    valeur: ligne.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[!\w+\]/g, ""),
    ligne: rang + 1,
  }));
}

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return chemin.endsWith(".ts") || chemin.endsWith(".md") ? [chemin] : [];
  });
}

const fautes = [];
const exemptes = new Map();

for (const chemin of fichiers(RACINE)) {
  const source = readFileSync(chemin, "utf8");
  const aLire = chemin.endsWith(".md") ? lignesDeMarkdown(source) : chaines(source);
  for (const { valeur, ligne } of aLire) {
    if (!MOTIF.test(valeur)) continue;
    if (EXEMPTS.has(chemin)) exemptes.set(chemin, (exemptes.get(chemin) ?? 0) + 1);
    else fautes.push({ chemin, ligne, valeur: valeur.length > 70 ? valeur.slice(0, 70) + "…" : valeur });
  }
}

if (exemptes.size > 0) {
  // L'exemption est BRUYANTE : elle se compte fichier par fichier à chaque
  // construction. Le jour où les valeurs sont fournies, on retire les deux
  // lignes de EXEMPTS et le garde-fou couvre tout le site.
  const total = [...exemptes.values()].reduce((a, b) => a + b, 0);
  console.log(`libellés : ${total} valeur(s) entre crochets, exemptées et à fournir —`);
  for (const [chemin, compte] of exemptes) console.log(`           ${compte} dans ${chemin}`);
}

if (fautes.length > 0) {
  console.error(`\n✗ ${fautes.length} libellé(s) contiennent encore un crochet — la construction s'arrête.\n`);
  for (const faute of fautes) console.error(`  ${faute.chemin}:${faute.ligne}  « ${faute.valeur} »`);
  console.error("\nUn crochet dans un libellé signifie une valeur jamais fournie. Complétez-la, ou retirez la phrase.\n");
  process.exit(1);
}

console.log("libellés : aucun crochet à compléter hors pages légales.");
