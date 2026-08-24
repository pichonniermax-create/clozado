"use server";

import { redirect } from "next/navigation";
import {
  attachOrigin,
  createApiKey,
  createOrigin,
  createSiteKey,
  revokeApiKey,
  revokeSiteKey,
  setDealOrigin,
  updateAllowedDomains,
} from "@/db/queries/acquisition";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireUser } from "@/lib/session";

/** Server actions de la collecte — org-scopées via requireUser(), erreurs renvoyées à l'écran appelant. */

export type ApiKeyState = { key: string | null; prefix: string | null; label: string | null; error: string | null };

/** Crée une clé d'API et renvoie sa valeur en clair UNE fois, à l'écran — jamais dans une URL, jamais récupérable ensuite. */
export async function createApiKeyAction(_prev: ApiKeyState, formData: FormData): Promise<ApiKeyState> {
  const user = await requireUser();
  try {
    const { key, row } = await createApiKey(user, user.id, String(formData.get("label") ?? ""));
    return { key, prefix: row.keyPrefix, label: row.label, error: null };
  } catch (error) {
    return { key: null, prefix: null, label: null, error: errorMessage(error) };
  }
}

export async function revokeApiKeyAction(id: string) {
  const user = await requireUser();
  let destination = "/settings";
  try {
    await revokeApiKey(user, id);
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  redirect(destination);
}

export async function createSiteKeyAction(formData: FormData) {
  const user = await requireUser();
  let destination = "/settings";
  try {
    await createSiteKey(user, String(formData.get("label") ?? ""));
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  redirect(destination);
}

export async function revokeSiteKeyAction(id: string) {
  const user = await requireUser();
  let destination = "/settings";
  try {
    await revokeSiteKey(user, id);
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  redirect(destination);
}

export async function updateAllowedDomainsAction(formData: FormData) {
  const user = await requireUser();
  let destination = "/settings";
  try {
    await updateAllowedDomains(user, String(formData.get("domains") ?? "").split(/\r?\n/));
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  redirect(destination);
}

export async function createOriginAction(formData: FormData) {
  const user = await requireUser();
  let destination = "/analytique/origines";
  try {
    await createOrigin(user, String(formData.get("label") ?? ""));
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  redirect(destination);
}

/** Rattache un texte reçu à une origine existante (originId) ou nouvelle (newLabel) — rétroactif. */
export async function attachOriginAction(formData: FormData) {
  const user = await requireUser();
  let destination = "/analytique/origines";
  try {
    const raw = String(formData.get("raw") ?? "");
    const originId = String(formData.get("originId") ?? "").trim();
    const newLabel = String(formData.get("newLabel") ?? "").trim();
    if (!originId && !newLabel) throw new Error("Choisis une origine existante, ou donne un nom à la nouvelle.");
    await attachOrigin(user, raw, originId ? { originId } : { newLabel });
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  redirect(destination);
}

export async function setDealOriginAction(dealId: string, formData: FormData) {
  const user = await requireUser();
  let destination = `/affaires/${dealId}`;
  try {
    await setDealOrigin(user, user.id, dealId, String(formData.get("leadId") ?? "").trim() || null);
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  redirect(destination);
}
