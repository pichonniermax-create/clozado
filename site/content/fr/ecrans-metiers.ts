/**
 * UN ÉCRAN DE PREUVE PAR MÉTIER — trois jeux de données, trois formes.
 *
 * Jusqu'ici les trois pages métier montraient le MÊME tableau Suivi, avec
 * les mêmes noms et les mêmes montants : un courtier et un agent immobilier
 * voyaient exactement le même écran. C'était le défaut le plus visible du
 * site, et le plus coûteux — un écran qui ne parle pas du métier de celui
 * qui le lit ne prouve rien.
 *
 * TROIS FORMES DIFFÉRENTES, parce que les trois métiers ne se regardent pas
 * de la même façon :
 *   — gestion de patrimoine : une CHRONOLOGIE, parce qu'un dossier de
 *     patrimoine se juge à son cycle de vie et à ses points d'arrêt ;
 *   — courtage : un TABLEAU CHIFFRÉ, parce qu'un courtier compare des
 *     délais et des montants par banque et par partenaire ;
 *   — transaction immobilière : une JAUGE DE PARCOURS, parce qu'un agent
 *     regarde d'abord OÙ en est chaque dossier sur la ligne, et lesquels
 *     n'ont pas bougé.
 *
 * AUCUN LIBELLÉ N'EST PARTAGÉ entre les trois, ni avec l'accueil : ni nom de
 * personne, ni bien, ni banque, ni montant, ni date. C'est vérifié par un
 * contrôle au navigateur, pas à l'œil.
 *
 * LES CHIFFRES SONT COHÉRENTS À L'INTÉRIEUR DE CHAQUE ÉCRAN : la somme des
 * écarts de la chronologie fait son ancienneté totale, les totaux des
 * tableaux sont la somme de leurs lignes, la moyenne des délais est
 * pondérée par le nombre de dossiers, et chaque compte de pile est le nombre
 * de lignes affichées. Un écran de démonstration qui ne tient pas ses
 * additions décrédibilise tout le reste.
 */
