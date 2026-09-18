/**
 * /fr/blog — L'INDEX, VIDE AU LANCEMENT ET QUI LE DIT.
 *
 * La structure est prête : la liste, la page d'un article, le balisage
 * `Blog`. Aucun article n'est inventé pour faire nombre — un blog qui
 * s'ouvre avec trois billets écrits pour remplir la page se voit, et coûte
 * plus qu'il ne rapporte.
 *
 * Le jour où un article existe, il s'ajoute à `articles` et la page se
 * remplit : rien d'autre à toucher.
 */
export const blog = {
  meta: {
    titre: "Le blog",
    description:
      "Ce que nous apprenons en construisant Clozado : suivi commercial, relances, conformité des envois et mesure. Le premier article paraîtra ici.",
  },

  hero: {
    surtitre: "Le blog",
    titre: "Ce que nous apprenons en construisant Clozado",
    chapo:
      "Suivi commercial, relances écrites à la main puis automatisées, conformité des envois, mesure de ce qui se transforme. Des notes de travail, pas des communiqués.",
  },

  /** Aucun article publié. La liste vit ici ; la page s'y adapte toute seule. */
  articles: [] as readonly {
    readonly slug: string;
    readonly titre: string;
    readonly resume: string;
    readonly date: string;
    readonly minutes: number;
    readonly corps: readonly string[];
  }[],

  vide: {
    titre: "Aucun article pour l’instant",
    texte:
      "Nous préférons une page vide à des billets écrits pour faire nombre. Le premier article paraîtra quand il aura quelque chose à apprendre à un cabinet.",
    action: "Voir le produit en attendant",
  },

  article: {
    retour: "Tous les articles",
    lectureMinutes: "min de lecture",
  },
} as const;
