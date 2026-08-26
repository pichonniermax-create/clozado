"use server";

import { redirect } from "next/navigation";
import {
  addStaticMembers,
  archiveMailTarget,
  countMembers,
  createMailTarget,
  createPackTargets,
  duplicateMailTarget,
  getMailTarget,
  listRecentSendsForTarget,
  previewSegment,
  removeStaticMember,
  restoreMailTarget,
  updateMailTarget,
  type MailTargetInput,
  type SegmentPreview,
} from "@/db/queries/mail-targets";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireUser } from "@/lib/session";
import { normalizeCriteria, SEGMENT_CRITERIA_SCHEMA, type SegmentCriteria } from "@/lib/targets/criteria";
import { getTranslations } from "next-intl/server";
import { AppError } from "@/lib/errors";
import { getOwnOrganization } from "@/db/queries/organizations";
import { toAppLocale } from "@/i18n/locales";
import { translatorFor } from "@/i18n/translator";

/**
 * Server actions des cibles — org-scopées via `requireUser()`, même
 * découplage que contacts, tâches et PRM : les fonctions de
 * `src/db/queries/` ne voient jamais la session. Les formulaires de
 * création/édition rendent leur erreur en état (`useActionState`) pour que
 * la saisie reste à l'écran ; les gestes d'un clic (dupliquer, désactiver,
 * ajouter un membre) reviennent à l'écran avec l'erreur en paramètre d'URL.
 */

export type TargetFormState = { error: string | null };

function readTargetForm(formData: FormData): MailTargetInput {
  const kind = formData.get("kind") === "static" ? "static" : "segment";
  let criteria: SegmentCriteria = {};
  if (kind === "segment") {
    let json: unknown;
    try {
      json = JSON.parse(String(formData.get("criteria") ?? "{}"));
    } catch {
      throw new AppError("les_criteres_sont_illisibles_recharge_la_page_e10c");
    }
    const parsed = SEGMENT_CRITERIA_SCHEMA.safeParse(json);
    if (!parsed.success) throw new AppError("un_critere_n_est_pas_valide_verifie_5ac2");
    criteria = normalizeCriteria(parsed.data);
  }
  const text = (key: string) => String(formData.get(key) ?? "").trim() || null;
  return {
    label: String(formData.get("label") ?? "").trim(),
    description: text("description"),
    kind,
    criteria,
    persona: text("persona"),
    concerns: text("concerns"),
    knowledgeLevel: text("knowledgeLevel"),
    editorialVoice: text("editorialVoice"),
    interests: text("interests"),
    avoid: text("avoid"),
    audienceLabel: text("audienceLabel"),
    defaultSignatoryId: text("defaultSignatoryId"),
  };
}

export async function createTargetAction(_prev: TargetFormState, formData: FormData): Promise<TargetFormState> {
  const user = await requireUser();
  let id: string;
  try {
    const target = await createMailTarget(user, readTargetForm(formData));
    id = target.id;
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  redirect(`/cibles/${id}`);
}

export async function updateTargetAction(
  id: string,
  _prev: TargetFormState,
  formData: FormData
): Promise<TargetFormState> {
  const user = await requireUser();
  try {
    await updateMailTarget(user, id, readTargetForm(formData));
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  redirect(`/cibles/${id}`);
}

export async function duplicateTargetAction(id: string) {
  const user = await requireUser();
  let destination: string;
  try {
    const copy = await duplicateMailTarget(user, id);
    destination = `/cibles/${copy.id}`;
  } catch (error) {
    destination = withError(`/cibles/${id}`, await errorMessage(error));
  }
  redirect(destination);
}

export async function archiveTargetAction(id: string) {
  const user = await requireUser();
  let destination = `/cibles/${id}`;
  try {
    await archiveMailTarget(user, id);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  redirect(destination);
}

export async function restoreTargetAction(id: string) {
  const user = await requireUser();
  let destination = `/cibles/${id}`;
  try {
    await restoreMailTarget(user, id);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  redirect(destination);
}

/** « Créer les cibles de mon métier » — idempotent : ne crée que ce qui manque. */
export async function createPackTargetsAction() {
  const t = await getTranslations("targets.actions");
  const user = await requireUser();
  let destination = "/cibles";
  try {
    const org = await getOwnOrganization(user);
    const templates = await translatorFor(toAppLocale(org?.defaultLocale), "templates");
    const { created } = await createPackTargets(user, templates);
    if (created === 0) destination = withError("/cibles", t("toutes_les_cibles_de_ton_metier_cf0b"), "info");
  } catch (error) {
    destination = withError("/cibles", await errorMessage(error));
  }
  redirect(destination);
}

export async function addMembersAction(targetId: string, formData: FormData) {
  const user = await requireUser();
  const contactIds = formData.getAll("contactIds").map(String);
  const q = String(formData.get("q") ?? "").trim();
  let destination = `/cibles/${targetId}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  try {
    await addStaticMembers(user, targetId, contactIds);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  redirect(destination);
}

export async function removeMemberAction(targetId: string, contactId: string) {
  const user = await requireUser();
  let destination = `/cibles/${targetId}`;
  try {
    await removeStaticMember(user, targetId, contactId);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  redirect(destination);
}

/**
 * L'aperçu permanent de l'éditeur de critères : appelé à chaque changement
 * (avec un délai côté client), renvoie le nombre, les sans-email et cinq
 * noms. Les critères sont validés ici comme à l'enregistrement — jamais un
 * JSON non vérifié compilé en SQL.
 */
export async function previewSegmentAction(
  input: unknown
): Promise<{ ok: true; preview: SegmentPreview } | { ok: false; error: string }> {
  const t = await getTranslations("targets.actions");
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: t("aucune_organisation_selectionnee") };
  const parsed = SEGMENT_CRITERIA_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("un_critere_n_est_pas_valide") };
  try {
    return { ok: true, preview: await previewSegment(user.organizationId, normalizeCriteria(parsed.data)) };
  } catch {
    return { ok: false, error: t("l_apercu_n_a_pas_pu_4e50") };
  }
}

export type TargetSummary = {
  count: number;
  recentSends: {
    id: string;
    title: string;
    subject: string | null;
    sentAt: string;
    topics: string[];
    recipients: number;
    overlap: number;
    overlapPercent: number | null;
  }[];
};

/** Ce que le composer montre au choix d'une cible : à combien de personnes réelles on s'adresse, et ce qu'elles ont déjà reçu. */
export async function targetSummaryAction(targetId: string): Promise<TargetSummary | null> {
  const user = await requireUser();
  let target;
  try {
    target = await getMailTarget(user, targetId);
  } catch {
    return null;
  }
  const count = await countMembers(target);
  const recentSends = await listRecentSendsForTarget(target, count);
  return {
    count,
    recentSends: recentSends.map((s) => ({ ...s, sentAt: s.sentAt.toISOString() })),
  };
}
