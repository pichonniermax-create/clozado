import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Banknote, Briefcase, Download, Funnel, Handshake, Percent, Timer, TrendingDown } from "lucide-react";
import { statNotes } from "@/components/analytics/duration-table";
import { StatTile } from "@/components/stat-tile";
import { buttonVariants } from "@/components/ui/button";
import { getFormats } from "@/i18n/formats";
import {
  dashboardIndicators,
  metricQueryString,
  PERIOD_PRESETS,
  periodPhrase,
  resolveBusinessPack,
  type DashboardIndicator,
  type ParsedMetricFilters,
} from "@/lib/metrics";
import type { OrgScopeUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import type { TranslatorOf } from "@/i18n/translator";
import type { Formats } from "@/lib/format";

/**
 * Les indicateurs du tableau de bord — ceux du pack métier de
 * l'organisation, dans son ordre, rien d'autre : ce composant parcourt la
 * liste du pack, il ne sait pas quel pack il affiche. Une tuile par
 * indicateur, la même tuile que le reste du tableau de bord ; une valeur
 * masquée (sous le seuil) s'écrit « — » et la note dit ce qui manque ; un
 * montant dont rien n'est connu s'écrit « — », jamais 0 €. Chaque tuile
 * ouvre l'écran analytique qui la détaille, avec la même période.
 */
const FAMILY_ICON: Record<string, ReactNode> = {
  volumes: <Briefcase />,
  delays: <Timer />,
  losses: <TrendingDown />,
  funnel: <Funnel />,
  partners: <Handshake />,
};


/** Valeur, note et icône d'une tuile — la règle d'affichage par unité, en un seul endroit. */
function tileOf({ metric, value, periodApplies }: DashboardIndicator, t: TranslatorOf<"dashboard.packIndicators">, tm: TranslatorOf<"metrics">, td: TranslatorOf<"analytics.durationTable">, fmt: Formats): { value: string | number; hint: string; icon: ReactNode } {
  const today = periodApplies ? undefined : t("a_aujourd_hui");
  const icon = metric.unit === "euros" ? <Banknote /> : metric.unit === "ratio" ? <Percent /> : (FAMILY_ICON[metric.family] ?? <Briefcase />);
  switch (value.kind) {
    case "count":
      return { value: value.n, hint: [value.detail, today].filter(Boolean).join(" · ") || tm(`definitions.${metric.id}.label`), icon };
    case "euros": {
      const { money } = value;
      const unknown = money.n > 0 && money.withoutAmount === money.n;
      const parts = [value.countPhrase, money.withoutAmount > 0 ? t("sans_montant", { withoutAmount: money.withoutAmount }) : null, value.detail, today];
      return { value: unknown ? "—" : (fmt.money(money.amount) ?? "—"), hint: parts.filter(Boolean).join(" · "), icon };
    }
    case "days": {
      const { stat } = value;
      if (stat.hidden || stat.medianDays === null || stat.meanDays === null) {
        return { value: "—", hint: statNotes(stat, td) ?? "", icon };
      }
      return { value: fmt.duration(stat.medianDays), hint: t("mediane_moyenne_observation_observations", { formatDuration: fmt.duration(stat.meanDays), n: stat.n }), icon };
    }
    case "ratio": {
      const { rate } = value;
      if (rate.hidden || rate.percent === null) {
        return { value: "—", hint: t("masque_il_manque_observation_observations_pour_dc5a", { missing: rate.missing }), icon };
      }
      return { value: fmt.rate(rate.percent), hint: [value.detail, today].filter(Boolean).join(" · "), icon };
    }
    case "unavailable":
      return { value: "—", hint: value.reason, icon };
  }
}

export async function PackIndicators({ user, businessPack, parsed }: { user: OrgScopeUser; businessPack: string | null; parsed: ParsedMetricFilters }) {
  const t = await getTranslations("dashboard.packIndicators");
  const tm = await getTranslations("metrics");
  const td = await getTranslations("analytics.durationTable");
  const fmt = await getFormats();
  const { pack, chosen } = resolveBusinessPack(businessPack);
  const indicators = await dashboardIndicators(user, pack.indicators, parsed.filters, parsed.params, tm, fmt);
  const period = periodPhrase(parsed, tm, fmt);

  return (
    <section className="flex flex-col gap-3" aria-label={t("indicateurs_du_pack_metier")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("indicateurs", { label: tm(`packs.${pack.key}.label`) })}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-lg border border-border p-0.5" aria-label={t("periode_des_indicateurs")}>
            {PERIOD_PRESETS.map((p) => (
              <Link
                key={p.key}
                href={`/dashboard?periode=${p.key}`}
                aria-current={parsed.period === p.key ? "true" : undefined}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs transition-colors",
                  parsed.period === p.key ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tm(`periods.${p.key}`)}
              </Link>
            ))}
          </div>
          <a
            href={`/api/analytique/export${metricQueryString<Record<string, string | undefined>>(parsed.params, { vue: "tableau-de-bord" })}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            title={t("telecharger_ces_indicateurs_avec_leur_periode_48ad")}
          >
            <Download />
            {t("csv")}
          </a>
          <Link href={`/analytique/funnel${metricQueryString(parsed.params)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t("tout_l_analytique")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground text-pretty">
        {chosen ? (
          <>{t("les_indicateurs_de_ton_pack_metier_e09e", { period })} </>
        ) : (
          <>
            {t("aucun_pack_metier_choisi_voici_le_6aac", { label: tm(`packs.${pack.key}.label`), period })}
          </>
        )}
        {t.rich("marque_reglages", { link: (chunks) => <Link href="/settings#pack-metier" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {indicators.map((indicator) => {
          const tile = tileOf(indicator, t, tm, td, fmt);
          return <StatTile key={indicator.id} label={tm(`definitions.${indicator.metric.id}.label`)} value={tile.value} hint={tile.hint} icon={tile.icon} href={indicator.href} />;
        })}
      </div>
    </section>
  );
}
