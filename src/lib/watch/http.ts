/**
 * Les appels HTTP de la veille — un seul endroit pour le délai, l'agent,
 * la taille maximale et la traduction des échecs en une cause LISIBLE,
 * celle que la source affiche (« injoignable depuis le … (délai
 * dépassé) »). Jamais un message technique brut à l'écran : l'échec porte
 * un CODE et ses valeurs, la phrase vient des messages
 * (`watch.fetchErrors.<code>`, chantier i18n) au moment de l'écrire ou de
 * l'afficher — `readableError` dans refresh.ts.
 */
export type WatchFetchCode =
  | "timeout"
  | "unreachable"
  | "http"
  | "feed_unreadable"
  | "feed_not_feed"
  | "content_unreadable"
  | "period_unreadable"
  | "no_observation"
  | "unexpected_format"
  | "empty_observation"
  | "multiple_series"
  | "no_recent_value"
  | "no_series"
  | "metadata_without_observation"
  | "date_unreadable";

export type WatchHttpReason = "forbidden" | "not_found" | "rate_limited" | "server" | "refused";

export class WatchFetchError extends Error {
  readonly code: WatchFetchCode;
  readonly values: Record<string, string | number>;

  constructor(code: WatchFetchCode, values: Record<string, string | number> = {}) {
    super(code);
    this.name = "WatchFetchError";
    this.code = code;
    this.values = values;
  }
}

export const WATCH_USER_AGENT = "Mozilla/5.0 (compatible; Clozado/1.0; veille; +https://clozado.app)";

export async function fetchWithTimeout(url: string, timeoutMs: number, accept: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": WATCH_USER_AGENT,
        Accept: accept,
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new WatchFetchError("timeout", { seconds: Math.round(timeoutMs / 1000) });
    }
    throw new WatchFetchError("unreachable");
  }
  if (!response.ok) {
    const reason: WatchHttpReason =
      response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : response.status === 429 ? "rate_limited" : response.status >= 500 ? "server" : "refused";
    throw new WatchFetchError("http", { status: response.status, reason });
  }
  return response;
}

/** Le corps, décodé selon le jeu de caractères annoncé (ou trouvé dans la page), borné à `maxBytes`. */
export async function readBodyText(response: Response, maxBytes: number): Promise<string> {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer.byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer);
  const contentType = response.headers.get("content-type") ?? "";
  let charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? null;
  if (!charset) {
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? /encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? null;
  }
  try {
    return new TextDecoder(charset ?? "utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
