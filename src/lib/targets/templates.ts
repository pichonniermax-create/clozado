import type { SegmentCriteria } from "./criteria";

/**
 * LES CIBLES PAR DÉFAUT D'UN MÉTIER — des données, rattachées à chaque pack
 * métier (src/lib/metrics/packs.ts), instanciées en LIGNES de
 * `mail_targets` de l'organisation à sa demande (« créer les cibles de mon
 * métier »), puis modifiables, dupliquées, désactivées comme n'importe
 * quelle cible. Aucun écran ne lit ces gabarits pour s'afficher : une fois
 * créées, les cibles vivent en base ; ici ne vit que le point de départ.
 *
 * Les étiquettes y sont nommées par LIBELLÉ (« Investisseur ») : elles
 * n'existent pas encore dans une organisation neuve, l'instanciation les
 * crée si besoin et remplace le libellé par l'identifiant. Rien ici n'est
 * propre à un client : un courtier en crédit écrit à des primo-accédants
 * et à des investisseurs, un CGP à des clients qui préparent leur
 * retraite — c'est le métier qui parle, l'organisation ajuste ensuite.
 */
export type TargetTemplate = {
  slug: string;
  label: string;
  /** À quoi sert cette cible, pour l'équipe (jamais dans le prompt). */
  description: string;
  persona: string;
  concerns: string;
  knowledgeLevel: string;
  editorialVoice: string;
  interests: string;
  avoid: string;
  criteria: Omit<
    SegmentCriteria,
    "tagsAny" | "tagsNone" | "ownerIds" | "dealStageIds" | "dealPipelineIds" | "originIds"
  > & {
    /** Porte au moins une de ces étiquettes — par libellé, créées si absentes. */
    tagLabelsAny?: string[];
    /** N'en porte aucune. */
    tagLabelsNone?: string[];
  };
};

const SANS_NOUVELLES: TargetTemplate = {
  slug: "sans-nouvelles",
  label: "Sans nouvelles depuis six mois",
  description: "Les fiches d'au moins six mois avec lesquelles plus rien ne s'est passé depuis six mois : à réveiller sans forcer.",
  persona: "Quelqu'un qu'on a connu — un échange, un dossier, une demande — et qui s'est éloigné sans se désabonner.",
  concerns: "Ne pas être harcelé ; retrouver un interlocuteur utile le jour où un besoin revient.",
  knowledgeLevel: "Variable : on ne sait plus où il en est, on ne présume de rien.",
  editorialVoice: "Sobre et utile, sans reproche ni « ça fait longtemps » : on donne une information qui vaut la peine, on reste joignable.",
  interests: "Ce qui a changé depuis six mois : une règle, un taux, une échéance qui le concerne peut-être.",
  avoid: "La culpabilisation, le rappel de l'inactivité, les offres pressantes, tout ce qui suppose un projet en cours.",
  // Les deux bornes ensemble : une fiche créée hier sans interaction n'est
  // pas « sans nouvelles depuis six mois » — vu au navigateur.
  criteria: { inactiveForDays: 180, createdMoreThanDays: 180 },
};

