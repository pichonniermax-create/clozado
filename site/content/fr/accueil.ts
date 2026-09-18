/**
 * LA PAGE D'ACCUEIL. Règles tenues ici, ligne par ligne : aucune
 * fonctionnalité citée qui n'existe pas en production (l'inventaire du
 * 2026-09-18 fait foi) ; aucun chiffre non sourcé ; aucun témoignage ;
 * registre corporate, sans punchline ni emoji ; les contrôles
 * déterministes et la conformité au centre, l'IA jamais mise en avant.
 */
export const accueil = {
  meta: {
    titre: "Suivi commercial, relances et communication client",
    description:
      "Clozado suit ce qui attend une relance, les affaires confiées à un confrère et les commissions dues, et la communication adressée à vos clients. À côté de votre CRM, sans le remplacer.",
  },

  hero: {
    titre: "Le suivi commercial de votre cabinet, sans changer de CRM",
    chapo:
      "Clozado suit ce qui attend une relance, les affaires que vous confiez à un confrère et les commissions qui vous restent dues, et la communication que vous adressez à vos clients.",
    precision: "Il s’installe à côté de votre CRM : vous gardez le vôtre.",
    note: "Démonstration en lecture seule, sans inscription.",
  },

  probleme: {
    intitule: "Le constat",
    titre: "Un outil bien rempli ne fait pas un suivi",
    elements: [
      {
        titre: "Un CRM sous-exploité",
        texte:
          "L’outil est payé, les fiches sont là. Mais personne ne sait dire, en une minute, ce qui attend une action aujourd’hui.",
      },
      {
        titre: "Des relances oubliées",
        texte:
          "Une affaire confiée à un confrère reste sans réponse. Un dossier accepté s’arrête. Une commission confirmée n’est jamais réglée. Rien ne le signale.",
      },
      {
        titre: "Une communication irrégulière",
        texte:
          "On écrit à ses clients quand on y pense, à la liste entière, sans savoir ce qui a déjà été dit ni à qui.",
      },
    ],
  },

  preuves: {
    intitule: "Le produit",
    titre: "Trois affirmations, et l’écran qui les prouve",
    elements: [
      {
        cle: "tableau-de-bord" as const,
        titre: "Ce qui attend une action, dès l’ouverture",
        texte:
          "Quatre nombres et la liste du jour : les tâches en retard, les partages qu’il faut relancer, les dossiers acceptés puis restés sans suite, et ce qui reste à encaisser. Chaque tuile mène à l’écran où l’on agit.",
        points: [
          "Les tâches de relance naissent du suivi, pas d’une saisie.",
          "Une tâche se referme d’un clic, depuis n’importe quel écran.",
          "Les indicateurs mis en avant sont ceux de votre métier.",
        ],
      },
      {
        cle: "regles" as const,
        titre: "Des relances écrites en phrases",
        texte:
          "Une règle se lit d’un coup d’œil : « Sans rendez-vous après 7 jours → tâche ». Un déclencheur, un seuil, des conditions, une action. Et pour celles qui écrivent un email, une vague de brouillons qu’une personne relit avant d’envoyer.",
        points: [
          "Le dernier passage et son résultat s’affichent sous chaque règle.",
          "La vague annonce exactement combien d’emails un clic enverra.",
          "Aucun envoi automatique ne part sans ce clic.",
        ],
      },
      {
        cle: "funnel" as const,
        titre: "Des indicateurs à définition unique",
        texte:
          "De la visite à la signature, une seule chaîne : combien passent chaque pas, combien se perdent, et depuis quelle origine. Chaque indicateur porte sa définition à côté du chiffre, et l’export CSV reprend la même.",
        points: [
          "Le libellé d’un pas ouvre la liste des affaires qu’il compte.",
          "Un taux calculé sur trop peu d’observations n’est pas affiché.",
          "La période se choisit une fois et vaut pour tout le produit.",
        ],
      },
    ],
  },

  /** La rupture de rythme : une bande sombre, une seule phrase, trois appuis. C'est le point qui nous distingue. */
  rupture: {
    titre: "Aucun email automatique ne part sans qu’une personne l’ait relu.",
    elements: [
      { titre: "La règle prépare", texte: "Elle écrit des brouillons. Elle n’envoie rien." },
      { titre: "Une personne relit", texte: "La vague montre chaque message, et ce qu’un clic enverra." },
      {
        titre: "Les garde-fous sont revérifiés",
        texte: "À l’envoi : arrêt demandé, désinscription, plafond par contact, heures de bureau.",
      },
    ],
  },

  reste: {
    intitule: "Le reste du produit",
    titre: "Ce que vous n’aurez plus à tenir ailleurs",
    elements: [
      {
        titre: "Les affaires confiées à un confrère",
        texte:
          "Un lien à votre nom, que le confrère ouvre sans créer de compte. La commission est fixée au moment de l’envoi, puis suivie jusqu’au règlement. Clozado n’encaisse rien.",
      },
      {
        titre: "Une communication adressée, pas diffusée",
        texte:
          "Vos cibles sont des segments vivants de votre base — étiquettes, ville, affaires en cours — recalculés à chaque consultation. Le composeur ne cite que des chiffres qui portent leur source et leur date.",
      },
      {
        titre: "Les emails reçus, rattachés tout seuls",
        texte:
          "Transférez un email à votre adresse d’ingestion, ou mettez-la en copie cachée : le produit propose une fiche et une interaction. Rien n’est écrit sans votre confirmation.",
      },
    ],
  },

  pourQui: {
    intitule: "Pour qui",
    titre: "Trois métiers, trois façons de lire les mêmes chiffres",
    chapo:
      "Les indicateurs mis en avant, les segments proposés et la veille suivie dépendent du métier déclaré dans l’espace.",
    elements: [
      {
        cle: "cgp" as const,
        titre: "Conseil en gestion de patrimoine",
        texte:
          "CGP et CIF : ce qui est signé et pour combien, l’encours du pipeline, la transformation des dossiers confiés, les délais et les pertes.",
      },
      {
        cle: "courtiers" as const,
        titre: "Courtage en crédit et en assurance",
        texte:
          "Les volumes et les délais : ce qui entre, ce qui se signe, le temps jusqu’à la signature, la réactivité sur les demandes reçues, les apporteurs et les commissions acquises.",
      },
      {
        cle: "immobilier" as const,
        titre: "Transaction immobilière",
        texte:
          "Agents et conseillers : un pipeline par étapes, des relances sur des cycles longs, les apporteurs mesurés, et une communication régulière aux vendeurs comme aux acquéreurs.",
      },
    ],
  },

  conformite: {
    intitule: "Contrôle et conformité",
    titre: "Ce qui part, part parce que quelqu’un l’a décidé",
    chapo:
      "Le produit est construit sur des contrôles déterministes : des règles lisibles, un journal de ce qu’elles ont fait et de ce qu’elles ont écarté, et une validation humaine avant chaque envoi.",
    elements: [
      {
        titre: "Un pied de page composé, jamais oublié",
        texte:
          "Identité de l’expéditeur, adresse postale, mentions légales, lien vers votre politique de confidentialité, désinscription, mention de la mesure des ouvertures et des clics. Le profil du pays décide de ce qui est obligatoire. Sans adresse postale, aucun envoi réel ne part.",
      },
      {
        titre: "Une désinscription en un clic, définitive",
        texte:
          "Conforme à la RFC 8058 : le bouton de désinscription du client de messagerie fonctionne, et l’adresse ne reçoit plus rien de l’organisation.",
      },
      {
        titre: "Un journal qui dit aussi ce qui n’a pas été fait",
        texte:
          "Chaque passage d’une règle, contact par contact : l’action faite, ou l’action écartée avec son motif. La mémoire anti-répétition est lisible, pas devinée.",
      },
      {
        titre: "Le droit des personnes, outillé",
        texte:
          "Export complet d’une fiche, suppression qui détruit l’identité en conservant la traçabilité des affaires, et journal des accès consultable sur chaque fiche.",
      },
      {
        titre: "Votre domaine d’envoi, vérifié",
        texte:
          "Les enregistrements DNS à créer vous sont donnés, avec le mode d’emploi de votre hébergeur. Tant que le domaine n’est pas vérifié, vos emails partent d’un sous-domaine mutualisé, à votre nom.",
      },
      {
        titre: "Hébergement dans l’Union européenne",
        texte: "L’application et sa base de données sont hébergées à Francfort.",
      },
    ],
  },

  perimetre: {
    intitule: "Le périmètre",
    titre: "Ce que Clozado ne fait pas",
    elements: [
      "Ce n’est pas un CRM : vous gardez le vôtre.",
      "Aucune gestion de contrats, de programmes ni de mandats.",
      "Aucun encaissement : les commissions sont suivies, jamais perçues.",
      "Aucune signature électronique, aucune gestion documentaire.",
      "Aucun envoi automatique sans relecture humaine.",
    ],
  },

  final: {
    titre: "Voir le produit sur des données réelles",
    texte:
      "La démonstration est ouverte en lecture seule, sans inscription : un cabinet fictif et sept mois d’historique. Pour en parler, réservez un créneau.",
  },
} as const;
