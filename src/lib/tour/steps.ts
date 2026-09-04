import { DEMO_TOUR_PARAM } from "@/lib/demo/public";

/**
 * LE DIDACTICIEL (docs/module-demo.md §1.8) : huit étapes, dans l'ordre où
 * le produit fait sens — l'accueil, les apporteurs et les partages, les
 * affaires et le suivi, les contacts, le composeur, le ciblage,
 * l'engagement, l'analytique. Chaque étape désigne UN écran ; les textes
 * vivent dans le namespace `tour` (FR/EN), jamais ici.
 *
 * L'état vit dans un cookie par navigateur, écrit côté client : un
 * visiteur de la démo publique n'a droit à aucune écriture serveur, et un
 * compte réel n'a pas besoin d'une migration pour reprendre une visite.
 */
export const TOUR_STEPS = [
  { key: "bienvenue", href: "/dashboard" },
  { key: "partenaires", href: "/partenaires" },
  { key: "affaires", href: "/affaires" },
  { key: "contacts", href: "/contacts" },
  { key: "newsletters", href: "/newsletters" },
  { key: "cibles", href: "/cibles" },
  { key: "engagement", href: "/regles" },
  { key: "analytique", href: "/analytique/funnel" },
] as const;

export type TourStepKey = (typeof TOUR_STEPS)[number]["key"];

export const TOUR_COOKIE = "clozado-visite";
export const TOUR_PARAM = DEMO_TOUR_PARAM;
/** Un an : une visite reprise plus tard reprend où elle en était. */
export const TOUR_COOKIE_MAX_AGE = 365 * 24 * 3600;

export type TourStatus = "en_cours" | "masque" | "termine";
export type TourState = { step: number; status: TourStatus };

const STATUSES: readonly TourStatus[] = ["en_cours", "masque", "termine"];

/** « 3|en_cours » → { step: 3, status: "en_cours" } ; tout ce qui n'a pas cette forme vaut « aucun état ». */
export function parseTourState(raw: string | undefined | null): TourState | null {
  if (!raw) return null;
  const [stepText, status] = decodeURIComponent(raw).split("|");
  const step = Number(stepText);
  if (!Number.isInteger(step) || step < 0 || step >= TOUR_STEPS.length) return null;
  if (!STATUSES.includes(status as TourStatus)) return null;
  return { step, status: status as TourStatus };
}

export function serializeTourState(state: TourState): string {
  return `${state.step}|${state.status}`;
}
