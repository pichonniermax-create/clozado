import type { PageLegale } from "../types";
import { HEBERGEUR, IDENTITE } from "../identite";

/**
 * /fr/mentions-legales — L'IDENTITÉ DE L'ÉDITEUR N'EST PLUS ÉCRITE ICI.
 *
 * Elle vient de `content/identite.ts`, qui est le seul fichier du dépôt où
 * une valeur peut manquer. Cette page ne fait que la mettre en forme : la
 * raison sociale, l'adresse et l'adresse électronique qui figuraient aussi
 * dans la politique de confidentialité ne peuvent plus diverger.
 *
 * LA DATE DE MISE À JOUR N'EST PAS SAISIE non plus : elle est lue dans
 * l'histoire du dépôt (`scripts/dates-legales.mjs`).
 *
 * L'hébergeur est connu et sourcé : Vercel Inc., dont l'adresse postale est
 * celle que la société publie elle-même (relevée le 2026-09-18).
 */
export const mentionsLegales = {
  meta: {
    titre: "Mentions légales",
    description: "Éditeur, directeur de la publication, hébergeur et conditions d’utilisation du site clozado.fr.",
  },
  titre: "Mentions légales",
  chapo: "Informations relatives à l’éditeur et à l’hébergeur du site clozado.fr.",
  miseAJour: "Dernière mise à jour",
  sections: [
    {
      titre: "Éditeur du site",
      blocs: [
        {
          type: "definitions",
          elements: [
            { terme: "Dénomination sociale", valeur: IDENTITE.raisonSociale },
            { terme: "Forme juridique", valeur: IDENTITE.formeJuridique },
            { terme: "Capital social", valeur: IDENTITE.capitalSocial },
            { terme: "Siège social", valeur: IDENTITE.adressePostale },
            { terme: "Immatriculation", valeur: IDENTITE.immatriculation },
            { terme: "Numéro SIREN", valeur: IDENTITE.siren },
            { terme: "Numéro de TVA intracommunautaire", valeur: IDENTITE.tva },
            { terme: "Adresse électronique", valeur: IDENTITE.email },
            { terme: "Téléphone", valeur: IDENTITE.telephone },
          ],
        },
      ],
    },
    {
      titre: "Directeur de la publication",
      blocs: [{ type: "definitions", elements: [{ terme: "Responsable", valeur: IDENTITE.directeurDePublication }] }],
    },
    {
      titre: "Hébergeur",
      blocs: [
        {
          type: "texte",
          texte: `Le site est hébergé par ${HEBERGEUR.denomination}, ${HEBERGEUR.adresse} — ${HEBERGEUR.site}.`,
        },
        {
          type: "texte",
          texte:
            "Les pages du site sont servies depuis le réseau de diffusion de l’hébergeur. L’application Clozado, distincte de ce site, est hébergée dans l’Union européenne, à Francfort.",
        },
      ],
    },
    {
      titre: "Propriété intellectuelle",
      blocs: [
        {
          type: "texte",
          texte:
            "L’ensemble des contenus de ce site — textes, mise en page, identité visuelle, marque Clozado — est la propriété de l’éditeur, sauf mention contraire. Toute reproduction ou représentation, totale ou partielle, sans autorisation écrite préalable, est interdite.",
        },
      ],
    },
    {
      titre: "Liens sortants",
      blocs: [
        {
          type: "texte",
          texte:
            "Ce site renvoie vers une seule adresse extérieure à ses pages : l’application Clozado, sur son domaine propre, dont l’éditeur est le même que celui de ce site. Aucun service tiers n’est appelé depuis ces pages, et aucun contenu extérieur n’y est chargé.",
        },
      ],
    },
    {
      titre: "Responsabilité",
      blocs: [
        {
          type: "texte",
          texte:
            "L’éditeur s’efforce de tenir ce site exact et à jour. Les informations qui y figurent décrivent le produit tel qu’il existe à la date de leur publication et ne constituent ni un engagement contractuel, ni un conseil professionnel — en particulier en matière juridique, fiscale, réglementaire ou d’investissement.",
        },
      ],
    },
    {
      titre: "Données personnelles",
      blocs: [
        {
          type: "texte",
          texte:
            "Ce site ne dépose aucun cookie, n’emploie aucun traceur, ne mesure pas son audience et ne comporte aucun formulaire. La politique de confidentialité couvre en deux parties distinctes ce site et l’application Clozado.",
        },
      ],
    },
    {
      titre: "Droit applicable",
      blocs: [
        {
          type: "texte",
          texte:
            "Le présent site et ses mentions sont soumis au droit français. Tout litige relatif à son utilisation relève de la compétence des juridictions françaises.",
        },
      ],
    },
  ],
} as const satisfies PageLegale;
