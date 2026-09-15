import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Les gardes d'ENTRÉE partagées (chantier audit et production-ready,
 * étape 2, constats S1 et S3). Une action serveur est appelable par
 * n'importe quel client avec n'importe quel JSON : le type TypeScript de
 * son argument n'existe plus à l'exécution. Ce qui entre en base passe donc
 * par un schéma zod STRICT (une clé inconnue — `organizationId`, `id` — est
 * un refus, jamais une colonne écrasée), et un lien saisi ou généré ne
 * porte qu'un schéma d'URL inoffensif.
 */

/** Valide une entrée client contre un schéma ; une forme inattendue devient une `AppError` (400), jamais une exception zod brute. */
export function readInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError("les_donnees_envoyees_ne_sont_pas_valides");
  return parsed.data;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Un lien qu'un email ou un écran peut poser dans un `href` : `http:`,
 * `https:` ou `mailto:`, lu par `new URL` (donc absolu, et le schéma en
 * minuscules quelle que soit la casse saisie). `javascript:`, `data:`,
 * `file:`, une adresse relative ou une chaîne illisible sont refusés —
 * l'échappement HTML ne neutralise pas un schéma.
 */
export function isSafeHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return SAFE_PROTOCOLS.has(url.protocol);
}

/** La variante web seulement : `http:` ou `https:` — pour une SOURCE (page citée par un chiffre), où `mailto:` n'aurait pas de sens. */
export function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

/** Le raffinement zod de `isSafeHttpUrl`, pour les schémas de blocs et de formulaires. */
export const safeHttpUrl = z.string().refine(isSafeHttpUrl);

/** Le même contrôle quand la chaîne vide est un état légitime (un brouillon qu'on vient d'insérer, un champ facultatif). */
export const safeHttpUrlOrEmpty = z.string().refine((value) => value === "" || isSafeHttpUrl(value));

/**
 * Un CHEMIN INTERNE du produit, pour une redirection décidée d'après une
 * valeur reçue (`?vers=`, un `backTo` lié à une action — un argument lié
 * voyage chez le client et en revient, donc il se forge) : chemin absolu
 * (`/…`), même origine que la requête une fois interprété par `new URL`
 * — ce qui rejette `//hôte`, `/\hôte`, `/\t//hôte` (les caractères de
 * contrôle que les navigateurs ignorent sont retirés AVANT l'analyse) et
 * toute adresse extérieure. Rend le chemin (avec sa question et son
 * ancre), ou le repli.
 */
export function safeInternalPath(value: string | null | undefined, origin: string, fallback = "/"): string {
  if (!value) return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "");
  if (!cleaned.startsWith("/")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(cleaned, origin);
  } catch {
    return fallback;
  }
  if (parsed.origin !== new URL(origin).origin) return fallback;
  // Un chemin normalisé qui COMMENCE par `//` ou `/\` redeviendrait une référence réseau à la prochaine
  // résolution (`/..//evil.com` → `//evil.com` → `https://evil.com/`) : refusé aussi.
  if (parsed.pathname.startsWith("//") || parsed.pathname.startsWith("/\\")) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
