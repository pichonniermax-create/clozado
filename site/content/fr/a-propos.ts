/**
 * /fr/a-propos — POURQUOI L'OUTIL EXISTE, à qui il s'adresse, comment il
 * est construit.
 *
 * Aucune information personnelle, aucune photo, aucun effectif, aucune
 * levée de fonds, aucune date de création annoncée : rien qui ne soit
 * vérifiable dans le produit lui-même. Ce sont des PRINCIPES DE
 * CONSTRUCTION, et chacun se constate à l'écran.
 */
export const aPropos = {
  meta: {
    titre: "À propos",
    description:
      "Pourquoi Clozado existe, à qui il s’adresse, et comment il est construit : contrôles déterministes, définitions uniques, validation humaine avant tout envoi.",
  },

  hero: {
    surtitre: "À propos",
    titre: "Un outil de suivi, pas un CRM de plus",
    chapo:
      "Clozado est né d’un constat simple : dans un cabinet, l’outil est payé, les fiches sont remplies, et personne ne sait dire en une minute ce qui attend une action aujourd’hui.",
  },

  pourquoi: {
    intitule: "Pourquoi",
    titre: "Ce que nous avons vu, et qui n’est pas outillé",
    elements: [
      {
        titre: "Le suivi vit ailleurs que dans l’outil",
        texte:
          "Un tableur pour les affaires confiées à un confrère, une boîte mail pour les relances, une note pour les commissions à encaisser. Chacun de ces supports fonctionne seul, aucun ne parle aux autres.",
      },
      {
        titre: "Les relances dépendent de la mémoire",
        texte:
          "Un dossier accepté qui s’arrête, un lien de partage qui expire, une commission confirmée jamais réglée : rien ne le signale, et c’est la charge mentale d’une personne qui tient le tout.",
      },
      {
        titre: "Les chiffres changent de définition",
        texte:
          "Le même taux ne vaut pas la même chose d’un écran à l’autre ni d’un export au suivant. Un indicateur dont la définition bouge ne se décide jamais.",
      },
    ],
  },

  pourQui: {
    intitule: "Pour qui",
    titre: "Des cabinets qui vendent du conseil, pas du volume",
    chapo:
      "Conseil en gestion de patrimoine, courtage en crédit et en assurance, transaction immobilière : des activités à cycles longs, à apporteurs, et à obligations de conformité.",
    elements: [
      {
        titre: "Du conseiller seul au cabinet de plusieurs",
        texte:
          "L’outil fonctionne pour une personne et tient quand l’équipe grandit : chaque fiche porte son conseiller, chaque chiffre se lit par conseiller comme pour le cabinet entier.",
      },
      {
        titre: "À côté du CRM, jamais à sa place",
        texte:
          "Vous gardez l’outil dans lequel vos fiches vivent. Clozado prend ce qui attend une action et ce qui doit être prouvé, et s’arrête là.",
      },
      {
        titre: "Avec des obligations réelles",
        texte:
          "Démarchage encadré, désinscription à honorer, traçabilité des envois : ces contraintes sont dans le produit dès le premier jour, pas ajoutées après coup.",
      },
    ],
  },

  comment: {
    intitule: "Comment",
    titre: "Quatre partis pris de construction",
    elements: [
      {
        titre: "Déterministe avant tout",
        texte:
          "Les règles s’écrivent en phrases lisibles et produisent toujours le même résultat sur les mêmes données. L’aide à la rédaction existe, mais elle propose : elle n’envoie rien.",
      },
      {
        titre: "Rien ne part sans une personne",
        texte:
          "Une règle prépare des brouillons ; quelqu’un les relit et clique. C’est le principe le plus coûteux à tenir, et celui que nous ne négocierons pas.",
      },
      {
        titre: "Une définition par indicateur",
        texte:
          "Chaque chiffre porte sa définition à côté de lui, et l’export reprend la même. Un taux calculé sur trop peu d’observations n’est pas affiché.",
      },
      {
        titre: "Hébergé dans l’Union européenne",
        texte:
          "L’application et sa base sont à Francfort. Le site que vous lisez n’exécute aucun script tiers et ne pose aucun cookie — il n’a donc aucun bandeau à vous montrer.",
      },
    ],
  },

  final: {
    titre: "Voir le produit plutôt que d’en lire la description",
    texte:
      "La démonstration publique est en lecture seule, sans inscription. Elle montre exactement ce que cette page décrit.",
  },
} as const;