export const COURTIER_CREDIT_TARGETS: readonly TargetTemplate[] = [
  {
    slug: "primo-accedants",
    label: "Primo-accédants",
    description: "Les personnes qui achètent leur premier logement — la cible pédagogique du cabinet.",
    persona: "Une personne ou un couple qui achète un premier logement, souvent entre 25 et 40 ans, avec un projet concret mais un dossier encore flou.",
    concerns: "Combien je peux emprunter, est-ce que mon dossier passera, combien ça coûte vraiment (frais, assurance, apport), et par où commencer.",
    knowledgeLevel: "Débutant : découvre le vocabulaire du crédit — taux, apport, assurance emprunteur, frais de notaire, différé.",
    editorialVoice: "Pédagogue et rassurant : une idée à la fois, des mots simples, un exemple concret quand un chiffre vérifié le permet.",
    interests: "Les étapes d'un achat, l'apport et les aides (prêt à taux zéro), le calendrier d'un dossier, les erreurs à éviter avant de signer un compromis.",
    avoid: "Le jargon bancaire non expliqué, les montages d'investisseur, les comparaisons avec des dossiers aguerris, toute promesse de taux ou de délai.",
    criteria: { kind: "person", tagLabelsAny: ["Primo-accédant"] },
  },
  {
    slug: "investisseurs",
    label: "Investisseurs",
    description: "Les clients et prospects qui financent un bien locatif ou un projet patrimonial.",
    persona: "Un particulier qui possède déjà un bien ou prépare un achat locatif, et cherche à financer et optimiser plutôt qu'à comprendre les bases.",
    concerns: "La rentabilité nette, la capacité d'endettement restante, l'effet de levier, la fiscalité du locatif, le bon moment pour emprunter.",
    knowledgeLevel: "Averti à expert : connaît le vocabulaire, veut de la précision et des ordres de grandeur sourcés.",
    editorialVoice: "Direct et factuel, orienté décision : on va droit au chiffre daté et à ce qu'il change pour lui.",
    interests: "Conditions des banques pour le locatif, LMNP et SCI, différé et lissage, rachat de crédit pour réinvestir, taux d'usure.",
    avoid: "Les explications de base, le ton paternaliste, les généralités sans chiffre, et tout conseil fiscal catégorique.",
    criteria: { tagLabelsAny: ["Investisseur"] },
  },
  {
    slug: "clients-finances",
    label: "Clients financés",
    description: "Les clients dont le prêt a été signé grâce au cabinet — la relation dure après la signature.",
    persona: "Un client dont le financement est bouclé : il a vécu un dossier de bout en bout avec nous et nous fait confiance.",
    concerns: "Bien vivre avec son crédit : savoir quand renégocier ou faire racheter, ce que vaut son assurance emprunteur, comment préparer un prochain projet.",
    knowledgeLevel: "Sait ce qu'est un dossier de A à Z ; n'a pas besoin qu'on lui réexplique les bases.",
    editorialVoice: "Complice et fidèle : on parle à quelqu'un qui nous connaît, sans discours commercial.",
    interests: "La renégociation, le changement d'assurance emprunteur, un nouveau projet (résidence secondaire, locatif), le parrainage d'un proche.",
    avoid: "Le ton de prospection, les rappels de ce qu'il sait déjà, vendre un nouveau crédit sans raison réelle.",
    criteria: { deals: "won" },
  },
  {
    slug: "projets-en-cours",
    label: "Projets en cours",
    description: "Les personnes dont le dossier de financement est ouvert — chaque email fait avancer d'un pas.",
    persona: "Une personne dont le dossier est en cours d'étude ou de montage : elle attend, elle fournit des pièces, elle s'inquiète du calendrier.",
    concerns: "Où en est mon dossier, quelle est la prochaine étape, quels documents manquent, qu'est-ce qui peut bloquer une banque.",
    knowledgeLevel: "En train d'apprendre, au cœur du processus : comprend le vocabulaire qu'on lui a déjà expliqué.",
    editorialVoice: "Précis, disponible, concret : on dit ce qui se passe et ce qu'il y a à faire, rien de plus.",
    interests: "Le calendrier d'un accord, les pièces du dossier, l'assurance emprunteur à choisir, la signature chez le notaire.",
    avoid: "L'incertitude inutile, les généralités sur le marché, tout ce qui ne concerne pas SON dossier.",
    criteria: { deals: "open" },
  },
  SANS_NOUVELLES,
];

