import type { PageLegale } from "../types";

/**
 * /fr/confidentialite — LA POLITIQUE DU SITE, pas celle du produit.
 *
 * Elle est courte parce que le site ne collecte rien : aucun cookie, aucun
 * traceur, aucune mesure d'audience, aucun formulaire. Ce qui reste — les
 * journaux techniques de l'hébergeur et les deux liens sortants — est dit,
 * plutôt que passé sous silence : c'est ce qui rend le reste crédible.
 *
 * La politique de l'APPLICATION est un document distinct : son adresse est
 * entre crochets tant qu'elle n'existe pas.
 */
export const confidentialite = {
  meta: {
    titre: "Confidentialité",
    description:
      "Ce site ne dépose aucun cookie, n’emploie aucun traceur, ne mesure pas son audience et ne comporte aucun formulaire.",
  },
  titre: "Politique de confidentialité",
  chapo:
    "Cette politique porte sur le site clozado.fr. L’application Clozado, à laquelle on accède depuis une autre adresse, relève d’un document distinct.",
  miseAJour: "Dernière mise à jour : [date]",
  sections: [
    {
      titre: "Ce que ce site ne fait pas",
      blocs: [
        {
          type: "liste",
          elements: [
            "Aucun cookie n’est déposé, d’aucune sorte — ni technique, ni de mesure, ni publicitaire.",
            "Aucun traceur, aucun pixel, aucun script tiers n’est chargé.",
            "L’audience du site n’est pas mesurée : ni outil externe, ni outil interne.",
            "Aucun formulaire n’y figure : aucune donnée ne vous est demandée.",
            "Rien n’est stocké dans votre navigateur.",
          ],
        },
        {
          type: "texte",
          texte:
            "Il n’y a donc aucun consentement à recueillir, et aucun bandeau à afficher. Les polices de caractères sont servies depuis ce même site : votre navigateur ne contacte aucun serveur extérieur pour afficher ces pages.",
        },
      ],
    },
    {
      titre: "Les journaux de l’hébergeur",
      blocs: [
        {
          type: "texte",
          texte:
            "Comme tout site, celui-ci est servi par un hébergeur qui conserve des journaux techniques : adresse IP, date et heure, page demandée, type de navigateur. Ils servent au fonctionnement du service et à sa sécurité. L’éditeur ne les exploite ni à des fins de mesure, ni à des fins commerciales.",
        },
        {
          type: "definitions",
          elements: [
            { terme: "Hébergeur", valeur: "Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis" },
            { terme: "Base légale", valeur: "Intérêt légitime : assurer le fonctionnement et la sécurité du site" },
            { terme: "Durée de conservation", valeur: "[durée appliquée par l’hébergeur]" },
          ],
        },
      ],
    },
    {
      titre: "Les liens sortants",
      blocs: [
        {
          type: "texte",
          texte:
            "Deux boutons de ce site mènent ailleurs. Aucun contenu de ces services n’est chargé dans ces pages : rien ne se déclenche tant que vous ne cliquez pas.",
        },
        {
          type: "definitions",
          elements: [
            {
              terme: "Réserver une démo",
              valeur:
                "Ouvre l’outil de prise de rendez-vous [nom du prestataire], qui recueille les informations que vous y saisissez selon sa propre politique.",
            },
            {
              terme: "Ouvrir la démonstration",
              valeur:
                "Ouvre la démonstration publique de l’application Clozado, en lecture seule : rien n’y est enregistré, et aucun email n’en part.",
            },
          ],
        },
      ],
    },
    {
      titre: "L’application Clozado",
      blocs: [
        {
          type: "texte",
          texte:
            "L’application est un service distinct de ce site : elle demande un compte, traite les données que ses utilisateurs y déposent, et son application ainsi que sa base de données sont hébergées dans l’Union européenne, à Francfort. Les traitements qui s’y opèrent sont décrits dans sa propre politique de confidentialité : [adresse de la politique de l’application].",
        },
      ],
    },
    {
      titre: "Vos droits",
      blocs: [
        {
          type: "texte",
          texte:
            "Le règlement général sur la protection des données vous reconnaît un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité sur les données qui vous concernent. Ce site n’en collectant aucune, ces droits s’exercent auprès de l’éditeur pour tout autre traitement.",
        },
        {
          type: "definitions",
          elements: [
            { terme: "Responsable de traitement", valeur: "[raison sociale]" },
            { terme: "Contact", valeur: "[adresse email de contact]" },
            { terme: "Adresse postale", valeur: "[adresse postale complète]" },
          ],
        },
        {
          type: "texte",
          texte:
            "Vous pouvez également introduire une réclamation auprès de la Commission nationale de l’informatique et des libertés (CNIL), 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 — cnil.fr.",
        },
      ],
    },
    {
      titre: "Modification",
      blocs: [
        {
          type: "texte",
          texte:
            "Cette politique peut être modifiée pour refléter une évolution du site. La date de dernière mise à jour figure en tête de page.",
        },
      ],
    },
  ],
} as const satisfies PageLegale;
