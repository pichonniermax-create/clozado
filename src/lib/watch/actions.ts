"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOwnOrganization } from "@/db/queries/organizations";
import {
  addToBasket,
  archiveWatchSource,
  archiveWatchTopic,
  clearBasket,
  createPackWatchDefaults,
  createWatchSource,
  createWatchTopic,
  dismissWatchItem,
  removeFromBasket,
  resetSummary,
  restoreWatchItem,
  restoreWatchSource,
  restoreWatchTopic,
  retryWatchSource,
  updateWatchTopic,
  WATCH_MANUAL_COOLDOWN_MINUTES,
  type WatchSourceInput,
  type WatchTopicInput,
} from "@/db/queries/watch";
import { errorMessage, withError } from "@/lib/form-actions";
import { resolveBusinessPack } from "@/lib/metrics/packs";
import { requireUser, requireSessionUser } from "@/lib/session";
import { discoverFeed } from "@/lib/watch/feeds";
import { scheduleWatchRefresh } from "@/lib/watch/schedule";
import { getFormats } from "@/i18n/formats";
import { getTranslations } from "next-intl/server";
import { toAppLocale } from "@/i18n/locales";
import { translatorFor } from "@/i18n/translator";

/**
 * Server actions de la veille — org-scopées via `requireUser()`, même
 * découplage que les cibles : les fonctions de `src/db/queries/` ne voient
 * jamais la session. Chaque geste revient sur /veille ; l'erreur ou
 * l'information voyage en paramètre d'URL et s'affiche une fois.
 * `revalidatePath` avant un `redirect` vers la même page avec une ancre :
 * sans lui, le routeur remonte la page depuis son cache (vu sur /settings).
 */
const PAGE = "/veille";
/** L'écran des concurrents et de l'écart de contenu (étape 5) — ses gestes reviennent chez lui. */
const COMPETITORS_PAGE = "/concurrents";

function back(anchor?: string): string {
  return anchor ? `${PAGE}#${anchor}` : PAGE;
}

function readTopicForm(formData: FormData): WatchTopicInput {
  return {
    label: String(formData.get("label") ?? ""),
    searchTerms: String(formData.get("searchTerms") ?? "").split(/[\n;]/),
    searchLanguages: formData.getAll("languages").map(String),
  };
}

