import { z } from "zod";

/**
 * La forme STRICTE de l'entrée d'un partage d'affaire (audit, constat S1),
 * dans un module PUR — sans base ni session — pour que le composeur
 * (client), l'action et la requête partagent le même contrat et qu'un test
 * puisse le rejouer sans connexion. Une clé inconnue — `organizationId`,
 * `tokenHash`, `createdBy`, ou un `state` que seul le serveur décide — est
 * refusée avant toute lecture : les types dérivés du schéma (`z.input`)
 * font qu'un champ en trop est d'abord une erreur TypeScript chez l'appelant.
 *
 * Les MONTANTS (chasse aux failles du 2026-09-14) : un taux entre 0 exclu
 * et 100, des montants décimaux positifs (deux décimales au plus), et le
 * montant CALCULÉ n'est plus reçu du client — la requête le calcule
 * elle-même (`computeCommissionAmount`), un « NaN » ou un montant inventé
 * ne peut plus fausser les totaux d'un partenaire.
 */
const optionalText = (max: number) => z.string().max(max).nullable().optional();

/** « 1000 », « 1000.50 » — jusqu'à dix chiffres, deux décimales. */
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;
/** « 10 », « 2.5 » — au plus deux décimales ; la borne (0, 100] est vérifiée à part. */
const RATE = /^\d{1,3}(\.\d{1,2})?$/;

const amount = z.string().regex(AMOUNT).nullable().optional();
const rate = z
  .string()
  .regex(RATE)
  .refine((v) => Number(v) > 0 && Number(v) <= 100)
  .nullable()
  .optional();

export const CREATE_SHARE_SCHEMA = z.strictObject({
  dealId: z.uuid(),
  partnerId: z.uuid(),
  proposedTerms: optionalText(5000),
  message: optionalText(5000),
  /** Un `Date` (le client en envoie un, le protocole des actions le transporte tel quel), jamais une chaîne ISO. */
  expiresAt: z.date().nullable().optional(),
  /**
   * C'est le moment où le conseiller fixe une commission qui l'engage
   * vis-à-vis d'un confrère — formalisée dès l'envoi, pas laissée en texte
   * libre à interpréter plus tard. Son état (« prévue ») et son montant
   * calculé sont posés par la requête, pas reçus du client.
   */
  commission: z
    .strictObject({
      basis: z.enum(["percentage", "fixed"]),
      rate,
      fixedAmount: amount,
      baseAmount: amount,
    })
    .nullable()
    .optional(),
  /** Renvoi de lien : le partage que celui-ci remplace (chaîne suivie par l'analytique). */
  replacesShareId: z.uuid().nullable().optional(),
});

export type CreateShareInput = z.input<typeof CREATE_SHARE_SCHEMA>;
export type CreateShareCommissionInput = NonNullable<CreateShareInput["commission"]>;

/**
 * Le montant calculé d'une commission, décidé par le serveur : un
 * pourcentage d'une base (arrondi au centime), ou le forfait ; null quand
 * la base manque (un pourcentage sans montant connu reste un taux).
 */
export function computeCommissionAmount(commission: CreateShareCommissionInput): string | null {
  if (commission.basis === "fixed") return commission.fixedAmount ?? null;
  if (!commission.rate || !commission.baseAmount) return null;
  return (Math.round(Number(commission.rate) * Number(commission.baseAmount)) / 100).toFixed(2);
}

/** Un pourcentage exige un taux ; un forfait exige un montant — sinon la commission ne dit rien. */
export function isCommissionComplete(commission: CreateShareCommissionInput): boolean {
  return commission.basis === "percentage" ? Boolean(commission.rate) : Boolean(commission.fixedAmount);
}
