import { aPropos } from "./a-propos";
import { accueil } from "./accueil";
import { blog } from "./blog";
import { carrieres } from "./carrieres";
import { conformite } from "./conformite";
import { cgp } from "./cgp";
import { common } from "./common";
import { confidentialite } from "./confidentialite";
import { courtiers } from "./courtiers";
import { demo } from "./demo";
import { ecrans, mentionEcrans } from "./ecrans";
import { ecransMetiers } from "./ecrans-metiers";
import { immobilier } from "./immobilier";
import { mentionsLegales } from "./mentions-legales";
import { produit } from "./produit";

/**
 * Le dictionnaire français — la langue de référence. Sa FORME est le
 * contrat : une autre langue qui s'ajoutera devra l'épouser exactement
 * (`Dictionary` dans lib/i18n.ts), une clé manquante sera une erreur de
 * build, pas un texte manquant à l'écran.
 */
export const fr = {
  common,
  accueil,
  ecrans,
  ecransMetiers,
  mentionEcrans,
  produit,
  cgp,
  courtiers,
  immobilier,
  conformite,
  demo,
  blog,
  aPropos,
  carrieres,
  mentionsLegales,
  confidentialite,
};
