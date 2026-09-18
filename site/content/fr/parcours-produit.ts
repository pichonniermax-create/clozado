/**
 * LE PARCOURS DE LA PAGE PRODUIT — six étapes, dans l'ordre d'usage réel.
 *
 * La page enchaînait sept écrans sans fil directeur, et reprenait ceux de
 * l'accueil. Elle suit maintenant UN dossier, du jour où le contact entre au
 * jour où l'analytique le compte : chaque étape dit ce qui vient de se
 * passer, montre l'écran où cela se voit, et annonce la suite.
 *
 * UN SEUL FIL, UN SEUL DOSSIER. Marion Delaunay entre par un comparateur le
 * 4 février ; son affaire avance ; elle est confiée au cabinet
 * Brunet-Lahaye ; une relance part ; la commission se suit jusqu'au
 * règlement ; et le mois compte une affaire gagnée de plus.
 *
 * SIX FORMES DIFFÉRENTES, et aucune de celles de l'accueil ni des pages
 * métier : une fiche, un tableau de colonnes, un va-et-vient, un aperçu de
 * message, une barre empilée, une série de barres mensuelles.
 *
 * LES CHIFFRES TIENNENT ENSEMBLE : les colonnes du tableau d'avancement font
 * le total annoncé, les trois parts de la commission font sa somme et leurs
 * pourcentages font cent, les six mois font leur cumul, et les écarts de
 * temps du va-et-vient tombent juste.
 */
