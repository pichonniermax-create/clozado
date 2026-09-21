import type { PageLegale } from "../types";
import { HEBERGEUR, IDENTITE, SOUS_TRAITANTS } from "../identite";

/**
 * /fr/confidentialite — UNE SEULE POLITIQUE, EN DEUX PARTIES.
 *
 * Elle couvrait le site seul et renvoyait, pour l'application, vers un
 * document qui n'existait pas — dont l'adresse était entre crochets. Depuis
 * le 2026-09-21, elle couvre les deux : la PARTIE 1 dit ce que fait ce
 * site (c'est-à-dire presque rien), la PARTIE 2 ce que fait l'application
 * (c'est-à-dire l'essentiel). L'application renvoie ici.
 *
 * Deux parties DISTINCTES, et pas un mélange : les traitements n'ont ni le
 * même responsable de fait, ni les mêmes données, ni les mêmes
 * sous-traitants, et un lecteur doit pouvoir lire la sienne sans démêler
 * l'autre.
 *
 * TOUT CE QUI EST DIT DE L'APPLICATION EST RELEVÉ DANS LE CODE : les
 * sous-traitants sont ses dépendances réelles (`content/identite.ts`), les
 * catégories de données sont ses tables, et la région d'hébergement est
 * celle que déclare sa configuration. Rien n'est supposé.
 *
 * L'identité de l'éditeur vient de `content/identite.ts` — elle n'est plus
 * écrite deux fois. La date de mise à jour est lue dans l'histoire du
 * dépôt (`scripts/dates-legales.mjs`).
 */
