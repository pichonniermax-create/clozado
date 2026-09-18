/**
 * LES TITRES — leur taille est une FONCTION DE LEUR LONGUEUR, pas une
 * constante.
 *
 * Un titre court supporte le maximum de l'échelle ; un titre de soixante-dix
 * caractères réglé à la même taille occupe six lignes, pousse le propos et
 * les boutons hors de l'écran, et se lit moins bien qu'un titre plus petit.
 * Trois paliers, décidés au nombre de caractères :
 *
 *   moins de 30   → le maximum de l'échelle (jusqu'à 96 px)
 *   de 30 à 55    → le palier intermédiaire (jusqu'à 64 px)
 *   plus de 55    → le palier bas           (jusqu'à 48 px)
 *
 * ET AUCUN MOT ORPHELIN : l'espace entre les deux derniers mots devient
 * insécable, de sorte qu'un titre ne finisse jamais par un mot seul sur sa
 * dernière ligne.
 */

export type PalierTitre = "haut" | "moyen" | "bas";

export function palierTitre(titre: string): PalierTitre {
  const longueur = titre.trim().length;
  if (longueur < 30) return "haut";
  if (longueur <= 55) return "moyen";
  return "bas";
}

/** La classe d'échelle d'un titre de premier niveau. */
export const CLASSE_TITRE: Record<PalierTitre, string> = {
  haut: "text-titre-haut",
  moyen: "text-titre-moyen",
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
