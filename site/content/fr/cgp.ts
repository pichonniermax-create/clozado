import type { ContenuMetier } from "../types";

/**
 * /fr/cgp — CONSEIL EN GESTION DE PATRIMOINE.
 *
 * Les irritants sont ceux du site existant (« Ce qui coince dans un cabinet
 * de 5 à 50 personnes »), gardés quand le produit y répond vraiment, et
 * écartés sinon : « le rapprochement de deux cabinets laisse deux bases
 * incompatibles » n'est pas tenu — un espace est une organisation, il n'y a
 * pas de consolidation entre deux cabinets. Rien n'est promis à sa place.
 *
 * Les indicateurs, les cibles, les sujets de veille et les indicateurs de
 * marché sont ceux du pack « Conseil en gestion de patrimoine » du produit
 * (src/lib/metrics/packs.ts), sous leur nom exact. Aucune valeur n'est
 * citée — seulement ce qui est mesuré.
 */
export const cgp = {
  meta: {
    titre: "Le suivi commercial des cabinets de gestion de patrimoine",
    description:
      "Pour les CGP et les CIF : ce qui attend une relance, les dossiers confiés à un confrère, les points annuels tenus, et une communication qui ne cite que des chiffres sourcés et datés.",
  },

  hero: {
    secteur: "Conseil en gestion de patrimoine",
    titre: "Ce que votre cabinet doit relancer, et ce qu’il doit prouver",
    chapo:
      "Clozado suit les dossiers en cours, les rendez-vous qui n’ont pas été repris, les affaires confiées à un confrère et les commissions qui vous restent dues — et tient la trace de ce que vous avez écrit, à qui et quand.",
    precision: "Il s’installe à côté de votre CRM : vous gardez le vôtre.",
  },

  coince: {
    intitule: "Ce qui coince",
    titre: "Du conseiller seul au cabinet de plusieurs conseillers",
    elements: [
      {
        titre: "La connaissance client est répartie",
        texte:
          "Entre les têtes, les boîtes mail et plusieurs fichiers. Personne ne peut dire en une minute où en est un dossier.",
      },
      {
        titre: "Le point annuel n’est pas systématiquement tenu",
        texte: "Il dépend de la mémoire de chacun, faute d’un suivi qui le réclame au bon moment.",
      },
      {
        titre: "La traçabilité se reconstitue à la main",
        texte: "Quand un échange est demandé, il faut le retrouver dans une boîte mail, et prouver qu’il a bien eu lieu.",
      },
      {
        titre: "Le réseau d’apporteurs n’est pas mesuré",
        texte:
          "Ni segmenté, ni animé. Un dossier confié à un confrère part et ne revient pas toujours ; la commission encore moins.",
      },
      {
        titre: "L’outil est payé, mais peu ouvert",
        texte: "Parce qu’il demande d’être rempli avant de rendre quoi que ce soit.",
      },
    ],
  },

  reponse: {
    intitule: "Ce que Clozado y répond",
    titre: "Cinq réponses, dans le même ordre",
    chapo: "Chacune existe en production aujourd’hui. Rien n’est annoncé ici qui ne s’ouvre pas dans la démonstration.",
    elements: [
      {
        titre: "Une fiche qui relie tout le dossier",
        texte:
          "Identité, étiquettes, société de rattachement, affaires, tâches, rendez-vous, appels, emails et notes — et l’historique des newsletters reçues avec leur état. Les doublons sont proposés à la fusion plutôt que laissés à vivre.",
      },
      {
        titre: "Une règle qui réclame le point annuel",
        texte:
          "« Aucun rendez-vous depuis N jours, alors créer une tâche pour le conseiller. » Elle se lit en une phrase, elle s’évalue tous les matins, et son journal dit pour chaque fiche ce qui a été fait — ou pourquoi ça ne l’a pas été. Un rendez-vous pris arrête la relance.",
      },
      {
        titre: "Une trace qui existe avant qu’on la demande",
        texte:
          "Les interactions se consignent depuis la fiche. Un email transféré à votre adresse d’ingestion, ou mise en copie cachée, revient en proposition de fiche et d’interaction — rien n’est écrit sans votre confirmation. Chaque consultation, export ou suppression d’une fiche est journalisée.",
      },
      {
        titre: "Des apporteurs qui deviennent des chiffres",
        texte:
          "Vous confiez une affaire par un lien à votre nom, que le confrère ouvre sans créer de compte. La commission est fixée à l’envoi et suivie jusqu’au règlement. L’écran d’analytique des partenaires donne partages, acceptation, transformation, commissions acquises et prévues, encours et vieillissement.",
      },
      {
        titre: "Un écran qui montre avant de demander",
        texte:
          "Le tableau de bord annonce ce qui attend une action aujourd’hui ; les tâches se referment d’un clic depuis n’importe quel écran. Les tâches de relance naissent toutes seules du suivi : partage sans réponse, dossier accepté puis silencieux, commission non réglée.",
      },
    ],
  },

  indicateurs: {
    intitule: "Les indicateurs",
    titre: "Ce que votre tableau de bord met en avant",
    chapo:
      "Le pack « Conseil en gestion de patrimoine » suit les encours et la collecte. Chaque indicateur a une définition écrite une fois, affichée à l’écran à côté du chiffre, et reprise à l’identique dans les exports CSV.",
    elements: [
      "Montant signé",
      "Affaires signées",
      "Affaires en cours",
      "Commissions générées",
      "Taux de transformation",
      "Délai création → signature",
      "Taux de perte",
      "Délai lead → premier contact effectif",
    ],
    note:
      "Un taux calculé sur trop peu d’observations n’est pas affiché : la tuile dit ce qui lui manque, plutôt que d’avancer un chiffre qui ne veut rien dire.",
  },

  communication: {
    intitule: "La communication client",
    titre: "À qui vous écrivez, et avec quoi",
    chapo:
      "Une cible est un segment vivant de votre base — étiquettes, ville, âge, affaires en cours — recalculé à chaque consultation. Votre métier en propose cinq pour commencer ; chacune se modifie ensuite.",
    ciblesTitre: "Les cibles proposées",
    cibles: [
      { titre: "Clients", texte: "Les fiches avec au moins une affaire gagnée." },
      { titre: "Prospects en réflexion", texte: "Une affaire ouverte : ils réfléchissent, l’email doit aider à décider." },
      { titre: "Chefs d’entreprise", texte: "Dirigeants et indépendants : patrimoine professionnel et personnel se répondent." },
      { titre: "Préparation de la retraite", texte: "Les personnes de cinquante ans et plus." },
      { titre: "Jeunes actifs", texte: "Les moins de quarante ans : construire, pas encore arbitrer." },
    ],
    veilleTitre: "La matière",
    veilleTexte:
      "La veille collecte chaque jour ce que publient les sources que vous suivez, classé par sujet et résumé avec nos mots — jamais un extrait d’article. Un résumé qui reprenait douze mots d’un article est refusé et n’est pas conservé.",
    sujets: [
      "Assurance-vie et placements",
      "SCPI et immobilier locatif",
      "Fiscalité du patrimoine",
      "Retraite",
      "Marchés financiers",
    ],
    sourcesTexte:
      "Sources publiques proposées au départ : l’AMF (espace épargnants et communiqués de presse), le ministère de l’Économie, la Banque centrale européenne, la Bank of England. Vous en ajoutez et en retirez librement.",
    marcheTitre: "Les chiffres que vous avez le droit de citer",
    marcheTexte:
      "Les indicateurs de marché sont lus à la source, datés, et copiés dans vos chiffres vérifiés — jamais saisis à la main. Le rédacteur ne cite aucun chiffre qui n’a pas sa source et sa date.",
    marche: [
      "Taux de la facilité de dépôt (BCE)",
      "€STR",
      "OAT 10 ans (TEC 10)",
      "Inflation en France (IPC)",
      "Inflation dans la zone euro (IPCH)",
      "Prix des logements anciens (Notaires-INSEE)",
      "Variation annuelle de l’IRL",
    ],
  },

  conformite: {
    intitule: "Contrôle et conformité",
    titre: "Ce qui part porte votre identité, et laisse une trace",
    chapo:
      "Un cabinet de CGP inscrit à l’ORIAS communique sous son identité et sous sa responsabilité. Clozado ne vous rend pas conforme — il tient la partie qui le concerne : ce qui part, à qui, quand, et avec quelles mentions.",
    elements: [
      {
        titre: "Vos mentions, dans chaque email",
        texte:
          "Un champ libre porte ce que votre statut impose — SIREN, numéro ORIAS, RCS, association agréée. Il est composé dans le pied de chaque envoi, avec votre adresse postale et le lien vers votre politique de confidentialité. Sans adresse postale, aucun envoi réel ne part.",
      },
      {
        titre: "Aucun chiffre sans sa source et sa date",
        texte:
          "Le rédacteur ne peut citer qu’un chiffre vérifié, qui porte qui le publie et la date à laquelle il était vrai. Un chiffre sans l’un des deux est marqué « à compléter » et ne lui est pas transmis. Cela vaut aussi pour vos chiffres internes.",
      },
      {
        titre: "Une désinscription en un clic, définitive",
        texte:
          "Conforme à la RFC 8058 : le bouton du client de messagerie fonctionne, et l’adresse ne reçoit plus rien de votre organisation. C’est irréversible, pour vous comme pour elle.",
      },
      {
        titre: "Le droit des personnes, outillé",
        texte:
          "Export complet d’une fiche en un fichier, suppression qui détruit l’identité en conservant la traçabilité des affaires, et journal des accès consultable sur chaque fiche — qui a consulté, exporté, fusionné, supprimé, et quand.",
      },
      {
        titre: "Rien ne part sans un clic humain",
        texte:
          "Les règles préparent une vague de brouillons ; une personne les relit et les envoie. À l’envoi, chaque garde-fou est revérifié : arrêt demandé, désinscription, plafond d’emails par contact, heures de bureau.",
      },
      {
        titre: "Votre domaine d’envoi, vérifié",
        texte:
          "Les enregistrements DNS à créer vous sont donnés, avec le mode d’emploi de votre hébergeur. Tant qu’il n’est pas vérifié, vos emails partent d’un sous-domaine mutualisé, à votre nom.",
      },
    ],
    avertissement:
      "Clozado n’est pas un outil de conformité réglementaire. Il ne produit ni lettre de mission, ni document d’entrée en relation, ni rapport d’adéquation, et ne se substitue à aucun contrôle.",
  },

  perimetre: {
    intitule: "Le périmètre",
    titre: "Ce que Clozado ne fait pas pour un cabinet de gestion de patrimoine",
    elements: [
      "Ce n’est pas un CRM : vous gardez le vôtre.",
      "Aucun suivi d’encours ni de portefeuille par support : les montants suivis sont ceux des affaires.",
      "Aucune gestion documentaire, aucune signature électronique.",
      "Aucun agrégateur de comptes, aucune connexion à un dépositaire.",
      "Aucune consolidation entre deux cabinets : un espace est une organisation.",
    ],
  },

  final: {
    titre: "Regarder le produit sur un cabinet fictif",
    texte:
      "La démonstration est ouverte en lecture seule, sans inscription : un cabinet et sept mois d’historique — dossiers, partages, commissions, relances et indicateurs. Pour en parler, réservez un créneau.",
  },
} as const satisfies ContenuMetier;
