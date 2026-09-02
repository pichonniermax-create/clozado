"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  archiveRule,
  cancelDraft,
  createRule,
  getRuleDraft,
  rearmAutoSend,
  setRuleEnabled,
  stopAutoSendByHand,
  updateAutoSendSettings,
  updateRule,
  updateRuleDraft,
  type RuleInput,
} from "@/db/queries/rules";
import { localeOfOrganization } from "@/i18n/locale-lookup";
import { translatorFor } from "@/i18n/translator";
import { publicOrigin } from "@/lib/email/config";
import { AppError } from "@/lib/errors";
import { errorMessage, withError } from "@/lib/form-actions";
import { evaluateOrganizationRules } from "@/lib/rules/evaluate";
import { sendAutomaticWave, sendRuleDraft } from "@/lib/rules/wave";
import { requireSessionUser, requireUser } from "@/lib/session";

/**
 * Server actions du moteur de règles — org-scopées via `requireUser()`,
 * retour à l'écran appelant avec l'erreur (ou l'info) en paramètre d'URL,
 * comme partout. L'évaluation et la vague s'ATTENDENT (quelques secondes,
 * bornées) : la personne lit le résultat en chiffres, jamais un « lancé »
 * sans suite.
 */

const RULES_PATH = "/regles";

function ruleInputFromForm(formData: FormData): RuleInput {
  const list = (name: string) => formData.getAll(name).map(String).filter(Boolean);
  return {
    name: String(formData.get("name") ?? ""),
    trigger: String(formData.get("trigger") ?? ""),
    thresholdDays: Number(formData.get("thresholdDays") ?? 0),
    action: String(formData.get("action") ?? ""),
    conditions: {
      tagsAny: list("tagsAny"),
      targetIds: list("targetIds"),
      partnerProfessions: list("partnerProfessions"),
      ownerIds: list("ownerIds"),
    },
    templateSubject: String(formData.get("templateSubject") ?? ""),
    templateBody: String(formData.get("templateBody") ?? ""),
    confirmAutoSend: formData.get("confirmAutoSend") === "on",
  };
}

export async function createRuleAction(formData: FormData) {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  const session = await requireSessionUser();
  let destination = withError(RULES_PATH, t("regle_creee"), "info");
  try {
    await createRule(user, session.id, ruleInputFromForm(formData));
  } catch (error) {
    destination = withError("/regles/new", await errorMessage(error));
  }
  revalidatePath(RULES_PATH);
  redirect(destination);
}

export async function updateRuleAction(ruleId: string, formData: FormData) {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  const session = await requireSessionUser();
  let destination = withError(RULES_PATH, t("regle_enregistree"), "info");
  try {
    await updateRule(user, ruleId, session.id, ruleInputFromForm(formData));
  } catch (error) {
    destination = withError(`/regles/${ruleId}`, await errorMessage(error));
  }
  revalidatePath(RULES_PATH);
  redirect(destination);
}

export async function setRuleEnabledAction(context: { ruleId: string; enabled: boolean }) {
  const user = await requireUser();
  let destination = RULES_PATH;
  try {
    await setRuleEnabled(user, context.ruleId, context.enabled);
  } catch (error) {
    destination = withError(RULES_PATH, await errorMessage(error));
  }
  revalidatePath(RULES_PATH);
  redirect(destination);
}

export async function archiveRuleAction(context: { ruleId: string }) {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  let destination = withError(RULES_PATH, t("regle_archivee"), "info");
  try {
    await archiveRule(user, context.ruleId);
  } catch (error) {
    destination = withError(RULES_PATH, await errorMessage(error));
  }
  revalidatePath(RULES_PATH);
  redirect(destination);
}

export async function evaluateNowAction() {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  let destination = RULES_PATH;
  try {
    if (!user.organizationId) throw new AppError("aucune_organisation_selectionnee");
    const summary = await evaluateOrganizationRules(user.organizationId, "manual", {
      origin: await publicOrigin(),
      budgetMs: 120_000,
    });
    destination =
      summary.status === "done"
        ? withError(
            RULES_PATH,
            t("evaluation_faite", {
              matched: summary.counters.matched,
              done: summary.counters.actionsDone,
              skipped: summary.counters.actionsSkipped,
            }),
            "info"
          )
        : withError(RULES_PATH, t("evaluation_deja_en_cours"), "info");
  } catch (error) {
    destination = withError(RULES_PATH, await errorMessage(error));
  }
  revalidatePath(RULES_PATH);
  redirect(destination);
}

