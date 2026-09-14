/**
 * LE JOURNAL du produit (chantier audit et production-ready, étape 2,
 * constat Q4) — une ligne JSON par événement sur la console : Vercel les
 * collecte telles quelles et les rend cherchables par champ. Rien d'autre :
 * pas d'envoi réseau, pas de dépendance, utilisable côté serveur comme côté
 * navigateur (les frontières d'erreur l'appellent par `reportError`).
 *
 * Un événement porte un NIVEAU, un MESSAGE court et stable (un identifiant
 * en snake_case, pas une phrase : « import_interrupted », pas « L'import
 * s'est interrompu ») et des CHAMPS libres — dont `organizationId` quand
 * l'événement concerne une organisation, pour retrouver tout ce qui lui est
 * arrivé. Une erreur passée dans `error` est sérialisée (nom, message, pile,
 * digest, code, clé) : jamais `[object Object]`, jamais une pile perdue.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = {
  organizationId?: string | null;
  error?: unknown;
  [key: string]: unknown;
};

export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  /** Le `digest` posé par Next/React sur une erreur de rendu — la clé pour la retrouver dans ses journaux. */
  digest?: string;
  /** Un code de fournisseur ou de pilote (« 23503 », « rate_limit_exceeded »). */
  code?: string;
  /** La clé de message d'une `AppError`. */
  key?: string;
  status?: number;
  cause?: SerializedError;
};

/** Une erreur (ou n'importe quelle valeur levée) sous une forme plate et sérialisable. */
export function serializeError(error: unknown, depth = 0): SerializedError {
  if (error instanceof Error) {
    const extra = error as Error & { digest?: unknown; code?: unknown; key?: unknown; status?: unknown; cause?: unknown };
    const out: SerializedError = { name: error.name, message: error.message };
    if (error.stack) out.stack = error.stack;
    if (typeof extra.digest === "string") out.digest = extra.digest;
    if (typeof extra.code === "string" || typeof extra.code === "number") out.code = String(extra.code);
    if (typeof extra.key === "string") out.key = extra.key;
    if (typeof extra.status === "number") out.status = extra.status;
    if (extra.cause !== undefined && depth < 3) out.cause = serializeError(extra.cause, depth + 1);
    return out;
  }
  if (typeof error === "object" && error !== null) {
    const digest = (error as { digest?: unknown }).digest;
    const message = (error as { message?: unknown }).message;
    return {
      name: "NonError",
      message: typeof message === "string" ? message : safeStringify(error),
      ...(typeof digest === "string" ? { digest } : {}),
    };
  }
  return { name: "NonError", message: String(error) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
  const { error, ...rest } = fields;
  const line: Record<string, unknown> = { level, time: new Date().toISOString(), message, ...rest };
  if (error !== undefined) line.error = serializeError(error);
  const text = safeStringify(line);
  // Un niveau par méthode de console : Vercel classe la ligne (et l'alerte) selon la méthode utilisée.
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};

/**
 * Ce qu'une frontière d'erreur (`error.tsx`, `global-error.tsx`) journalise
 * côté navigateur : la même ligne JSON, avec la frontière qui l'a attrapée
 * et l'adresse de la page. Pas d'envoi réseau (décision D4 de l'audit en
 * attente) : la console du navigateur, et les outils qui la lisent.
 */
export function reportError(error: unknown, context: { boundary: string }): void {
  const path = typeof window !== "undefined" ? window.location.pathname : undefined;
  write("error", "client_boundary_error", { boundary: context.boundary, path, error });
}
