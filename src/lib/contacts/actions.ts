"use server";

import { z } from "zod";

import { redirect } from "next/navigation";
import {
  buildContactNewsletterBrief,
  createContact,
  createContactTag,
  deleteContact,
  findDuplicateCandidates,
  importContacts,
  mergeContacts,
  patchContact,
  setContactTags,
  updateContact,
  type CreateContactInput,
  type ImportMode,
  type ImportReport,
  type ImportRowInput,
} from "@/db/queries/contacts";
import { createPartner } from "@/db/queries/partners";
import { actionResult, errorMessage, withError, type ActionResult } from "@/lib/form-actions";
import { validateContactInput } from "@/lib/contacts/input";
import { versionOf, type InlinePatch, type InlineSaveResult } from "@/lib/fiches/inline";
import { saveNewsletter } from "@/lib/newsletter/actions";
import { log } from "@/lib/log";
import { requireUser } from "@/lib/session";
import { readInput } from "@/lib/validation";
import { getTranslations } from "next-intl/server";
import { AppError, isAppError } from "@/lib/errors";

/**
 * Server actions du module contacts — org-scopées via `requireUser()`,
 * même découplage que les modules PRM et mailing : les fonctions de
 * `src/db/queries/` ne voient jamais la session.
 */

export type CreateContactState = {
  error: string | null;
  /** Doublons potentiels trouvés — la création est suspendue à un choix humain. */
  duplicates: { id: string; name: string; email: string | null; companyName: string | null }[] | null;
};

function readContactForm(formData: FormData): CreateContactInput {
  const kind = formData.get("kind") === "company" ? "company" : "person";
  // Pour une personne, le nom d'affichage se compose de prénom + nom si le
  // formulaire ne fournit pas de champ name explicite (l'import CSV, lui,
  // en fournit toujours un).
  let name = String(formData.get("name") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!name && kind === "person") name = [firstName, lastName].filter(Boolean).join(" ");
  return {
    kind,
    name,
    firstName: firstName || null,
    lastName: lastName || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    companyName: String(formData.get("companyName") ?? "").trim() || null,
    jobTitle: String(formData.get("jobTitle") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    postalCode: String(formData.get("postalCode") ?? "").trim() || null,
    country: String(formData.get("country") ?? "").trim() || null,
    birthDate: String(formData.get("birthDate") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    ownerId: String(formData.get("ownerId") ?? "").trim() || null,
    // Lot 2 : l'origine métier de la fiche, et le confrère qui l'a apportée.
    originId: String(formData.get("originId") ?? "").trim() || null,
    partnerId: String(formData.get("partnerId") ?? "").trim() || null,
  };
}

/**
 * CRÉER UN CONFRÈRE SANS QUITTER LE FORMULAIRE (lot 2) — le cas courant :
 * on saisit une fiche apportée par quelqu'un qui n'est pas encore au
 * répertoire. Le nom seul suffit ; le reste se complète depuis sa fiche.
 * Rend son échec au lieu de le lever : l'appel vient d'un composant
 * client, une `AppError` levée arriverait avec sa CLÉ pour message.
 */
export async function quickCreatePartnerAction(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  return actionResult(async () => {
    const user = await requireUser();
    const partner = await createPartner(user, { name: String(name ?? "").trim() });
    return { id: partner.id, name: partner.name };
  });
}

export async function createContactAction(
  _prev: CreateContactState,
  formData: FormData
): Promise<CreateContactState> {
  const t = await getTranslations("contacts.actions");
  const user = await requireUser();
  if (!user.organizationId) {
    // La cause exacte est connue : la dire, plutôt qu'un générique qui
    // enverrait chercher un problème de saisie qui n'existe pas.
    return { error: t("aucune_organisation_selectionnee_choisis_une_organisation_f1fd"), duplicates: null };
  }
  const input = readContactForm(formData);
  if (!input.name) return { error: t("le_nom_est_obligatoire"), duplicates: null };
  // La forme de la saisie (stabilisation, E5) : la phrase, jamais l'écran d'erreur.
  const shape = validateContactInput(input);
  if (!shape.ok) return { error: (await getTranslations("errors"))(shape.key as never), duplicates: null };

  // Détection de doublons AVANT la création : même email ou même nom.
  // « Créer quand même » renvoie le formulaire avec force=1.
  if (formData.get("force") !== "1") {
    const candidates = await findDuplicateCandidates(user, input);
    if (candidates.length > 0) {
      return {
        error: null,
        duplicates: candidates.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          companyName: c.companyName,
        })),
      };
    }
  }

  let contactId: string;
  try {
    const contact = await createContact(user, user.id, input);
    contactId = contact.id;
  } catch {
    return {
      error:
        t("la_creation_a_echoue_de_notre_b2e7"),
      duplicates: null,
    };
  }
  redirect(`/contacts/${contactId}`);
}

export async function updateContactAction(id: string, formData: FormData) {
  const user = await requireUser();
  const input = readContactForm(formData);
  const backTo = `/contacts/${id}`;
  let destination = backTo;
  // La forme d'abord, puis l'écriture rattrapée (stabilisation, E5) : une valeur refusée revient sur la fiche en
  // notification — avant, l'écran d'erreur de la liste.
  const shape = validateContactInput(input);
  if (!shape.ok) {
    destination = withError(backTo, (await getTranslations("errors"))(shape.key as never));
  } else {
    try {
      await updateContact(user, id, input);
    } catch (error) {
      destination = withError(backTo, await errorMessage(error));
    }
  }
  redirect(destination);
}

