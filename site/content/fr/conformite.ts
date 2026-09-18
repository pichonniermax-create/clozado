/**
 * /fr/conformite — LA CONFORMITÉ COMME PAGE PRODUIT, pas comme page légale.
 *
 * Sur ce marché, un cabinet achète d'abord la certitude que rien ne partira
 * sans lui et que ses données restent les siennes. Cette page décrit donc
 * des MÉCANISMES vérifiables dans le produit, jamais des intentions : ce
 * qui est écrit ici s'ouvre dans la démonstration ou se lit dans un journal.
 *
 * Les mentions de l'éditeur (identité, adresse, ORIAS) restent aux pages
 * légales : elles n'ont pas leur place dans un argumentaire.
 */
export const conformite = {
  meta: {
    titre: "Conformité et contrôle",
    description:
      "Hébergement dans l’Union européenne, isolation entre organisations, consentement et désinscription, journal de ce qui a été fait et écarté, export et réversibilité. Les mécanismes, pas les intentions.",
  },

  hero: {
    surtitre: "Conformité",
    titre: "Ce qui part, part parce que quelqu’un l’a décidé",
    chapo:
      "Clozado est construit sur des contrôles déterministes : des règles lisibles, un journal de ce qu’elles ont fait et de ce qu’elles ont écarté, et une validation humaine avant chaque envoi.",
    precision: "Tout ce qui suit s’ouvre dans la démonstration ou se lit dans un journal du produit.",
  },

  blocs: {
    intitule: "Les mécanismes",
    titre: "Six garanties, et comment elles tiennent",
    elements: [
      {
        titre: "Données personnelles",
        texte:
          "Vous restez responsable des données de vos clients ; Clozado les traite pour votre compte, selon vos instructions. Les droits des personnes sont outillés dans le produit, pas promis dans un document.",
        points: [
          "Export complet d’une fiche, en un geste.",
          "Suppression qui détruit l’identité et conserve la traçabilité des affaires.",
          "Journal des accès consultable sur chaque fiche.",
        ],
      },
      {
        titre: "Hébergement et localisation",
        texte:
          "L’application et sa base de données sont hébergées à Francfort, dans l’Union européenne. Les emails partent par un prestataire d’envoi ; tant que votre domaine n’est pas vérifié, ils partent d’un sous-domaine mutualisé, à votre nom.",
        points: [
          "Aucune donnée de production hors de l’Union européenne.",
          "Les enregistrements DNS à créer vous sont donnés, avec leur mode d’emploi.",
          "Le site que vous lisez n’exécute aucun script tiers et ne pose aucun cookie.",
        ],
      },
      {
        titre: "Isolation entre organisations",
        texte:
          "Chaque ligne de la base porte son organisation, et les clés étrangères la portent aussi : une tâche, un échange ou une commission ne peuvent pas désigner l’élément d’un autre espace. C’est la base de données qui l’interdit, pas une condition dans le code.",
        points: [
          "Les rattachements passent par des clés composites vérifiées à l’écriture.",
          "Un script d’isolation rejoue ces garanties à chaque évolution du schéma.",
          "Un lien de partage ne donne accès qu’à l’affaire qu’il désigne.",
        ],
      },
      {
        titre: "Consentement et démarchage",
        texte:
          "Une adresse désinscrite ne reçoit plus rien de l’organisation, définitivement. Les garde-fous sont revérifiés au moment de l’envoi, pas seulement au moment où la règle s’écrit.",
        points: [
          "Désinscription en un clic conforme à la RFC 8058, depuis le client de messagerie.",
          "Plafond d’envois par contact, heures de bureau, arrêt demandé.",
          "Un contact qui a demandé l’arrêt sort de toutes les cibles, sans exception.",
        ],
      },
      {
        titre: "Traçabilité des envois",
        texte:
          "Chaque passage d’une règle est journalisé contact par contact : l’action faite, ou l’action écartée avec son motif. La mémoire anti-répétition est lisible, jamais devinée.",
        points: [
          "Le pied de page légal est composé à l’envoi, jamais oublié.",
          "Sans adresse postale renseignée, aucun envoi réel ne part.",
          "L’état de chaque message est conservé : remis, ouvert, cliqué, en échec.",
        ],
      },
      {
        titre: "Réversibilité et export",
        texte:
          "Vos données sortent comme elles sont entrées. Les exports reprennent les définitions affichées à l’écran, à l’identique : un chiffre exporté veut dire la même chose qu’un chiffre lu.",
        points: [
          "Export CSV des contacts, des affaires, des commissions et des indicateurs.",
          "Les définitions sont écrites une fois et servent à l’écran comme à l’export.",
          "Aucune donnée n’est revendue, agrégée ni utilisée pour entraîner un modèle.",
        ],
      },
    ],
  },

  limite: {
    intitule: "La limite",
    titre: "Ce que cette page ne remplace pas",
    texte:
      "Clozado outille vos obligations, il ne les porte pas à votre place. Les mentions de votre cabinet — statut d’intermédiaire, numéro d’immatriculation, réclamations — relèvent de votre conformité et s’affichent sous votre responsabilité. Nos propres mentions sont aux pages légales de ce site.",
  },

  final: {
    titre: "Vérifier par vous-même",
    texte:
      "La démonstration publique montre les journaux, les garde-fous et les exports sur un cabinet fictif. Pour en parler sur votre organisation, réservez un créneau.",
  },
} as const;
