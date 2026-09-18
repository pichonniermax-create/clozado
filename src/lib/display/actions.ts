"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  countOwnViews,
  createView,
  deleteView,
  duplicateView,
  getView,
  renameView,
  setViewShared,
  updateViewDefinition,
} from "@/db/queries/saved-views";
import { getPreferences, PREF, preferenceList, rememberPreference, resetPreferences } from "@/db/queries/preferences";
import { SAVED_VIEW_SCREENS, type SavedViewScreen } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireUser } from "@/lib/session";
import { displayScreen, screenForView } from "./screens";
import { parseDensity, sanitizeScreenState, VIEW_PARAM, type ScreenState } from "./state";

/**
 * LES GESTES D'AFFICHAGE (lot 1) — mémoriser l'état d'un écran, la période
 * partagée, les colonnes, la densité ; créer et ranger des vues ;
 * réinitialiser. Aucun ne touche à une donnée métier : au pire, une
 * personne retrouve son écran comme elle l'avait laissé.
 *
 * Deux règles tenues ici, pas dans les écrans : un visiteur de la démo
 * publique n'écrit rien (la couche `preferences` l'ignore, le proxy refuse
 * déjà ses POST), et une personne sans organisation (super admin en vue
 * globale) non plus — la mémoire est une paire (personne, organisation).
 */

/** Une vue de plus qu'ici et ce n'est plus une liste de vues (HubSpot s'arrête à 50 par personne). */
const MAX_OWN_VIEWS = 50;

function screenOrThrow(key: string): SavedViewScreen {
  if (!(SAVED_VIEW_SCREENS as readonly string[]).includes(key)) throw new AppError("vue_ecran_inconnu");
  return key as SavedViewScreen;
}

/**
 * LA MÉMOIRE D'UN ÉCRAN, écrite depuis le navigateur après la navigation
 * (`RememberDisplay`) : le chemin dit l'écran, la liste blanche de l'écran
 * dit quels paramètres comptent. Volontairement silencieuse — elle ne
 * revalide rien, ne redirige pas, et n'a aucun retour à montrer : c'est un
 * effet de bord d'affichage, jamais une étape du travail de la personne.
 */
export async function rememberDisplayAction(input: { screen: string; params: Record<string, string> }): Promise<void> {
  const user = await requireUser();
  if (!user.organizationId || user.readOnly) return;
  const screen = displayScreen(input.screen);
  if (!screen) return;
  const state = sanitizeScreenState(screen, input.params);
  await rememberPreference(user, PREF.screen(screen.key), state);
  // La période est GLOBALE : un écran qui en a une la met à jour pour tous les autres. On n'écrit QUE si l'adresse
  // en porte une : une adresse muette veut dire « celle dont je me souviens », pas « oublie-la » — sans quoi le
  // premier écran ouvert sans paramètre effacerait le choix qu'il vient pourtant d'afficher.
  if (screen.period) {
    const { periode, du, au } = state;
    if (du || au) await rememberPreference(user, PREF.period, { du, au });
    else if (periode) await rememberPreference(user, PREF.period, { periode });
  }
  const density = parseDensity(state.densite);
  if (density) await rememberPreference(user, PREF.density, density);
}

/** Les colonnes d'un tableau, choisies dans son menu « Colonnes » — `null` remet les colonnes d'usine. */
export async function setColumnsAction(table: string, keys: string[] | null): Promise<void> {
  const user = await requireUser();
  const clean = keys === null ? null : keys.filter((k) => typeof k === "string" && /^[a-z0-9_-]{1,60}$/i.test(k)).slice(0, 40);
  await rememberPreference(user, PREF.columns(table), clean);
}

/** « Réinitialiser l'affichage » : un écran, ou tout — les vues enregistrées ne bougent pas. */
export async function resetDisplayAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const t = await getTranslations("ui.display");
  const raw = String(formData.get("ecran") ?? "");
  const screen = raw ? displayScreen(raw) : undefined;
  await resetPreferences(user, screen?.key);
  revalidatePath("/", "layout");
  redirect(withError(screen?.href ?? "/dashboard", t("affichage_reinitialise"), "info"));
}

