/**
 * Les appels HTTP de la veille — un seul endroit pour le délai, l'agent,
 * la taille maximale et la traduction des échecs en une cause LISIBLE,
 * celle que la source affiche (« injoignable depuis le … (délai
 * dépassé) »). Jamais un message technique brut à l'écran.
 */
export class WatchFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchFetchError";
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
      throw new WatchFetchError(`délai dépassé (${Math.round(timeoutMs / 1000)} s)`);
    }
    throw new WatchFetchError("site injoignable");
  }
  if (!response.ok) {
    const reason =
      response.status === 403 ? "accès refusé" : response.status === 404 ? "page introuvable" : response.status === 429 ? "trop de requêtes" : response.status >= 500 ? "erreur du site" : "refus";
    throw new WatchFetchError(`réponse ${response.status} (${reason})`);
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
