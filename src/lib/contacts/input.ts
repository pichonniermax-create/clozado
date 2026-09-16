import { z } from "zod";
import type { CreateContactInput } from "@/db/queries/contacts";

/**
 * La forme d'une fiche contact saisie à la main (stabilisation, E5) : les
 * longueurs, une adresse plausible, une date lisible — ce que l'import CSV
 * vérifiait déjà et que la création et la modification ne vérifiaient pas
 * (une valeur refusée par la base envoyait sur l'écran d'erreur). Chaque
 * refus porte la CLÉ de sa phrase (`errors.*`).
 */
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export const CONTACT_INPUT_SCHEMA = z.object({
  kind: z.enum(["person", "company"]),
  name: z.string().trim().max(200),
  firstName: text(100),
  lastName: text(100),
  email: text(254).refine((v) => !v || EMAIL_SHAPE.test(v), { message: "cette_adresse_email_ne_semble_pas_valide" }),
  phone: text(40),
  companyName: text(200),
  jobTitle: text(120),
  city: text(120),
  postalCode: text(20),
  country: text(80),
  birthDate: text(10).refine((v) => !v || (DATE_SHAPE.test(v) && !Number.isNaN(Date.parse(v))), { message: "la_date_de_naissance_est_illisible" }),
  notes: text(5000),
  ownerId: z.uuid().nullable().optional(),
  source: z.enum(["manual", "import"]).optional(),
});

/** `ok` ou la clé de la phrase à montrer — jamais le message technique de zod. */
export function validateContactInput(input: CreateContactInput): { ok: true } | { ok: false; key: string } {
  const parsed = CONTACT_INPUT_SCHEMA.safeParse(input);
  if (parsed.success) return { ok: true };
  const first = parsed.error.issues[0];
  const known = first?.message === "cette_adresse_email_ne_semble_pas_valide" || first?.message === "la_date_de_naissance_est_illisible";
  return { ok: false, key: known ? first.message : "la_saisie_est_trop_longue_ou_invalide" };
}