export async function sendWaveAction() {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  let destination = RULES_PATH;
  try {
    const result = await sendAutomaticWave(user, await publicOrigin());
    destination = withError(
      RULES_PATH,
      t("vague_envoyee", { sent: result.sent, canceled: result.canceled + result.failed, remaining: result.remaining }),
      "info"
    );
  } catch (error) {
    destination = withError(RULES_PATH, await errorMessage(error));
  }
  revalidatePath(RULES_PATH);
  redirect(destination);
}

// --- Les brouillons, depuis la fiche ou l'écran des règles -----------------

type DraftContext = { messageId: string; backTo: string; errorParam?: string; infoParam?: string };

export async function sendDraftAction(context: DraftContext) {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  let destination = withError(context.backTo, t("brouillon_envoye"), context.infoParam ?? "info");
  try {
    await sendRuleDraft(user, await publicOrigin(), context.messageId);
  } catch (error) {
    destination = withError(context.backTo, await errorMessage(error), context.errorParam ?? "erreur");
  }
  revalidatePath(context.backTo.split("?")[0].split("#")[0]);
  redirect(destination);
}

export async function updateDraftAction(context: DraftContext, formData: FormData) {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  let destination = withError(context.backTo, t("brouillon_enregistre"), context.infoParam ?? "info");
  try {
    await updateRuleDraft(user, context.messageId, {
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
  } catch (error) {
    destination = withError(context.backTo, await errorMessage(error), context.errorParam ?? "erreur");
  }
  revalidatePath(context.backTo.split("?")[0].split("#")[0]);
  redirect(destination);
}

export async function ignoreDraftAction(context: DraftContext) {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  let destination = withError(context.backTo, t("brouillon_ignore"), context.infoParam ?? "info");
  try {
    // getRuleDraft vérifie l'organisation et le statut — jamais une annulation par simple id.
    const draft = await getRuleDraft(user, context.messageId);
    const tq = await translatorFor(await localeOfOrganization(draft.organizationId), "rules.queries");
    await cancelDraft(draft.id, tq("annule_par_une_personne"));
  } catch (error) {
    destination = withError(context.backTo, await errorMessage(error), context.errorParam ?? "erreur");
  }
  revalidatePath(context.backTo.split("?")[0].split("#")[0]);
  redirect(destination);
}

// --- L'arrêt et le réarmement, depuis la fiche -----------------------------

type ContactContext = { contactId: string; backTo: string; errorParam?: string; infoParam?: string };

export async function stopAutoSendAction(context: ContactContext) {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  const session = await requireSessionUser();
  let destination = withError(context.backTo, t("envois_arretes"), context.infoParam ?? "info");
  try {
    await stopAutoSendByHand(user, session.id, context.contactId);
  } catch (error) {
    destination = withError(context.backTo, await errorMessage(error), context.errorParam ?? "erreur");
  }
  revalidatePath(context.backTo.split("?")[0].split("#")[0]);
  redirect(destination);
}

export async function rearmAutoSendAction(context: ContactContext) {
  const t = await getTranslations("rules.actions");
  const user = await requireUser();
  const session = await requireSessionUser();
  let destination = withError(context.backTo, t("envois_rearmes"), context.infoParam ?? "info");
  try {
    await rearmAutoSend(user, session.id, context.contactId);
  } catch (error) {
    destination = withError(context.backTo, await errorMessage(error), context.errorParam ?? "erreur");
  }
  revalidatePath(context.backTo.split("?")[0].split("#")[0]);
  redirect(destination);
}

// --- La carte « Envois automatiques » des réglages -------------------------

const SETTINGS_AUTO_SEND = "/settings#envois-automatiques";

export async function saveAutoSendSettingsAction(formData: FormData) {
  const t = await getTranslations("rules.settingsCard");
  const user = await requireUser();
  let destination = withError(SETTINGS_AUTO_SEND, t("reglages_enregistres"), "info");
  try {
    await updateAutoSendSettings(user, {
      autoSendEnabled: formData.get("autoSendEnabled") === "on",
      autoSendPeriodDays: Number(formData.get("autoSendPeriodDays") ?? 0),
      officeHoursStart: Number(formData.get("officeHoursStart") ?? -1),
      officeHoursEnd: Number(formData.get("officeHoursEnd") ?? -1),
    });
  } catch (error) {
    destination = withError(SETTINGS_AUTO_SEND, await errorMessage(error));
  }
  revalidatePath("/settings");
  redirect(destination);
}
