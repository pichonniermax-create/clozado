/**
 * Les textes présents sur TOUTES les pages : coquille, navigation, pied de
 * page, appels à l'action. Aucun de ces mots ne vit dans un composant.
 */
export const common = {
  /** Le nom du produit — une marque, jamais traduite. */
  marque: "Clozado",

  meta: {
    nomDuSite: "Clozado",
    titreParDefaut: "Clozado — suivi commercial, relances et communication client",
    gabaritDeTitre: "%s — Clozado",
    imagePartageAlt: "Clozado — suivi commercial, relances et communication client",
  },

  coquille: {
    allerAuContenu: "Aller au contenu",
    navigationPrincipale: "Navigation principale",
    navigationDuPied: "Navigation du pied de page",
    ouvrirLeMenu: "Menu",
    choisirLaLangue: "Choisir la langue",
  },

  nav: {
    accueil: "Accueil",
    cgp: "Gestion de patrimoine",
    courtiers: "Courtage",
    immobilier: "Transaction immobilière",
    tarifs: "Tarifs",
    demo: "Démonstration",
    mentionsLegales: "Mentions légales",
    confidentialite: "Confidentialité",
  },

  groupes: {
    metiers: "Métiers",
    produit: "Produit",
    legal: "Informations légales",
  },

  actions: {
    reserverUneDemo: "Réserver une démo",
    ouvrirLaDemo: "Ouvrir la démonstration",
    ouvrirLaDemoAide: "La démonstration s’ouvre dans un nouvel onglet, sur l’application",
    enSavoirPlus: "En savoir plus",
    nouvelOnglet: "(nouvel onglet)",
  },

  pied: {
    presentation:
      "Clozado est un outil de suivi commercial pour les cabinets de conseil en gestion de patrimoine, de courtage et de transaction immobilière. Il s’utilise à côté d’un CRM, sans le remplacer.",
    droits: "© {annee} Clozado. Tous droits réservés.",
  },

  introuvable: {
    metaTitre: "Page introuvable",
    code: "404",
    titre: "Cette page n’existe pas",
    texte:
      "L’adresse est peut-être incomplète, ou la page a été retirée lors de la refonte du site. Le sommaire ci-dessous mène au reste.",
    retour: "Revenir à l’accueil",
  },

  /**
   * Les références clients. Vides tant qu'aucune n'est vérifiée et
   * autorisée : le bloc ne s'affiche pas du tout — jamais un faux logo,
   * jamais un témoignage inventé.
   */
  references: {
    titre: "Ils utilisent Clozado",
    elements: [] as { nom: string; metier: string; citation?: string }[],
  },
} as const;
