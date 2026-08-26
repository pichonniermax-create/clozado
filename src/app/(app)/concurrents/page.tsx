import { use } from "react";
import Link from "next/link";
import { ExternalLink, Newspaper, Radar, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { RefreshWhileRunning } from "@/components/watch/refresh-while-running";
import { countMembersByTarget, listMailTargets } from "@/db/queries/mail-targets";
import {
  getLatestFinishedRun,
  getRunningRun,
  isWatchStale,
  listCompetitorArticles,
  listTreatedSubjects,
  listWatchSources,
  WATCH_MAX_ITEM_AGE_DAYS,
} from "@/db/queries/watch";
import type { WatchRun, WatchSource } from "@/db/schema";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import {
  archiveCompetitorAction,
  createCompetitorAction,
  refreshCompetitorsAction,
  restoreCompetitorAction,
  retryCompetitorAction,
  writeFromGapAction,
} from "@/lib/watch/actions";
import { SOURCE_COUNTRY_CODES } from "@/lib/watch/countries";
import {
  competitorStats,
  computeContentGap,
  GAP_WINDOW_DAYS,
  isCompetitorAngle,
  type CompetitorArticle,
  type CompetitorStats,
  type ContentGap,
  type GapRow,
} from "@/lib/watch/gap";
import { sourceHealth } from "@/lib/watch/health";
import { scheduleWatchRefresh } from "@/lib/watch/schedule";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

/**
 * La collecte lancée à la visite s'exécute après la réponse : la fonction
 * reste en vie le temps de son budget (120 s) et d'une marge. Ici, un
 * concurrent ajouté pendant une collecte attend sa fin (100 s au plus,
 * `scheduleWatchRefresh(…, { queue: true })`) AVANT de lancer la sienne :
 * 100 + 120 s, plus la marge.
 */
export const maxDuration = 240;

const SELECT_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

type TargetOption = { id: string; label: string; count: number };

/**
 * LES CONCURRENTS ET L'ÉCART DE CONTENU (chantier ciblage et contenu,
 * étape 5). L'écart d'abord — c'est le produit : « trois de tes
 * concurrents ont traité le rachat de crédit ce mois-ci, tu ne l'as pas
 * fait » — puis les concurrents eux-mêmes : ce qu'ils publient (fréquence,
 * sujets, angles), leur santé, ce qu'on sait d'eux. Tout ce qui s'affiche
 * ici vient de titres publics classés ; aucune page de concurrent n'est lue.
 */
export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; info?: string }>;
}) {
  const tr = await getTranslations("watch.competitors");
  const tp = await getTranslations("watch.page");
  const user = await requireUser();
  const params = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title={tr("concurrents")} description={tr("description")} />
        <EmptyState>{tr("tu_es_en_vue_globale_choisis_1f0a")}</EmptyState>
      </>
    );
  }
  const organizationId = user.organizationId;

  const [competitors, articles, treated, latestFinished, alreadyRunning, targets] = await Promise.all([
    listWatchSources(organizationId, { kind: "competitor", includeArchived: true }),
    listCompetitorArticles(organizationId),
    listTreatedSubjects(organizationId, { days: GAP_WINDOW_DAYS }),
    getLatestFinishedRun(organizationId),
    getRunningRun(organizationId),
    listMailTargets(user),
  ]);
  const counts = await countMembersByTarget(targets);
  const active = competitors.filter((c) => !c.archivedAt);
  const archived = competitors.filter((c) => c.archivedAt);

  // À la visite : la même collecte que la veille (elle couvre les deux
  // écrans) quand elle a plus de 24 h — démarrée maintenant, exécutée après
  // la réponse ; la page se rafraîchit d'elle-même.
  let running: WatchRun | null = alreadyRunning;
  if (active.length > 0 && !running && isWatchStale(latestFinished)) {
    try {
      const start = await scheduleWatchRefresh(organizationId, "visit");
      if (start.status === "started" || start.status === "running") running = start.run;
    } catch {
      running = null;
    }
  }

  const gap = computeContentGap(articles, treated);
  const stats = competitorStats(active, articles);
  const targetOptions: TargetOption[] = targets.map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 }));

  return (
    <>
      <PageHeader
        title={tr("concurrents")}
        description={tr("description")}
        actions={
          <>
            <Link href="/veille" className={buttonVariants({ variant: "ghost" })}>
              <Newspaper />
              {tp("veille")}
            </Link>
            <form action={refreshCompetitorsAction}>
              <Button type="submit" variant="outline" disabled={active.length === 0 || Boolean(running)}>
                <RefreshCw />
                {running ? tp("collecte_en_cours") : tp("actualiser_maintenant")}
              </Button>
            </form>
          </>
        }
      />

      <RefreshWhileRunning active={Boolean(running)} />

      {params.erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{params.erreur}</p>
      )}
      {params.info && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{params.info}</p>}

      {active.length > 0 && (
        <Status
          running={running}
          latestFinished={latestFinished}
          total={articles.length}
          classified={articles.filter((a) => a.classified).length}
          pending={articles.filter((a) => a.pending).length}
        />
      )}

      {active.length === 0 ? (
        <EmptyState
          title={tr("aucun_concurrent_pour_l_instant")}
          action={
            <a href="#ajouter" className={buttonVariants()}>
              {tr("ajouter_un_concurrent")}
            </a>
          }
        >
          {tr("declare_les_concurrents_dont_tu_veux_5b1e")}
        </EmptyState>
      ) : (
        <GapSection gap={gap} targets={targetOptions} />
      )}

      <CompetitorsSection competitors={active} stats={stats} articles={articles} />

      {gap.covered.length > 0 && <CoveredSection rows={gap.covered} />}

      {archived.length > 0 && (
        <DetailsCard variant="archive" summary={tr("concurrents_desactives", { count: archived.length })} flush>
          <ul className="divide-y divide-border">
            {archived.map((competitor) => (
              <li key={competitor.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">{competitor.label}</span>
                <form action={restoreCompetitorAction.bind(null, competitor.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    {tp("reactiver")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </DetailsCard>
      )}

      <p className="text-xs text-muted-foreground">{tr("rien_du_contenu_de_tes_concurrents_0d4e")}</p>
    </>
  );
}

function Status({
  running,
  latestFinished,
  total,
  classified,
  pending,
}: {
  running: WatchRun | null;
  latestFinished: WatchRun | null;
  total: number;
  classified: number;
  pending: number;
}) {
  const tr = useTranslations("watch.competitors");
  const tp = useTranslations("watch.page");
  const fmt = use(getFormats());
  if (running) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {tp("collecte_en_cours_demarree_les_nouveautes_2443", { formatRelativeTime: fmt.relative(running.startedAt) })}
      </p>
    );
  }
  const known = tr("article_articles_de_concurrents_connu_connus_2d6b", { count: total, classified, pending });
  return (
    <p className="text-sm tabular-nums text-muted-foreground">
      {latestFinished?.finishedAt ? tr("derniere_collecte", { formatRelativeTime: fmt.relative(latestFinished.finishedAt) }) : tp("aucune_collecte_terminee_pour_l_instant")} {known}
    </p>
  );
}

function GapSection({ gap, targets }: { gap: ContentGap; targets: TargetOption[] }) {
  const tr = useTranslations("watch.competitors");
  const tp = useTranslations("watch.page");
  const compared = gap.gaps.length + gap.covered.length;
  return (
    <section id="ecart" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft p-4 scroll-mt-24">
      <h2 className="flex items-center gap-2 text-sm font-semibold tabular-nums">
        <Radar className="size-4" />
        {tr("ecart_de_contenu_derniers_jours", { days: gap.days })}
      </h2>
      {gap.gaps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {compared === 0 ? tr("rien_a_comparer_pour_l_instant_aucun_7c31", { days: gap.days }) : tr("aucun_ecart_tout_ce_que_tes_ea2d", { days: gap.days })}
        </p>
      ) : (
        <form action={writeFromGapAction} className="flex flex-col gap-3">
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tp.rich("il_faut_une_cible_pour_ecrire_ac2e", { link: (chunks) => <Link href="/cibles" className="underline underline-offset-2">{chunks}</Link> })}
            </p>
          ) : (
            <Field label={tp("pour_quelle_cible")} htmlFor="gap-target">
              <select id="gap-target" name="targetId" className={SELECT_CLASS} defaultValue={targets[0]?.id} required>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tp("contact_contacts", { label: t.label, count: t.count })}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <ul className="flex flex-col gap-2">
            {gap.gaps.map((row) => (
              <GapRowItem key={row.key} row={row} canWrite={targets.length > 0} />
            ))}
          </ul>
        </form>
      )}
    </section>
  );
}