export const CGP_TARGETS: readonly TargetTemplate[] = [
  {
    slug: "clients",
    label: "Clients",
    description: "Les personnes qui ont déjà signé un investissement ou un contrat avec le cabinet.",
    persona: "Un client accompagné, qui a confié une partie de son patrimoine et attend un suivi régulier et clair.",
    concerns: "Mon allocation tient-elle la route, que change une nouvelle règle fiscale pour moi, quand faut-il ajuster.",
    knowledgeLevel: "Averti : connaît les grandes familles de placements et son propre dossier.",
    editorialVoice: "Posé, précis, sans jargon inutile : le ton d'un conseiller qui connaît son client.",
    interests: "Les échéances fiscales, l'évolution des marchés expliquée simplement, la transmission, les arbitrages.",
    avoid: "Le discours de prospection, les promesses de rendement, tout conseil fiscal ou juridique catégorique.",
    criteria: { deals: "won" },
  },
  {
    slug: "prospects-en-reflexion",
    label: "Prospects en réflexion",
    description: "Les personnes avec une affaire ouverte : elles réfléchissent, l'email doit aider à décider.",
    persona: "Une personne qui a exprimé un projet (épargne, retraite, transmission) et hésite encore sur la suite.",
    concerns: "Est-ce le bon moment, est-ce que je comprends ce qu'on me propose, quels risques je prends.",
    knowledgeLevel: "Débutant à averti : a compris son besoin, pas forcément les solutions.",
    editorialVoice: "Clair et honnête, une solution expliquée à la fois, sans pression.",
    interests: "Comparer des solutions, comprendre les frais, les horizons de placement, les cas concrets proches du sien.",
    avoid: "La pression, les superlatifs, les chiffres de rendement non sourcés, les sujets de gestion avancée.",
    criteria: { deals: "open" },
  },
  {
    slug: "chefs-d-entreprise",
    label: "Chefs d'entreprise",
    description: "Les dirigeants et indépendants : patrimoine professionnel et personnel se répondent.",
    persona: "Un dirigeant ou un indépendant qui pense à sa rémunération, à sa retraite et à la transmission de son entreprise.",
    concerns: "Optimiser sans risque, protéger sa famille, préparer la cession ou la transmission, sortir de la trésorerie proprement.",
    knowledgeLevel: "Averti sur son entreprise, souvent moins sur le patrimoine privé.",
    editorialVoice: "De pair à pair, concret, orienté décision et calendrier.",
    interests: "Holding, PER, prévoyance du dirigeant, trésorerie d'entreprise, cession et transmission.",
    avoid: "Les sujets de particulier débutant, les généralités, tout conseil juridique catégorique.",
    criteria: { tagLabelsAny: ["Chef d'entreprise"] },
  },
  {
    slug: "preparation-retraite",
    label: "Préparation de la retraite",
    description: "Les personnes de 50 ans et plus : l'horizon se rapproche, les décisions comptent double.",
    persona: "Une personne de 50 ans ou plus qui veut savoir de quoi sa retraite sera faite et ce qu'il est encore temps de faire.",
    concerns: "Le niveau de ses revenus futurs, le bon moment pour partir, ce qu'il faut décider maintenant.",
    knowledgeLevel: "Variable : sait ce qu'est un PER ou une assurance-vie, moins les mécanismes de liquidation.",
    editorialVoice: "Rassurant et concret, orienté calendrier : ce qui se décide cette année, ce qui peut attendre.",
    interests: "Le calendrier de la retraite, le PER, l'assurance-vie, la résidence principale, la transmission.",
    avoid: "Le ton anxiogène, les produits de long horizon inadaptés, les sujets de jeune actif.",
    criteria: { kind: "person", ageMin: 50 },
  },
  {
    slug: "jeunes-actifs",
    label: "Jeunes actifs",
    description: "Les moins de 40 ans : construire, pas encore arbitrer.",
    persona: "Une personne de moins de 40 ans qui commence à épargner sérieusement, souvent avec un premier achat en tête.",
    concerns: "Par où commencer, combien mettre de côté, comment concilier achat immobilier et épargne.",
    knowledgeLevel: "Débutant : les grandes notions, pas les mécanismes.",
    editorialVoice: "Simple et encourageant, sans condescendance.",
    interests: "Les premières briques (épargne de précaution, assurance-vie, PEA), le premier achat, l'épargne salariale.",
    avoid: "Les sujets de transmission et de retraite proche, le jargon, les montages complexes.",
    criteria: { kind: "person", ageMax: 39 },
  },
];

