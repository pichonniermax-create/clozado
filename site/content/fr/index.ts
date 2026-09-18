import { accueil } from "./accueil";
import { common } from "./common";

/**
 * Le dictionnaire français — la langue de référence. Sa FORME est le
 * contrat : une autre langue qui s'ajoutera devra l'épouser exactement
 * (`Dictionary` dans lib/i18n.ts), une clé manquante sera une erreur de
 * build, pas un texte manquant à l'écran.
 */
export const fr = { common, accueil };
