/**
 * Le contrôle DÉTERMINISTE de la règle de droit d'auteur : avant qu'un
 * résumé soit enregistré, on vérifie qu'aucune suite de `WINDOW` mots du
 * résumé n'apparaît dans le texte d'origine (docs/module-ciblage-contenu.md
 * §1.1). Le texte d'origine est celui lu à l'instant — il n'est jamais
 * écrit en base ; seul le verdict l'est (`summary_state = refused`).
 *
 * Comparaison sur des mots normalisés (minuscules, sans accents, sans
 * ponctuation) : « L'État a annoncé » et « l'etat a annonce » sont la même
 * suite — une reprise ne doit pas passer grâce à une virgule déplacée.
 */
export const OVERLAP_WINDOW = 12;

export function normalizeWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * La première suite de `window` mots du résumé présente telle quelle dans
 * l'original, ou null. Rendue pour le journal (et les tests), jamais
 * stockée avec l'article.
 */
export function findCopiedPassage(summary: string, original: string, window = OVERLAP_WINDOW): string | null {
  const s = normalizeWords(summary);
  const o = normalizeWords(original);
  if (s.length < window || o.length < window) return null;
  const seen = new Set<string>();
  for (let i = 0; i + window <= o.length; i++) {
    seen.add(o.slice(i, i + window).join(" "));
  }
  for (let i = 0; i + window <= s.length; i++) {
    const run = s.slice(i, i + window).join(" ");
    if (seen.has(run)) return run;
  }
  return null;
}
