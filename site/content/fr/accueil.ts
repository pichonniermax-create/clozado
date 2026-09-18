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

  produit: {
    intitule: "Le produit",
    titre: "Ce que Clozado tient à votre place",
    elements: [
      {
        titre: "Ce qui attend une action, en trois piles",
        texte:
          "Les partages sans réponse, les dossiers acceptés puis restés sans suite, les commissions confirmées non réglées. Et une liste de tâches — échéance, priorité, responsable — qui se referme d’un clic depuis n’importe quel écran.",
      },
      {
        titre: "Des relances écrites en phrases",
        texte:
          "Une règle se lit : aucun rendez-vous depuis quinze jours, alors créer une tâche pour le conseiller. Un déclencheur, un seuil, des conditions, une action. Rien d’implicite.",
      },
      {
        titre: "Aucun email automatique ne part sans un clic",
        texte:
          "Les règles préparent une vague de brouillons. Une personne les relit et les envoie. À l’envoi, chaque garde-fou est revérifié : arrêt demandé, désinscription, plafond d’emails par contact, heures de bureau.",
      },
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
        titre: "Des indicateurs à définition unique",
        texte:
          "Funnel, délais, pertes, apporteurs, origines. Chaque indicateur a une définition écrite une fois, affichée à l’écran à côté du chiffre, et reprise à l’identique dans les exports.",
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
      "La démonstration est ouverte en lecture seule, sans inscription : un cabinet fictif et sept mois d’historique. Pour en parler, réservez un créneau de trente minutes.",
  },
} as const;
