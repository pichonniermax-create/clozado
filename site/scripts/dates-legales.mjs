#!/usr/bin/env node
/**
 * LA DATE DE MISE À JOUR DES PAGES LÉGALES — calculée, jamais saisie.
 *
 * « Dernière mise à jour : … » était une chaîne à écrire à la main. Une
 * date écrite à la main est fausse le lendemain du jour où l'on a corrigé
 * le texte sans y penser — et sur une page légale, une date fausse est le
 * genre de détail qu'on ne vous pardonne pas.
 *
 * Elle est donc LUE DANS L'HISTOIRE DU DÉPÔT : la date du dernier commit
 * qui a touché le contenu de la page. Si le fichier est modifié et pas
 * encore committé, c'est aujourd'hui — parce que c'est vrai.
 *
 * POURQUOI UN FICHIER ENGENDRÉ PLUTÔT QU'UN APPEL À GIT PENDANT LE BUILD :
 * l'hébergeur ne garantit pas que l'historique complet soit disponible au
 * moment de la construction (un clone peu profond n'a pas les dates des
 * fichiers anciens). Le fichier `content/dates-legales.json` est donc
 * ENGENDRÉ ICI, COMMITTÉ, et lu par le site. Comme un fichier de
 * verrouillage : `--verifier` fait échouer la construction s'il n'est plus
 * d'accord avec l'histoire, en disant quoi lancer.
 *
 *   node scripts/dates-legales.mjs             écrit le fichier
 *   node scripts/dates-legales.mjs --verifier  vérifie qu'il est à jour
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const SORTIE = "content/dates-legales.json";

/** Chaque page, et les fichiers dont son contenu dépend. */
const PAGES = {
  "mentions-legales": ["content/fr/mentions-legales.ts", "content/identite.ts"],
  confidentialite: ["content/fr/confidentialite.ts", "content/identite.ts"],
};

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const aujourdHui = new Date().toISOString().slice(0, 10);

/** La date de dernière modification d'un fichier : son commit, ou aujourd'hui s'il est en cours. */
function dateDuFichier(chemin) {
  if (git(["status", "--porcelain", "--", chemin]) !== "") return aujourdHui;
  const date = git(["log", "-1", "--format=%cs", "--", chemin]);
  return date || null; // pas d'historique : on ne devine pas
}

function calcule() {
  const dates = {};
  for (const [page, fichiers] of Object.entries(PAGES)) {
    const trouvees = fichiers.map(dateDuFichier).filter(Boolean);
    if (trouvees.length !== fichiers.length) return null; // historique incomplet
    dates[page] = trouvees.sort().at(-1);
  }
  return dates;
}

const verifier = process.argv.includes("--verifier");

let calculees;
try {
  calculees = calcule();
} catch {
  calculees = null;
}

const ecrit = (valeur) => `${JSON.stringify(valeur, null, 2)}\n`;

if (calculees === null) {
  // Pas d'historique ici (clone peu profond, archive sans `.git`). Le fichier
  // committé fait foi — c'est précisément pour ce cas qu'il existe.
  let existant;
  try {
    existant = readFileSync(SORTIE, "utf8");
  } catch {
    console.error(
      `\n  ARRÊT — ni l'historique du dépôt, ni « ${SORTIE} » ne sont disponibles :\n` +
        `  impossible de dater les pages légales, et une date inventée n'en est pas une.\n`
    );
    process.exit(1);
  }
  console.log(`  Dates légales : historique du dépôt indisponible, « ${SORTIE} » fait foi.`);
  console.log(`  ${Object.entries(JSON.parse(existant)).map(([p, d]) => `${p} → ${d}`).join(" · ")}`);
  process.exit(0);
}

if (verifier) {
  let existant = null;
  try {
    existant = readFileSync(SORTIE, "utf8");
  } catch {
    /* le fichier n'existe pas encore */
  }
  if (existant !== ecrit(calculees)) {
    console.error(
      `\n  ARRÊT — « ${SORTIE} » n'est plus d'accord avec l'histoire du dépôt.\n\n` +
        `  attendu : ${JSON.stringify(calculees)}\n` +
        `  trouvé  : ${existant ? JSON.stringify(JSON.parse(existant)) : "(absent)"}\n\n` +
        `  Le contenu d'une page légale a changé sans que sa date suive. À faire :\n` +
        `      npm run dates:legales\n` +
        `  puis committer le fichier avec le changement de contenu — les deux vont ensemble.\n`
    );
    process.exit(1);
  }
  console.log(
    `  Dates légales : ${Object.entries(calculees).map(([p, d]) => `${p} → ${d}`).join(" · ")}`
  );
  process.exit(0);
}

writeFileSync(SORTIE, ecrit(calculees));
console.log(`  ${SORTIE} écrit : ${Object.entries(calculees).map(([p, d]) => `${p} → ${d}`).join(" · ")}`);
