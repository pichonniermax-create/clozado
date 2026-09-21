/**
 * /fr/demo — DEUX GESTES, SÉPARÉS. L'un ne mène pas à l'autre : ouvrir la
 * démonstration publique se fait tout de suite et sans rien donner ;
 * réserver un créneau se fait avec nous. Chacun a sa carte, son titre, sa
 * liste et son bouton.
 *
 * TANT QUE LA RÉSERVATION N'EST PAS EN LIGNE, il n'y a qu'un geste — et la
 * page doit le dire. Un titre qui annonce « deux façons » au-dessus d'une
 * seule carte est un texte faux, pas une approximation : `heroSeul` et
 * `metaSeul` sont la version à un geste, choisie par la page selon
 * `RESERVATION_EN_LIGNE`. Le jour où la réservation ouvre, rien à
 * réécrire.
 *
 * Tout ce qui est dit de la démonstration est vérifié dans le produit :
 * lecture seule imposée sur tous les chemins publics, aucune écriture en
 * base, blocage des emails au transport, `noindex`, cabinet fictif et sept
 * mois d'historique.
 */
export const demo = {
  meta: {
    titre: "Voir Clozado",
    description:
      "La démonstration publique s’ouvre en lecture seule, sans inscription : un cabinet fictif et sept mois d’historique. Ou réservez un créneau pour en parler avec nous.",
  },

  hero: {
    titre: "Deux façons de voir le produit",
    chapo:
      "La première ne demande rien et s’ouvre tout de suite. La seconde se fait avec nous, en visioconférence. Elles sont indépendantes : commencez par celle que vous voulez.",
  },

  /** La même page quand seul le premier geste existe. */
  heroSeul: {
    titre: "Voir le produit, tout de suite",
    chapo:
      "La démonstration publique s’ouvre sans inscription et sans rien donner. Vous entrez sur le tableau de bord d’un cabinet fictif, vous regardez ce que vous voulez, et vous quittez quand vous voulez.",
  },

  metaSeul: {
    titre: "Voir Clozado",
    description:
      "La démonstration publique s’ouvre en lecture seule, sans inscription : un cabinet fictif et sept mois d’historique.",
  },

  ouvrir: {
    surtitre: "Tout de suite, sans inscription",
    titre: "Ouvrir la démonstration publique",
    texte:
      "Un cabinet fictif, des données inventées, sept mois d’historique. Vous entrez directement sur le tableau de bord, une visite guidée vous propose le parcours, et vous quittez quand vous voulez.",
    elementsTitre: "Ce que vous verrez",
    elements: [
      "Le tableau de bord : ce qui attend une action aujourd’hui",
      "Le suivi en trois piles, et les tâches du jour",
      "Une affaire partagée à un confrère, et sa commission",
      "Les cinq écrans d’analytique, avec la définition de chaque indicateur",
      "Les règles de relance et leur journal",
      "Les cibles, une newsletter et la veille",
    ],
    action: "Ouvrir la démonstration",
  },

  reserver: {
    surtitre: "En visioconférence, avec nous",
    titre: "Réserver un créneau",
    texte:
      "Nous regardons votre situation plutôt que nos écrans : ce qui vous échappe aujourd’hui dans les relances, ce que vos apporteurs vous doivent, et ce que vous écrivez à vos clients.",
    elementsTitre: "Ce que nous regardons ensemble",
    elements: [
      "Ce qui attend une relance chez vous aujourd’hui, et comment vous le savez",
      "Comment vous confiez une affaire à un confrère, et ce que vous en récupérez",
      "Ce que vous envoyez à vos clients, à quelle fréquence, et à qui",
      "Ce que Clozado ferait à votre place, et ce qu’il ne ferait pas",
      "Votre CRM et vos outils actuels : ce qui reste en place",
    ],
    action: "Réserver une démo",
  },

  limites: {
    intitule: "Ce qu’il faut savoir",
    titre: "Ce que la démonstration publique n’est pas",
    elements: [
      { intitule: "Ce n’est pas un compte d’essai", precision: "rien de ce que vous faites n’y est enregistré." },
      { intitule: "Elle est en lecture seule", precision: "les gestes qui écrivent sont refusés, et le disent." },
      { intitule: "Aucun email ne part", precision: "l’envoi est bloqué au transport, pas seulement masqué à l’écran." },
      { intitule: "Les données sont inventées", precision: "le cabinet, les personnes et les montants sont fictifs." },
      { intitule: "Elle n’est pas indexée", precision: "les moteurs de recherche ne la référencent pas." },
    ],
  },

  final: {
    titre: "Une question avant d’ouvrir la démonstration ?",
    texte: "Réservez plutôt un créneau : un échange suffit à savoir si le produit vous concerne.",
  },
} as const;
