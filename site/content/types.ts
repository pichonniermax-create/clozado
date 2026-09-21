/** Un point d'une liste structurée : un intitulé qui se balaie, une précision qu'on lit. */
export type PointStructure = { intitule: string; precision?: string };

/**
 * LA FORME D'UNE PAGE MÉTIER. Les trois pages — gestion de patrimoine,
 * courtage, transaction immobilière — partagent exactement cette
 * structure : ce qui coince, ce que le produit y répond, les indicateurs,
 * ce qu'on écrit et à qui, la conformité, le périmètre.
 *
 * Elle est déclarée ici et pas dans un composant pour que le contrôle
 * s'exerce à la compilation : une section oubliée dans une langue est une
 * erreur de build, pas un trou à l'écran.
 */
export type Element = { titre: string; texte: string };

export type ContenuMetier = {
  meta: { titre: string; description: string };
  hero: { secteur: string; titre: string; chapo: string; precision: string };
  /** Les irritants du métier. Repris du site existant quand ils sont justes, réécrits sinon. */
  coince: { intitule: string; titre: string; elements: Element[] };
  /** Ce que le produit y répond — une réponse par irritant, dans le même ordre. */
  reponse: { intitule: string; titre: string; chapo: string; elements: Element[] };
  /** Les indicateurs mis en avant sur le tableau de bord de ce métier, sous leur nom exact dans le produit. */
  indicateurs: { intitule: string; titre: string; chapo: string; elements: string[]; note: string };
  /** Les cibles proposées au métier, la veille suivie, les indicateurs de marché lus à la source. */
  communication: {
    intitule: string;
    titre: string;
    chapo: string;
    ciblesTitre: string;
    cibles: Element[];
    veilleTitre: string;
    veilleTexte: string;
    sujets: string[];
    sourcesTexte: string;
    marcheTitre: string;
    marcheTexte: string;
    marche: string[];
  };
  /** Ce que l'activité exige, et ce que le produit tient exactement — sans déborder. */
  conformite: {
    intitule: string;
    titre: string;
    chapo: string;
    elements: Element[];
    avertissement: string;
  };
  perimetre: { intitule: string; titre: string; elements: PointStructure[] };
  final: {
    titre: string;
    texte: string;
    /** La phrase qui n'a de sens que si la prise de rendez-vous est ouverte. */
    texteReservation?: string;
  };
};

/**
 * UNE PAGE LÉGALE — mentions légales, confidentialité. Un document, pas une
 * page de vente : des sections, et dans chacune du texte, une liste, ou des
 * couples terme/valeur. Le rendu est commun aux deux, pour que leur mise en
 * page ne diverge pas.
 *
 * Les valeurs que seul l'éditeur connaît restent entre crochets dans les
 * contenus : elles se voient à l'écran, et on ne peut pas publier sans les
 * avoir vues.
 */
export type BlocLegal =
  | { type: "texte"; texte: string }
  | { type: "liste"; elements: string[] }
  | {
      type: "definitions";
      elements: {
        terme: string;
        valeur: string;
        /**
         * La ligne n'existe que si la prise de rendez-vous est ouverte
         * (`RESERVATION_EN_LIGNE`). Une politique de confidentialité qui
         * décrit un bouton absent est fausse ; un bouton que la politique
         * ne décrit pas l'est aussi. Le lien entre les deux est ici, pas
         * dans un commentaire qu'on oublie de lire.
         */
        quand?: "reservation";
      }[];
    };

export type PageLegale = {
  meta: { titre: string; description: string };
  titre: string;
  chapo: string;
  miseAJour: string;
  sections: { titre: string; blocs: BlocLegal[] }[];
};