export const parcoursProduit = {
  intitule: "Le parcours",
  titre: "Un dossier, du premier contact à la mesure",
  chapo:
    "Six étapes dans l’ordre où elles arrivent. Chacune montre l’écran où elle se joue, avec les données d’un cabinet fictif.",

  etapes: [
    {
      cle: "entree" as const,
      numero: "01",
      intitule: "Le contact entre",
      titre: "Une fiche naît de ce qu’elle sait déjà",
      texte:
        "Un formulaire rempli, un email transféré, un import : la fiche se crée avec son origine et son conseiller, et la date d’attribution est posée le jour même. C’est elle qui comptera plus tard dans l’analytique — jamais une saisie faite après coup.",
      liaison: "La fiche existe. Reste à savoir ce qu’elle vaut, et où elle en est.",
      ecran: {
        nom: "Fiche contact",
        resume: "Marion Delaunay — créée le 4 février",
        legende: "La fiche d’un contact, redessinée.",
        champs: [
          { libelle: "Origine", valeur: "Comparateur en ligne" },
          { libelle: "Entrée le", valeur: "4 février, 9 h 12" },
          { libelle: "Premier contact", valeur: "4 février, 11 h 22" },
          { libelle: "Délai de rappel", valeur: "2 h 10" },
          { libelle: "Conseillère", valeur: "Claire Estève" },
          { libelle: "Projet déclaré", valeur: "Résidence principale" },
          { libelle: "Étiquettes", valeur: "Primo-accédant · Loire-Atlantique" },
          { libelle: "Consentement", valeur: "Recueilli au formulaire" },
        ],
      },
    },
    {
      cle: "affaire" as const,
      numero: "02",
      intitule: "L’affaire avance",
      titre: "Des colonnes, pas un tableur",
      texte:
        "L’affaire prend sa place dans la filière du métier et avance d’une colonne à l’autre. Le montant estimé la suit, l’issue se dit une fois, et c’est cette issue qui alimente les chiffres — pas une seconde saisie.",
      liaison: "L’affaire est en négociation. Le cabinet n’a pas la main sur une partie du dossier : il la confie.",
      ecran: {
        nom: "Affaires",
        resume: "Douze affaires en cours, 1 486 000 € estimés",
        legende: "La filière des affaires, redessinée.",
        colonnes: [
          {
            titre: "Qualifiée",
            compte: "5",
            montant: "412 000 €",
            cartes: [
              { titre: "Marion Delaunay", detail: "Résidence principale · 285 000 €" },
              { titre: "SCI Vigneron", detail: "Locatif · 127 000 €" },
            ],
          },
          {
            titre: "Proposition",
            compte: "4",
            montant: "638 000 €",
            cartes: [
              { titre: "Karim Benslimane", detail: "Renégociation · 196 000 €" },
              { titre: "Estelle Thouard", detail: "Achat-revente · 442 000 €" },
            ],
          },
          {
            titre: "Négociation",
            compte: "3",
            montant: "436 000 €",
            cartes: [{ titre: "Marion Delaunay", detail: "Résidence principale · 285 000 €" }],
          },
        ],
        total: { libelle: "Total en cours", compte: "12", montant: "1 486 000 €" },
      },
    },
    {
      cle: "partage" as const,
      numero: "03",
      intitule: "Elle est confiée à un confrère",
      titre: "Un lien, deux gestes, aucune boîte noire",
      texte:
        "Vous envoyez un lien à votre nom ; le confrère l’ouvre sans créer de compte et répond. La commission est fixée au moment de l’envoi, et chaque geste est horodaté des deux côtés.",
      liaison: "Le confrère a accepté. À partir de là, c’est le silence qui devient un risque.",
      ecran: {
        nom: "Partage",
        resume: "Marion Delaunay — cabinet Brunet-Lahaye",
        legende: "Le va-et-vient d’un partage, redessiné.",
        cotes: { vous: "Votre cabinet", confrere: "Cabinet Brunet-Lahaye" },
        gestes: [
          { cote: "vous" as const, libelle: "Lien envoyé, commission fixée à 12 %", horodatage: "11 mars, 9 h 40" },
          { cote: "confrere" as const, libelle: "Lien ouvert", horodatage: "11 mars, 14 h 05", ecart: "4 h 25" },
          { cote: "confrere" as const, libelle: "Affaire acceptée", horodatage: "12 mars, 10 h 15", ecart: "20 h 10" },
          { cote: "vous" as const, libelle: "Dossier transmis", horodatage: "12 mars, 11 h 30", ecart: "1 h 15" },
        ],
        pied: { libelle: "De l’envoi à l’acceptation", valeur: "24 h 35" },
      },
    },
    {
      cle: "relance" as const,
      numero: "04",
      intitule: "La relance part",
      titre: "Une personne relit, puis clique",
      texte:
        "La règle a écrit le brouillon ; elle ne l’envoie pas. L’aperçu montre le message tel qu’il partira, pied de page légal compris, et les garde-fous sont revérifiés au moment de l’envoi, pas seulement au moment où la règle s’est écrite.",
      liaison: "Le message est parti, l’affaire se signe. Il reste à être payé.",
      ecran: {
        nom: "Aperçu avant envoi",
        resume: "Brouillon écrit ce matin à 7 h 00",
        legende: "L’aperçu d’une relance, redessiné.",
        destinataire: "À : marion.delaunay@exemple.fr",
        objet: "Objet : votre dossier avance — deux pièces à nous transmettre",
        corps: [
          "Bonjour Marion,",
          "Votre dossier est passé en négociation le 12 mars. Pour la suite, il nous manque votre avis d’imposition 2025 et le compromis signé.",
        ],
        piedTitre: "Pied de page composé",
        piedElements: [
          "Cabinet fictif — 12 rue des Halles, Nantes",
          "Désinscription en un clic · Politique de confidentialité",
        ],
        controlesTitre: "Garde-fous revérifiés à l’envoi",
        controles: [
          { libelle: "Désinscription", etat: "Aucune" },
          { libelle: "Plafond par contact", etat: "1 sur 4 ce mois" },
          { libelle: "Heures de bureau", etat: "9 h 00 – 18 h 00" },
          { libelle: "Adresse postale", etat: "Renseignée" },
        ],
        action: "Envoyer ce message",
      },
    },
    {
      cle: "commission" as const,
      numero: "05",
      intitule: "La commission se suit",
      titre: "Trois états, une somme",
      texte:
        "Une commission n’est pas un chiffre unique : elle est prévue, puis confirmée, puis réglée. Chaque part porte sa date, et ce qui reste dû devient une tâche plutôt qu’un post-it. Clozado n’encaisse rien : il compte.",
      liaison: "Le dossier est clos, payé pour partie. Il entre alors dans ce qui se mesure.",
      ecran: {
        nom: "Commission",
        resume: "Marion Delaunay — 3 600 € au total",
        legende: "Le suivi d’une commission, redessiné.",
        total: "3 600 €",
        parts: [
          { libelle: "Réglée", montant: "1 200 €", part: "33,3 %", date: "Reçue le 28 avril" },
          { libelle: "Confirmée", montant: "1 800 €", part: "50,0 %", date: "Attendue le 30 mai" },
          { libelle: "Prévue", montant: "600 €", part: "16,7 %", date: "À la signature de l’acte" },
        ],
        rappel: { libelle: "Tâche ouverte", valeur: "Relancer le règlement du 30 mai" },
      },
    },
    {
      cle: "analytique" as const,
      numero: "06",
      intitule: "L’analytique mesure",
      titre: "Le mois compte une signature de plus",
      texte:
        "L’affaire gagnée entre dans la série du mois, à la date de son issue. Chaque indicateur porte sa définition à côté du chiffre, et l’export reprend la même — un chiffre exporté veut dire ce qu’un chiffre lu veut dire.",
      liaison: "",
      ecran: {
        nom: "Signatures par mois",
        resume: "Six mois glissants — 39 dossiers signés",
        legende: "La série mensuelle, redessinée.",
        mois: [
          { libelle: "Sept.", valeur: "4" },
          { libelle: "Oct.", valeur: "6" },
          { libelle: "Nov.", valeur: "5" },
          { libelle: "Déc.", valeur: "8" },
          { libelle: "Janv.", valeur: "7" },
          { libelle: "Févr.", valeur: "9" },
        ],
        total: { libelle: "Cumul six mois", valeur: "39" },
        variation: { libelle: "Février contre septembre", valeur: "+5" },
        definition: "Affaire gagnée : issue « gagnée » posée sur l’affaire, comptée à la date de cette issue.",
      },
    },
  ],
} as const;
