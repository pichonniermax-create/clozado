import { formatDate } from "@/lib/format";
import { PERIOD_PRESETS, type ParsedMetricFilters } from "./search-params";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * La période d'une vue analytique, en mots — la même phrase sur le funnel,
 * dans le bandeau de sélection de la liste des affaires et, demain, dans
 * l'export : « depuis le début », « sur les 90 derniers jours », « du
 * 1 juin 2026 au 30 juin 2026 inclus ».
 */
export function periodPhrase(parsed: ParsedMetricFilters, t: TranslatorOf<"metrics">): string {
  if (parsed.period === "perso") {
    const du = parsed.params.du ? `du ${formatDate(`${parsed.params.du}T12:00:00Z`)}` : "";
    const au = parsed.params.au ? `au ${formatDate(`${parsed.params.au}T12:00:00Z`)} inclus` : "";
    return [du, au].filter(Boolean).join(" ") || t("periodPhrase.depuis_le_debut");
  }
  if (parsed.period === "tout") return t("periodPhrase.depuis_le_debut");
  const preset = PERIOD_PRESETS.find((p) => p.key === parsed.period);
  return preset ? t("periodPhrase.sur_les", { toLowerCase: t(`periods.${preset.key}`).toLowerCase() }) : t("periodPhrase.depuis_le_debut");
}
