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

/** Les indicateurs périmés sont relus après la réponse (`after`) : une marge sur la durée de la fonction. */
export const maxDuration = 60;

const DESCRIPTION =
  "La source unique des chiffres que le composer a le droit de citer — chacun avec sa source et sa date. Les indicateurs de marché s'y copient tout seuls, datés et sourcés.";

export default async function FiguresPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; info?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title="Chiffres vérifiés" description={DESCRIPTION} />
        <EmptyState>
          Tu es en vue globale : choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir
          ses chiffres.
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
        title="Chiffres vérifiés"
        description={DESCRIPTION}
        actions={
          followedKeys.length > 0 ? (
            <form action={refreshIndicatorsAction}>
              <Button type="submit" variant="outline">
                <RefreshCw />
                Relire les indicateurs
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
          {followedKeys.length} indicateur{followedKeys.length > 1 ? "s" : ""} de marché suivi{followedKeys.length > 1 ? "s" : ""}
        </h2>
        {followedKeys.length === 0 ? (
          <EmptyState
            title="Aucun indicateur suivi pour l'instant"
            action={
              proposals.pack.length > 0 ? (
                <form action={followPackIndicatorsAction}>
                  <Button type="submit">
                    Suivre les {proposals.pack.length} indicateurs du métier « {pack.label} »
                  </Button>
                </form>
              ) : undefined
            }
          >
            Taux directeurs, OAT, taux d&apos;usure, inflation, indices des loyers et des prix : des chiffres officiels
            (BCE, Banque de France, INSEE, Eurostat), lus à la source, datés, et copiés dans tes chiffres vérifiés pour
            que le composer puisse les citer.
            {!chosen && (
              <>
                {" "}
                Aucun pack métier n&apos;est choisi : ce sont les indicateurs « Tout métier ».{" "}
                <Link href="/settings#pack-metier" className="underline underline-offset-2">
                  Choisir mon métier
                </Link>
                .
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
                  <span className="text-sm font-medium text-muted-foreground">{indicator.label}</span>
                  <p className="text-3xl font-semibold tracking-tight">{obs ? formatIndicatorValue(obs.valueText, indicator.unit) : "—"}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {obs
                      ? `${indicator.periodicity === "on_change" ? "depuis le" : indicator.periodicity === "daily" ? "au" : ""} ${formatPeriod(obs.period)}`.trim()
                      : status?.lastError
                        ? `Source muette (${status.lastError}) — aucune valeur encore lue.`
                        : "Pas encore lu — à la prochaine collecte."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <a href={indicator.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {indicator.sourceName} <ExternalLink className="inline size-3" />
                    </a>
                    {status?.lastOkAt && ` · lu ${formatRelativeTime(status.lastOkAt)}`}
                    {obs && status?.lastError && ` · source muette depuis (${status.lastError}) : dernière valeur conservée`}
                  </p>
                  <form action={unfollowIndicatorAction.bind(null, key)} className="pt-1">
                    <Button type="submit" variant="ghost" size="sm">
                      Ne plus suivre
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
        {followedKeys.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Chaque indicateur suivi est copié dans les chiffres vérifiés avec sa période et sa source, mis à jour par la
            collecte — jamais à la main. Une source muette laisse la dernière valeur affichée, avec sa date.
          </p>
        )}
      </section>

      {(proposals.pack.length > 0 || proposals.others.length > 0) && (
        <DetailsCard variant="archive" summary={`Autres indicateurs disponibles (${proposals.pack.length + proposals.others.length})`} flush>
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
          {internal.length} chiffre{internal.length > 1 ? "s" : ""} de l&apos;organisation
          {incomplete > 0 && <span className="text-muted-foreground"> · {incomplete} à compléter</span>}
        </h2>
        {internal.length === 0 ? (
          <EmptyState>
            Tes propres chiffres — dossiers financés, clients accompagnés, encours — avec leur source (toi) et la date à
            laquelle ils étaient vrais. Sans les deux, le composer ne les cite pas.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {internal.map((figure) => (
              <FigureRow key={figure.id} figure={figure} />
            ))}
          </ul>
        )}
        <DetailsCard summary="Ajouter un chiffre">
          <FigureForm action={createFigureAction} submitLabel="Ajouter le chiffre" />
        </DetailsCard>
        <p className="text-xs text-muted-foreground">
          Un chiffre sans source ou sans date est marqué « à compléter » et n&apos;est pas transmis au composer tant qu&apos;il
          l&apos;est — la règle « aucun chiffre sans sa date et sa source » vaut aussi pour les chiffres internes.
        </p>
      </section>
    </>
  );
}

function IndicatorProposal({ indicator, fromPack }: { indicator: MarketIndicator; fromPack: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0 flex flex-col">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {indicator.label}
          {fromPack && <Badge variant="secondary">Ton métier</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">
          {indicator.description} — {indicator.sourceName}.
        </span>
      </span>
      <form action={followIndicatorAction.bind(null, indicator.key)}>
        <Button type="submit" variant="outline" size="sm">
          Suivre
        </Button>
      </form>
    </li>
  );
}

function FigureRow({ figure }: { figure: VerifiedFigure }) {
  const complete = isFigureComplete(figure);
  return (
    <li id={`chiffre-${figure.id}`} className="flex flex-col gap-2 px-4 py-3 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex flex-col">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {figure.label}
            {!complete && <Badge variant="outline">À compléter</Badge>}
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
              "source manquante"
            )}
            {" · "}
            {figure.asOf ?? "date manquante"}
            {figure.updatedAt && ` · modifié le ${formatDate(figure.updatedAt)}`}
          </span>
        </span>
        <form action={deleteFigureAction.bind(null, figure.id)}>
          <Button type="submit" variant="ghost" size="sm">
            Supprimer
          </Button>
        </form>
      </div>
      <details className="group text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{complete ? "Modifier" : "Compléter"}</summary>
        <div className="pt-3">
          <FigureForm figure={figure} action={updateFigureAction.bind(null, figure.id)} submitLabel="Enregistrer le chiffre" />
        </div>
      </details>
    </li>
  );
}

function FigureForm({ figure, action, submitLabel }: { figure?: VerifiedFigure; action: (formData: FormData) => Promise<void>; submitLabel: string }) {
  const id = figure?.id ?? "new";
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Libellé" htmlFor={`figure-label-${id}`}>
          <Input id={`figure-label-${id}`} name="label" defaultValue={figure?.label ?? ""} required placeholder="Dossiers financés en 2025" />
        </Field>
        <Field label="Valeur, telle qu'elle se cite" htmlFor={`figure-value-${id}`} hint="Exactement comme elle doit apparaître : « 910 », « 95 % », « 680 M€ ».">
          <Input id={`figure-value-${id}`} name="value" defaultValue={figure?.value ?? ""} required placeholder="910" />
        </Field>
        <Field label="Source" htmlFor={`figure-source-${id}`} hint="Qui publie ce chiffre — ton cabinet pour une donnée interne.">
          <Input id={`figure-source-${id}`} name="sourceName" defaultValue={figure?.sourceName ?? ""} placeholder="Cabinet Dupont — bilan 2025" />
        </Field>
        <Field label="Lien de la source (facultatif)" htmlFor={`figure-url-${id}`}>
          <Input id={`figure-url-${id}`} name="sourceUrl" defaultValue={figure?.sourceUrl ?? ""} placeholder="https://…" />
        </Field>
        <Field label="Date ou période, telle qu'on la cite" htmlFor={`figure-asof-${id}`} hint="« 2025 », « juin 2026 », « au 30 juin 2026 »…">
          <Input id={`figure-asof-${id}`} name="asOf" defaultValue={figure?.asOf ?? ""} placeholder="2025" />
        </Field>
        <Field label="Premier jour de la période (pour trier, facultatif)" htmlFor={`figure-asofdate-${id}`}>
          <Input id={`figure-asofdate-${id}`} name="asOfDate" type="date" defaultValue={figure?.asOfDate ?? ""} className="w-fit" />
        </Field>
      </div>
      <Button type="submit" variant={figure ? "outline" : "default"} className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
