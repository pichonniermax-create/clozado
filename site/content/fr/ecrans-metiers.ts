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
 *   — transaction immobilière : une LISTE À PILES, parce qu'un agent suit
 *     des personnes qui avancent, ou pas, dans un parcours.
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
      { libelle: "Rendez-vous découverte", date: "11 mars", ecart: "8 j", etat: "fait" as const },
      { libelle: "Étude et proposition remises", date: "24 mars", ecart: "13 j", etat: "fait" as const },
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

  /** Transaction immobilière — le parcours de la visite à l'acte. */
  immobilier: {
    nom: "De la visite à l’acte",
    resume: "Huit acquéreurs en cours de parcours",
    legende: "Le parcours des acquéreurs, redessiné.",
    piles: [
      {
        titre: "Visites sans retour",
        compte: "3",
        precision: "Visité, puis plus de nouvelles.",
        lignes: [
          {
            titre: "T3 — rue des Tanneurs",
            detail: "Nadia Belhadj · visité le 2 mai · sans nouvelles depuis 19 j",
            action: "Rappeler",
          },
          {
            titre: "Maison de bourg — Sucé-sur-Erdre",
            detail: "Yann Coatmeur · visité le 28 avril · sans nouvelles depuis 23 j",
            action: "Rappeler",
          },
          {
            titre: "Terrain viabilisé — Le Cellier",
            detail: "Famille Ferreira · visité le 11 mai · sans nouvelles depuis 10 j",
            action: "Rappeler",
          },
        ],
      },
      {
        titre: "Offres remises, sans réponse",
        compte: "2",
        precision: "Le vendeur n’a pas encore tranché.",
        lignes: [
          {
            titre: "Duplex — quai Malakoff",
            detail: "Sabine Ortega · offre remise le 14 mai · réponse attendue sous 5 j",
            action: "Relancer",
          },
          {
            titre: "Longère — Vallet",
            detail: "Bruno Tanguy · offre remise le 9 mai · réponse attendue sous 2 j",
            action: "Relancer",
          },
        ],
      },
      {
        titre: "Compromis signés, acte à venir",
        compte: "3",
        precision: "Le délai court ; rien à faire, sauf si une date glisse.",
        lignes: [
          {
            titre: "Appartement — boulevard des Poilus",
            detail: "Inès Rahmouni · compromis le 6 mai · acte prévu le 24 juin",
            action: "Suivre",
          },
          {
            titre: "Maison — Saint-Fiacre",
            detail: "Loïc Pennanec’h · compromis le 29 avril · acte prévu le 17 juin",
            action: "Suivre",
          },
          {
            titre: "Studio — rue Fouré",
            detail: "Camille Desprès · compromis le 18 mai · acte prévu le 6 juillet",
            action: "Suivre",
          },
        ],
      },
    ],
  },
} as const;
