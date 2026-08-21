/** Pur affichage — aucune logique métier ici, juste du formatage pour la page partenaire. */

export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

export function formatEuros(amount: string | null): string | null {
  if (amount == null) return null;
  const n = Number(amount);
  if (Number.isNaN(n)) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatCommission(commission: {
  basis: "percentage" | "fixed";
  rate: string | null;
  fixedAmount: string | null;
  computedAmount: string | null;
}): string {
  const base =
    commission.basis === "percentage"
      ? commission.rate
        ? `${commission.rate} %`
        : null
      : formatEuros(commission.fixedAmount);
  const computed = formatEuros(commission.computedAmount);
  if (base && computed) return `${base} · ≈ ${computed}`;
  return base ?? computed ?? "—";
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso)
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