export const ecransMetiers = {
  /** Gestion de patrimoine — la chronologie d'un dossier, de l'entrée au versement. */
  cgp: {
    nom: "Cycle du dossier",
    resume: "Arbitrage assurance-vie — Hélène Vasseur",
    legende: "Le cycle de vie d’un dossier, redessiné.",
    ancienneteLibelle: "Ouvert depuis",
    ancienneteValeur: "71 j",
    etapes: [
      { libelle: "Dossier ouvert", date: "3 mars", ecart: "", etat: "fait" as const },
      { libelle: "Rendez-vous découverte", date: "10 mars", ecart: "7 j", etat: "fait" as const },
      { libelle: "Étude et proposition remises", date: "24 mars", ecart: "14 j", etat: "fait" as const },
      { libelle: "Mandat signé", date: "2 avril", ecart: "9 j", etat: "fait" as const },
      { libelle: "Souscription transmise à l’assureur", date: "9 avril", ecart: "7 j", etat: "fait" as const },
      {
        libelle: "Pièces réclamées : justificatif de domicile",
        date: "21 avril",
        ecart: "12 j",
        etat: "arret" as const,
        note: "Premier point d’arrêt",
      },
      {
        libelle: "Commission versée",
        date: "attendue",
        ecart: "22 j",
        etat: "attente" as const,
        note: "Second point d’arrêt : rien depuis le 21 avril",
      },
    ],
  },

  /** Courtage — les dossiers en attente de banque, et les commissions dues par partenaire. */
  courtiers: {
    nom: "En attente de banque",
    resume: "Onze dossiers déposés, aucune réponse",
    legende: "Les délais par étape et les commissions dues, redessinés.",
    banques: {
      colonnes: { nom: "Banque", dossiers: "Dossiers", moyen: "Délai moyen", ancien: "Le plus ancien" },
      lignes: [
        { nom: "Banque Regain", dossiers: "5", moyen: "12 j", ancien: "21 j" },
        { nom: "Caisse de l’Estuaire", dossiers: "3", moyen: "18 j", ancien: "27 j" },
        { nom: "Crédit Ligérien", dossiers: "2", moyen: "9 j", ancien: "11 j" },
        { nom: "Banque Solane", dossiers: "1", moyen: "24 j", ancien: "24 j" },
      ],
      total: { nom: "Total", dossiers: "11", moyen: "14 j", ancien: "27 j" },
    },
    commissions: {
      titre: "Commissions dues par partenaire",
      colonnes: { nom: "Partenaire", dossiers: "Dossiers", montant: "Montant" },
      lignes: [
        { nom: "Cabinet Torrès", dossiers: "4", montant: "3 120 €" },
        { nom: "Agence Maupertuis", dossiers: "2", montant: "1 480 €" },
        { nom: "Vial & Fils", dossiers: "1", montant: "940 €" },
      ],
      total: { nom: "Total", dossiers: "7", montant: "5 540 €" },
    },
  },

  /**
   * Transaction immobilière — la JAUGE DE PARCOURS.
   *
   * C'était une liste à piles, c'est-à-dire la même forme que le Suivi de
   * l'accueil : un visiteur qui passait de l'un à l'autre voyait deux fois
   * le même écran. La jauge dit la même chose autrement — où en est chaque
   * dossier sur la ligne visite → offre → compromis → acte, et lesquels
   * n'ont pas bougé.
   *
   * Les données n'ont pas changé : mêmes acquéreurs, mêmes biens, mêmes
   * dates. L'ancienneté de chacun est le nombre de jours depuis son dernier
   * mouvement, comptés au 21 mai ; un dossier est MARQUÉ au-delà de quinze
   * jours, et le seuil est écrit à l'écran plutôt que deviné.
   */
  immobilier: {
    nom: "De la visite à l’acte",
    resume: "Huit acquéreurs en cours de parcours",
    legende: "Le parcours des acquéreurs, redessiné.",
    seuilLibelle: "Sans mouvement depuis plus de 15 jours",
    positions: [
      { cle: "visite" as const, libelle: "Visite", compte: "3" },
      { cle: "offre" as const, libelle: "Offre", compte: "2" },
      { cle: "compromis" as const, libelle: "Compromis", compte: "3" },
      { cle: "acte" as const, libelle: "Acte", compte: "0" },
    ],
    dossiers: [
      {
        position: "visite" as const,
        personne: "Nadia Belhadj",
        bien: "T3 — rue des Tanneurs",
        depuisLe: "2 mai",
        anciennete: "19 j",
        marque: true,
      },
      {
        position: "visite" as const,
        personne: "Yann Coatmeur",
        bien: "Maison de bourg — Sucé-sur-Erdre",
        depuisLe: "28 avril",
        anciennete: "23 j",
        marque: true,
      },
      {
        position: "visite" as const,
        personne: "Famille Ferreira",
        bien: "Terrain viabilisé — Le Cellier",
        depuisLe: "11 mai",
        anciennete: "10 j",
        marque: false,
      },
      {
        position: "offre" as const,
        personne: "Sabine Ortega",
        bien: "Duplex — quai Malakoff",
        depuisLe: "14 mai",
        anciennete: "7 j",
        marque: false,
      },
      {
        position: "offre" as const,
        personne: "Bruno Tanguy",
        bien: "Longère — Vallet",
        depuisLe: "9 mai",
        anciennete: "12 j",
        marque: false,
      },
      {
        position: "compromis" as const,
        personne: "Inès Rahmouni",
        bien: "Appartement — boulevard des Poilus",
        depuisLe: "6 mai",
        anciennete: "15 j",
        marque: false,
      },
      {
        position: "compromis" as const,
        personne: "Loïc Pennanec’h",
        bien: "Maison — Saint-Fiacre",
        depuisLe: "29 avril",
        anciennete: "22 j",
        marque: true,
      },
      {
        position: "compromis" as const,
        personne: "Camille Desprès",
        bien: "Studio — rue Fouré",
        depuisLe: "18 mai",
        anciennete: "3 j",
        marque: false,
      },
    ],
  },
} as const;
