import type { PageLegale } from "../types";

/**
 * /fr/mentions-legales — L'IDENTITÉ DE L'ÉDITEUR EST ENTRE CROCHETS, à
 * remplir avant la mise en ligne. Elle s'affiche telle quelle : on ne peut
 * pas publier sans l'avoir vue.
 *
 * L'hébergeur, lui, est connu et sourcé : Vercel Inc., dont l'adresse
 * postale est celle que la société publie elle-même dans sa politique de
 * confidentialité (relevée le 2026-09-18).
 */
export const mentionsLegales = {
  meta: {
    titre: "Mentions légales",
    description: "Éditeur, directeur de la publication, hébergeur et conditions d’utilisation du site clozado.fr.",
  },
  titre: "Mentions légales",
  chapo: "Informations relatives à l’éditeur et à l’hébergeur du site clozado.fr.",
  miseAJour: "Dernière mise à jour : [date]",
  sections: [
    {
      titre: "Éditeur du site",
      blocs: [
        {
          type: "definitions",
          elements: [
            { terme: "Dénomination sociale", valeur: "[raison sociale]" },
            { terme: "Forme juridique", valeur: "[forme juridique]" },
            { terme: "Capital social", valeur: "[capital social]" },
            { terme: "Siège social", valeur: "[adresse postale complète]" },
            { terme: "Immatriculation", valeur: "[RCS de …, numéro]" },
            { terme: "Numéro SIREN", valeur: "[numéro SIREN]" },
            { terme: "Numéro de TVA intracommunautaire", valeur: "[numéro de TVA]" },
            { terme: "Adresse électronique", valeur: "[adresse email de contact]" },
            { terme: "Téléphone", valeur: "[numéro de téléphone]" },
          ],
        },
      ],
    },
    {
      titre: "Directeur de la publication",
      blocs: [{ type: "definitions", elements: [{ terme: "Responsable", valeur: "[prénom et nom]" }] }],
    },
    {
      titre: "Hébergeur",
      blocs: [
        {
          type: "texte",
          texte:
            "Le site est hébergé par Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis — vercel.com.",
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
            "Ce site renvoie vers deux adresses extérieures à ses pages : l’outil de prise de rendez-vous et la démonstration publique de l’application. L’éditeur n’exerce aucun contrôle sur le service de prise de rendez-vous et ne saurait être tenu responsable de son contenu ni de ses pratiques.",
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
            "Ce site ne dépose aucun cookie, n’emploie aucun traceur, ne mesure pas son audience et ne comporte aucun formulaire. Le détail figure dans la politique de confidentialité.",
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
