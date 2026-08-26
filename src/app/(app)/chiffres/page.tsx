import Link from "next/link";
import { after } from "next/server";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  getIndicatorStatuses,
  getLatestObservations,
  isFigureComplete,
  listFollowedIndicatorKeys,
  listVerifiedFigures,
  proposedIndicators,
} from "@/db/queries/market";
import { getOwnOrganization } from "@/db/queries/organizations";
import type { VerifiedFigure } from "@/db/schema";
import { createFigureAction, deleteFigureAction, followIndicatorAction, followPackIndicatorsAction, refreshIndicatorsAction, unfollowIndicatorAction, updateFigureAction } from "@/lib/figures/actions";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { resolveBusinessPack } from "@/lib/metrics/packs";
import { requireUser } from "@/lib/session";
import { formatIndicatorValue, getIndicator, type MarketIndicator } from "@/lib/watch/indicators";
import { formatPeriod } from "@/lib/watch/periods";
import { refreshOrganizationIndicators } from "@/lib/watch/refresh";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

/** Les indicateurs périmés sont relus après la réponse (`after`) : une marge sur la durée de la fonction. */
export const maxDuration = 60;

export default async function FiguresPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; info?: string }>;
}) {
  const t = await getTranslations("figures.page");
  const tf = await getTranslations("figures");
  const tm = await getTranslations("metrics");
  const user = await requireUser();
  const params = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title={t("chiffres_verifies")} description={t("description")} />
        <EmptyState>
          {t("tu_es_en_vue_globale_choisis_d645")}
        </EmptyState>
      </>
    );
  }
  const organizationId = user.organizationId;

  const [org, figures, followedKeys] = await Promise.all([
    getOwnOrganization(user),
    listVerifiedFigures(user),
    listFollowedIndicatorKeys(organizationId),
  ]);
  const [observations, statuses] = await Promise.all([getLatestObservations(followedKeys), getIndicatorStatuses(followedKeys)]);

  // À la visite : ce qui a plus de vingt heures est relu après la réponse —
  // la page rend la dernière observation connue, avec sa date.
  if (followedKeys.length > 0) {
    after(async () => {
      await refreshOrganizationIndicators(organizationId).catch(() => undefined);
    });
  }

  const { pack, chosen } = resolveBusinessPack(org?.businessPack);
  const proposals = proposedIndicators(followedKeys, pack.watch.indicators);
  const internal = figures.filter((f) => !f.indicatorKey);
  const incomplete = internal.filter((f) => !isFigureComplete(f)).length;

  return (
    <>
      <PageHeader
        title={t("chiffres_verifies")}
        description={t("description")}
        actions={
          followedKeys.length > 0 ? (
            <form action={refreshIndicatorsAction}>
              <Button type="submit" variant="outline">
                <RefreshCw />
                {t("relire_les_indicateurs")}
              </Button>
            </form>
          ) : undefined
        }
      />

      {params.erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{params.erreur}</p>
      )}
      {params.info && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{params.info}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tabular-nums">
          {t("indicateur_indicateurs_de_marche_suivi_suivis", { count: followedKeys.length })}
        </h2>
        {followedKeys.length === 0 ? (
          <EmptyState
            title={t("aucun_indicateur_suivi_pour_l_instant")}
            action={
              proposals.pack.length > 0 ? (
                <form action={followPackIndicatorsAction}>
                  <Button type="submit">
                    {t("suivre_les_indicateurs_du_metier", { count: proposals.pack.length, label: tm(`packs.${pack.key}.label`) })}
                  </Button>
                </form>
              ) : undefined
            }
          >
            {t("taux_directeurs_oat_taux_d_usure_0d21")}
            {!chosen && (
              <>
                {t.rich("aucun_pack_metier_n_est_choisi_757c", { link: (chunks) => <Link href="/settings#pack-metier" className="underline underline-offset-2">{chunks}</Link> })}
              </>
            )}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {followedKeys.map((key) => {
              const indicator = getIndicator(key);
              if (!indicator) return null;
              const obs = observations.get(key);
              const status = statuses.get(key);
              return (
                <div key={key} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 shadow-xs">
                  <span className="text-sm font-medium text-muted-foreground">{tf(`indicators.${indicator.key}.label`)}</span>
                  <p className="text-3xl font-semibold tracking-tight">{obs ? formatIndicatorValue(obs.valueText, indicator.unit) : "—"}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {obs
                      ? `${indicator.periodicity === "on_change" ? "depuis le" : indicator.periodicity === "daily" ? "au" : ""} ${formatPeriod(obs.period, tf)}`.trim()
                      : status?.lastError
                        ? t("source_muette_aucune_valeur_encore_lue", { lastError: status.lastError })
                        : t("pas_encore_lu_a_la_prochaine_a1d1")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <a href={indicator.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {tf(`indicators.${indicator.key}.sourceName`)} <ExternalLink className="inline size-3" />
                    </a>
                    {status?.lastOkAt && t("lu", { formatRelativeTime: formatRelativeTime(status.lastOkAt) })}
                    {obs && status?.lastError && t("source_muette_depuis_derniere_valeur_conservee", { lastError: status.lastError })}
                  </p>
                  <form action={unfollowIndicatorAction.bind(null, key)} className="pt-1">
                    <Button type="submit" variant="ghost" size="sm">
                      {t("ne_plus_suivre")}
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
        {followedKeys.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("chaque_indicateur_suivi_est_copie_dans_659c")}
          </p>
        )}
      </section>

      {(proposals.pack.length > 0 || proposals.others.length > 0) && (
        <DetailsCard variant="archive" summary={t("autres_indicateurs_disponibles", { n: proposals.pack.length + proposals.others.length })} flush>
          <ul className="divide-y divide-border">
            {[...proposals.pack.map((i) => ({ indicator: i, pack: true })), ...proposals.others.map((i) => ({ indicator: i, pack: false }))].map(
              ({ indicator, pack: fromPack }) => (
                <IndicatorProposal key={indicator.key} indicator={indicator} fromPack={fromPack} />
              )
            )}
          </ul>
        </DetailsCard>
      )}

      <section id="chiffres" className="flex flex-col gap-3 scroll-mt-24">
        <h2 className="text-sm font-semibold tabular-nums">
          {t("chiffre_chiffres_de_l_organisation", { count: internal.length })}
          {incomplete > 0 && <span className="text-muted-foreground"> {t("a_completer", { incomplete })}</span>}
        </h2>
        {internal.length === 0 ? (
          <EmptyState>
            {t("tes_propres_chiffres_dossiers_finances_clients_673b")}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {internal.map((figure) => (
              <FigureRow key={figure.id} figure={figure} />
            ))}
          </ul>
        )}
        <DetailsCard summary={t("ajouter_un_chiffre")}>
          <FigureForm action={createFigureAction} submitLabel={t("ajouter_le_chiffre")} />
        </DetailsCard>
        <p className="text-xs text-muted-foreground">
          {t("un_chiffre_sans_source_ou_sans_0ada")}
        </p>
      </section>
    </>
  );
}

function IndicatorProposal({ indicator, fromPack }: { indicator: MarketIndicator; fromPack: boolean }) {
  const t = useTranslations("figures.page");
  const tf = useTranslations("figures");
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0 flex flex-col">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {tf(`indicators.${indicator.key}.label`)}
          {fromPack && <Badge variant="secondary">{t("ton_metier")}</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">
          {tf(`indicators.${indicator.key}.description`)} — {tf(`indicators.${indicator.key}.sourceName`)}.
        </span>
      </span>
      <form action={followIndicatorAction.bind(null, indicator.key)}>
        <Button type="submit" variant="outline" size="sm">
          {t("suivre")}
        </Button>
      </form>
    </li>
  );
}

function FigureRow({ figure }: { figure: VerifiedFigure }) {
  const t = useTranslations("figures.page");
  const complete = isFigureComplete(figure);
  return (
    <li id={`chiffre-${figure.id}`} className="flex flex-col gap-2 px-4 py-3 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex flex-col">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {figure.label}
            {!complete && <Badge variant="outline">{t("a_completer_b061")}</Badge>}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{figure.value}</span>
            {" · "}
            {figure.sourceName ? (
              figure.sourceUrl ? (
                <a href={figure.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {figure.sourceName}
                </a>
              ) : (
                figure.sourceName
              )
            ) : (
              t("source_manquante")
            )}
            {" · "}
            {figure.asOf ?? t("date_manquante")}
            {figure.updatedAt && t("modifie_le", { formatDate: formatDate(figure.updatedAt) })}
          </span>
        </span>
        <form action={deleteFigureAction.bind(null, figure.id)}>
          <Button type="submit" variant="ghost" size="sm">
            {t("supprimer")}
          </Button>
        </form>
      </div>
      <details className="group text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{complete ? t("modifier") : t("completer")}</summary>
        <div className="pt-3">
          <FigureForm figure={figure} action={updateFigureAction.bind(null, figure.id)} submitLabel={t("enregistrer_le_chiffre")} />
        </div>
      </details>
    </li>
  );
}

function FigureForm({ figure, action, submitLabel }: { figure?: VerifiedFigure; action: (formData: FormData) => Promise<void>; submitLabel: string }) {
  const t = useTranslations("figures.page");
  const id = figure?.id ?? "new";
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("libelle")} htmlFor={`figure-label-${id}`}>
          <Input id={`figure-label-${id}`} name="label" defaultValue={figure?.label ?? ""} required placeholder={t("dossiers_finances_en_2025")} />
        </Field>
        <Field label={t("valeur_telle_qu_elle_se_cite")} htmlFor={`figure-value-${id}`} hint={t("exactement_comme_elle_doit_apparaitre_910_b9bb")}>
          <Input id={`figure-value-${id}`} name="value" defaultValue={figure?.value ?? ""} required placeholder="910" />
        </Field>
        <Field label={t("source")} htmlFor={`figure-source-${id}`} hint={t("qui_publie_ce_chiffre_ton_cabinet_be41")}>
          <Input id={`figure-source-${id}`} name="sourceName" defaultValue={figure?.sourceName ?? ""} placeholder={t("cabinet_dupont_bilan_2025")} />
        </Field>
        <Field label={t("lien_de_la_source_facultatif")} htmlFor={`figure-url-${id}`}>
          <Input id={`figure-url-${id}`} name="sourceUrl" defaultValue={figure?.sourceUrl ?? ""} placeholder={t("https")} />
        </Field>
        <Field label={t("date_ou_periode_telle_qu_on_affe")} htmlFor={`figure-asof-${id}`} hint={t("n_2025_juin_2026_au_30_juin_60fc")}>
          <Input id={`figure-asof-${id}`} name="asOf" defaultValue={figure?.asOf ?? ""} placeholder="2025" />
        </Field>
        <Field label={t("premier_jour_de_la_periode_pour_9b63")} htmlFor={`figure-asofdate-${id}`}>
          <Input id={`figure-asofdate-${id}`} name="asOfDate" type="date" defaultValue={figure?.asOfDate ?? ""} className="w-fit" />
        </Field>
      </div>
      <Button type="submit" variant={figure ? "outline" : "default"} className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
