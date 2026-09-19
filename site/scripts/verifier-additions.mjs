#!/usr/bin/env node
/**
 * LE TABLEAU DES ADDITIONS — il REFAIT les calculs de chaque écran de
 * preuve et fait ÉCHOUER LA CONSTRUCTION si un seul tombe à côté.
 *
 * Chaque total doit être la somme de ses lignes, chaque pourcentage le
 * rapport qu'il annonce, chaque écart la différence de ses deux bornes, et
 * chaque somme d'écarts le total qu'elle porte. Les nombres des écrans sont
 * inventés — la page le dit — mais un nombre inventé qui ne tombe pas juste
 * se voit, et il décrédibilise tout le reste de la page. Un lecteur qui
 * additionne deux colonnes et trouve autre chose n'a plus de raison de
 * croire le paragraphe d'à côté.
 *
 * LES CONTRÔLES SONT ÉCRITS UNE FOIS, LES NOMBRES SONT LUS. Rien n'est
 * recopié ici : chaque ligne relit le jeu de données. Corriger un montant
 * dans `content/fr/` suffit — le contrôle se refait tout seul, et c'est lui
 * qui dira si la correction est cohérente.
 */
import { ecrans } from "../content/fr/ecrans.ts";
import { ecransMetiers } from "../content/fr/ecrans-metiers.ts";
import { parcoursProduit } from "../content/fr/parcours-produit.ts";

/* ---------------------------------------------------------------- lecture */

