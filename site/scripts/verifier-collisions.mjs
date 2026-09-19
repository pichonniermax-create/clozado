#!/usr/bin/env node
/**
 * LE TABLEAU DE COLLISION — il compare les écrans de preuve DEUX À DEUX et
 * fait ÉCHOUER LA CONSTRUCTION si deux écrans qui n'ont rien à voir se
 * partagent une donnée.
 *
 * POURQUOI. Treize écrans sont redessinés en HTML pour prouver le produit.
 * S'ils se ressemblent, ils ne prouvent plus rien : un visiteur qui passe
 * de la page Courtage à la page Immobilier et retrouve le même nom, le même
 * bien ou la même date comprend qu'il regarde un décor, pas un produit.
 * C'était le défaut le plus visible du site avant les trois écrans métier,
 * et rien ne l'empêchait de revenir — jusqu'à ce fichier.
 *
 * CE QU'EST UNE FAMILLE. Cinq familles, treize écrans. À l'intérieur d'une
 * famille, le partage est VOULU : les quatre écrans de l'accueil montrent
 * le même cabinet, et les six écrans du parcours suivent UN SEUL dossier,
 * du premier contact à la mesure — c'est le sujet même de la page. Entre
 * deux familles, le partage est un défaut, et c'est lui qu'on cherche.
 *
 * CE QUI EST COMPARÉ. Ce que le doctrine des écrans métier énumère déjà :
 * un nom propre, un montant, une date. Pas les nombres nus : deux écrans
 * peuvent compter « 4 » choses ou annoncer « 12 j » de délai sans se
 * copier — ce sont des valeurs, pas des libellés. Les mots ordinaires de la
 * langue et les formes juridiques (Banque, Cabinet, SCI…) sont écartés par
 * une liste EXPLICITE, écrite plus bas : l'exemption se lit, elle ne se
 * devine pas.
 */
import { ecrans } from "../content/fr/ecrans.ts";
import { ecransMetiers } from "../content/fr/ecrans-metiers.ts";
import { parcoursProduit } from "../content/fr/parcours-produit.ts";

/** Les cinq familles, et les écrans de chacune. */
const FAMILLES = [
  ["accueil", ["Suivi", "Tableau de bord", "Règles de relance", "Funnel"],
    [ecrans.suivi, ecrans.tableauDeBord, ecrans.regles, ecrans.funnel]],
  ["gestion de patrimoine", ["Cycle du dossier"], [ecransMetiers.cgp]],
  ["courtage", ["En attente de banque"], [ecransMetiers.courtiers]],
  ["transaction immobilière", ["De la visite à l’acte"], [ecransMetiers.immobilier]],
  ["parcours produit", parcoursProduit.etapes.map((e) => e.ecran.nom),
    parcoursProduit.etapes.map((e) => e.ecran)],
];

const MOIS = "janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre";

/**
 * Les mots qui commencent par une majuscule sans désigner personne : la
 * langue courante, les intitulés d'interface, les formes juridiques et les
 * catégories de biens. Deux écrans ont le droit de dire « Maison » ou
 * « Cabinet » — pas de dire « Sophie Guérin ».
 */
const ORDINAIRES = new Set([
  "Le", "La", "Les", "Un", "Une", "Des", "De", "Du", "Ce", "Cette", "Il", "Elle", "Sans", "Pour", "Votre", "Bonjour",
  "Aujourd", "Demain", "Hier", "Premier", "Second", "Deuxième", "Aucune", "Total", "Nombre", "Passage", "Montant",
  "Banque", "Caisse", "Crédit", "Cabinet", "Agence", "SCI", "Partenaire", "Conseillère", "Adresse", "Origine",
  "Dossier", "Dossiers", "Affaire", "Affaires", "Partage", "Partages", "Commission", "Commissions", "Tâches",
  "Contacts", "Leads", "Visiteurs", "Simulations", "Acceptées", "Acceptés", "Signatures", "Étiquettes",
  "Maison", "Appartement", "Studio", "Duplex", "Longère", "Terrain", "Résidence", "Locatif", "Renégociation",
  "Achat", "Regroupement", "Comparateur", "Primo", "Projet", "Consentement", "Entrée", "Délai", "Lien", "Brouillon",
  "Visite", "Offre", "Compromis", "Acte", "Mandat", "Étude", "Pièces", "Souscription", "Qualifiée", "Proposition",
  "Négociation", "Réglée", "Confirmée", "Prévue", "Reçue", "Attendue", "Renseignée", "Heures", "Plafond",
  "Désinscription", "Politique", "Envoyer", "Ouvrir", "Renvoyer", "Relancer", "Rappeler", "Choisir", "Écrits",
  "Objet", "Suivi", "Funnel", "Règles", "Fiche", "Aperçu", "Cycle", "Cumul", "Écran",
  "Sept", "Oct", "Nov", "Déc", "Janv", "Févr", "Février",
]);

