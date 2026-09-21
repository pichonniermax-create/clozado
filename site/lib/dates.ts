/**
 * Les dates écrites en français — « 18 septembre 2026 ».
 *
 * Elles servaient au blog ; elles servent maintenant aussi aux pages
 * légales, dont la date de mise à jour est CALCULÉE et non saisie
 * (`scripts/dates-legales.mjs`). Deux formatages différents pour la même
 * chose auraient fini par diverger.
 */
export function dateLongue(iso: string): string {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(annee, mois - 1, jour))
  );
}
