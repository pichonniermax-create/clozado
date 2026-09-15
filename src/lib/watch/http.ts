import { lookup } from "node:dns/promises";
import { isPublicAddress } from "@/lib/net/address";

/**
 * Les appels HTTP de la veille — un seul endroit pour le délai, l'agent,
 * la taille maximale et la traduction des échecs en une cause LISIBLE,
 * celle que la source affiche (« injoignable depuis le … (délai
 * dépassé) »). Jamais un message technique brut à l'écran : l'échec porte
 * un CODE et ses valeurs, la phrase vient des messages
 * (`watch.fetchErrors.<code>`, chantier i18n) au moment de l'écrire ou de
 * l'afficher — `readableError` dans refresh.ts.
 *
 * Et un seul endroit pour la GARDE CONTRE LE SSRF (audit, constat S6) :
 * les adresses viennent des membres (sites, flux) et des pages elles-mêmes
 * (liens découverts, redirections) ; la fonction serverless ne doit jamais
 * être envoyée sonder le réseau interne de l'hébergeur. Avant CHAQUE
 * requête — le premier saut comme chacune des redirections, suivies à la
 * main — l'hôte est résolu et TOUTES ses adresses doivent être publiques
 * (`isPublicAddress`), le schéma http(s), le port 80 ou 443. Limite
 * honnête : la résolution faite ici et celle que `fetch` refait ensuite
 * sont deux résolutions ; un DNS qui répondrait différemment aux deux
 * (« DNS rebinding ») passerait — s'en prémunir demande un agent HTTP qui
 * épingle l'adresse résolue, pas construit ici.
 */
export type WatchFetchCode =
  | "timeout"
  | "unreachable"
  | "forbidden_address"
  | "too_many_redirects"
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

/** Au plus trois redirections suivies ; au-delà, la source est en cause. */
export const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** La forme d'une adresse qu'on accepte de joindre : http(s), port standard, hôte présent. Rend l'URL analysée. */
function readTarget(url: string): URL {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new WatchFetchError("forbidden_address");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new WatchFetchError("forbidden_address");
  if (target.port && target.port !== "80" && target.port !== "443") throw new WatchFetchError("forbidden_address");
  if (!target.hostname) throw new WatchFetchError("forbidden_address");
  return target;
}

/**
 * Résout l'hôte et refuse la moindre adresse non publique — toutes les
 * réponses comptent, pas seulement la première : c'est celle que `fetch`
 * choisira qu'on ne connaît pas.
 */
export async function assertPublicTarget(url: string, resolve: typeof lookup = lookup): Promise<void> {
  const target = readTarget(url);
  const host = target.hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string }[];
  try {
    addresses = await resolve(host, { all: true, order: "verbatim" });
  } catch {
    throw new WatchFetchError("unreachable");
  }
  if (addresses.length === 0) throw new WatchFetchError("unreachable");
  if (addresses.some(({ address }) => !isPublicAddress(address))) throw new WatchFetchError("forbidden_address");
}

export async function fetchWithTimeout(url: string, timeoutMs: number, accept: string): Promise<Response> {
  let current = url;
  // Le délai est GLOBAL : partagé par le premier saut et chaque redirection (chasse aux failles du
  // 2026-09-14 — une source à trois redirections lentes cumulait quatre délais).
  const deadline = Date.now() + timeoutMs;
  for (let hop = 0; ; hop++) {
    await assertPublicTarget(current);
    let response: Response;
    try {
      response = await fetch(current, {
        headers: {
          "User-Agent": WATCH_USER_AGENT,
          Accept: accept,
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
        // Les redirections sont suivies ICI, une par une, chacune revérifiée : `follow` les cacherait à la garde.
        redirect: "manual",
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new WatchFetchError("timeout", { seconds: Math.round(timeoutMs / 1000) });
      }
      throw new WatchFetchError("unreachable");
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop >= MAX_REDIRECTS) throw new WatchFetchError("too_many_redirects");
      try {
        current = new URL(location, current).toString();
      } catch {
        throw new WatchFetchError("forbidden_address");
      }
      continue;
    }
    if (!response.ok) {
      const reason: WatchHttpReason =
        response.status === 403 ? "forbidden" : response.status === 404 ? "not_found" : response.status === 429 ? "rate_limited" : response.status >= 500 ? "server" : "refused";
      throw new WatchFetchError("http", { status: response.status, reason });
    }
    return response;
  }
}

/** Le corps, décodé selon le jeu de caractères annoncé (ou trouvé dans la page), borné à `maxBytes`. */
export async function readBodyText(response: Response, maxBytes: number): Promise<string> {
  // Lecture EN FLUX, bornée (chasse aux failles du 2026-09-14) : `arrayBuffer()` chargeait tout le corps en
  // mémoire avant de tronquer — un flux compressé piégé (quelques Ko qui se déplient en centaines de Mo)
  // faisait tomber la fonction entière. Ici, la taille annoncée refuse d'emblée, et la lecture s'arrête —
  // en annulant le flux — dès que la borne est dépassée.
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new WatchFetchError("content_unreadable", { type: "too_large" });
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new WatchFetchError("content_unreadable", { type: "too_large" });
      }
      chunks.push(value);
    }
  }
  const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
  const contentType = response.headers.get("content-type") ?? "";
  let charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? null;
  if (!charset) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? /encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? null;
  }
  try {
    return new TextDecoder(charset ?? "utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
