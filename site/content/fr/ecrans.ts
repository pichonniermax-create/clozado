/**
 * LES ÉCRANS DU PRODUIT, EN DONNÉES — partagés par toutes les pages.
 *
 * Ils vivaient dans `accueil.ts` tant que l'accueil était seul à les
 * montrer ; les pages métier les montrent aussi. Un seul jeu de données
 * pour un seul produit : un chiffre corrigé l'est partout à la fois.
 */
export const ecrans = {

  /** Les trois vues du premier écran, et le nom de leur groupe pour les lecteurs d'écran. */
  onglets: {
    libelleListe: "Choisir un écran du produit",
    suivi: "Suivi",
    tableauDeBord: "Tableau de bord",
    funnel: "Funnel",
  },

  suivi: {
    nom: "Suivi",
    resume: "12 éléments attendent une action : 8 partages sans réponse, 4 affaires acceptées restées sans suite.",
    legende: "L’écran Suivi, redessiné.",
    piles: [
      {
        titre: "Partages sans réponse",
        compte: "8",
        precision: "Le confrère n’a pas répondu, ou le lien va expirer.",
        lignes: [
          {
            titre: "Maison familiale — Saint-Herblain",
            detail: "Sophie Guérin · sans réponse depuis 24 j · lien expiré",
            action: "Renvoyer le lien",
          },
          {
            titre: "Regroupement de crédits",
            detail: "Julien Marchal · sans réponse depuis 20 j · expire dans 9 j",
            action: "Renvoyer le lien",
          },
          {
            titre: "Achat résidence principale — Orvault",
            detail: "Mehdi Bouaziz · sans réponse depuis 14 j · lien expiré",
            action: "Renvoyer le lien",
          },
        ],
      },
      {
        titre: "Acceptées sans suite",
        compte: "4",
        precision: "Acceptées, puis plus rien depuis cinq jours ou plus.",
        lignes: [
          {
            titre: "Maison de ville — Rezé",
            detail: "Sophie Guérin · acceptée le 5 mai 2026 · rien depuis 130 j",
            action: "Ouvrir",
          },
          {
            titre: "Deuxième investissement — SCI Les Tilleuls",
            detail: "Julien Marchal · acceptée le 10 août 2026 · rien depuis 33 j",
            action: "Ouvrir",
          },
        ],
      },
    ],
  },

  tableauDeBord: {
    nom: "Tableau de bord",
    resume: "Ce qui attend une action, dès l’ouverture.",
    legende: "Le tableau de bord, redessiné.",
    tuiles: [
      { libelle: "Tâches à faire", valeur: "31", precision: "dont 1 en retard" },
      { libelle: "Partages sans retour", valeur: "8", precision: "à relancer" },
      { libelle: "Acceptés sans suite", valeur: "4", precision: "depuis 5 jours ou plus" },
      { libelle: "Commissions à encaisser", valeur: "4 476 €", precision: "confirmées, non réglées" },
    ],
    listeTitre: "Les tâches du jour",
    lignes: [
      { titre: "Rappeler Sophie Guérin", detail: "En retard d’un jour · haute · Maison familiale — Saint-Herblain" },
      { titre: "Relancer le notaire", detail: "Aujourd’hui · normale · Achat résidence principale — Orvault" },
      { titre: "Envoyer le bilan trimestriel", detail: "Demain · normale · SCI Les Tilleuls" },
    ],
  },

  regles: {
    nom: "Règles de relance",
    resume: "Une vague de brouillons, et les règles qui les ont écrits.",
    legende: "L’écran Règles de relance, redessiné.",
    vague: {
      titre: "2 brouillons prêts à relire",
      precision: "Écrits ce matin à 7 h 00. Rien ne part tant que personne n’a cliqué.",
      action: "Envoyer les 2 emails",
    },
    lignes: [
      {
        phrase: "Sans rendez-vous après 7 jours → tâche",
        detail: "Hier à 7 h 00 : 14 contacts examinés, 2 tâches créées, 12 écartés — déjà relancés.",
      },
      {
        phrase: "Simulation terminée sans appel sous 48 h → email",
        detail: "Hier à 7 h 00 : 9 contacts examinés, 2 brouillons écrits, 7 écartés — hors heures de bureau, plafond par contact atteint.",
      },
    ],
  },

  funnel: {
    nom: "Funnel de conversion",
    resume: "De la visite à la signature, une seule chaîne.",
    legende: "L’écran Funnel de conversion, redessiné.",
    colonnes: { pas: "Pas", nombre: "Nombre", taux: "Passage", perte: "Déperdition" },
    pas: [
      { libelle: "Visiteurs", nombre: "1 284", taux: "—", perte: "—" },
      { libelle: "Simulations démarrées", nombre: "412", taux: "32,1 %", perte: "872" },
      { libelle: "Simulations terminées", nombre: "233", taux: "56,6 %", perte: "179" },
      { libelle: "Leads reçus", nombre: "148", taux: "63,5 %", perte: "85" },
      { libelle: "Contacts établis", nombre: "96", taux: "64,9 %", perte: "52" },
      { libelle: "Affaires issues de ces leads", nombre: "41", taux: "42,7 %", perte: "55" },
      { libelle: "Affaires gagnées", nombre: "12", taux: "29,3 %", perte: "29" },
    ],
  },
} as const;

/**
 * LES ÉCRANS DE CETTE PAGE SONT REDESSINÉS EN HTML, pas photographiés :
 * aucune image n'est servie. Ils montrent ce que montre le produit, avec
 * les données du cabinet fictif de la démonstration. Ces nombres sont
 * inventés par construction : il faut le dire à l'écran, sinon la page
 * présente des chiffres non sourcés — exactement ce qu'elle s'interdit
 * partout ailleurs.
 */
export const mentionEcrans =
  "Les écrans de cette page sont ceux du produit, redessinés ici avec les données de la démonstration : un cabinet fictif, des chiffres inventés.";