/** Le premier nombre d'un texte : « 1 486 000 € », « 32,1 % », « 12 j », « 8 ». */
function n(texte) {
  const propre = String(texte).replace(/[  ]/g, " ");
  const trouve = propre.match(/-?\d[\d ]*(?:,\d+)?/);
  if (!trouve) return NaN;
  return Number(trouve[0].replace(/ /g, "").replace(",", "."));
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Le jour d'une date écrite « 3 mars » — en jours depuis le 1er janvier 2026. */
function jour(texte) {
  const t = String(texte).toLowerCase();
  const trouve = t.match(new RegExp(`(\\d{1,2})\\s(${MOIS.join("|")})`));
  if (!trouve) return NaN;
  return Math.round(Date.UTC(2026, MOIS.indexOf(trouve[2]), Number(trouve[1])) / 86400000);
}

/** L'instant d'un horodatage « 11 mars, 9 h 40 », en minutes. */
function instant(texte) {
  const heure = String(texte).match(/(\d{1,2})\s?h\s?(\d{2})?/);
  return jour(texte) * 1440 + (heure ? Number(heure[1]) * 60 + Number(heure[2] ?? 0) : 0);
}

/** Une durée « 24 h 35 », « 2 h 10 », en minutes. */
function duree(texte) {
  const trouve = String(texte).match(/(\d+)\s?h\s?(\d{2})?/);
  return trouve ? Number(trouve[1]) * 60 + Number(trouve[2] ?? 0) : NaN;
}

const somme = (liste) => liste.reduce((t, v) => t + v, 0);

/* ------------------------------------------------------------- contrôles */

const lignes = [];
/** Un contrôle : ce qu'on attend, ce que l'écran dit. Égalité à la tolérance près. */
function controle(ecran, intitule, attendu, obtenu, tolerance = 0) {
  const juste = Number.isFinite(attendu) && Number.isFinite(obtenu) && Math.abs(attendu - obtenu) <= tolerance;
  lignes.push({ ecran, intitule, attendu, obtenu, juste });
}

/* — accueil · Suivi — */
{
  const { suivi } = ecrans;
  controle("accueil · Suivi", "le résumé annonce ce que les piles comptent",
    somme(suivi.piles.map((p) => n(p.compte))), n(suivi.resume));
  for (const pile of suivi.piles) {
    controle("accueil · Suivi", `« ${pile.titre} » : lignes montrées ≤ compte annoncé`,
      0, Math.max(0, pile.lignes.length - n(pile.compte)));
  }
}

/* — accueil · Tableau de bord — */
{
  const { tableauDeBord, suivi } = ecrans;
  const tuile = (debut) => tableauDeBord.tuiles.find((t) => t.libelle.startsWith(debut));
  controle("accueil · Tableau de bord", "« Partages sans retour » = la pile du Suivi",
    n(suivi.piles[0].compte), n(tuile("Partages").valeur));
  controle("accueil · Tableau de bord", "« Acceptés sans suite » = la pile du Suivi",
    n(suivi.piles[1].compte), n(tuile("Acceptés").valeur));
  const taches = tuile("Tâches");
  controle("accueil · Tableau de bord", "les tâches en retard ne dépassent pas les tâches à faire",
    0, Math.max(0, n(taches.precision) - n(taches.valeur)));
  controle("accueil · Tableau de bord", "les tâches en retard sont au moins celles que la liste montre",
    0, Math.max(0, tableauDeBord.lignes.filter((l) => /retard/i.test(l.detail)).length - n(taches.precision)));
}

/* — accueil · Règles de relance — */
{
  const { regles } = ecrans;
  for (const ligne of regles.lignes) {
    const nombres = [...ligne.detail.matchAll(/(\d+)\s+(contacts examinés|tâches créées|brouillons écrits|écartés)/g)];
    const lu = (quoi) => n(nombres.find(([, , q]) => q === quoi)?.[1] ?? "0");
    controle("accueil · Règles de relance", `« ${ligne.phrase.slice(0, 34)}… » : agis + écartés = examinés`,
      lu("contacts examinés"), lu("tâches créées") + lu("brouillons écrits") + lu("écartés"));
  }
  controle("accueil · Règles de relance", "la vague annonce les brouillons que les règles ont écrits",
    somme(regles.lignes.map((l) => n(l.detail.match(/(\d+)\s+brouillons écrits/)?.[1] ?? "0"))), n(regles.vague.titre));
  controle("accueil · Règles de relance", "le bouton envoie autant d'emails que la vague en porte",
    n(regles.vague.titre), n(regles.vague.action));
}

/* — accueil · Funnel — */
{
  const { pas } = ecrans.funnel;
  for (let i = 1; i < pas.length; i += 1) {
    const avant = n(pas[i - 1].nombre);
    const ici = n(pas[i].nombre);
    controle("accueil · Funnel", `« ${pas[i].libelle} » : le taux est le rapport au pas précédent`,
      Math.round((ici / avant) * 1000) / 10, n(pas[i].taux), 0.05);
    controle("accueil · Funnel", `« ${pas[i].libelle} » : la déperdition est la différence`,
      avant - ici, n(pas[i].perte));
  }
  controle("accueil · Funnel", "la somme des déperditions mène du premier pas au dernier",
    n(pas[0].nombre) - n(pas[pas.length - 1].nombre), somme(pas.slice(1).map((p) => n(p.perte))));
}

/* — gestion de patrimoine · Cycle du dossier — */
{
  const { cgp } = ecransMetiers;
  controle("CGP · Cycle du dossier", "la somme des écarts fait l'ancienneté annoncée",
    n(cgp.ancienneteValeur), somme(cgp.etapes.map((e) => n(e.ecart) || 0)));
  for (let i = 1; i < cgp.etapes.length; i += 1) {
    const avant = jour(cgp.etapes[i - 1].date);
    const ici = jour(cgp.etapes[i].date);
    if (!Number.isFinite(ici)) continue; // « attendue » : pas de date à comparer
    controle("CGP · Cycle du dossier", `« ${cgp.etapes[i].libelle.slice(0, 34)}… » : l'écart est la différence des dates`,
      ici - avant, n(cgp.etapes[i].ecart));
  }
}

/* — courtage · En attente de banque — */
{
  const { courtiers } = ecransMetiers;
  const b = courtiers.banques;
  controle("Courtage · En attente de banque", "le total des dossiers est la somme des banques",
    somme(b.lignes.map((l) => n(l.dossiers))), n(b.total.dossiers));
  controle("Courtage · En attente de banque", "le délai moyen est pondéré par les dossiers",
    Math.round(somme(b.lignes.map((l) => n(l.dossiers) * n(l.moyen))) / somme(b.lignes.map((l) => n(l.dossiers)))),
    n(b.total.moyen));
  controle("Courtage · En attente de banque", "le plus ancien du total est le plus ancien des lignes",
    Math.max(...b.lignes.map((l) => n(l.ancien))), n(b.total.ancien));
  controle("Courtage · En attente de banque", "le résumé annonce le total des dossiers",
    n(b.total.dossiers), /onze/i.test(courtiers.resume) ? 11 : n(courtiers.resume));
  const c = courtiers.commissions;
  controle("Courtage · Commissions dues", "le total des dossiers est la somme des partenaires",
    somme(c.lignes.map((l) => n(l.dossiers))), n(c.total.dossiers));
  controle("Courtage · Commissions dues", "le total des montants est la somme des partenaires",
    somme(c.lignes.map((l) => n(l.montant))), n(c.total.montant));
}

/* — transaction immobilière · De la visite à l'acte — */
{
  const { immobilier } = ecransMetiers;
  const REFERENCE = jour("21 mai");
  const SEUIL = n(immobilier.seuilLibelle);
  controle("Immobilier · De la visite à l'acte", "le résumé annonce autant d'acquéreurs que de dossiers",
    immobilier.dossiers.length, /huit/i.test(immobilier.resume) ? 8 : n(immobilier.resume));
  controle("Immobilier · De la visite à l'acte", "la somme des positions fait le nombre de dossiers",
    immobilier.dossiers.length, somme(immobilier.positions.map((p) => n(p.compte))));
  for (const position of immobilier.positions) {
    controle("Immobilier · De la visite à l'acte", `« ${position.libelle} » : le compte est le nombre de dossiers`,
      immobilier.dossiers.filter((d) => d.position === position.cle).length, n(position.compte));
  }
  for (const dossier of immobilier.dossiers) {
    controle("Immobilier · De la visite à l'acte", `${dossier.personne} : l'ancienneté se compte depuis sa date`,
      REFERENCE - jour(dossier.depuisLe), n(dossier.anciennete));
    controle("Immobilier · De la visite à l'acte", `${dossier.personne} : la marque suit le seuil de ${SEUIL} j`,
      n(dossier.anciennete) > SEUIL ? 1 : 0, dossier.marque ? 1 : 0);
  }
}

/* — parcours produit — */
{
  const etape = (cle) => parcoursProduit.etapes.find((e) => e.cle === cle).ecran;

  const fiche = etape("entree");
  const champ = (libelle) => fiche.champs.find((c) => c.libelle === libelle).valeur;
  controle("Produit 01 · Fiche contact", "le délai de rappel est l'écart entre l'entrée et le premier contact",
    instant(champ("Premier contact")) - instant(champ("Entrée le")), duree(champ("Délai de rappel")));

  const affaires = etape("affaire");
  controle("Produit 02 · Affaires", "le total en cours est la somme des colonnes",
    somme(affaires.colonnes.map((c) => n(c.compte))), n(affaires.total.compte));
  controle("Produit 02 · Affaires", "le montant total est la somme des colonnes",
    somme(affaires.colonnes.map((c) => n(c.montant))), n(affaires.total.montant));
  controle("Produit 02 · Affaires", "le résumé annonce le total des affaires",
    n(affaires.total.compte), /douze/i.test(affaires.resume) ? 12 : n(affaires.resume));
  controle("Produit 02 · Affaires", "le résumé annonce le montant total",
    n(affaires.total.montant), n(affaires.resume.replace(/^[^,]*,/, "")));
  for (const colonne of affaires.colonnes) {
    controle("Produit 02 · Affaires", `« ${colonne.titre} » : les cartes montrées ne dépassent pas le compte`,
      0, Math.max(0, colonne.cartes.length - n(colonne.compte)));
    controle("Produit 02 · Affaires", `« ${colonne.titre} » : les cartes montrées ne dépassent pas le montant`,
      0, Math.max(0, somme(colonne.cartes.map((c) => n(c.detail))) - n(colonne.montant)));
  }
  const titres = affaires.colonnes.flatMap((c) => c.cartes.map((carte) => carte.titre));
  controle("Produit 02 · Affaires", "aucune affaire n'est montrée dans deux colonnes",
    titres.length, new Set(titres).size);

  const partage = etape("partage");
  for (let i = 1; i < partage.gestes.length; i += 1) {
    controle("Produit 03 · Partage", `« ${partage.gestes[i].libelle.slice(0, 30)}… » : l'écart est la différence des horodatages`,
      instant(partage.gestes[i].horodatage) - instant(partage.gestes[i - 1].horodatage), duree(partage.gestes[i].ecart));
  }
  const acceptation = partage.gestes.findIndex((g) => /acceptée/i.test(g.libelle));
  controle("Produit 03 · Partage", "le pied va de l'envoi à l'acceptation",
    instant(partage.gestes[acceptation].horodatage) - instant(partage.gestes[0].horodatage), duree(partage.pied.valeur));

  const commission = etape("commission");
  controle("Produit 05 · Commission", "le total est la somme des parts",
    somme(commission.parts.map((p) => n(p.montant))), n(commission.total));
  controle("Produit 05 · Commission", "le résumé annonce le total",
    n(commission.total), n(commission.resume.replace(/^[^—]*—/, "")));
  for (const part of commission.parts) {
    controle("Produit 05 · Commission", `« ${part.libelle} » : le pourcentage est le rapport au total`,
      Math.round((n(part.montant) / n(commission.total)) * 1000) / 10, n(part.part), 0.05);
  }
  controle("Produit 05 · Commission", "les trois pourcentages font cent",
    100, somme(commission.parts.map((p) => n(p.part))), 0.1);

  const serie = etape("analytique");
  controle("Produit 06 · Signatures par mois", "le cumul est la somme des mois",
    somme(serie.mois.map((m) => n(m.valeur))), n(serie.total.valeur));
  controle("Produit 06 · Signatures par mois", "le résumé annonce le cumul",
    n(serie.total.valeur), n(serie.resume.replace(/^[^—]*—/, "")));
  controle("Produit 06 · Signatures par mois", "la variation est l'écart du dernier mois au premier",
    n(serie.mois[serie.mois.length - 1].valeur) - n(serie.mois[0].valeur), n(serie.variation.valeur));
}

/* ---------------------------------------------------------------- verdict */

const largeurEcran = Math.max(...lignes.map((l) => l.ecran.length));
const largeurIntitule = Math.max(...lignes.map((l) => l.intitule.length));
console.log("\nTABLEAU DES ADDITIONS — les écrans de preuve, recalculés\n");
let precedent = "";
for (const ligne of lignes) {
  const ecran = ligne.ecran === precedent ? "".padEnd(largeurEcran) : ligne.ecran.padEnd(largeurEcran);
  precedent = ligne.ecran;
  console.log(`  ${ecran}  ${ligne.intitule.padEnd(largeurIntitule)}  ${String(ligne.attendu).padStart(9)} ${String(ligne.obtenu).padStart(9)}  ${ligne.juste ? "OK" : "✗"}`);
}

const fautes = lignes.filter((l) => !l.juste);
console.log();
if (fautes.length === 0) {
  console.log(`  ${lignes.length} contrôles, tous justes.\n`);
  process.exit(0);
}
console.error(`✗ ${fautes.length} contrôle(s) sur ${lignes.length} tombent à côté — la construction s'arrête.\n`);
for (const f of fautes) console.error(`  ${f.ecran} — ${f.intitule} : attendu ${f.attendu}, lu ${f.obtenu}`);
console.error();
process.exit(1);
