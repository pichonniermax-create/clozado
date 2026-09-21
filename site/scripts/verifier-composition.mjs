#!/usr/bin/env node
/**
 * LE GARDE-FOU DE LA COMPOSITION — il fait ÉCHOUER LA CONSTRUCTION quand une
 * page repose une largeur à elle ou un décalage de colonne.
 *
 * POURQUOI. Le site a eu, des mois durant, DEUX largeurs : la barre de
 * navigation à 70rem, le contenu à 96rem. Personne ne l'avait décidé, et
 * personne ne l'a vu — jusqu'à ce qu'on mesure en production un contenu qui
 * dépassait la barre de 80 px de chaque côté à 1280, et de 160 px à 1440.
 * À cela s'ajoutaient vingt-deux décalages `lg:col-start-4` semés page par
 * page, qui poussaient chaque titre à 294 px du bord.
 *
 * La composition est maintenant CENTRÉE, et elle tient à trois choses :
 *   1. UNE SEULE LARGEUR, `--largeur-site`, déclarée une fois dans
 *      `app/globals.css`, et lue par la barre (`.largeur-site`) comme par le
 *      contenu (`.editorial-conteneur`) ;
 *   2. aucune page ne pose de largeur maximale ;
 *   3. aucune page ne pose de décalage de colonne.
 *
 * IL NE REND RIEN. Pas de navigateur, pas de construction : il lit les
 * fichiers. Un garde-fou qui demanderait un rendu ne tournerait pas avant
 * `next build`, donc trop tard — et il coûterait une minute à chaque fois.
 *
 * Les mesures au pixel, elles, se font au navigateur sur la construction
 * servie : c'est un autre travail, et il ne peut pas être automatique ici.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CSS = "app/globals.css";
const RACINES = ["app", "components"];

/**
 * LES MOTIFS INTERDITS DANS UNE PAGE.
 *
 * `max-w-[85%]` et ses pareils restent admis : une largeur RELATIVE à
 * l'intérieur d'un écran de preuve — la bulle d'un message, par exemple —
 * n'est pas une largeur de composition, elle ne peut pas désaligner une
 * page. Tout ce qui est absolu (`max-w-5xl`, `max-w-[70rem]`) est refusé.
 */
const INTERDITS = [
  { motif: /\bmax-w-(?!\[\d+(?:\.\d+)?%\])[\w[\]%.-]+/g, quoi: "une largeur maximale posée dans la page" },
  { motif: /\b(?:lg:|md:|sm:|xl:)?col-(?:start|span)-[\w[\]]+/g, quoi: "un décalage de colonne" },
  { motif: /\bgrid-cols-12\b/g, quoi: "la grille de douze colonnes de l'ancienne composition" },
];

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return chemin.endsWith(".tsx") ? [chemin] : [];
  });
}

const fautes = [];

// --- 1. UNE SEULE LARGEUR, et les deux conteneurs la lisent ---------------
const css = readFileSync(CSS, "utf8");
const declarations = css.match(/--largeur-site:\s*[^;]+;/g) ?? [];
if (declarations.length !== 1) {
  fautes.push({
    chemin: CSS,
    ligne: 0,
    quoi: `la largeur du site est déclarée ${declarations.length} fois (attendu : une seule)`,
    extrait: declarations.join(" · ") || "(aucune)",
  });
}
for (const [classe, regle] of [
  [".largeur-site", /\.largeur-site\s*\{[^}]*max-width:\s*var\(--largeur-site\)/],
  [".editorial-conteneur", /\.editorial-conteneur\s*\{[^}]*max-width:\s*var\(--largeur-site\)/],
]) {
  if (!regle.test(css)) {
    fautes.push({ chemin: CSS, ligne: 0, quoi: `${classe} ne lit pas --largeur-site`, extrait: classe });
  }
}

// --- 2. Aucune page ne repose une largeur ni un décalage ------------------
for (const racine of RACINES) {
  for (const fichier of fichiers(racine)) {
    const lignes = readFileSync(fichier, "utf8").split("\n");
    lignes.forEach((ligne, rang) => {
      for (const { motif, quoi } of INTERDITS) {
        for (const trouve of ligne.matchAll(motif)) {
          fautes.push({ chemin: fichier, ligne: rang + 1, quoi, extrait: trouve[0] });
        }
      }
    });
  }
}

if (fautes.length > 0) {
  console.error(`\n  ARRÊT — ${fautes.length} entorse(s) à la composition centrée :\n`);
  for (const f of fautes) {
    console.error(`    ${f.chemin}${f.ligne ? ":" + f.ligne : ""}  « ${f.extrait} » — ${f.quoi}`);
  }
  console.error(
    "\n  La composition du site est centrée depuis le 2026-09-21 : une seule largeur,\n" +
      "  partagée par la barre et le contenu, et aucune page qui pose la sienne.\n" +
      "  Les mises en page vivent dans app/globals.css (.duo, .avec-aparte,\n" +
      "  .entete-section, .colonne-lecture), jamais dans une page.\n"
  );
  process.exit(1);
}

console.log("  Composition : une seule largeur, aucune page ne repose une largeur ni un décalage.");
