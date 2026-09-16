/**
 * Une erreur DESTINÉE À UNE PERSONNE (chantier marque blanche et
 * internationalisation, étape 4) : une CLÉ de message (namespace
 * `errors` de `src/messages/<langue>/errors.json`), ses valeurs, et le
 * statut HTTP qu'une route lui donnerait. Plus une phrase française cachée
 * dans une requête : l'action ou la route traduit la clé au moment de
 * revenir à l'écran (`errorMessage`, src/lib/form-actions.ts), dans la
 * langue de la personne. Une erreur qui n'est pas une `AppError` est un
 * accident technique : la personne reçoit le message générique, jamais
 * l'exception brute.
 */
export class AppError extends Error {
  readonly key: string;
  readonly values: Record<string, string | number> | undefined;
  readonly status: number;

  constructor(key: string, values?: Record<string, string | number>, status = 400) {
    super(key);
    this.name = "AppError";
    this.key = key;
    this.values = values;
    this.status = status;
  }
}

/** Les deux erreurs que tout le produit partage : l'accès refusé (403) et l'introuvable (404). */
export function accessDenied(key = "common.access_denied"): AppError {
  return new AppError(key, undefined, 403);
}

export function notFound(key: string, values?: Record<string, string | number>): AppError {
  return new AppError(key, values, 404);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Une lecture de fiche : `null` quand la fiche n'existe pas ou n'est pas à cette personne (403 / 404 — l'écran rend
 * « introuvable ») ; TOUTE AUTRE erreur remonte à `error.tsx`. Avant, `.catch(() => null)` faisait d'une base
 * indisponible un « Cette fiche n'existe pas » (stabilisation, E2).
 */
export async function nullIfNotFound<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isAppError(error) && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}

/** Le statut HTTP d'une erreur attrapée par une route : celui de l'AppError, 500 pour un accident. */
export function statusOf(error: unknown): number {
  return isAppError(error) ? error.status : 500;
}
