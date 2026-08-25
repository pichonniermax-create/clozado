import { MIN_OBSERVATIONS } from "./definitions";

/**
 * Le résultat d'une métrique de durée. La règle du seuil est appliquée
 * ICI, une fois pour toutes (`finishStat`) : un écran ne décide jamais
 * lui-même d'afficher ou non un chiffre.
 */
export type DurationStat = {
  /** Observations retenues. */
  n: number;
  /** Médiane et moyenne en jours (décimaux), nulles quand l'indicateur est masqué. */
  medianDays: number | null;
  meanDays: number | null;
  /** Vrai sous le seuil : rien à afficher, l'écran dit combien il manque. */
  hidden: boolean;
  /** Observations manquantes pour atteindre le seuil (0 si affiché). */
  missing: number;
  /** Lignes écartées parce que reconstituées après coup (pas des observations). */
  excludedReconstructed: number;
  /** Lignes écartées faute de date connue. */
  excludedUnknown: number;
  /** Observations EN COURS, pas encore closes (passage où l'affaire est encore, lead sans premier contact) — de la matière à venir, hors période. */
  pending: number;
  /** Renseigné quand la métrique n'est pas mesurable du tout dans ce contexte (source absente, filtre sans objet). */
  unavailable?: string;
};

const DAY_S = 24 * 60 * 60;

/** Secondes (résultat SQL, souvent une chaîne) → jours décimaux. */
export function secondsToDays(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n / DAY_S : null;
}

export function finishStat(raw: {
  n: unknown;
  medianSeconds: unknown;
  meanSeconds: unknown;
  excludedReconstructed?: unknown;
  excludedUnknown?: unknown;
  pending?: unknown;
}): DurationStat {
  const n = Number(raw.n) || 0;
  const hidden = n < MIN_OBSERVATIONS;
  return {
    n,
    medianDays: hidden ? null : secondsToDays(raw.medianSeconds),
    meanDays: hidden ? null : secondsToDays(raw.meanSeconds),
    hidden,
    missing: hidden ? MIN_OBSERVATIONS - n : 0,
    excludedReconstructed: Number(raw.excludedReconstructed) || 0,
    excludedUnknown: Number(raw.excludedUnknown) || 0,
    pending: Number(raw.pending) || 0,
  };
}

export function unavailableStat(reason: string): DurationStat {
  return {
    n: 0,
    medianDays: null,
    meanDays: null,
    hidden: true,
    missing: MIN_OBSERVATIONS,
    excludedReconstructed: 0,
    excludedUnknown: 0,
    pending: 0,
    unavailable: reason,
  };
}

/**
 * Un TAUX entre deux pas d'un funnel : le compte d'un pas rapporté à celui
 * du pas précédent. Un compte est un fait (3 leads sont 3 leads) et
 * s'affiche toujours ; un taux est une statistique : calculé sur moins de
 * `MIN_OBSERVATIONS` cas au pas précédent, il est MASQUÉ — « 1 affaire sur
 * 2 leads » n'est pas un taux de 50 %. La règle vit ici (`finishRate`),
 * une fois pour toutes.
 */
export type RateStat = {
  /** Le dénominateur — le pas précédent. */
  base: number;
  /** Le numérateur — le pas mesuré. */
  value: number;
  /** En pour-cent (0–100, PEUT dépasser 100 quand un pas compte plus que le précédent) ; null quand masqué. */
  percent: number | null;
  hidden: boolean;
  /** Observations manquantes au pas précédent pour afficher le taux. */
  missing: number;
};

export function finishRate(value: number, base: number): RateStat {
  const hidden = base < MIN_OBSERVATIONS;
  return {
    base,
    value,
    percent: hidden ? null : (value / base) * 100,
    hidden,
    missing: hidden ? MIN_OBSERVATIONS - base : 0,
  };
}