/** La vue qui s'ouvre par défaut sur un module, pour cette personne. */
export async function setDefaultViewAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const t = await getTranslations("ui.display");
  const view = screenOrThrow(String(formData.get("ecran") ?? ""));
  const screen = screenForView(view)!;
  const id = String(formData.get("vue") ?? "");
  let destination = screen.href;
  try {
    if (!id) await rememberPreference(user, PREF.defaultView(view), null);
    else {
      const found = await getView(user, view, id);
      if (!found) throw new AppError("vue_introuvable", undefined, 404);
      await rememberPreference(user, PREF.defaultView(view), id);
    }
    destination = withError(destination, id ? t("vue_d_accueil_enregistree") : t("vue_d_accueil_retiree"), "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath("/", "layout");
  redirect(destination);
}

/** Masquer une vue FOURNIE pour soi seul (personne d'autre n'en est privé). */
export async function toggleHiddenViewAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const view = screenOrThrow(String(formData.get("ecran") ?? ""));
  const screen = screenForView(view)!;
  const id = String(formData.get("vue") ?? "");
  const preferences = await getPreferences(user);
  const hidden = new Set(preferenceList(preferences, PREF.hiddenViews) ?? []);
  if (hidden.has(id)) hidden.delete(id);
  else hidden.add(id);
  await rememberPreference(user, PREF.hiddenViews, [...hidden].slice(0, 200));
  revalidatePath(screen.href);
  redirect(screen.href);
}

/** La définition à enregistrer : l'affichage courant, tel que l'écran l'a envoyé dans le formulaire. */
function definitionFromForm(formData: FormData, screen: SavedViewScreen): { params: ScreenState } {
  const target = screenForView(screen)!;
  const raw = String(formData.get("etat") ?? "");
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;
  return { params: sanitizeScreenState(target, params) };
}

export async function saveViewAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const t = await getTranslations("ui.display");
  const view = screenOrThrow(String(formData.get("ecran") ?? ""));
  const screen = screenForView(view)!;
  const definition = definitionFromForm(formData, view);
  let destination = `${screen.href}${new URLSearchParams(definition.params).toString() ? `?${new URLSearchParams(definition.params)}` : ""}`;
  try {
    if ((await countOwnViews(user)) >= MAX_OWN_VIEWS) throw new AppError("vue_trop_de_vues");
    const id = await createView(user, view, String(formData.get("nom") ?? ""), definition);
    const sp = new URLSearchParams(definition.params);
    sp.set(VIEW_PARAM, id);
    destination = withError(`${screen.href}?${sp}`, t("vue_enregistree"), "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath("/", "layout");
  redirect(destination);
}

/** Renommer, mettre à jour, dupliquer, partager, supprimer — un seul point d'entrée, le geste dans le formulaire. */
export async function viewCommandAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const t = await getTranslations("ui.display");
  const tv = await getTranslations("ui.views.builtIn");
  const view = screenOrThrow(String(formData.get("ecran") ?? ""));
  const screen = screenForView(view)!;
  const id = String(formData.get("vue") ?? "");
  const command = String(formData.get("geste") ?? "");
  const current = await getView(user, view, id);
  const fallbackName = current?.name ?? (current?.builtin ? tv(current.builtin as never) : t("vue_sans_nom"));
  let destination = `${screen.href}?${VIEW_PARAM}=${encodeURIComponent(id)}`;
  try {
    switch (command) {
      case "renommer":
        await renameView(user, id, String(formData.get("nom") ?? ""), fallbackName);
        destination = withError(screen.href, t("vue_renommee"), "info");
        break;
      case "mettre-a-jour":
        await updateViewDefinition(user, id, definitionFromForm(formData, view), fallbackName);
        destination = withError(destination, t("vue_mise_a_jour"), "info");
        break;
      case "dupliquer": {
        const copy = await duplicateView(user, view, id, String(formData.get("nom") ?? "") || t("copie_de", { nom: fallbackName }));
        destination = withError(`${screen.href}?${VIEW_PARAM}=${copy}`, t("vue_dupliquee"), "info");
        break;
      }
      case "partager":
        await setViewShared(user, id, String(formData.get("partagee") ?? "") === "1");
        destination = withError(destination, t("vue_partage_change"), "info");
        break;
      case "supprimer":
        await deleteView(user, id);
        destination = withError(screen.href, t("vue_supprimee"), "info");
        break;
      default:
        throw new AppError("vue_geste_inconnu");
    }
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath("/", "layout");
  redirect(destination);
}
