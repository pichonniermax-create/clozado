/**
 * Retour d'une action serveur vers l'écran appelant, l'erreur éventuelle
 * en paramètre d'URL montrée une fois : se tromper dans un formulaire n'est
 * pas une panne, on ne bascule pas sur un écran d'erreur. Partagé par les
 * modules tâches, interactions et contacts.
 */

export function withError(backTo: string, message: string, param = "erreur"): string {
  const separator = backTo.includes("?") ? "&" : "?";
  return `${backTo}${separator}${param}=${encodeURIComponent(message)}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "L'opération a échoué de notre côté — réessaie.";
}
