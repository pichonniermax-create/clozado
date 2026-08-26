/**
 * Retour d'une action serveur vers l'écran appelant, l'erreur éventuelle
 * en paramètre d'URL montrée une fois : se tromper dans un formulaire n'est
 * pas une panne, on ne bascule pas sur un écran d'erreur. Partagé par les
 * modules tâches, interactions et contacts.
 */

export function withError(backTo: string, message: string, param = "erreur"): string {
  // Le paramètre se place AVANT l'ancre : « /veille#sources?info=… » mettrait
  // la question dans le fragment, que le serveur ne voit jamais — vu au
  // navigateur sur la veille (message d'ajout d'une source jamais affiché).
  const [path, hash] = backTo.split("#", 2);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${param}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "L'opération a échoué de notre côté — réessaie.";
}