/**
 * LA MODIFICATION EN PLACE d'un champ (chantier « les fiches deviennent
 * modifiables »). Elle ne redirige pas : elle REND son verdict au champ,
 * qui remet la valeur précédente et dit pourquoi en cas de refus.
 *
 * Toutes les gardes sont côté serveur, dans `patchContact` : organisation,
 * version de la fiche, liste blanche des champs, forme de la valeur. Un
 * appel direct à cette action avec l'identifiant d'une fiche d'une autre
 * organisation ne modifie rien.
 */
export async function patchContactFieldAction(id: string, patch: InlinePatch): Promise<InlineSaveResult> {
  const user = await requireUser();
  // Un visiteur de la démonstration publique n'écrit rien : le proxy refuse déjà ses requêtes, la garde est ici aussi.
  if (user.readOnly) return { ok: false, error: (await getTranslations("demo.banner"))("lecture_seule_notice") };
  try {
    const updated = await patchContact(user, id, patch);
    return { ok: true, version: versionOf(updated) };
  } catch (error) {
    // 409 = la fiche a changé ailleurs : l'écran doit se recharger avant toute nouvelle saisie.
    return { ok: false, error: await errorMessage(error), stale: isAppError(error) && error.status === 409 };
  }
}

/** Enregistre les étiquettes cochées + en crée une à la volée si un libellé est saisi. */
export async function saveContactTagsAction(contactId: string, formData: FormData) {
  const user = await requireUser();
  const tagIds = formData.getAll("tagIds").map(String);
  const newLabel = String(formData.get("newTag") ?? "").trim();
  if (newLabel) {
    const tag = await createContactTag(user, newLabel);
    tagIds.push(tag.id);
  }
  await setContactTags(user, contactId, tagIds);
  redirect(`/contacts/${contactId}`);
}

export async function deleteContactAction(contactId: string) {
  const user = await requireUser();
  await deleteContact(user, contactId, user.id, await getTranslations("contacts.queries"));
  redirect("/contacts");
}

export async function mergeContactsAction(survivorId: string, absorbedId: string) {
  const user = await requireUser();
  await mergeContacts(user, survivorId, absorbedId, user.id, await getTranslations("contacts.queries"));
  redirect(`/contacts/${survivorId}`);
}

/** Paramètre d'URL de l'erreur de cette action sur la fiche (distinct de ceux des tâches et du journal). */
const NEWSLETTER_ERROR_PARAM = "erreurNewsletter";

/**
 * « Rédiger une newsletter pour ce contact » : crée un brouillon dont le
 * brief est déjà rempli depuis la fiche, puis ouvre l'éditeur existant sur
 * ce brouillon — le composer n'est pas modifié, il reçoit une newsletter
 * comme une autre (`saveNewsletter` vérifie que le groupe de destinataires
 * appartient bien à l'organisation).
 */
export async function createNewsletterForContactAction(contactId: string, formData: FormData) {
  const user = await requireUser();
  const targetId = String(formData.get("targetId") ?? "").trim();
  let destination: string;
  try {
    if (!targetId) throw new AppError("choisis_le_groupe_de_destinataires_de_la_74e8");
    const { title, brief } = await buildContactNewsletterBrief(user, contactId, await getTranslations("contacts.queries"));
    const id = await saveNewsletter({ targetId, title, brief, subject: "", preheader: "", blocks: [] });
    destination = `/newsletters/${id}`;
  } catch (error) {
    destination = withError(`/contacts/${contactId}`, await errorMessage(error), NEWSLETTER_ERROR_PARAM);
  }
  redirect(destination);
}

// ---------------------------------------------------------------------------
// Import CSV — logique dans src/db/queries/contacts.ts (testable sans session)
// ---------------------------------------------------------------------------

export type { ImportField, ImportMode, ImportReport, ImportRowInput } from "@/db/queries/contacts";

/** La forme STRICTE d'un import (chasse aux failles du 2026-09-14) : des chaînes bornées, un mode connu, cinq mille lignes au plus. */
const IMPORT_VALUES_SCHEMA = z
  .object({
    name: z.string().max(200),
    firstName: z.string().max(160),
    lastName: z.string().max(160),
    email: z.string().max(254),
    phone: z.string().max(40),
    companyName: z.string().max(200),
    jobTitle: z.string().max(160),
    city: z.string().max(160),
    postalCode: z.string().max(20),
    country: z.string().max(80),
    notes: z.string().max(2000),
    // Lot 2 : trois colonnes qui DÉSIGNENT une ligne existante (adresse d'un compte, nom d'un confrère,
    // libellé d'une origine). Bornées comme le reste — le rapprochement, lui, se fait côté base.
    owner: z.string().max(254),
    partner: z.string().max(200),
    origin: z.string().max(200),
  })
  .partial()
  .strict();
const IMPORT_SCHEMA = z.strictObject({
  rows: z.array(z.strictObject({ line: z.number().int().positive(), values: IMPORT_VALUES_SCHEMA })).min(1).max(5000),
  mode: z.enum(["skip", "complete"]),
});

export async function importContactsAction(
  rows: ImportRowInput[],
  mode: ImportMode
): Promise<ImportReport> {
  const user = await requireUser();
  const input = readInput(IMPORT_SCHEMA, { rows, mode });
  const report = await importContacts(user, user.id, input.rows as ImportRowInput[], input.mode, await getTranslations("contacts.queries"));
  log.info("contacts_imported", { organizationId: user.organizationId, actorId: user.id, inserted: report.inserted, completed: report.completed.length, mode: input.mode });
  return report;
}