export const confidentialite = {
  meta: {
    titre: "Confidentialité",
    description:
      "Une seule politique, en deux parties : le site clozado.fr, qui ne dépose aucun cookie et ne collecte rien, et l’application Clozado.",
  },
  titre: "Politique de confidentialité",
  chapo:
    "Elle couvre en deux parties distinctes le site clozado.fr, qui ne collecte rien, et l’application Clozado, qui traite les données que ses utilisateurs y déposent.",
  miseAJour: "Dernière mise à jour",
  sections: [
    // ───────────────────────── PARTIE 1 — LE SITE ─────────────────────────
    {
      titre: "Partie 1 — Le site clozado.fr",
      blocs: [
        {
          type: "texte",
          texte:
            "Cette partie couvre les pages publiques de clozado.fr : ce que vous lisez en ce moment. Elle est courte parce que le site ne collecte rien.",
        },
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
            { terme: "Hébergeur", valeur: `${HEBERGEUR.denomination}, ${HEBERGEUR.adresse}` },
            { terme: "Base légale", valeur: "Intérêt légitime : assurer le fonctionnement et la sécurité du site" },
            {
              terme: "Durée de conservation",
              valeur: `${HEBERGEUR.retentionDesJournaux}, durée appliquée par l’hébergeur à l’offre souscrite et publiée dans sa documentation (${HEBERGEUR.sourceRetention})`,
            },
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
            "Les boutons de ce site qui mènent ailleurs mènent tous à l’application Clozado, sur son propre domaine. Aucun service tiers n’est appelé, aucun contenu extérieur n’est chargé dans ces pages : rien ne part tant que vous ne cliquez pas.",
        },
        {
          type: "definitions",
          elements: [
            {
              terme: "Ouvrir la démonstration",
              valeur:
                "Ouvre la démonstration publique de l’application Clozado, en lecture seule : rien n’y est enregistré, et aucun email n’en part.",
            },
            {
              terme: "Réserver une démo",
              valeur:
                "Ouvre la page de prise de rendez-vous de l’application Clozado, qui recueille le nom, l’adresse électronique et le créneau que vous y indiquez.",
              quand: "reservation",
            },
          ],
        },
      ],
    },

    // ────────────────────── PARTIE 2 — L'APPLICATION ──────────────────────
    {
      titre: "Partie 2 — L’application Clozado",
      blocs: [
        {
          type: "texte",
          texte:
            "Cette partie couvre l’application, accessible sur un domaine distinct. Elle demande un compte, et elle traite deux sortes de données : celles du compte lui-même, et celles que les cabinets utilisateurs y déposent sur leurs propres clients.",
        },
        {
          type: "texte",
          texte:
            "Pour les données qu’un cabinet dépose sur ses clients, c’est le cabinet qui décide de ce qu’il enregistre et pourquoi : l’éditeur les traite pour son compte, et ne s’en sert pour aucune autre fin — ni prospection, ni revente, ni entraînement d’un modèle.",
        },
      ],
    },
    {
      titre: "Ce que l’application traite",
      blocs: [
        {
          type: "definitions",
          elements: [
            {
              terme: "Le compte",
              valeur:
                "Adresse électronique, nom, langue et préférences d’affichage, appartenance à un espace de travail et rôle. La connexion se fait par un lien à usage unique envoyé par courriel : il n’y a pas de mot de passe à conserver.",
            },
            {
              terme: "Les données du cabinet",
              valeur:
                "Contacts et sociétés, affaires et leur avancement, tâches, rendez-vous, commissions, partenaires et affaires partagées, notes et échanges consignés, listes de diffusion et consentements, journaux d’accès aux fiches.",
            },
            {
              terme: "Les courriels",
              valeur:
                "Les messages envoyés depuis l’application, leurs états de remise, et les réponses reçues sur l’adresse d’ingestion lorsqu’elle est utilisée.",
            },
            {
              terme: "Les journaux techniques",
              valeur:
                "Les journaux d’exécution de l’hébergeur, dans les mêmes conditions et pour la même durée qu’en partie 1.",
            },
          ],
        },
      ],
    },
    {
      titre: "Pourquoi, et sur quelle base",
      blocs: [
        {
          type: "definitions",
          elements: [
            {
              terme: "Fournir le service",
              valeur:
                "Exécution du contrat conclu avec le cabinet : tenir ses dossiers, envoyer ses messages, calculer ses indicateurs.",
            },
            {
              terme: "Sécurité et fonctionnement",
              valeur:
                "Intérêt légitime : journaux d’accès, traces de connexion, garde-fous contre les envois non désirés.",
            },
            {
              terme: "Messages adressés à des contacts",
              valeur:
                "C’est le cabinet expéditeur qui détermine la base — consentement ou intérêt légitime — et qui la consigne dans l’application, contact par contact.",
            },
          ],
        },
      ],
    },
    {
      titre: "Qui la sert, et où",
      blocs: [
        {
          type: "texte",
          texte:
            "L’application s’exécute et sa base de données réside dans l’Union européenne, à Francfort. Les prestataires ci-dessous interviennent pour l’éditeur, chacun pour une fonction précise.",
        },
        {
          type: "definitions",
          elements: SOUS_TRAITANTS.map((prestataire) => ({ terme: prestataire.nom, valeur: prestataire.role })),
        },
        {
          type: "texte",
          texte: `Ces prestataires sont établis aux États-Unis, même lorsque les données qu’ils traitent résident en Europe. Mécanisme de transfert : ${IDENTITE.transfertsHorsUE}.`,
        },
      ],
    },
    {
      titre: "Combien de temps",
      blocs: [
        {
          type: "texte",
          texte: `Les données d’un espace de travail sont conservées tant qu’il est ouvert, et effacées ensuite : ${IDENTITE.conservationApresFermeture}. Un contact désinscrit d’une liste de diffusion garde une trace de sa désinscription, qui est indélébile — c’est ce qui garantit qu’il ne sera pas réinscrit par un import.`,
        },
      ],
    },
    {
      titre: "La démonstration publique",
      blocs: [
        {
          type: "texte",
          texte:
            "La démonstration ouverte depuis ce site fonctionne sur un cabinet fictif et des données inventées. Elle est en lecture seule : rien n’y est enregistré, aucun courriel n’en part, et elle ne demande ni compte ni adresse.",
        },
      ],
    },

    // ──────────────────────── COMMUN AUX DEUX ────────────────────────
    {
      titre: "Vos droits",
      blocs: [
        {
          type: "texte",
          texte:
            "Le règlement général sur la protection des données vous reconnaît un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité sur les données qui vous concernent.",
        },
        {
          type: "texte",
          texte:
            "Si vous êtes le client d’un cabinet qui utilise Clozado, adressez votre demande à ce cabinet : c’est lui qui décide de ce qu’il enregistre à votre sujet. L’éditeur l’assiste et donne suite à ses instructions. Pour tout autre cas, écrivez à l’éditeur.",
        },
        {
          type: "definitions",
          elements: [
            { terme: "Responsable de traitement", valeur: IDENTITE.raisonSociale },
            { terme: "Contact", valeur: IDENTITE.email },
            { terme: "Adresse postale", valeur: IDENTITE.adressePostale },
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
            "Cette politique peut être modifiée pour refléter une évolution du site ou de l’application. La date de dernière mise à jour figure en tête de page, et elle est calculée à partir de la dernière modification du texte lui-même.",
        },
      ],
    },
  ],
} as const satisfies PageLegale;
