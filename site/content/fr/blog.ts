/**
 * /fr/blog — L'INDEX, LA PAGE D'UN ARTICLE, LES CATÉGORIES.
 *
 * Les articles ne sont PAS ici : ils vivent en Markdown dans
 * `content/articles/`, lus au build (`lib/articles.ts`). Ce fichier ne
 * porte que les mots de l'interface — fil d'Ariane, sommaire, pagination,
 * voisins — parce qu'aucun texte affiché ne s'écrit dans un composant.
 *
 * UN SEUL ARTICLE EXISTE, marqué « démonstration » dans son en-tête, et la
 * page le dit en toutes lettres. Aucun autre n'est inventé pour faire
 * nombre : un blog qui s'ouvre avec trois billets de remplissage se voit.
 */
export const blog = {
  meta: {
    titre: "Le blog",
    description:
      "Ce que nous apprenons en construisant Clozado : suivi commercial, relances, conformité des envois et mesure.",
    titreCategorie: "Catégorie : {nom}",
    descriptionCategorie: "Les articles de la catégorie {nom}.",
    titrePage: "Le blog, page {numero}",
  },

  hero: {
    surtitre: "Le blog",
    titre: "Ce que nous apprenons en construisant Clozado",
    chapo:
      "Suivi commercial, relances écrites à la main puis automatisées, conformité des envois, mesure de ce qui se transforme. Des notes de travail, pas des communiqués.",
  },

  vide: {
    titre: "Aucun article pour l’instant",
    texte:
      "Nous préférons une page vide à des billets écrits pour faire nombre. Le premier article paraîtra quand il aura quelque chose à apprendre à un cabinet.",
  },

  liste: {
    intitule: "Les articles",
    categoriesTitre: "Par catégorie",
    toutes: "Toutes",
    compteUn: "article",
    comptePlusieurs: "articles",
    fluxTitre: "Flux RSS",
    fluxAide: "S’abonner au flux RSS du blog",
  },

  article: {
    lecture: "min de lecture",
    publieLe: "Publié le",
    misAJourLe: "Mis à jour le",
    sommaireTitre: "Sommaire",
    sommaireAide: "Sommaire de l’article",
    precedent: "Article précédent",
    suivant: "Article suivant",
    voisinsAide: "Articles voisins",
  },

  demonstration: {
    titre: "Article de démonstration",
    texte:
      "Ce texte montre ce qu’un article donne dans cette mise en page : titres, listes, citation, note, tableau et bloc de code. Il sera remplacé par le premier vrai article.",
  },

  filAriane: {
    aide: "Fil d’Ariane",
    accueil: "Accueil",
  },

  pagination: {
    aide: "Pages du blog",
    precedente: "Page précédente",
    suivante: "Page suivante",
    page: "Page",
    sur: "sur",
  },

  flux: {
    titre: "Le blog de Clozado",
    description:
      "Ce que nous apprenons en construisant Clozado : suivi commercial, relances, conformité des envois et mesure.",
  },
} as const;
