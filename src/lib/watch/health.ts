import type { WatchSource } from "@/db/schema";
import { sourceDueAt } from "@/db/queries/watch";
import type { TranslatorOf } from "@/i18n/translator";
import type { Formats } from "@/lib/format";

export type SourceHealth = { text: string; tone: "ok" | "warning" | "asleep" | "never" };

/**
 * La SANTÉ d'une source ou d'un concurrent, en une phrase : « lue il y a
 * 2 h », « injoignable depuis le … (cause) — nouvel essai dans 6 h », « en
 * sommeil depuis le … ». Partagée par l'écran de la veille et celui des
 * concurrents — une seule lecture des mêmes colonnes.
 */
export function sourceHealth(source: WatchSource, t: TranslatorOf<"watch.page">, fmt: Formats): SourceHealth {
  if (source.asleepAt) {
    return { text: t("en_sommeil_depuis_le_trente_jours_f5f9", { formatDate: fmt.date(source.asleepAt), n: source.lastError ?? t("cause_inconnue") }), tone: "asleep" };
  }
  if (source.lastError) {
    const since = source.lastOkAt ?? source.createdAt;
    const due = sourceDueAt(source);
    return {
      text: t("injoignable_depuis_le", { formatDate: fmt.date(since), lastError: source.lastError, value: due ? t("nouvel_essai", { replace: fmt.relative(due) }) : "" }),
      tone: "warning",
    };
  }
  // « Lue » pour une source, « Lu » pour un concurrent : le français accorde, les clés existent en deux genres.
  const competitor = source.kind === "competitor";
  if (source.lastOkAt) return { text: t(competitor ? "lu" : "lue", { formatRelativeTime: fmt.relative(source.lastOkAt) }), tone: "ok" };
  return { text: t(competitor ? "pas_encore_lu" : "pas_encore_lue"), tone: "never" };
}
