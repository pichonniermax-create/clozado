/**
 * L'IDENTITÉ DE L'ÉDITEUR — écrite UNE FOIS, pour tout le site.
 *
 * Les mentions légales et la politique de confidentialité demandent les
 * mêmes valeurs : la raison sociale y figurait deux fois, l'adresse
 * électronique deux fois, l'adresse postale deux fois. Six occasions de
 * diverger, et personne pour s'en apercevoir — une page légale ne se relit
 * pas tous les mois. Elles sont ici, et les deux pages les lisent.
 *
 * CE FICHIER EST LE SEUL EXEMPTÉ du garde-fou des crochets
 * (`scripts/verifier-libelles.mjs`) : c'est le seul endroit du dépôt où une
 * valeur peut manquer. Les deux pages légales, elles, sont redevenues
 * contrôlées comme le reste du site. Le jour où tout est rempli, on retire
 * la dernière ligne de `EXEMPTS` et plus rien n'échappe au contrôle.
 *
 * Le compte des valeurs manquantes s'affiche à CHAQUE construction.
 */
export const IDENTITE = {
  raisonSociale: "[raison sociale]",
  formeJuridique: "[forme juridique]",
  capitalSocial: "[capital social]",
  adressePostale: "[adresse postale complète]",
  immatriculation: "[RCS de …, numéro]",
  siren: "[numéro SIREN]",
  tva: "[numéro de TVA intracommunautaire]",
  email: "[adresse email de contact]",
  telephone: "[numéro de téléphone]",
  directeurDePublication: "[prénom et nom du directeur de la publication]",

  /**
   * Les sous-traitants de l'application sont établis aux États-Unis. Le
   * mécanisme de transfert dépend des contrats signés avec chacun : il ne
   * se devine pas, il se relève.
   */
  transfertsHorsUE: "[mécanisme de transfert retenu pour les sous-traitants établis hors de l’Union européenne]",

  /** Ce que devient un espace de travail après sa fermeture. */
  conservationApresFermeture: "[durée de conservation des données après fermeture d’un espace de travail]",
} as const;

/**
 * L'HÉBERGEUR, et ce qu'il conserve.
 *
 * L'adresse postale est celle que Vercel publie elle-même (relevée le
 * 2026-09-18). La durée de conservation des journaux n'est PAS une
 * estimation : elle est lue dans la documentation de l'hébergeur, et la
 * page légale cite la source pour qu'un lecteur puisse la vérifier.
 *
 * « Runtime logs are stored with the following observability limits —
 * Hobby : 1 hour of logs ; Pro : 1 day of logs. »
 * https://vercel.com/docs/logs/runtime (section « Limits »), relevé le
 * 2026-09-21.
 *
 * L'offre retenue ici est Hobby. Indice mesuré et non déduit d'une
 * facture : les deux tâches planifiées de l'application sont quotidiennes
 * et se déclenchent avec une dérive d'environ une heure, ce qui est le
 * comportement documenté de l'offre Hobby. À CONFIRMER par l'éditeur —
 * en Pro, la ligne devient « un jour ».
 */
export const HEBERGEUR = {
  denomination: "Vercel Inc.",
  adresse: "440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis",
  site: "vercel.com",
  retentionDesJournaux: "Une heure",
  sourceRetention: "vercel.com/docs/logs/runtime",
} as const;

/**
 * LES SOUS-TRAITANTS DE L'APPLICATION, relevés dans le dépôt et non
 * recopiés d'ailleurs : chacun correspond à une dépendance réelle du code.
 * Une politique de confidentialité qui oublie un sous-traitant est fausse ;
 * une qui en invente un l'est aussi.
 */
export const SOUS_TRAITANTS = [
  {
    nom: "Vercel Inc. (États-Unis)",
    role: "Hébergement de l’application et du site. Les fonctions de l’application s’exécutent à Francfort.",
  },
  {
    nom: "Neon Inc. (États-Unis)",
    role: "Base de données de l’application, hébergée dans l’Union européenne, à Francfort.",
  },
  {
    nom: "Resend (États-Unis)",
    role: "Envoi et réception des emails de l’application : liens de connexion, messages adressés aux contacts, réponses reçues.",
  },
  {
    nom: "Anthropic PBC (États-Unis)",
    role: "Assistance à la rédaction et veille : les textes soumis par l’utilisateur sont transmis au modèle pour produire une proposition.",
  },
] as const;
