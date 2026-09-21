/**
 * LE MONTANT A CHANGÉ, LA COMMISSION NON (chantier « les fiches
 * deviennent modifiables »).
 *
 * Une commission en POURCENTAGE est figée au moment où elle est convenue :
 * `commissions.base_amount` garde le montant sur lequel on s'est entendu,
 * `computed_amount` le résultat. Corriger le montant de l'affaire ensuite
 * ne la recalcule pas — ce serait réécrire un accord passé avec un
 * confrère. Mais le taire serait pire : la fiche doit dire que les deux
 * chiffres ne parlent pas du même montant.
 *
 * Une commission FIXE ne dépend pas du montant : rien à signaler.
 */
export function commissionOnOldAmount(
  commission: { basis: string; baseAmount: string | null },
  currentAmount: string | null
): boolean {
  if (commission.basis !== "percentage") return false;
  if (!commission.baseAmount || !currentAmount) return false;
  const base = Number(commission.baseAmount);
  const current = Number(currentAmount);
  if (!Number.isFinite(base) || !Number.isFinite(current)) return false;
  // Au centime près : « 300000 » et « 300000.00 » sont le même montant.
  return Math.abs(base - current) >= 0.01;
}