function GapRowItem({ row, canWrite }: { row: GapRow; canWrite: boolean }) {
  const tr = useTranslations("watch.competitors");
  const ta = useTranslations("watch.angles");
  const fmt = use(getFormats());
  const draft = row.drafts[0];
  const meta = [
    fmt.list(row.competitors.map((c) => (c.articles > 1 ? tr("subject_count", { subject: c.label, count: c.articles }) : c.label))),
    row.angles.length > 0 ? tr("angles", { join: fmt.list(row.angles.map((a) => (a.count > 1 ? tr("angle_count", { angle: ta(a.angle), count: a.count }) : ta(a.angle)))) }) : null,
    row.latestAt ? tr("dernier_article_le", { formatDate: fmt.date(row.latestAt) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex flex-col gap-0.5">
          <p className="text-sm font-medium text-pretty">
            {tr("de_tes_concurrents_ont_traite_tu_a3f2", { count: row.competitors.length, subject: row.subject, articles: row.articles.length })}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">{meta}</p>
          {draft && (
            <p className="text-xs text-muted-foreground">
              {tr.rich("en_preparation_dans", { title: draft.newsletterTitle, link: (chunks) => <Link href={`/newsletters/${draft.newsletterId}`} className="underline underline-offset-2">{chunks}</Link> })}
            </p>
          )}
        </div>
        {canWrite && (
          <Button type="submit" name="subject" value={row.subject} variant="outline" size="sm">
            <Sparkles />
            {tr("ecrire_sur_ce_sujet")}
          </Button>
        )}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{tr("ce_qu_ils_ont_publie", { count: row.articles.length })}</summary>
        <ul className="flex flex-col gap-1.5 pt-2">
          {row.articles.map((article) => (
            <ArticleLine key={article.id} article={article} showCompetitor />
          ))}
        </ul>
      </details>
    </li>
  );
}

function CoveredSection({ rows }: { rows: GapRow[] }) {
  const tr = useTranslations("watch.competitors");
  const fmt = use(getFormats());
  return (
    <DetailsCard variant="archive" summary={tr("sujets_que_tu_as_aussi_traites", { count: rows.length })} flush>
      <ul className="divide-y divide-border text-sm">
        {rows.map((row) => {
          const sent = row.sent[0];
          return (
            <li key={row.key} className="flex flex-col gap-0.5 px-4 py-2.5">
              <span className="font-medium">{row.subject}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {fmt.list(row.competitors.map((c) => c.label))}
                {sent && sent.sentAt ? (
                  <>
                    {" · "}
                    {tr.rich("traite_dans_le", { title: sent.newsletterTitle, formatDate: fmt.date(sent.sentAt), link: (chunks) => <Link href={`/newsletters/${sent.newsletterId}`} className="underline underline-offset-2">{chunks}</Link> })}
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </DetailsCard>
  );
}

function ArticleLine({ article, showCompetitor = false }: { article: CompetitorArticle; showCompetitor?: boolean }) {
  const tr = useTranslations("watch.competitors");
  const tp = useTranslations("watch.page");
  const ta = useTranslations("watch.angles");
  const fmt = use(getFormats());
  const meta = [
    showCompetitor ? article.sourceLabel : null,
    article.publishedAt ? fmt.date(article.publishedAt) : tp("date_inconnue"),
    article.classified ? article.subject : article.pending ? tr("a_classer") : tr("pas_un_article"),
    isCompetitorAngle(article.angle) ? ta(article.angle) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-col">
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
        {article.title} <ExternalLink className="ml-0.5 inline size-3 text-muted-foreground" />
      </a>
      <span className="tabular-nums text-muted-foreground">{meta}</span>
    </li>
  );
}

function CompetitorsSection({ competitors, stats, articles }: { competitors: WatchSource[]; stats: CompetitorStats[]; articles: CompetitorArticle[] }) {
  const tr = useTranslations("watch.competitors");
  const tp = useTranslations("watch.page");
  const ta = useTranslations("watch.angles");
  const fmt = use(getFormats());
  const statsById = new Map(stats.map((s) => [s.id, s]));
  return (
    <section id="concurrents" className="flex flex-col gap-3 scroll-mt-24">
      <h2 className="text-sm font-semibold tabular-nums">{tr("concurrent_concurrents_suivi_suivis", { count: competitors.length })}</h2>
      {competitors.length > 0 && (
        <ListCard>
          {competitors.map((competitor) => {
            const health = sourceHealth(competitor, tp, fmt);
            const s = statsById.get(competitor.id);
            const own = articles.filter((a) => a.sourceId === competitor.id);
            const perWeek = s ? Math.round((s.inWindow * 7) / GAP_WINDOW_DAYS) : 0;
            const rate = !s || s.inWindow === 0 ? "" : perWeek === 0 ? tr("moins_d_un_par_semaine") : tr("environ_par_semaine", { perWeek });
            const activity = s
              ? [
                  tr("article_articles_ces_derniers_jours_f4d1", { count: s.inWindow, days: GAP_WINDOW_DAYS, rate }),
                  s.lastAt ? tr("dernier_article_le", { formatDate: fmt.date(s.lastAt) }) : null,
                  s.topSubjects.length > 0
                    ? tr("sujets_join", { join: fmt.list(s.topSubjects.map((x) => (x.count > 1 ? tr("subject_count", { subject: x.subject, count: x.count }) : x.subject))) })
                    : null,
                  s.topAngle ? tr("angle_dominant", { angle: ta(s.topAngle) }) : null,
                  s.unclassified > 0 ? tr("a_classer_a_la_prochaine_collecte", { count: s.unclassified }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : null;
            return (
              <li key={competitor.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <a href={competitor.siteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {competitor.label}
                      </a>
                      {!competitor.feedUrl && <Badge variant="outline">{tr("sans_flux_cherche_par_domaine")}</Badge>}
                    </span>
                    <span className="truncate text-xs tabular-nums text-muted-foreground">
                      {[
                        fmt.country(competitor.country),
                        competitor.lang === "en" ? tp("anglais") : competitor.lang === "fr" ? tp("francais") : null,
                        competitor.feedUrl ? tp("flux_label", { url: competitor.feedUrl }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {(health.tone === "warning" || health.tone === "asleep") && (
                      <form action={retryCompetitorAction.bind(null, competitor.id)}>
                        <Button type="submit" variant="outline" size="sm">
                          {health.tone === "asleep" ? tp("reveiller") : tp("reessayer")}
                        </Button>
                      </form>
                    )}
                    <form action={archiveCompetitorAction.bind(null, competitor.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        {tp("desactiver")}
                      </Button>
                    </form>
                  </div>
                </div>
                <p className={`text-xs ${health.tone === "warning" || health.tone === "asleep" ? "text-warning" : "text-muted-foreground"}`}>{health.text}</p>
                {activity && <p className="text-xs tabular-nums text-muted-foreground text-pretty">{activity}</p>}
                {own.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      {tr("ce_qu_ils_ont_publie_jours", { count: own.length, days: WATCH_MAX_ITEM_AGE_DAYS })}
                    </summary>
                    <ul className="flex flex-col gap-1.5 pt-2">
                      {own.map((article) => (
                        <ArticleLine key={article.id} article={article} />
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ListCard>
      )}
      <DetailsCard id="ajouter" summary={tr("ajouter_un_concurrent")} defaultOpen={competitors.length === 0}>
        <CompetitorForm />
      </DetailsCard>
    </section>
  );
}

function CompetitorForm() {
  const tr = useTranslations("watch.competitors");
  const tp = useTranslations("watch.page");
  return (
    <form action={createCompetitorAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={tp("adresse_du_site")} htmlFor="competitor-site" hint={tp("le_flux_rss_ou_atom_est_b45b")}>
          <Input id="competitor-site" name="siteUrl" required placeholder={tp("https_www_exemple_fr")} />
        </Field>
        <Field label={tp("nom")} htmlFor="competitor-label" hint={tp("vide_le_nom_de_domaine")}>
          <Input id="competitor-label" name="label" />
        </Field>
        <Field label={tp("adresse_du_flux_si_tu_la_6bff")} htmlFor="competitor-feed">
          <Input id="competitor-feed" name="feedUrl" placeholder={tp("https_www_exemple_fr_feed")} />
        </Field>
        <Field label={tp("pays")} htmlFor="competitor-country">
          <select id="competitor-country" name="country" className={SELECT_CLASS} defaultValue="FR">
            {SOURCE_COUNTRY_CODES.map((code) => (
              <option key={code} value={code}>
                {tp(`countries.${code || "unknown"}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tp("langue")} htmlFor="competitor-lang">
          <select id="competitor-lang" name="lang" className={SELECT_CLASS} defaultValue="fr">
            <option value="fr">{tp("francais")}</option>
            <option value="en">{tp("anglais")}</option>
            <option value="">{tp("autre")}</option>
          </select>
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">{tr("uniquement_ce_qu_ils_publient_publiquement_aa10")}</p>
      <Button type="submit" className="w-fit">
        {tr("ajouter_le_concurrent")}
      </Button>
    </form>
  );
}
