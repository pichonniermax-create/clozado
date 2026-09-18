import type { StaticImageData } from "next/image";
import funnel1080 from "@/assets/produit/funnel-1080.webp";
import funnel1184 from "@/assets/produit/funnel-1184.webp";
import funnel440 from "@/assets/produit/funnel-440.webp";
import funnel720 from "@/assets/produit/funnel-720.webp";
import regles1080 from "@/assets/produit/regles-1080.webp";
import regles1184 from "@/assets/produit/regles-1184.webp";
import regles440 from "@/assets/produit/regles-440.webp";
import regles720 from "@/assets/produit/regles-720.webp";
import suivi1080 from "@/assets/produit/suivi-1080.webp";
import suivi1440 from "@/assets/produit/suivi-1440.webp";
import suivi440 from "@/assets/produit/suivi-440.webp";
import suivi720 from "@/assets/produit/suivi-720.webp";
import tableau1080 from "@/assets/produit/tableau-de-bord-1080.webp";
import tableau1184 from "@/assets/produit/tableau-de-bord-1184.webp";
import tableau440 from "@/assets/produit/tableau-de-bord-440.webp";
import tableau720 from "@/assets/produit/tableau-de-bord-720.webp";

/**
 * LES CAPTURES DU PRODUIT — prises dans la démonstration publique, donc
 * d'un cabinet fictif aux données inventées (la page le dit).
 *
 * Quatre largeurs par capture, décrites en `w` et non en `x`. La nuance
 * n'est pas cosmétique : un `srcset` en `1x/2x` se décide sur la DENSITÉ de
 * l'écran seule, jamais sur la place réellement occupée — un téléphone à
 * forte densité téléchargeait donc l'image de 1440 px pour l'afficher sur
 * 360. Avec des largeurs et un attribut `sizes`, le navigateur choisit la
 * plus petite qui suffise.
 *
 * Les fichiers sont IMPORTÉS, jamais posés dans `public/` : l'import donne
 * un nom haché — donc un cache immuable — et les dimensions réelles, ce qui
 * interdit tout décalage de mise en page.
 */
export type Capture = { variantes: readonly StaticImageData[] };

export const CAPTURES = {
  suivi: { variantes: [suivi440, suivi720, suivi1080, suivi1440] },
  "tableau-de-bord": { variantes: [tableau440, tableau720, tableau1080, tableau1184] },
  regles: { variantes: [regles440, regles720, regles1080, regles1184] },
  funnel: { variantes: [funnel440, funnel720, funnel1080, funnel1184] },
} as const satisfies Record<string, Capture>;

export type CleCapture = keyof typeof CAPTURES;
