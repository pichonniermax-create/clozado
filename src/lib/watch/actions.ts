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
import { formatDateTime } from "@/lib/format";

/**
 * Server actions de la veille — org-scopées via `requireUser()`, même
 * découplage que les cibles : les fonctions de `src/db/queries/` ne voient
 * jamais la session. Chaque geste revient sur /veille ; l'erreur ou
 * l'information voyage en paramètre d'URL et s'affiche une fois.
 * `revalidatePath` avant un `redirect` vers la même page avec une ancre :
 * sans lui, le routeur remonte la page depuis son cache (vu sur /settings).
 */
const PAGE = "/veille";

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
    destination = withError(destination, errorMessage(error));
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
    destination = withError(destination, errorMessage(error));
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
    destination = withError(destination, errorMessage(error));
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
    destination = withError(destination, errorMessage(error));
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
      ? `Source ajoutée — flux trouvé : ${source.feedUrl}.`
      : source.feedUrl
        ? "Source ajoutée avec son flux."
        : "Source ajoutée sans flux : elle sera cherchée par son domaine à chaque collecte, à condition d'être rattachée à un sujet.";
    destination = withError(destination, info, "info");
  } catch (error) {
    destination = withError(destination, errorMessage(error));
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
    destination = withError(destination, errorMessage(error));
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
    destination = withError(destination, errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Réessayer » ou « Réveiller » : la source redevient due, la prochaine collecte la relit. */
export async function retrySourceAction(id: string) {
  const user = await requireUser();
  let destination = back("sources");
  try {
    await retryWatchSource(user, id);
    destination = withError(destination, "La source sera relue à la prochaine collecte.", "info");
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Actualiser maintenant » : une collecte par dix minutes ; elle démarre tout de suite et s'exécute après la réponse. */
export async function refreshWatchAction() {
  const user = await requireUser();
  let destination = PAGE;
  if (!user.organizationId) {
    destination = withError(PAGE, "Aucune organisation sélectionnée.");
  } else {
    try {
      const result = await scheduleWatchRefresh(user.organizationId, "manual");
      if (result.status === "started") destination = withError(PAGE, "Collecte lancée — les nouveautés apparaissent au fil de l'eau.", "info");
      else if (result.status === "running") destination = withError(PAGE, "Une collecte est déjà en cours.", "info");
      else
        destination = withError(
          PAGE,
          `Une collecte vient d'avoir lieu : la prochaine à la main est possible à partir de ${formatDateTime(result.until)} (${WATCH_MANUAL_COOLDOWN_MINUTES} minutes entre deux).`,
          "info"
        );
    } catch (error) {
      destination = withError(PAGE, errorMessage(error));
    }
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function addToBasketAction(itemId: string) {
  const user = await requireUser();
  const session = await requireSessionUser();
  let destination = `${PAGE}#article-${itemId}`;
  try {
    await addToBasket(user, itemId, session.id);
  } catch (error) {
    destination = withError(PAGE, errorMessage(error));
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
    destination = withError(PAGE, errorMessage(error));
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
    destination = withError(PAGE, errorMessage(error));
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
    destination = withError(PAGE, errorMessage(error));
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
    destination = withError(PAGE, errorMessage(error));
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
    destination = withError(PAGE, errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Suivre la veille de mon métier » — idempotent : ne crée que ce qui manque. */
export async function createPackWatchAction() {
  const user = await requireUser();
  let destination = PAGE;
  try {
    const org = await getOwnOrganization(user);
    const { pack } = resolveBusinessPack(org?.businessPack);
    const created = await createPackWatchDefaults(user, pack);
    const total = created.topics + created.sources + created.indicators;
    destination = withError(
      PAGE,
      total === 0
        ? "Tout ce que propose ton métier est déjà suivi — rien à créer."
        : `Ajouté : ${created.topics} sujet${created.topics > 1 ? "s" : ""}, ${created.sources} source${created.sources > 1 ? "s" : ""}, ${created.indicators} indicateur${created.indicators > 1 ? "s" : ""}. La première collecte démarre.`,
      "info"
    );
    if (total > 0 && user.organizationId) await scheduleWatchRefresh(user.organizationId, "visit");
  } catch (error) {
    destination = withError(PAGE, errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** Depuis le panier : « écrire une newsletter à partir de ça », avec la cible choisie — le composer reçoit la matière et la cible d'un coup. */
export async function writeFromBasketAction(formData: FormData) {
  await requireUser();
  const targetId = String(formData.get("targetId") ?? "").trim();
  if (!targetId) {
    revalidatePath(PAGE);
    redirect(withError(`${PAGE}#panier`, "Choisis d'abord la cible à qui écrire."));
  }
  redirect(`/newsletters/new?cible=${encodeURIComponent(targetId)}&panier=1`);
}