/** Toutes les chaînes d'un jeu de données, à n'importe quelle profondeur. */
function chaines(valeur, sortie = []) {
  if (typeof valeur === "string") { sortie.push(valeur); return sortie; }
  if (Array.isArray(valeur)) { for (const v of valeur) chaines(v, sortie); return sortie; }
  if (valeur && typeof valeur === "object") { for (const v of Object.values(valeur)) chaines(v, sortie); return sortie; }
  return sortie;
}

/** Les données identifiantes d'un écran : noms propres, montants, dates. */
function entites(textes) {
  const trouvees = new Map();
  const poser = (genre, valeur) => trouvees.set(`${genre} « ${valeur} »`, { genre, valeur });
  for (const texte of textes) {
    for (const m of texte.matchAll(/\d[\d   ]*\s?€/g)) poser("montant", m[0].replace(/[  \s]+/g, " ").trim());
    for (const m of texte.matchAll(new RegExp(`\\b\\d{1,2}\\s(?:${MOIS})\\b`, "gi"))) poser("date", m[0]);
    for (const m of texte.matchAll(/\p{Lu}[\p{L}’'\-]{2,}/gu)) if (!ORDINAIRES.has(m[0])) poser("nom", m[0]);
  }
  return trouvees;
}

const jeux = FAMILLES.map(([famille, noms, donnees]) => ({
  famille,
  noms,
  entites: entites(donnees.flatMap((e) => chaines(e))),
}));

const largeur = Math.max(...jeux.map((j) => j.famille.length));
const pad = (t) => t.padEnd(largeur);

console.log("\nTABLEAU DE COLLISION — les écrans de preuve, deux à deux\n");
console.log(`  ${jeux.reduce((t, j) => t + j.noms.length, 0)} écrans en ${jeux.length} familles :`);
for (const j of jeux) console.log(`    ${pad(j.famille)}  ${j.noms.length} écran(s), ${j.entites.size} données  —  ${j.noms.join(", ")}`);

const fautes = [];
console.log("\n  Famille × famille                                    en commun");
for (let i = 0; i < jeux.length; i += 1) {
  for (let j = i + 1; j < jeux.length; j += 1) {
    const commun = [...jeux[i].entites.keys()].filter((cle) => jeux[j].entites.has(cle));
    const paire = `${jeux[i].famille} × ${jeux[j].famille}`;
    console.log(`  ${paire.padEnd(52)} ${commun.length === 0 ? "0" : `${commun.length}  → ${commun.join(", ")}`}`);
    if (commun.length > 0) fautes.push({ paire, commun });
  }
}

const paires = (jeux.length * (jeux.length - 1)) / 2;
console.log();
if (fautes.length === 0) {
  console.log(`  ${paires} paires, zéro donnée en commun.\n`);
  process.exit(0);
}
console.error(`✗ ${fautes.length} paire(s) sur ${paires} partagent une donnée — la construction s'arrête.\n`);
for (const { paire, commun } of fautes) console.error(`  ${paire} : ${commun.join(", ")}`);
console.error("\nDeux écrans de familles différentes ne partagent ni nom, ni montant, ni date.\n");
process.exit(1);
