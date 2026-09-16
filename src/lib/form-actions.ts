import { getTranslations } from "next-intl/server";
import { isAppError } from "@/lib/errors";

/**
 * Retour d'une action serveur vers l'écran appelant, l'erreur éventuelle
 * en paramètre d'URL montrée une fois : se tromper dans un formulaire n'est
 * pas une panne, on ne bascule pas sur un écran d'erreur. Partagé par
 * tous les modules.
 */

export function withError(backTo: string, message: string, param = "erreur"): string {
  // Le paramètre se place AVANT l'ancre : « /veille#sources?info=… » mettrait
  // la question dans le fragment, que le serveur ne voit jamais — vu au
  // navigateur sur la veille (message d'ajout d'une source jamais affiché).
  const [path, hash] = backTo.split("#", 2);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${param}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`;
}

/**
 * La phrase à montrer pour une erreur attrapée par une action : la clé
 * d'une `AppError` traduite dans la langue de la personne ; le message
 * générique pour tout le reste — une exception technique ne s'affiche
 * jamais telle quelle.
 */
export async function errorMessage(error: unknown): Promise<string> {
  const t = await getTranslations("errors");
  if (isAppError(error)) {
    // La clé est dynamique par construction : le typage des messages ne peut pas la connaître.
    return t(error.key as never, error.values as never);
  }
  return t("common.generic");
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Une action serveur appelée depuis un composant CLIENT rend son échec — la
 * phrase traduite — au lieu de le lever : levée, une `AppError` arrivait au
 * navigateur avec sa CLÉ pour message (« cette_etape_appartient_a_un_autre_
 * pipeline_9d7d » sur le kanban — stabilisation, E3).
 */
export async function actionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: await errorMessage(error) };
  }
}
