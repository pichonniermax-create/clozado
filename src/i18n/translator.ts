import { createTranslator, type Messages, type NamespaceKeys, type NestedKeyOf } from "next-intl";
import type { AppLocale } from "./locales";
import { loadMessages } from "./messages";

/** Un namespace des messages (« metrics », « targets », « templates »…). */
export type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/**
 * Le traducteur d'un namespace — le type que reçoit une fonction pure à qui
 * l'appelant passe le sien (`describeCriteria(criteria, options, t)`,
 * `exportTables(…, t)`) : la fonction ne sait pas d'où vient la langue.
 */
export type TranslatorOf<NS extends Namespace> = ReturnType<typeof createTranslator<Messages, NS>>;

/**
 * Un traducteur HORS requête — une tâche générée par le suivi, un gabarit
 * instancié en lignes de l'organisation, un email, une collecte lancée par
 * le cron : la langue est DONNÉE (celle de l'organisation, du destinataire),
 * jamais déduite d'une requête qui n'existe pas.
 */
export async function translatorFor<NS extends Namespace>(locale: AppLocale, namespace: NS): Promise<TranslatorOf<NS>> {
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages, namespace });
}
