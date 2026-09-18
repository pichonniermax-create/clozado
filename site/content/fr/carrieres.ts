/**
 * /fr/carrieres — SOBRE, SANS POSTE OUVERT.
 *
 * Aucun poste inventé, aucun effectif annoncé, aucun avantage promis :
 * ce qui est écrit ici décrit la manière de travailler, qui se constate
 * dans le produit. Une candidature spontanée a une adresse, et c'est tout.
 */
export const carrieres = {
  meta: {
    titre: "Carrières",
    description:
      "Ce que fait Clozado, comment nous travaillons, et où envoyer une candidature spontanée. Aucun poste ouvert affiché aujourd’hui.",
  },

  hero: {
    surtitre: "Carrières",
    titre: "Aucun poste ouvert aujourd’hui",
    chapo:
      "Nous préférons le dire que de laisser une page d’offres qui ne bouge pas. Voici ce que nous construisons et comment nous travaillons : si cela vous parle, écrivez-nous.",
  },

  activite: {
    intitule: "Ce que nous faisons",
    titre: "Un outil de suivi commercial pour des cabinets réglementés",
    texte:
      "Clozado tient le suivi d’un cabinet de conseil en gestion de patrimoine, de courtage ou de transaction immobilière : ce qui attend une relance, les affaires confiées à un confrère, les commissions dues, et la communication adressée aux clients. Il s’utilise à côté d’un CRM, sans le remplacer.",
  },

  methode: {
    intitule: "Comment nous travaillons",
    titre: "Quatre habitudes, tenues",
    elements: [
      {
        titre: "Ce qui est livré est prouvé",
        texte:
          "Une fonctionnalité n’est pas finie quand elle compile : elle est finie quand elle a été exécutée, mesurée, et que la mesure est écrite. Les journaux de chantier du produit sont tenus à ce niveau.",
      },
      {
        titre: "Les décisions sont écrites",
        texte:
          "Chaque choix structurant est consigné avec ce qu’il coûte et ce qu’il exclut. On peut revenir sur une décision ; on ne la redécouvre pas six mois plus tard.",
      },
      {
        titre: "Le produit passe avant l’outillage",
        texte:
          "Pas de dépendance ajoutée pour une ligne de code, pas de couche d’abstraction posée à l’avance. Le site que vous lisez n’a aucune librairie d’animation et ne sert aucune image.",
      },
      {
        titre: "La conformité n’est pas une option",
        texte:
          "Désinscription, plafonds d’envoi, journal des actions écartées, isolation entre organisations : ces contraintes sont dans le modèle de données, pas dans une liste de tâches à traiter plus tard.",
      },
    ],
  },

  candidature: {
    intitule: "Candidatures spontanées",
    titre: "Écrivez-nous",
    texte:
      "Dites-nous ce que vous avez construit, et ce que vous aimeriez construire ici. Une candidature courte et précise vaut mieux qu’un dossier : un lien vers du travail réel suffit.",
    adresse: "candidatures@clozado.fr",
    mention: "Nous répondons à toutes les candidatures, y compris quand la réponse est non.",
  },
} as const;
