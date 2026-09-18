import type { ContenuMetier } from "../types";

/**
 * /fr/immobilier — TRANSACTION IMMOBILIÈRE, pour les agents et conseillers.
 *
 * Attention : les irritants du site existant portaient sur la PROMOTION
 * immobilière (programmes, lots, réservations, mandataires). Quatre d'entre
 * eux se transposent à la transaction et sont repris en ce sens ; les deux
 * autres — le suivi des lots et la duplication d'un programme au suivant —
 * ne concernent pas ce métier et sont abandonnés, pas réécrits.
 *
 * Le produit n'a pas de pack d'indicateurs propre à la transaction : c'est
 * le pack « Tout métier » qui s'applique. La page liste donc exactement ce
 * qu'un agent verra sur son tableau de bord, sans laisser croire à un pack
 * dédié.
 */
export const immobilier = {
  meta: {
    titre: "Le suivi commercial des agents et conseillers immobiliers",
    description:
      "Pour la transaction : d’où viennent vos contacts et ce qu’ils deviennent, un pipeline de la visite à l’acte, des relances sur des cycles longs, et les apporteurs mesurés.",
  },

  hero: {
    secteur: "Transaction immobilière",
    titre: "D’où viennent vos contacts, et ce qu’ils deviennent",
    chapo:
      "Clozado suit les dossiers entre la première visite et l’acte, les acquéreurs et les vendeurs qu’il faut relancer, les affaires confiées à un confrère et les commissions qui vous restent dues.",
    precision: "Il s’installe à côté de votre logiciel de transaction : vous gardez le vôtre.",
  },

  coince: {
    intitule: "Ce qui coince",
    titre: "En transaction",
    elements: [
      {
        titre: "Les contacts arrivent de partout",
        texte:
          "Portails, site, panneaux, recommandations, confrères. Ils se perdent avant d’être qualifiés, et personne ne sait dire quelle source a produit quoi.",
      },
      {
        titre: "Le parcours jusqu’à l’acte n’est pas suivi",
        texte:
          "Entre la visite, l’offre, le compromis, le financement et la signature, le dossier passe par des étapes que rien ne tient dans un seul endroit.",
      },
      {
        titre: "Les cycles sont longs",
        texte:
          "Un acquéreur sans nouvelles depuis trois semaines est un acquéreur perdu, sans que personne l’ait décidé — et sans relance structurée pour l’empêcher.",
      },
      {
        titre: "Les apporteurs ne sont ni suivis ni mesurés",
        texte:
          "Confrères, notaires, courtiers : on sait qu’ils envoient des affaires, pas combien, ni ce qu’elles sont devenues, ni ce qui reste à encaisser.",
      },
      {
        titre: "On écrit par à-coups, et à tout le monde",
        texte:
          "Vendeurs et acquéreurs reçoivent la même chose, quand on y pense — sans savoir ce qui a déjà été dit ni à qui.",
      },
    ],
  },

  reponse: {
    intitule: "Ce que Clozado y répond",
    titre: "Cinq réponses, dans le même ordre",
    chapo: "Chacune existe en production aujourd’hui. Rien n’est annoncé ici qui ne s’ouvre pas dans la démonstration.",
    elements: [
      {
        titre: "Une origine par affaire, et un funnel qui la lit",
        texte:
          "La liste des origines est la vôtre, éditable. L’écran des origines rapproche ce qui a été saisi librement, et l’écran du funnel donne la conversion par origine — chaque pas cliquable ouvre la liste des affaires qu’il compte.",
      },
      {
        titre: "Un pipeline à vos étapes",
        texte:
          "Un pipeline est une famille d’affaires avec ses propres étapes, dans l’ordre que vous fixez. Une affaire se glisse d’une colonne à l’autre en kanban, ou se travaille en liste triable et filtrable. L’écran des délais donne le temps passé par étape.",
      },
      {
        titre: "Des relances qui tiennent sur la durée",
        texte:
          "Une règle se lit en une phrase : « aucune interaction depuis N jours, alors créer une tâche ». Elle s’évalue tous les matins et laisse un journal qui dit, contact par contact, ce qui a été fait ou pourquoi ça ne l’a pas été. Un rendez-vous pris l’arrête.",
      },
      {
        titre: "Des apporteurs qui deviennent des chiffres",
        texte:
          "Vous confiez une affaire par un lien à votre nom, que le confrère ouvre sans créer de compte. La commission est fixée à l’envoi et suivie jusqu’au règlement. Partages, acceptation, transformation, commissions acquises et prévues, encours et vieillissement sont sur un écran.",
      },
      {
        titre: "Deux audiences, deux messages",
        texte:
          "Une cible se décrit par des critères — étiquettes, ville, affaires en cours ou gagnées — et se recalcule à chaque consultation. Vendeurs et acquéreurs deviennent deux cibles distinctes, chacune avec son identité éditoriale.",
      },
    ],
  },

  indicateurs: {
    intitule: "Les indicateurs",
    titre: "Ce que votre tableau de bord met en avant",
    chapo:
      "Chaque indicateur a une définition écrite une fois, affichée à l’écran à côté du chiffre, et reprise à l’identique dans les exports CSV.",
    elements: [
      "Affaires créées",
      "Affaires signées",
      "Montant signé",
      "Affaires en cours",
      "Délai création → signature",
      "Taux de perte",
      "Partages envoyés",
      "Commissions générées",
    ],
    note:
      "Il n’existe pas encore de pack d’indicateurs propre à la transaction immobilière : ce sont ceux du pack « Tout métier », mis en avant sur le tableau de bord. Les cinq écrans d’analytique — funnel, délais, pertes, partenaires, origines — restent ouverts en entier.",
  },

  communication: {
    intitule: "La communication client",
    titre: "À qui vous écrivez, et avec quoi",
    chapo:
      "Une cible est un segment vivant de votre base, recalculé à chaque consultation. Celles-ci sont les cibles de départ ; elles se modifient, se dupliquent et se complètent — la ville et les étiquettes font le reste.",
    ciblesTitre: "Les cibles proposées",
    cibles: [
      { titre: "Tous les contacts", texte: "Toute la base : pour ce qui concerne tout le monde." },
      { titre: "Clients", texte: "Les fiches avec au moins une affaire gagnée." },
      { titre: "Prospects", texte: "Les fiches avec au moins une affaire en cours." },
      { titre: "Sociétés", texte: "Les personnes morales de la base." },
      { titre: "Sans nouvelles depuis six mois", texte: "Les fiches d’au moins six mois avec lesquelles plus rien ne s’est passé." },
    ],
    veilleTitre: "La matière",
    veilleTexte:
      "La veille collecte chaque jour ce que publient les sources que vous suivez, classé par sujet et résumé avec nos mots — jamais un extrait d’article. Un résumé qui reprenait douze mots d’un article est refusé et n’est pas conservé.",
    sujets: ["Immobilier", "Marché immobilier", "Crédit immobilier", "Fiscalité", "Actualité économique"],
    sourcesTexte:
      "Sources publiques proposées au départ : le ministère de l’Économie et la Banque centrale européenne ; l’ANIL, sur l’information au logement, s’ajoute en une ligne. Vous en ajoutez et en retirez librement.",
    marcheTitre: "Les chiffres que vous avez le droit de citer",
    marcheTexte:
      "Les indicateurs de marché sont lus à la source, datés, et copiés dans vos chiffres vérifiés — jamais saisis à la main. Le rédacteur ne cite aucun chiffre qui n’a pas sa source et sa date.",
    marche: [
      "Prix des logements anciens (Notaires-INSEE)",
      "Indice de référence des loyers (IRL)",
      "Variation annuelle de l’IRL",
      "Taux d’usure — prêts à taux fixe de 20 ans et plus",
      "OAT 10 ans (TEC 10)",
      "Inflation en France (IPC)",
    ],
  },

  conformite: {
    intitule: "Contrôle et conformité",
    titre: "Ce qui part porte votre identité, et laisse une trace",
    chapo:
      "Un agent immobilier titulaire d’une carte professionnelle communique sous son identité et sous sa responsabilité. Clozado ne vous rend pas conforme — il tient la partie qui le concerne : ce qui part, à qui, quand, et avec quelles mentions.",
    elements: [
      {
        titre: "Vos mentions et votre carte professionnelle, dans chaque email",
        texte:
          "Un champ libre porte ce que votre activité impose — SIREN, RCS, numéro de carte professionnelle, garantie financière. Il est composé dans le pied de chaque envoi, avec votre adresse postale et le lien vers votre politique de confidentialité. Sans adresse postale, aucun envoi réel ne part.",
      },
      {
        titre: "Aucun chiffre sans sa source et sa date",
        texte:
          "Citer une évolution des prix ou un indice des loyers, c’est citer un chiffre officiel, daté, lu à la source. Le rédacteur ne peut rien citer d’autre ; un chiffre sans source ou sans date lui est refusé.",
      },
      {
        titre: "Une désinscription en un clic, définitive",
        texte:
          "Conforme à la RFC 8058 : le bouton du client de messagerie fonctionne, et l’adresse ne reçoit plus rien de votre organisation. C’est irréversible, pour vous comme pour elle.",
      },
      {
        titre: "La trace des échanges, avant qu’on la demande",
        texte:
          "Visites, appels, rendez-vous et notes se consignent depuis la fiche. Un email transféré à votre adresse d’ingestion — ou celle-ci mise en copie cachée — revient en proposition de fiche et d’interaction, jamais écrite sans votre confirmation.",
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
      "Clozado n’est pas un outil de conformité réglementaire. Il ne tient ni registre des mandats, ni registre des répertoires, ne produit aucun mandat ni aucun document de transaction, et ne se substitue à aucun contrôle.",
  },

  perimetre: {
    intitule: "Le périmètre",
    titre: "Ce que Clozado ne fait pas pour un agent immobilier",
    elements: [
      "Aucune gestion de mandats, aucun registre des mandats ni des répertoires.",
      "Aucun fichier de biens, aucun rapprochement entre un bien et un acquéreur.",
      "Aucune diffusion vers les portails, aucune passerelle vers un logiciel de transaction.",
      "Aucun document de transaction, aucune signature électronique.",
      "Aucun encaissement : les commissions sont suivies, jamais perçues.",
    ],
  },

  final: {
    titre: "Regarder le produit sur un cabinet fictif",
    texte:
      "La démonstration est ouverte en lecture seule, sans inscription : sept mois d’historique — dossiers, partages, commissions, relances et indicateurs. Pour en parler, réservez un créneau.",
  },
} as const satisfies ContenuMetier;
