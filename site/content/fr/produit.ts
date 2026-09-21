/**
 * /fr/produit — LA PAGE CENTRALE DU SITE : ce que fait Clozado, écran par
 * écran, dans l'ordre où on s'en sert.
 *
 * Règle tenue ligne à ligne : rien ici qui n'existe en production. Chaque
 * affirmation s'ouvre dans la démonstration publique, et quatre des sept
 * écrans sont redessinés en HTML sur cette page. Aucun chiffre non sourcé,
 * aucun superlatif, aucune punchline.
 */
export const produit = {
  meta: {
    titre: "Le produit, écran par écran",
    description:
      "Le suivi, le tableau de bord, les affaires, les partages et commissions, les règles de relance, l’analytique et les newsletters. Ce que Clozado fait, dans l’ordre où l’on s’en sert.",
  },

  hero: {
    surtitre: "Le produit",
    titre: "Sept écrans, une seule question : qu’est-ce qui attend une action ?",
    chapo:
      "Clozado tient le suivi commercial d’un cabinet : ce qui attend une relance, les affaires confiées à un confrère, les commissions qui restent dues, et la communication adressée aux clients.",
    precision: "Il s’installe à côté de votre CRM. Vous gardez le vôtre.",
  },

  ecrans: {
    intitule: "Les écrans",
    titre: "Ce que vous ouvrez, et ce que vous y faites",
    chapo:
      "Quatre de ces écrans sont redessinés ci-dessous, avec les données du cabinet fictif de la démonstration. Les trois autres s’ouvrent en démonstration comme les premiers.",
    elements: [
      {
        cle: "suivi" as const,
        ecran: "suivi" as const,
        titre: "Le suivi",
        texte:
          "Trois piles, et rien d’autre : les affaires confiées à un confrère restées sans réponse, celles qui ont été acceptées puis se sont arrêtées, et les commissions confirmées qui ne sont pas réglées. Chaque ligne porte le geste qui la referme.",
        points: [
          "Le nombre de jours écoulés est affiché, pas à recalculer.",
          "Un lien de partage expiré se renvoie depuis la ligne.",
          "Une pile vide disparaît : l’écran ne montre que ce qui attend.",
        ],
      },
      {
        cle: "tableau-de-bord" as const,
        ecran: "tableauDeBord" as const,
        titre: "Le tableau de bord",
        texte:
          "Quatre nombres à l’ouverture, et la liste des tâches du jour. Les indicateurs mis en avant dépendent du métier déclaré dans l’espace : un cabinet de gestion de patrimoine et un courtier ne regardent pas les mêmes chiffres.",
        points: [
          "Chaque tuile mène à l’écran où l’on agit.",
          "Les tâches de relance naissent du suivi, jamais d’une saisie.",
          "Une tâche se referme d’un clic, depuis n’importe quel écran.",
        ],
      },
      {
        cle: "affaires" as const,
        titre: "Les affaires",
        texte:
          "Un pipeline par étapes, avec le montant estimé, le conseiller qui la tient et le contact auquel elle se rattache. L’issue se dit une fois — gagnée, perdue — et c’est elle qui alimente les chiffres, jamais une saisie parallèle.",
        points: [
          "Les étapes suivent le métier déclaré dans l’espace.",
          "Une affaire perdue garde son motif, lisible dans l’analytique.",
          "Les montants ne servent qu’à mesurer : Clozado n’encaisse rien.",
        ],
      },
      {
        cle: "partages" as const,
        titre: "Les partages et les commissions",
        texte:
          "Vous confiez une affaire à un confrère par un lien à votre nom, qu’il ouvre sans créer de compte. La commission est fixée au moment de l’envoi, puis suivie jusqu’au règlement : confirmée, puis réglée, avec sa date.",
        points: [
          "Le confrère répond depuis le lien : accepté, refusé, sans compte.",
          "Un partage sans réponse remonte tout seul dans le suivi.",
          "Une commission confirmée non réglée devient une tâche, pas un post-it.",
        ],
      },
      {
        cle: "regles" as const,
        ecran: "regles" as const,
        titre: "Les règles de relance",
        texte:
          "Une règle s’écrit en une phrase : un déclencheur, un seuil, des conditions, une action. Celles qui créent une tâche agissent seules ; celles qui écrivent un email préparent une vague de brouillons qu’une personne relit avant d’envoyer.",
        points: [
          "La vague annonce exactement combien d’emails un clic enverra.",
          "Aucun envoi automatique ne part sans ce clic.",
          "Le journal dit aussi ce qui a été écarté, et pourquoi.",
        ],
      },
      {
        cle: "analytique" as const,
        ecran: "funnel" as const,
        titre: "L’analytique",
        texte:
          "Cinq écrans qui répondent à cinq questions : d’où viennent les affaires, combien passent chaque étape, combien de temps elles prennent, où elles se perdent, et ce que les confrères apportent. Chaque indicateur porte sa définition à côté du chiffre.",
        points: [
          "Le libellé d’une étape ouvre la liste des affaires qu’elle compte.",
          "Un taux calculé sur moins de cinq observations n’est pas affiché.",
          "L’export CSV reprend les mêmes définitions que l’écran.",
        ],
      },
      {
        cle: "newsletters" as const,
        titre: "Les newsletters et les cibles",
        texte:
          "Vos cibles sont des segments vivants de votre base — étiquettes, ville, affaires en cours — recalculés à chaque consultation, jamais des listes figées. Le composeur n’écrit que des phrases dont les chiffres portent leur source et leur date.",
        points: [
          "Le pied de page légal est composé, jamais oublié.",
          "La désinscription en un clic est définitive pour l’organisation.",
          "Chaque envoi laisse son état : remis, ouvert, cliqué, en échec.",
        ],
      },
    ],
  },

  metiers: {
    intitule: "Par métier",
    titre: "Les mêmes écrans, lus autrement",
    chapo:
      "Les indicateurs mis en avant, les segments proposés et la veille suivie dépendent du métier déclaré dans l’espace.",
  },

  perimetre: {
    intitule: "Le périmètre",
    titre: "Ce que Clozado ne fait pas",
    elements: [
      { intitule: "Ce n’est pas un CRM", precision: "vous gardez le vôtre, et Clozado s’installe à côté." },
      { intitule: "Aucune gestion de contrats", precision: "ni de programmes, ni de mandats." },
      { intitule: "Aucun encaissement", precision: "les commissions sont suivies, jamais perçues." },
      { intitule: "Aucune signature électronique", precision: "ni gestion documentaire." },
      { intitule: "Aucun envoi sans relecture", precision: "une règle écrit le brouillon, une personne l’envoie." },
    ],
  },

  final: {
    titre: "Ouvrir ces écrans maintenant",
    texte:
      "La démonstration publique est en lecture seule, sans inscription : un cabinet fictif et sept mois d’historique.",
    texteReservation: "Pour en parler sur votre organisation, réservez un créneau.",
  },
} as const;