export async function createTopicAction(formData: FormData) {
  const user = await requireUser();
  let destination = back("sujets");
  try {
    await createWatchTopic(user, readTopicForm(formData));
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function updateTopicAction(id: string, formData: FormData) {
  const user = await requireUser();
  let destination = back("sujets");
  try {
    await updateWatchTopic(user, id, readTopicForm(formData));
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function archiveTopicAction(id: string) {
  const user = await requireUser();
  let destination = back("sujets");
  try {
    await archiveWatchTopic(user, id);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function restoreTopicAction(id: string) {
  const user = await requireUser();
  let destination = back("sujets");
  try {
    await restoreWatchTopic(user, id);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/**
 * Une source : le flux est DÉCOUVERT depuis la page d'accueil quand il n'est
 * pas donné (le cas courant des sites de cabinets, WordPress) ; sans flux,
 * la source vit par la recherche restreinte à son domaine — l'information
 * le dit, pour que l'utilisateur rattache la source à un sujet.
 */
export async function createSourceAction(formData: FormData) {
  const t = await getTranslations("watch.actions");
  const user = await requireUser();
  let destination = back("sources");
  try {
    const siteUrl = String(formData.get("siteUrl") ?? "").trim();
    let feedUrl = String(formData.get("feedUrl") ?? "").trim() || null;
    let discovered = false;
    if (!feedUrl && siteUrl) {
      const found = await discoverFeed(siteUrl.match(/^https?:\/\//i) ? siteUrl : `https://${siteUrl}`, 8_000);
      if (found) {
        feedUrl = found.feedUrl;
        discovered = true;
      }
    }
    const input: WatchSourceInput = {
      kind: formData.get("kind") === "competitor" ? "competitor" : "source",
      label: String(formData.get("label") ?? ""),
      siteUrl,
      feedUrl,
      country: String(formData.get("country") ?? "") || null,
      lang: String(formData.get("lang") ?? "") || null,
      topicId: String(formData.get("topicId") ?? "") || null,
    };
    const source = await createWatchSource(user, input);
    const info = discovered
      ? t("source_ajoutee_flux_trouve", { feedUrl: (source.feedUrl) ?? "" })
      : source.feedUrl
        ? t("source_ajoutee_avec_son_flux")
        : t("source_ajoutee_sans_flux_elle_sera_c04a");
    destination = withError(destination, info, "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function archiveSourceAction(id: string) {
  const user = await requireUser();
  let destination = back("sources");
  try {
    await archiveWatchSource(user, id);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function restoreSourceAction(id: string) {
  const user = await requireUser();
  let destination = back("sources");
  try {
    await restoreWatchSource(user, id);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Réessayer » ou « Réveiller » : la source redevient due, la prochaine collecte la relit. */
export async function retrySourceAction(id: string) {
  const t = await getTranslations("watch.actions");
  const user = await requireUser();
  let destination = back("sources");
  try {
    await retryWatchSource(user, id);
    destination = withError(destination, t("la_source_sera_relue_a_la_e3a4"), "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Actualiser maintenant » : une collecte par dix minutes ; elle démarre tout de suite et s'exécute après la réponse. La même collecte, quel que soit l'écran qui la demande. */
async function refreshAndReturnTo(page: string) {
  const t = await getTranslations("watch.actions");
  const user = await requireUser();
  let destination = page;
  if (!user.organizationId) {
    destination = withError(page, t("aucune_organisation_selectionnee"));
  } else {
    try {
      const result = await scheduleWatchRefresh(user.organizationId, "manual");
      if (result.status === "started") destination = withError(page, t("collecte_lancee_les_nouveautes_apparaissent_au_b885"), "info");
      else if (result.status === "running") destination = withError(page, t("une_collecte_est_deja_en_cours"), "info");
      else if (result.status === "demo") destination = withError(page, t("demo_la_collecte_est_desactivee_les_elements"), "info");
      else
        destination = withError(
          page,
          t("une_collecte_vient_d_avoir_lieu_1eeb", { formatDateTime: (await getFormats()).dateTime(result.until), watchManualCooldownMinutes: WATCH_MANUAL_COOLDOWN_MINUTES }),
          "info"
        );
    } catch (error) {
      destination = withError(page, await errorMessage(error));
    }
  }
  revalidatePath(PAGE);
  revalidatePath(COMPETITORS_PAGE);
  redirect(destination);
}

export async function refreshWatchAction() {
  await refreshAndReturnTo(PAGE);
}

export async function refreshCompetitorsAction() {
  await refreshAndReturnTo(COMPETITORS_PAGE);
}

export async function addToBasketAction(itemId: string) {
  const user = await requireUser();
  const session = await requireSessionUser();
  let destination = `${PAGE}#article-${itemId}`;
  try {
    await addToBasket(user, itemId, session.id);
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function removeFromBasketAction(itemId: string) {
  const user = await requireUser();
  let destination = `${PAGE}#article-${itemId}`;
  try {
    await removeFromBasket(user, itemId);
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function clearBasketAction() {
  const user = await requireUser();
  let destination = PAGE;
  try {
    await clearBasket(user);
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function dismissItemAction(itemId: string) {
  const user = await requireUser();
  let destination = PAGE;
  try {
    await dismissWatchItem(user, itemId);
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function restoreItemAction(itemId: string) {
  const user = await requireUser();
  let destination = `${PAGE}#article-${itemId}`;
  try {
    await restoreWatchItem(user, itemId);
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** Un résumé refusé ou échoué peut être retenté : l'article repasse en attente pour la prochaine collecte. */
export async function resummarizeAction(itemId: string) {
  const user = await requireUser();
  let destination = `${PAGE}#article-${itemId}`;
  try {
    await resetSummary(user, itemId);
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Suivre la veille de mon métier » — idempotent : ne crée que ce qui manque. */
export async function createPackWatchAction() {
  const t = await getTranslations("watch.actions");
  const user = await requireUser();
  let destination = PAGE;
  try {
    const org = await getOwnOrganization(user);
    const { pack } = resolveBusinessPack(org?.businessPack);
    const templates = await translatorFor(toAppLocale(org?.defaultLocale), "templates");
    const created = await createPackWatchDefaults(user, pack, templates);
    const total = created.topics + created.sources + created.indicators;
    destination = withError(
      PAGE,
      total === 0
        ? t("tout_ce_que_propose_ton_metier_1e31")
        : t("ajoute_sujet_sujets_source_sources_indicateur_75c5", { topics: created.topics, sources: created.sources, indicators: created.indicators }),
      "info"
    );
    if (total > 0 && user.organizationId) await scheduleWatchRefresh(user.organizationId, "visit");
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** Depuis le panier : « écrire une newsletter à partir de ça », avec la cible choisie — le composer reçoit la matière et la cible d'un coup. */
export async function writeFromBasketAction(formData: FormData) {
  const t = await getTranslations("watch.actions");
  await requireUser();
  const targetId = String(formData.get("targetId") ?? "").trim();
  if (!targetId) {
    revalidatePath(PAGE);
    redirect(withError(`${PAGE}#panier`, t("choisis_d_abord_la_cible_a_9f68")));
  }
  redirect(`/newsletters/new?cible=${encodeURIComponent(targetId)}&panier=1`);
}

// ---------------------------------------------------------------------------
// Les concurrents et l'écart de contenu (étape 5)
// ---------------------------------------------------------------------------

/**
 * Un concurrent nommé : la même mécanique qu'une source — flux découvert
 * depuis la page d'accueil, sinon recherche restreinte à son domaine —
 * avec `kind = competitor` et sans sujet : on suit ce qu'il publie, quel
 * qu'en soit le thème. Une collecte démarre tout de suite (déclencheur
 * « visite », sans délai), ou dès la fin de celle en cours : l'écart
 * n'attend pas le lendemain.
 */
export async function createCompetitorAction(formData: FormData) {
  const t = await getTranslations("watch.actions");
  const user = await requireUser();
  let destination = `${COMPETITORS_PAGE}#concurrents`;
  try {
    const siteUrl = String(formData.get("siteUrl") ?? "").trim();
    let feedUrl = String(formData.get("feedUrl") ?? "").trim() || null;
    let discovered = false;
    if (!feedUrl && siteUrl) {
      const found = await discoverFeed(siteUrl.match(/^https?:\/\//i) ? siteUrl : `https://${siteUrl}`, 8_000);
      if (found) {
        feedUrl = found.feedUrl;
        discovered = true;
      }
    }
    const source = await createWatchSource(user, {
      kind: "competitor",
      label: String(formData.get("label") ?? ""),
      siteUrl,
      feedUrl,
      country: String(formData.get("country") ?? "") || null,
      lang: String(formData.get("lang") ?? "") || null,
      topicId: null,
    });
    const info = discovered
      ? t("concurrent_ajoute_flux_trouve_la_collecte_c3e7", { feedUrl: source.feedUrl ?? "" })
      : source.feedUrl
        ? t("concurrent_ajoute_avec_son_flux_la_5c12")
        : t("concurrent_ajoute_sans_flux_il_sera_1d2c");
    destination = withError(destination, info, "info");
    // Tout de suite, ou dès la fin de la collecte en cours : le concurrent n'attend pas le lendemain.
    if (user.organizationId) await scheduleWatchRefresh(user.organizationId, "visit", { queue: true }).catch(() => undefined);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(COMPETITORS_PAGE);
  redirect(destination);
}

/** Un geste sur un concurrent (désactiver, réactiver, réessayer) : revient sur l'écran des concurrents, l'information ou l'erreur en paramètre. */
async function competitorGesture(work: (user: Awaited<ReturnType<typeof requireUser>>) => Promise<void>, info?: (t: Awaited<ReturnType<typeof getTranslations<"watch.actions">>>) => string) {
  const user = await requireUser();
  let destination = `${COMPETITORS_PAGE}#concurrents`;
  try {
    await work(user);
    if (info) destination = withError(destination, info(await getTranslations("watch.actions")), "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(COMPETITORS_PAGE);
  redirect(destination);
}

export async function archiveCompetitorAction(id: string) {
  await competitorGesture((user) => archiveWatchSource(user, id));
}

export async function restoreCompetitorAction(id: string) {
  await competitorGesture((user) => restoreWatchSource(user, id));
}

/** « Réessayer » ou « Réveiller » : le concurrent redevient dû, la prochaine collecte le relit. */
export async function retryCompetitorAction(id: string) {
  await competitorGesture(
    (user) => retryWatchSource(user, id),
    (t) => t("le_concurrent_sera_relu_a_la_e0b1")
  );
}

/**
 * Depuis l'écart : « écrire sur ce sujet », avec la cible choisie — le
 * composer reçoit le sujet (et, de lui, notre matière et le brief), jamais
 * un article de concurrent.
 */
export async function writeFromGapAction(formData: FormData) {
  const t = await getTranslations("watch.actions");
  await requireUser();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  if (!targetId || !subject) {
    revalidatePath(COMPETITORS_PAGE);
    redirect(withError(`${COMPETITORS_PAGE}#ecart`, t("choisis_d_abord_la_cible_a_9f68")));
  }
  redirect(`/newsletters/new?cible=${encodeURIComponent(targetId)}&sujet=${encodeURIComponent(subject)}`);
}
