import { accueil } from "./accueil";
import { cgp } from "./cgp";
import { common } from "./common";
import { confidentialite } from "./confidentialite";
import { courtiers } from "./courtiers";
import { demo } from "./demo";
import { immobilier } from "./immobilier";
import { mentionsLegales } from "./mentions-legales";
import { tarifs } from "./tarifs";

/**
 * Le dictionnaire français — la langue de référence. Sa FORME est le
 * contrat : une autre langue qui s'ajoutera devra l'épouser exactement
 * (`Dictionary` dans lib/i18n.ts), une clé manquante sera une erreur de
 * build, pas un texte manquant à l'écran.
 */
export const fr = { common, accueil, cgp, courtiers, immobilier, tarifs, demo, mentionsLegales, confidentialite };
