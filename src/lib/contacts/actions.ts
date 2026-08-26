"use server";

import { redirect } from "next/navigation";
import {
  buildContactNewsletterBrief,
  createContact,
  createContactTag,
  deleteContact,
  findDuplicateCandidates,
  importContacts,
  mergeContacts,
  setContactTags,
  updateContact,
  type CreateContactInput,
  type ImportMode,
  type ImportReport,
  type ImportRowInput,
} from "@/db/queries/contacts";
import { errorMessage, withError } from "@/lib/form-actions";
import { saveNewsletter } from "@/lib/newsletter/actions";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import { AppError } from "@/lib/errors";

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
  };
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
  await updateContact(user, id, input);
  redirect(`/contacts/${id}`);
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

export async function importContactsAction(
  rows: ImportRowInput[],
  mode: ImportMode
): Promise<ImportReport> {
  const user = await requireUser();
  return importContacts(user, user.id, rows, mode, await getTranslations("contacts.queries"));
}
