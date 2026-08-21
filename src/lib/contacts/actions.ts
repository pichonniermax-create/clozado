"use server";

import { redirect } from "next/navigation";
import {
  createContact,
  createContactTag,
  deleteContact,
  findDuplicateCandidates,
  mergeContacts,
  setContactTags,
  updateContact,
  type CreateContactInput,
} from "@/db/queries/contacts";
import { requireUser } from "@/lib/session";

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
  const user = await requireUser();
  const input = readContactForm(formData);
  if (!input.name) return { error: "Le nom est obligatoire.", duplicates: null };

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
    return { error: "La création a échoué. Vérifie les champs et réessaie.", duplicates: null };
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
  await deleteContact(user, contactId, user.id);
  redirect("/contacts");
}

export async function mergeContactsAction(survivorId: string, absorbedId: string) {
  const user = await requireUser();
  await mergeContacts(user, survivorId, absorbedId, user.id);
  redirect(`/contacts/${survivorId}`);
}

// ---------------------------------------------------------------------------
// Import CSV
// ---------------------------------------------------------------------------

export type ImportField =
  | "name"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "companyName"
  | "jobTitle"
  | "city"
  | "postalCode"
  | "country"
  | "notes";

export type ImportRowInput = {
  /** Numéro de ligne DANS LE FICHIER (en-tête = 1), pour un rapport lisible. */
  line: number;
  values: Partial<Record<ImportField, string>>;
};

export type ImportReport = {
  inserted: number;
  skipped: { line: number; reason: string }[];
  error: string | null;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMPORT_ROWS = 5000;

/**
 * Import partiel assumé : chaque ligne est validée indépendamment, les
 * valides entrent, les autres sortent dans le rapport ligne par ligne.
 * Un email déjà présent dans l'organisation est ignoré (pas de doublon
 * silencieux) — signalé comme tel, jamais fusionné automatiquement.
 */
export async function importContactsAction(rows: ImportRowInput[]): Promise<ImportReport> {
  const user = await requireUser();
  if (!user.organizationId) {
    return { inserted: 0, skipped: [], error: "Aucune organisation associée à cet utilisateur." };
  }
  if (rows.length === 0) return { inserted: 0, skipped: [], error: "Aucune ligne à importer." };
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      inserted: 0,
      skipped: [],
      error: `Trop de lignes (${rows.length}) : l'import est limité à ${MAX_IMPORT_ROWS} par passage.`,
    };
  }

  const { db } = await import("@/db");
  const { contacts } = await import("@/db/schema");
  const { and, eq, isNull } = await import("drizzle-orm");

  const existing = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.organizationId, user.organizationId), isNull(contacts.deletedAt)));
  const knownEmails = new Set(
    existing.map((r) => r.email?.toLowerCase()).filter((e): e is string => Boolean(e))
  );

  const skipped: ImportReport["skipped"] = [];
  const toInsert: (typeof contacts.$inferInsert)[] = [];
  const seenInFile = new Set<string>();

  for (const row of rows) {
    const v = row.values;
    const name = v.name?.trim();
    const email = v.email?.trim() || null;

    if (!name) {
      skipped.push({ line: row.line, reason: "Nom manquant." });
      continue;
    }
    if (email && !EMAIL_SHAPE.test(email)) {
      skipped.push({ line: row.line, reason: `Email invalide : « ${email} ».` });
      continue;
    }
    const emailKey = email?.toLowerCase();
    if (emailKey && knownEmails.has(emailKey)) {
      skipped.push({ line: row.line, reason: `Ignorée : « ${email} » existe déjà dans tes contacts.` });
      continue;
    }
    if (emailKey && seenInFile.has(emailKey)) {
      skipped.push({ line: row.line, reason: `Ignorée : « ${email} » apparaît plusieurs fois dans le fichier.` });
      continue;
    }
    if (emailKey) seenInFile.add(emailKey);

    toInsert.push({
      organizationId: user.organizationId,
      kind: "person",
      name,
      firstName: v.firstName?.trim() || null,
      lastName: v.lastName?.trim() || null,
      email,
      phone: v.phone?.trim() || null,
      companyName: v.companyName?.trim() || null,
      jobTitle: v.jobTitle?.trim() || null,
      city: v.city?.trim() || null,
      postalCode: v.postalCode?.trim() || null,
      country: v.country?.trim() || null,
      notes: v.notes?.trim() || null,
      source: "import",
      createdBy: user.id,
    });
  }

  // Insertion par paquets — jamais 5 000 lignes dans une seule requête.
  const CHUNK = 500;
  let inserted = 0;
  try {
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      if (chunk.length > 0) {
        await db.insert(contacts).values(chunk);
        inserted += chunk.length;
      }
    }
  } catch {
    return {
      inserted,
      skipped,
      error:
        inserted > 0
          ? `L'import s'est interrompu après ${inserted} fiche(s) créée(s) — relance le fichier : les emails déjà importés seront ignorés.`
          : "L'import a échoué avant la première fiche. Vérifie le fichier et réessaie.",
    };
  }

  return { inserted, skipped, error: null };
}