export const ASSURANCE_TARGETS: readonly TargetTemplate[] = [
  {
    slug: "assures-emprunteurs",
    label: "Assurés emprunteurs",
    description: "Les personnes assurées sur un prêt : la loi permet de changer, elles doivent le savoir au bon moment.",
    persona: "Une personne qui a un crédit en cours et une assurance emprunteur, souvent celle de la banque, jamais vraiment comparée.",
    concerns: "Est-ce que je paie trop, puis-je changer sans risque, que couvre vraiment mon contrat.",
    knowledgeLevel: "Débutant : connaît le mot, pas les garanties ni le droit de résiliation.",
    editorialVoice: "Pédagogue et pratique : ce qu'on peut faire, comment, en combien de temps.",
    interests: "La résiliation à tout moment, les économies possibles, les garanties utiles, les questionnaires de santé.",
    avoid: "La peur, les promesses d'économies chiffrées non vérifiées, les sujets d'assurance professionnelle.",
    criteria: { tagLabelsAny: ["Emprunteur"] },
  },
  {
    slug: "professionnels-tns",
    label: "Professionnels et indépendants",
    description: "Les travailleurs non salariés : prévoyance, santé et retraite se pensent ensemble.",
    persona: "Un indépendant, un professionnel libéral ou un dirigeant, qui doit se protéger lui-même car aucun employeur ne le fait.",
    concerns: "Que se passe-t-il si je m'arrête, comment protéger ma famille et mon activité, que puis-je déduire.",
    knowledgeLevel: "Averti sur son métier, peu sur ses propres couvertures.",
    editorialVoice: "De pair à pair, direct, orienté décisions et échéances.",
    interests: "La prévoyance du dirigeant, la santé, la retraite complémentaire, la déductibilité, la responsabilité civile professionnelle.",
    avoid: "Le ton de particulier, les généralités, tout engagement chiffré non sourcé.",
    criteria: { tagLabelsAny: ["Indépendant"] },
  },
  {
    slug: "clients-assures",
    label: "Clients assurés",
    description: "Les clients dont un contrat est signé — le suivi entretient la confiance.",
    persona: "Un client couvert par un contrat placé par le cabinet, qui attend qu'on pense à lui avant l'échéance.",
    concerns: "Suis-je toujours bien couvert, est-ce que ma situation a changé, quand faut-il revoir le contrat.",
    knowledgeLevel: "Connaît son contrat dans les grandes lignes.",
    editorialVoice: "Fidèle, attentif, sans discours commercial.",
    interests: "Les échéances, les changements de situation (naissance, déménagement, nouveau prêt), les garanties à ajuster.",
    avoid: "La prospection, la vente forcée d'un second contrat, le jargon des garanties.",
    criteria: { deals: "won" },
  },
  {
    slug: "prospects-en-cours",
    label: "Prospects en cours",
    description: "Les personnes avec un devis ou un dossier ouvert : l'email aide à conclure sans presser.",
    persona: "Une personne qui a demandé un devis ou une étude et compare encore.",
    concerns: "Est-ce que c'est le bon contrat, le bon prix, le bon interlocuteur.",
    knowledgeLevel: "Débutant à averti selon le contrat.",
    editorialVoice: "Clair, honnête, disponible : on répond aux questions qui bloquent.",
    interests: "Comprendre les garanties, comparer sans se tromper, les délais de mise en place.",
    avoid: "La pression, les comparaisons dénigrantes, les chiffres non sourcés.",
    criteria: { deals: "open" },
  },
  SANS_NOUVELLES,
];

export const GENERIQUE_TARGETS: readonly TargetTemplate[] = [
  {
    slug: "tous-les-contacts",
    label: "Tous les contacts",
    description: "Toute la base : pour les informations qui concernent tout le monde.",
    persona: "L'ensemble des personnes et sociétés de la base, quel que soit leur lien avec nous.",
    concerns: "Recevoir ce qui les concerne, pas plus.",
    knowledgeLevel: "Hétérogène : on écrit pour quelqu'un qui découvre.",
    editorialVoice: "Clair, court, accessible à tous.",
    interests: "Les nouveautés du cabinet, les changements de règles qui touchent tout le monde.",
    avoid: "Les sujets de niche, le jargon, les messages qui supposent une relation en cours.",
    criteria: {},
  },
  {
    slug: "clients",
    label: "Clients",
    description: "Les fiches avec au moins une affaire gagnée.",
    persona: "Un client qui a déjà conclu avec nous.",
    concerns: "Être bien suivi, savoir à qui s'adresser, ne rien rater d'important.",
    knowledgeLevel: "Connaît nos services.",
    editorialVoice: "Fidèle et attentif, sans discours commercial.",
    interests: "Le suivi, les nouveautés utiles, un prochain projet.",
    avoid: "La prospection, le rappel de ce qu'il sait déjà.",
    criteria: { deals: "won" },
  },
  {
    slug: "prospects",
    label: "Prospects",
    description: "Les fiches avec au moins une affaire en cours.",
    persona: "Une personne qui hésite encore, avec un projet ouvert.",
    concerns: "Faire le bon choix, comprendre ce qu'on lui propose.",
    knowledgeLevel: "Débutant à averti.",
    editorialVoice: "Clair et honnête, sans pression.",
    interests: "Des explications concrètes, des cas proches du sien.",
    avoid: "La pression, les superlatifs, les chiffres non sourcés.",
    criteria: { deals: "open" },
  },
  {
    slug: "societes",
    label: "Sociétés",
    description: "Les personnes morales de la base.",
    persona: "Une entreprise ou une structure, lue par la personne qui la représente.",
    concerns: "Gagner du temps, décider vite avec des informations fiables.",
    knowledgeLevel: "Professionnel.",
    editorialVoice: "De pair à pair, concret, orienté résultats.",
    interests: "Ce qui touche l'activité : règles, échéances, opportunités.",
    avoid: "Le ton grand public, les sujets de particulier.",
    criteria: { kind: "company" },
  },
  SANS_NOUVELLES,
];
