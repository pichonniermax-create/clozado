/**
 * LES TITRES — leur taille est une FONCTION DE LEUR LONGUEUR, pas une
 * constante.
 *
 * Un titre court supporte une grande taille ; un titre de soixante-dix
 * caractères réglé à la même taille occupe six lignes, pousse le propos et
 * les boutons hors de l'écran, et se lit moins bien qu'un titre plus petit.
 *
 * DEUX PALIERS, décidés au nombre de caractères :
 *
 *   jusqu'à 55 caractères → le palier haut (jusqu'à 72 px)
 *   au-delà               → le palier bas  (jusqu'à 56 px)
 *
 * Il y en avait trois : un troisième palier à 96 px, réservé aux titres de
 * moins de trente caractères, que PLUS AUCUN titre du site n'atteignait. Un
 * palier mort est une complexité pour rien ; le rapport d'échelle de la page
 * se joue désormais sur les chiffres des écrans de preuve, pas sur les
 * titres.
 *
 * ET AUCUN MOT ORPHELIN : l'espace entre les deux derniers mots devient
 * insécable, de sorte qu'un titre ne finisse jamais par un mot seul sur sa
 * dernière ligne.
 */

export type PalierTitre = "haut" | "bas";

export function palierTitre(titre: string): PalierTitre {
  return titre.trim().length <= 55 ? "haut" : "bas";
}

/** La classe d'échelle d'un titre de premier niveau. */
export const CLASSE_TITRE: Record<PalierTitre, string> = {
  haut: "text-titre-haut",
  bas: "text-titre-bas",
};

/** Le titre, avec une espace insécable entre ses deux derniers mots. */
export function sansOrphelin(titre: string): string {
  return titre.replace(/\s+(\S+)\s*$/u, " $1");
}

/** Raccourci : la classe du palier, pour un titre donné. */
export function classeTitre(titre: string): string {
  return CLASSE_TITRE[palierTitre(titre)];
}
