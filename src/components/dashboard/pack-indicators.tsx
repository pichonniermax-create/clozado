import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Banknote, Briefcase, Download, Funnel, Handshake, Percent, Timer, TrendingDown } from "lucide-react";
import { statNotes } from "@/components/analytics/duration-table";
import { StatTile } from "@/components/stat-tile";
import { buttonVariants } from "@/components/ui/button";
import { formatDuration, formatEuros, formatRate } from "@/lib/format";
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

function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/** Valeur, note et icône d'une tuile — la règle d'affichage par unité, en un seul endroit. */
function tileOf({ metric, value, periodApplies }: DashboardIndicator): { value: string | number; hint: string; icon: ReactNode } {
  const today = periodApplies ? undefined : "à aujourd'hui";
  const icon = metric.unit === "euros" ? <Banknote /> : metric.unit === "ratio" ? <Percent /> : (FAMILY_ICON[metric.family] ?? <Briefcase />);
  switch (value.kind) {
    case "count":
      return { value: value.n, hint: [value.detail, today].filter(Boolean).join(" · ") || metric.label, icon };
    case "euros": {
      const { money, countWord } = value;
      const unknown = money.n > 0 && money.withoutAmount === money.n;
      const parts = [plural(money.n, countWord[0], countWord[1]), money.withoutAmount > 0 ? `${money.withoutAmount} sans montant` : null, value.detail, today];
      return { value: unknown ? "—" : (formatEuros(money.amount) ?? "—"), hint: parts.filter(Boolean).join(" · "), icon };
    }
    case "days": {
      const { stat } = value;
      if (stat.hidden || stat.medianDays === null || stat.meanDays === null) {
        return { value: "—", hint: statNotes(stat) ?? "", icon };
      }
      return { value: formatDuration(stat.medianDays), hint: `médiane · moyenne ${formatDuration(stat.meanDays)} · ${plural(stat.n, "observation")}`, icon };
    }
    case "ratio": {
      const { rate } = value;
      if (rate.hidden || rate.percent === null) {
        return { value: "—", hint: `masqué : il manque ${plural(rate.missing, "observation")} pour afficher un taux`, icon };
      }
      return { value: formatRate(rate.percent), hint: [value.detail, today].filter(Boolean).join(" · "), icon };
    }
    case "unavailable":
      return { value: "—", hint: value.reason, icon };
  }
}

export async function PackIndicators({ user, businessPack, parsed }: { user: OrgScopeUser; businessPack: string | null; parsed: ParsedMetricFilters }) {
  const { pack, chosen } = resolveBusinessPack(businessPack);
  const indicators = await dashboardIndicators(user, pack.indicators, parsed.filters, parsed.params);
  const period = periodPhrase(parsed);

  return (
    <section className="flex flex-col gap-3" aria-label="Indicateurs du pack métier">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Indicateurs — {pack.label}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-lg border border-border p-0.5" aria-label="Période des indicateurs">
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
                {p.label}
              </Link>
            ))}
          </div>
          <a
            href={`/api/analytique/export${metricQueryString<Record<string, string | undefined>>(parsed.params, { vue: "tableau-de-bord" })}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            title="Télécharger ces indicateurs, avec leur période, en CSV (Excel)"
          >
            <Download />
            CSV
          </a>
          <Link href={`/analytique/funnel${metricQueryString(parsed.params)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            Tout l&apos;analytique
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground text-pretty">
        {chosen ? (
          <>Les indicateurs de ton pack métier, {period} ; les encours sont à aujourd&apos;hui. Une tuile « — » dit ce qui lui manque. Le pack se change dans </>
        ) : (
          <>
            Aucun pack métier choisi : voici le pack « {pack.label} », {period}. Un CGP suit ses encours et sa collecte, un courtier ses volumes et ses
            délais — choisis le tien dans{" "}
          </>
        )}
        <Link href="/settings#pack-metier" className="underline underline-offset-2 hover:text-foreground">
          Marque &amp; réglages
        </Link>
        .
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {indicators.map((indicator) => {
          const tile = tileOf(indicator);
          return <StatTile key={indicator.id} label={indicator.metric.label} value={tile.value} hint={tile.hint} icon={tile.icon} href={indicator.href} />;
        })}
      </div>
    </section>
  );
}
