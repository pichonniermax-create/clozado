import { z } from "zod";

/**
 * La forme STRICTE de l'entrée d'un partage d'affaire (audit, constat S1),
 * dans un module PUR — sans base ni session — pour que le composeur
 * (client), l'action et la requête partagent le même contrat et qu'un test
 * puisse le rejouer sans connexion. Une clé inconnue — `organizationId`,
 * `tokenHash`, `createdBy`, ou un `state` que seul le serveur décide — est
 * refusée avant toute lecture : les types dérivés du schéma (`z.input`)
 * font qu'un champ en trop est d'abord une erreur TypeScript chez l'appelant.
 */
const optionalText = (max: number) => z.string().max(max).nullable().optional();

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
   * libre à interpréter plus tard. Son état (« prévue ») est posé par la
   * requête, pas reçu du client.
   */
  commission: z
    .strictObject({
      basis: z.enum(["percentage", "fixed"]),
      rate: optionalText(20),
      fixedAmount: optionalText(40),
      baseAmount: optionalText(40),
      computedAmount: optionalText(40),
    })
    .nullable()
    .optional(),
  /** Renvoi de lien : le partage que celui-ci remplace (chaîne suivie par l'analytique). */
  replacesShareId: z.uuid().nullable().optional(),
});

export type CreateShareInput = z.input<typeof CREATE_SHARE_SCHEMA>;
export type CreateShareCommissionInput = NonNullable<CreateShareInput["commission"]>;
