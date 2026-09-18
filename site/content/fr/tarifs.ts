/**
 * /fr/tarifs — LES PRIX RESTENT ENTRE CROCHETS tant qu'ils ne sont pas
 * validés. Ils se voient à l'écran : on ne peut pas mettre le site en ligne
 * sans les avoir remplacés.
 *
 * La structure n'invente aucun palier : le produit n'a ni plan, ni quota,
 * ni facturation en base — vérifié dans le code le 2026-09-18. Une seule
 * offre, tout le produit. Ce qui relève d'une politique commerciale non
 * décidée (engagement, essai, nombre d'utilisateurs compris) est entre
 * crochets ; ce qui relève du produit est écrit en clair et existe.
 */
export const tarifs = {
  meta: {
    titre: "Tarifs",
    description:
      "Une seule offre : tout le produit, pour tout le cabinet. Contacts, affaires, relances, partages entre confrères, analytique, cibles et newsletters.",
  },

  hero: {
    titre: "Une seule offre, tout le produit",
    chapo:
      "Clozado ne se vend pas par module : un espace donne accès à tous les écrans. Aucune fonctionnalité n’est réservée à un palier supérieur.",
  },

  offre: {
    nom: "[Nom de l’offre]",
    prix: "[prix]",
    unite: "[par utilisateur et par mois]",
    mention: "[engagement, facturation et période d’essai]",
    inclus: "Ce qui est compris",
    elements: [
      "Contacts, sociétés, étiquettes, import CSV et fusion des doublons",
      "Affaires en kanban ou en liste, plusieurs pipelines, types d’affaire et motifs de perte",
      "Tâches avec échéance, priorité, responsable et récurrence",
      "Partage d’affaires à un confrère par lien, commissions suivies jusqu’au règlement",
      "Cinq écrans d’analytique — funnel, délais, pertes, apporteurs, origines — et leurs exports CSV",
      "Règles de relance, vagues relues à la main, et journal de ce qui a été fait ou écarté",
      "Cibles, newsletters, veille quotidienne et chiffres vérifiés",
      "Adresse d’ingestion des emails reçus",
      "Votre marque : logo, couleur, police du gabarit email, et votre domaine d’envoi vérifié",
      "Français et anglais, devise et fuseau horaire par organisation",
      "Rôles administrateur et membre, isolation stricte entre organisations",
    ],
    note: "Les écrans sont ceux de la démonstration : ce que vous y voyez est ce que vous aurez.",
  },

  questions: {
    intitule: "Questions fréquentes",
    titre: "Ce qu’on nous demande avant de décider",
    elements: [
      {
        question: "Faut-il changer de CRM ?",
        reponse:
          "Non. Clozado s’utilise à côté du vôtre : il suit les relances, les affaires confiées à un confrère et la communication client. Vous n’y migrez rien de force — l’import CSV est là si vous le voulez.",
      },
      {
        question: "Mes confrères doivent-ils créer un compte ?",
        reponse:
          "Non. Une affaire partagée ouvre une page à votre nom, que le confrère consulte et à laquelle il répond en un clic. Il n’installe rien et ne crée aucun compte.",
      },
      {
        question: "Puis-je envoyer depuis mon propre domaine ?",
        reponse:
          "Oui. Les enregistrements DNS à créer vous sont donnés, avec le mode d’emploi de votre hébergeur. Tant que le domaine n’est pas vérifié, vos emails partent d’un sous-domaine mutualisé, à votre nom.",
      },
      {
        question: "Où sont hébergées mes données ?",
        reponse: "L’application et sa base de données sont hébergées dans l’Union européenne, à Francfort.",
      },
      {
        question: "Combien d’utilisateurs sont compris ?",
        reponse: "[à compléter]",
      },
      {
        question: "Y a-t-il un engagement ou une période d’essai ?",
        reponse: "[à compléter]",
      },
    ],
  },

  final: {
    titre: "Parler de votre situation",
    texte:
      "Un échange pour regarder vos relances, vos apporteurs et ce que vous écrivez à vos clients. La démonstration, elle, s’ouvre sans rendez-vous.",
  },
} as const;
