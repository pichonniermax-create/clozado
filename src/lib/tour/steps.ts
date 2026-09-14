import { DEMO_TOUR_PARAM } from "@/lib/demo/public";

/**
 * LE DIDACTICIEL (docs/module-demo.md §1.8, repris par le chantier UI/UX) :
 * huit étapes, dans l'ordre où le produit fait sens — l'accueil, les
 * apporteurs et les partages, les affaires et le suivi, les contacts, le
 * composeur, le ciblage, l'engagement, l'analytique. Chaque étape désigne
 * UN écran, et sur cet écran UN élément à MONTRER (`target` : un attribut
 * `data-tour` posé par l'écran — la carte s'ancre dessus et l'éclaire,
 * dès `md` ; sans lui, ou sur petit écran, la carte reste en bas) et, le
 * plus souvent, UN geste à FAIRE (`action` : le formulaire déjà déplié, la
 * page de création). Les textes vivent dans le namespace `tour` (FR/EN),
 * jamais ici.
 *
 * L'état vit dans un cookie par navigateur, écrit côté client : un
 * visiteur de la démo publique n'a droit à aucune écriture serveur, et un
 * compte réel n'a pas besoin d'une migration pour reprendre une visite.
 */
export type TourStep = {
  key: "bienvenue" | "partenaires" | "affaires" | "contacts" | "newsletters" | "cibles" | "engagement" | "analytique";
  href: string;
  /** La valeur de l'attribut `data-tour` de l'élément à éclairer sur cet écran. */
  target?: string;
  /** Le geste proposé par l'étape (un lien) ; son libellé vit dans `tour.steps.<key>.action`. */
  action?: string;
};

export const TOUR_STEPS: readonly TourStep[] = [
  { key: "bienvenue", href: "/dashboard", target: "dashboard-tuiles" },
  { key: "partenaires", href: "/partenaires", target: "partenaires-nouveau", action: "/partenaires?nouveau=1" },
  { key: "affaires", href: "/affaires", target: "affaires-nouvelle", action: "/affaires?nouveau=1" },
  { key: "contacts", href: "/contacts", target: "contacts-nouveau", action: "/contacts/import" },
  { key: "newsletters", href: "/newsletters", target: "newsletters", action: "/newsletters/new" },
  { key: "cibles", href: "/cibles", target: "cibles", action: "/cibles/new" },
  { key: "engagement", href: "/regles", target: "regles", action: "/regles/new" },
  { key: "analytique", href: "/analytique/funnel", target: "analytique" },
];

export type TourStepKey = TourStep["key"];

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
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null; // un cookie forgé ou abîmé vaut « aucun état », jamais une erreur
  }
  const [stepText, status] = decoded.split("|");
  const step = Number(stepText);
  if (!Number.isInteger(step) || step < 0 || step >= TOUR_STEPS.length) return null;
  if (!STATUSES.includes(status as TourStatus)) return null;
  return { step, status: status as TourStatus };
}

export function serializeTourState(state: TourState): string {
  return `${state.step}|${state.status}`;
}
