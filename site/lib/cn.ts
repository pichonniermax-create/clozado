/**
 * Concaténer des classes conditionnelles. Volontairement minuscule : le
 * site n'a pas de variantes qui se contredisent, donc rien à fusionner —
 * `clsx` et `tailwind-merge` seraient deux dépendances pour un `join`.
 */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}
