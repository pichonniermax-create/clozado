import type { ContenuMetier } from "../types";

/**
 * /fr/courtiers — COURTAGE EN CRÉDIT ET EN ASSURANCE, une page, deux
 * activités. Le produit a deux packs d'indicateurs distincts (« Courtier en
 * crédit » et « Courtier en assurance ») : la page les nomme tous les deux
 * plutôt que d'en inventer un troisième.
 *
 * Les irritants viennent du site existant (« Ce qui coince chez un courtier
 * de 5 à 50 personnes »). Deux sont écartés faute de réponse réelle : le
 * suivi des échéances de contrat (le produit ne gère pas de contrats — dit
 * dans le périmètre) et la reconstitution du devoir de conseil (il tient la
 * trace des échanges, pas le document).
 */
export const courtiers = {
  meta: {
    titre: "Le suivi commercial des courtiers en crédit et en assurance",
    description:
      "Pour les courtiers IOBSP et IAS : un pipeline par activité, des relances qui laissent un journal, les apporteurs mesurés, et des envois qui portent vos mentions ORIAS.",
  },

  hero: {
    secteur: "Courtage en crédit et en assurance",
    titre: "Un cabinet, plusieurs activités, un seul endroit où l’on sait quoi faire",
    chapo:
      "Clozado suit les dossiers qui n’avancent plus, les demandes restées sans premier contact, les affaires confiées à un confrère et les commissions qui vous restent dues — activité par activité, sans les mélanger.",
    precision: "Il s’installe à côté de votre CRM et de votre logiciel de gestion : vous gardez les deux.",
  },

  coince: {
    intitule: "Ce qui coince",
    titre: "Du courtier seul au cabinet de plusieurs conseillers",
    elements: [
      {
        titre: "Les affaires non abouties ne sont pas relancées",
        texte: "Le prospect repart, et personne ne sait pourquoi. Le dossier reste ouvert dans l’outil, sans suite.",
      },
      {
        titre: "Le portefeuille n’est pas segmenté",
        texte:
          "Ni par produit, ni par compagnie, ni par situation. Écrire à « ceux que ça concerne » demande un export et un tableur.",
      },
      {
        titre: "Les apporteurs ne sont ni suivis ni mesurés",
        texte:
          "On sait qu’un confrère envoie des dossiers. On ne sait pas combien, ni ce qu’ils sont devenus, ni ce qui reste à encaisser.",
      },
      {
        titre: "Le multi-statut ORIAS multiplie les process",
        texte:
          "Crédit, assurance, placement : trois cycles, trois vocabulaires, trois façons de compter — et rien qui se lise ensemble.",
      },
      {
        titre: "La réactivité sur les demandes reçues n’est pas mesurée",
        texte: "Une demande arrivée le vendredi et rappelée le mardi est une demande perdue, sans que le chiffre existe.",
      },
    ],
  },

  reponse: {
    intitule: "Ce que Clozado y répond",
    titre: "Cinq réponses, dans le même ordre",
    chapo: "Chacune existe en production aujourd’hui. Rien n’est annoncé ici qui ne s’ouvre pas dans la démonstration.",
    elements: [
      {
        titre: "Une perte se déclare, avec son motif",
        texte:
          "Une affaire qui part sur une étape « perdu » demande son motif, pris dans la liste de votre cabinet — taux concurrent, projet abandonné, sans réponse. L’écran des pertes en donne le taux et la répartition, période par période.",
      },
      {
        titre: "Des segments vivants, pas des exports",
        texte:
          "Une cible se décrit par des critères — étiquettes, ville, âge, affaires en cours ou gagnées — et se recalcule à chaque consultation. Votre portefeuille se découpe par étiquette (produit, compagnie) sans jamais quitter le produit.",
      },
      {
        titre: "Des apporteurs qui deviennent des chiffres",
        texte:
          "Vous confiez une affaire par un lien à votre nom, que le confrère ouvre sans créer de compte. La commission est fixée à l’envoi et suivie jusqu’au règlement. Partages, taux d’acceptation, transformation, commissions acquises et prévues, encours et vieillissement sont sur un écran.",
      },
      {
        titre: "Un pipeline par activité, dans un seul espace",
        texte:
          "Un pipeline est une famille d’affaires avec ses propres étapes : crédit immobilier, assurance emprunteur, prévoyance. Chacun a ses étapes, ses probabilités et ses étapes terminales gagné ou perdu. L’analytique se filtre par pipeline, ou se lit consolidée.",
      },
      {
        titre: "Le délai de premier contact, mesuré",
        texte:
          "Le « délai lead → premier contact effectif » est un indicateur du produit, avec sa définition affichée à côté du chiffre. Une demande reçue par vos simulateurs entre par une clé d’API, côté serveur, et entre dans ce compte.",
      },
    ],
  },

  indicateurs: {
    intitule: "Les indicateurs",
    titre: "Deux packs, selon votre activité principale",
    chapo:
      "« Courtier en crédit » suit les volumes et les délais : affaires créées, affaires signées, montant signé, délai création → signature, délai lead → premier contact effectif, taux de perte, partages envoyés, commissions générées. « Courtier en assurance » suit la transformation et la réactivité :",
    elements: [
      "Leads reçus",
      "Délai lead → premier contact effectif",
      "Affaires créées",
      "Affaires signées",
      "Taux de perte",
      "Affaires perdues",
      "Taux d’acceptation",
      "Commissions générées",
    ],
    note:
      "Le pack décide de ce qui est mis en avant sur le tableau de bord, pas de ce qui est disponible : les cinq écrans d’analytique — funnel, délais, pertes, partenaires, origines — restent ouverts en entier, quel que soit le pack.",
  },

  communication: {
    intitule: "La communication client",
    titre: "À qui vous écrivez, et avec quoi",
    chapo:
      "Une cible est un segment vivant de votre base, recalculé à chaque consultation. Chaque métier en propose cinq pour commencer ; chacune se modifie ensuite.",
    ciblesTitre: "Les cibles proposées",
    cibles: [
      { titre: "Primo-accédants", texte: "Les personnes qui achètent leur premier logement — la cible pédagogique du cabinet." },
      { titre: "Investisseurs", texte: "Clients et prospects qui financent un bien locatif ou un projet patrimonial." },
      { titre: "Assurés emprunteurs", texte: "Les personnes assurées sur un prêt : la loi permet de changer, elles doivent le savoir au bon moment." },
      { titre: "Professionnels et indépendants", texte: "Les travailleurs non salariés : prévoyance, santé et retraite se pensent ensemble." },
      { titre: "Projets en cours", texte: "Les dossiers de financement ouverts — chaque email fait avancer d’un pas." },
    ],
    veilleTitre: "La matière",
    veilleTexte:
      "La veille collecte chaque jour ce que publient les sources que vous suivez, classé par sujet et résumé avec nos mots — jamais un extrait d’article. Un résumé qui reprenait douze mots d’un article est refusé et n’est pas conservé.",
    sujets: [
      "Crédit immobilier",
      "Taux d’usure et conditions d’emprunt",
      "Marché immobilier",
      "Assurance emprunteur",
      "Aides à l’achat et primo-accédants",
      "Prévoyance et santé",
      "Réglementation de l’assurance",
    ],
    sourcesTexte:
      "Sources publiques proposées au départ : le ministère de l’Économie, l’ANIL, la Banque centrale européenne, l’espace épargnants de l’AMF. Vous en ajoutez et en retirez librement.",
    marcheTitre: "Les chiffres que vous avez le droit de citer",
    marcheTexte:
      "Les indicateurs de marché sont lus à la source, datés, et copiés dans vos chiffres vérifiés — jamais saisis à la main. Le rédacteur ne cite aucun chiffre qui n’a pas sa source et sa date.",
    marche: [
      "Taux d’usure — prêts à taux fixe de 20 ans et plus",
      "Taux d’usure — prêts à taux fixe de 10 à moins de 20 ans",
      "Taux effectif moyen — prêts de 20 ans et plus",
      "OAT 10 ans (TEC 10)",
      "Taux de la facilité de dépôt (BCE)",
      "Inflation en France (IPC)",
      "Prix des logements anciens (Notaires-INSEE)",
      "Indice de référence des loyers (IRL)",
    ],
  },

  conformite: {
    intitule: "Contrôle et conformité",
    titre: "Ce qui part porte votre identité, et laisse une trace",
    chapo:
      "Un courtier inscrit à l’ORIAS communique sous son identité, sous son statut et sous sa responsabilité. Clozado ne vous rend pas conforme — il tient la partie qui le concerne : ce qui part, à qui, quand, et avec quelles mentions.",
    elements: [
      {
        titre: "Vos mentions et votre numéro ORIAS, dans chaque email",
        texte:
          "Un champ libre porte ce que vos statuts imposent — SIREN, numéro ORIAS, RCS. Il est composé dans le pied de chaque envoi, avec votre adresse postale et le lien vers votre politique de confidentialité. Sans adresse postale, aucun envoi réel ne part.",
      },
      {
        titre: "Aucun chiffre sans sa source et sa date",
        texte:
          "Citer un taux d’usure ou une inflation, c’est citer un chiffre officiel, daté, lu à la source. Le rédacteur ne peut rien citer d’autre ; un chiffre sans source ou sans date est marqué « à compléter » et ne lui est pas transmis.",
      },
      {
        titre: "Une désinscription en un clic, définitive",
        texte:
          "Conforme à la RFC 8058 : le bouton du client de messagerie fonctionne, et l’adresse ne reçoit plus rien de votre organisation. C’est irréversible, pour vous comme pour elle.",
      },
      {
        titre: "La trace des échanges, avant qu’on la demande",
        texte:
          "Appels, rendez-vous et notes se consignent depuis la fiche. Un email transféré à votre adresse d’ingestion — ou celle-ci mise en copie cachée — revient en proposition de fiche et d’interaction, jamais écrite sans votre confirmation.",
      },
      {
        titre: "Rien ne part sans un clic humain",
        texte:
          "Les règles préparent une vague de brouillons ; une personne les relit et les envoie. À l’envoi, chaque garde-fou est revérifié : arrêt demandé, désinscription, plafond d’emails par contact, heures de bureau.",
      },
      {
        titre: "Le droit des personnes, outillé",
        texte:
          "Export complet d’une fiche, suppression qui détruit l’identité en conservant la traçabilité des affaires, et journal des accès sur chaque fiche — qui a consulté, exporté, fusionné, supprimé, et quand.",
      },
    ],
    avertissement:
      "Clozado n’est pas un outil de conformité réglementaire. Il ne produit ni document d’entrée en relation, ni fiche de devoir de conseil, ni rapport d’adéquation, et ne se substitue à aucun contrôle.",
  },

  perimetre: {
    intitule: "Le périmètre",
    titre: "Ce que Clozado ne fait pas pour un courtier",
    elements: [
      "Ce n’est pas un CRM : vous gardez le vôtre.",
      "Aucune gestion de contrats : ni contrat, ni compagnie, ni date d’échéance native. Une échéance se porte par une tâche, au besoin récurrente.",
      "Aucune comparaison de garanties, aucun tarificateur, aucune connexion à un extranet compagnie.",
      "Aucun document de devoir de conseil : la trace des échanges, pas la pièce réglementaire.",
      "Aucun encaissement : les commissions sont suivies, jamais perçues.",
    ],
  },

  final: {
    titre: "Regarder le produit sur un cabinet fictif",
    texte:
      "La démonstration est ouverte en lecture seule, sans inscription : un cabinet de courtage et sept mois d’historique — dossiers, partages, commissions, relances et indicateurs.",
    texteReservation: "Pour en parler, réservez un créneau.",
  },
} as const satisfies ContenuMetier;
