import Link from "next/link";
import { ExternalLink, RefreshCw, ShoppingBasket, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app-shell/page-header";
import { RefreshWhileRunning } from "@/components/watch/refresh-while-running";
import { countMembersByTarget, listMailTargets } from "@/db/queries/mail-targets";
import { listFollowedIndicatorKeys } from "@/db/queries/market";
import { getOwnOrganization } from "@/db/queries/organizations";
import {
  getLatestFinishedRun,
  getRunningRun,
  isWatchStale,
  listBasket,
  listRecentRuns,
  listWatchItems,
  listWatchSources,
  listWatchTopics,
  missingPackWatch,
  sourceDueAt,
  type WatchItemRow,
} from "@/db/queries/watch";
import type { WatchRun, WatchSource, WatchTopic } from "@/db/schema";
import { formatCountry, formatDate, formatDateTime, formatRelativeTime } from "@/lib/format";
import { resolveBusinessPack } from "@/lib/metrics/packs";
import { requireUser } from "@/lib/session";
import {
  addToBasketAction,
  archiveSourceAction,
  archiveTopicAction,
  clearBasketAction,
  createPackWatchAction,
  createSourceAction,
  createTopicAction,
  dismissItemAction,
  refreshWatchAction,
  removeFromBasketAction,
  restoreSourceAction,
  restoreTopicAction,
  resummarizeAction,
  retrySourceAction,
  updateTopicAction,
  writeFromBasketAction,
} from "@/lib/watch/actions";
import { scheduleWatchRefresh } from "@/lib/watch/schedule";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { TranslatorOf } from "@/i18n/translator";

/** La collecte lancée à la visite s'exécute après la réponse : la fonction reste en vie le temps de son budget (120 s) et d'une marge. */
export const maxDuration = 180;


const SELECT_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

/** Les pays proposés pour une source ; leurs noms sont `watch.page.countries.<code>` (« unknown » pour un pays inconnu). */
const COUNTRY_CODES = ["", "FR", "BE", "CH", "LU", "EU", "GB", "US", "DE", "ES", "IT"] as const;

export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; info?: string }>;
}) {
  const tr = await getTranslations("watch.page");
  const tm = await getTranslations("metrics");
  const tt = await getTranslations("templates");
  const user = await requireUser();
  const params = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title={tr("veille")} description={tr("description")} />
        <EmptyState>
          {tr("tu_es_en_vue_globale_choisis_92cd")}
        </EmptyState>
      </>
    );
  }
  const organizationId = user.organizationId;

  const [org, topics, sources, items, basket, latestFinished, alreadyRunning, runs, followedKeys, targets] = await Promise.all([
    getOwnOrganization(user),
    listWatchTopics(organizationId, { includeArchived: true }),
    listWatchSources(organizationId, { includeArchived: true }),
    listWatchItems(user, { limit: 200 }),
    listBasket(user),
    getLatestFinishedRun(organizationId),
    getRunningRun(organizationId),
    listRecentRuns(organizationId, 5),
    listFollowedIndicatorKeys(organizationId),
    listMailTargets(user),
  ]);
  const counts = await countMembersByTarget(targets);
  const { pack, chosen } = resolveBusinessPack(org?.businessPack);
  const activeTopics = topics.filter((t) => !t.archivedAt);
  const archivedTopics = topics.filter((t) => t.archivedAt);
  const activeSources = sources.filter((s) => !s.archivedAt);
  const archivedSources = sources.filter((s) => s.archivedAt);
  const missing = missingPackWatch(pack, topics, sources, followedKeys, tt);
  const missingCount = missing.topics.length + missing.sources.length + missing.indicators.length;
  const hasSetup = activeTopics.length > 0 || activeSources.length > 0;

  // À la visite : quand la collecte a plus de 24 h (ou n'a jamais eu lieu),
  // elle démarre maintenant et s'exécute APRÈS la réponse — la page rend
  // l'état connu tout de suite et se rafraîchit d'elle-même.
  let running: WatchRun | null = alreadyRunning;
  if (hasSetup && !running && isWatchStale(latestFinished)) {
    try {
      const start = await scheduleWatchRefresh(organizationId, "visit");
      if (start.status === "started" || start.status === "running") running = start.run;
    } catch {
      running = null;
    }
  }

  const byTopic = new Map<string, WatchItemRow[]>();
  const others: WatchItemRow[] = [];
  for (const item of items) {
    const topic = item.topicId ? activeTopics.find((t) => t.id === item.topicId) : null;
    if (topic) byTopic.set(topic.id, [...(byTopic.get(topic.id) ?? []), item]);
    else others.push(item);
  }
  const packLabel = tr("suivre_la_veille_du_metier_sujet_7ee5", { label: tm(`packs.${pack.key}.label`), count: missing.topics.length, count2: missing.sources.length, count3: missing.indicators.length });

  return (
    <>
      <PageHeader
        title={tr("veille")}
        description={tr("description")}
        actions={
          <form action={refreshWatchAction}>
            <Button type="submit" variant="outline" disabled={!hasSetup || Boolean(running)}>
              <RefreshCw />
              {running ? tr("collecte_en_cours") : tr("actualiser_maintenant")}
            </Button>
          </form>
        }
      />

      <RefreshWhileRunning active={Boolean(running)} />

      {params.erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{params.erreur}</p>
      )}
      {params.info && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{params.info}</p>}

      {hasSetup && <RunStatus running={running} latestFinished={latestFinished} />}

      {!hasSetup ? (
        <EmptyState
          title={tr("aucune_veille_pour_l_instant")}
          action={
            <>
              {missingCount > 0 && (
                <form action={createPackWatchAction}>
                  <Button type="submit">{packLabel}</Button>
                </form>
              )}
              <a href="#sujets" className={buttonVariants({ variant: "outline" })}>
                {tr("ajouter_un_sujet_a_la_main")}
              </a>
            </>
          }
        >
          {tr("declare_les_sujets_qui_comptent_pour_a153")}
          {!chosen && (
            <>
              {tr.rich("aucun_pack_metier_n_est_choisi_436c", { link: (chunks) => <Link href="/settings#pack-metier" className="underline underline-offset-2">{chunks}</Link> })}
            </>
          )}
        </EmptyState>
      ) : (
        <>
          <BasketSection basket={basket} targets={targets.map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 }))} />

          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold tabular-nums">
              {tr("article_articles_collecte_collectes", { count: items.length })}
            </h2>
            {items.length === 0 ? (
              <EmptyState>
                {running
                  ? tr("la_collecte_est_en_cours_les_7fdb")
                  : tr("aucun_article_pour_l_instant_lance_ccd0")}
              </EmptyState>
            ) : (
              <>
                {activeTopics.map((topic) => {
                  const rows = byTopic.get(topic.id) ?? [];
                  if (rows.length === 0) return null;
                  return <TopicArticles key={topic.id} title={topic.label} rows={rows} />;
                })}
                {others.length > 0 && <TopicArticles title={tr("autres_articles")} rows={others} />}
                <p className="text-xs text-muted-foreground">
                  {tr("rien_du_texte_des_articles_n_63f8")}
                </p>
              </>
            )}
          </section>
        </>
      )}

      {missingCount > 0 && hasSetup && (
        <DetailsCard variant="archive" summary={tr("propose_par_ton_metier", { label: tm(`packs.${pack.key}.label`), missingCount })}>
          <div className="flex flex-col gap-3 text-sm">
            {missing.topics.length > 0 && (
              <p>
                {tr.rich("sujets", { join: missing.topics.map((tpl) => tt(`topics.${tpl.slug}.label`)).join(", "), span: (chunks) => <span className="font-medium">{chunks}</span> })}
              </p>
            )}
            {missing.sources.length > 0 && (
              <p>
                {tr.rich("sources", { join: missing.sources.map((s) => tt(`sources.${s.slug}`)).join(", "), span: (chunks) => <span className="font-medium">{chunks}</span> })}
              </p>
            )}
            {missing.indicators.length > 0 && (
              <p>
                {tr.rich("indicateurs_de_marche_visibles_sur_l_a621", { count: missing.indicators.length, span: (chunks) => <span className="font-medium">{chunks}</span>, link: (chunks) => <Link href="/chiffres" className="underline underline-offset-2">{chunks}</Link> })}
              </p>
            )}
            <form action={createPackWatchAction}>
              <Button type="submit" variant="outline">
                {packLabel}
              </Button>
            </form>
          </div>
        </DetailsCard>
      )}

      <TopicsSection topics={activeTopics} archived={archivedTopics} defaultOpen={!hasSetup} />
      <SourcesSection sources={activeSources} archived={archivedSources} topics={activeTopics} />

      {runs.length > 0 && (
        <DetailsCard variant="archive" summary={tr("dernieres_collectes", { count: runs.length })} flush>
          <ul className="divide-y divide-border text-sm">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                <span className="tabular-nums">
                  {formatDateTime(run.startedAt)} — {run.trigger === "manual" ? tr("a_la_main") : run.trigger === "cron" ? tr("programmee") : tr("a_la_visite")}
                  {run.finishedAt ? "" : <>{" "}{tr("en_cours")}</>}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {run.finishedAt
                    ? tr("nouveau_nouveaux_resume_resumes_source_sources_44fe", { itemsNew: run.itemsNew, itemsSummarized: run.itemsSummarized, sourcesOk: run.sourcesOk, value: run.sourcesFailed ? tr("en_echec", { sourcesFailed: run.sourcesFailed }) : "" })
                    : "démarrée " + formatRelativeTime(run.startedAt)}
                  {run.error ? ` — ${run.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </DetailsCard>
      )}
    </>
  );
}

function RunStatus({ running, latestFinished }: { running: WatchRun | null; latestFinished: WatchRun | null }) {
  const t = useTranslations("watch.page");
  if (running) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {t("collecte_en_cours_demarree_les_nouveautes_2443", { formatRelativeTime: formatRelativeTime(running.startedAt) })}
      </p>
    );
  }
  if (!latestFinished?.finishedAt) {
    return <p className="text-sm text-muted-foreground">{t("aucune_collecte_terminee_pour_l_instant")}</p>;
  }
  const r = latestFinished;
  return (
    <p className="text-sm tabular-nums text-muted-foreground">
      {t("derniere_collecte_nouveau_nouveaux_article_articles_2c84", { formatRelativeTime: formatRelativeTime(r.finishedAt!), itemsNew: r.itemsNew, itemsSummarized: r.itemsSummarized, sourcesOk: r.sourcesOk, value: r.sourcesFailed ? t("en_echec", { sourcesFailed: r.sourcesFailed }) : "", value2: r.error ? ` ${r.error}` : "" })}
    </p>
  );
}

function BasketSection({ basket, targets }: { basket: WatchItemRow[]; targets: { id: string; label: string; count: number }[] }) {
  const tr = useTranslations("watch.page");
  if (basket.length === 0) {
    return (
      <p id="panier" className="text-sm text-muted-foreground">
        <ShoppingBasket className="mr-1 inline size-4" />
        {tr("le_panier_est_vide_mets_de_fc38")}
      </p>
    );
  }
  return (
    <section id="panier" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tabular-nums">
          <ShoppingBasket className="size-4" />
          {tr("panier_article_articles_mis_de_cote", { count: basket.length })}
        </h2>
        <form action={clearBasketAction}>
          <Button type="submit" variant="ghost" size="sm">
            {tr("vider_le_panier")}
          </Button>
        </form>
      </div>
      <ul className="flex flex-col gap-1.5">
        {basket.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 flex flex-col">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="truncate font-medium hover:underline">
                {item.title}
              </a>
              <span className="truncate text-xs tabular-nums text-muted-foreground">
                {[item.publisher, item.publishedAt ? formatDate(item.publishedAt) : null].filter(Boolean).join(" · ")}
                {item.usedIn > 0 ? tr("deja_utilise_dans_newsletter_newsletters", { usedIn: item.usedIn }) : ""}
              </span>
            </span>
            <form action={removeFromBasketAction.bind(null, item.id)}>
              <Button type="submit" variant="ghost" size="sm">
                {tr("retirer")}
              </Button>
            </form>
          </li>
        ))}
      </ul>
      {targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tr.rich("il_faut_une_cible_pour_ecrire_ac2e", { link: (chunks) => <Link href="/cibles" className="underline underline-offset-2">{chunks}</Link> })}
        </p>
      ) : (
        <form action={writeFromBasketAction} className="flex flex-wrap items-end gap-3">
          <Field label={tr("pour_quelle_cible")} htmlFor="basket-target">
            <select id="basket-target" name="targetId" className={SELECT_CLASS} defaultValue={targets[0]?.id} required>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {tr("contact_contacts", { label: t.label, count: t.count })}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit">
            <Sparkles />
            {tr("ecrire_une_newsletter_a_partir_de_f06e")}
          </Button>
        </form>
      )}
    </section>
  );
}

function TopicArticles({ title, rows }: { title: string; rows: WatchItemRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium tabular-nums">
        {title} <span className="text-muted-foreground">({rows.length})</span>
      </h3>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((item) => (
          <ArticleRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

function summaryStateLabel(item: WatchItemRow, t: TranslatorOf<"watch.page">): string {
  switch (item.summaryState) {
    case "pending":
      return t("resume_en_attente_a_la_prochaine_4452");
    case "refused":
      return t("resume_refuse_la_formulation_reprenait_l_a09f");
    case "failed":
      return item.angle ? t("resume_impossible", { angle: item.angle }) : t("resume_impossible_page_non_lisible");
    default:
      return "";
  }
}

function ArticleRow({ item }: { item: WatchItemRow }) {
  const t = useTranslations("watch.page");
  const meta = [
    item.publisher,
    formatCountry(item.country),
    item.publishedAt ? formatDate(item.publishedAt) : "date inconnue",
    item.discoveredVia === "feed" ? "flux" : "recherche",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li id={`article-${item.id}`} className="flex flex-col gap-2 px-4 py-3 scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex flex-col gap-0.5">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline">
            {item.title} <ExternalLink className="ml-0.5 inline size-3 text-muted-foreground" />
          </a>
          <span className="text-xs tabular-nums text-muted-foreground">{meta}</span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {item.usedIn > 0 && <Badge variant="secondary">{item.usedSent ? t("deja_envoye") : t("deja_utilise")}</Badge>}
          {item.inBasket ? (
            <form action={removeFromBasketAction.bind(null, item.id)}>
              <Button type="submit" variant="outline" size="sm">
                {t("retirer_du_panier")}
              </Button>
            </form>
          ) : (
            <form action={addToBasketAction.bind(null, item.id)}>
              <Button type="submit" variant="outline" size="sm">
                {t("mettre_de_cote")}
              </Button>
            </form>
          )}
          <form action={dismissItemAction.bind(null, item.id)}>
            <Button type="submit" variant="ghost" size="sm">
              {t("ecarter")}
            </Button>
          </form>
        </div>
      </div>
      {item.summaryState === "done" && item.summary ? (
        <p className="text-sm text-pretty">{item.summary}</p>
      ) : (
        // Un <div>, pas un <p> : un formulaire dans un paragraphe est refermé
        // par le navigateur avant le formulaire — l'arbre ne correspond plus à
        // celui de React (erreur d'hydratation #418, vue au navigateur).
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{summaryStateLabel(item, t)}</span>
          {(item.summaryState === "refused" || item.summaryState === "failed") && (
            <form action={resummarizeAction.bind(null, item.id)}>
              <Button type="submit" variant="ghost" size="sm">
                {t("resumer_a_nouveau")}
              </Button>
            </form>
          )}
        </div>
      )}
      {(item.themes.length > 0 || (item.angle && item.summaryState === "done")) && (
        <p className="text-xs text-muted-foreground">
          {[...item.themes, item.summaryState === "done" ? item.angle : null].filter(Boolean).join(" · ")}
        </p>
      )}
    </li>
  );
}

function TopicForm({ topic, action, submitLabel }: { topic?: WatchTopic; action: (formData: FormData) => Promise<void>; submitLabel: string }) {
  const t = useTranslations("watch.page");
  const id = topic?.id ?? "new";
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("sujet")} htmlFor={`topic-label-${id}`}>
          <Input id={`topic-label-${id}`} name="label" defaultValue={topic?.label ?? ""} required placeholder={t("credit_immobilier")} />
        </Field>
        <Field label={t("langues_des_recherches")} htmlFor={`topic-lang-fr-${id}`}>
          <span className="flex flex-wrap items-center gap-4 pt-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input id={`topic-lang-fr-${id}`} type="checkbox" name="languages" value="fr" defaultChecked={topic ? topic.searchLanguages.includes("fr") : true} />
              {t("francais")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="languages" value="en" defaultChecked={topic?.searchLanguages.includes("en") ?? false} />
              {t("anglais")}
            </label>
          </span>
        </Field>
      </div>
      <Field
        label={t("termes_de_recherche")}
        htmlFor={`topic-terms-${id}`}
        hint={t("un_par_ligne_la_collecte_en_fd02")}
      >
        <Textarea id={`topic-terms-${id}`} name="searchTerms" defaultValue={topic?.searchTerms.join("\n") ?? ""} className="min-h-16" placeholder={t("taux_credit_immobilier_pret_immobilier_banques")} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant={topic ? "outline" : "default"}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function TopicsSection({ topics, archived, defaultOpen }: { topics: WatchTopic[]; archived: WatchTopic[]; defaultOpen: boolean }) {
  const t = useTranslations("watch.page");
  return (
    <section id="sujets" className="flex flex-col gap-3 scroll-mt-24">
      <h2 className="text-sm font-semibold tabular-nums">
        {t("sujet_sujets_suivi_suivis", { count: topics.length })}
      </h2>
      {topics.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {topics.map((topic) => (
            <li key={topic.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex flex-col">
                  <span className="text-sm font-medium">{topic.label}</span>
                  <span className="truncate text-xs tabular-nums text-muted-foreground">
                    {topic.searchTerms.length ? topic.searchTerms.join(" · ") : t("recherche_par_son_libelle")} —{" "}
                    {topic.searchLanguages.map((l) => (l === "en" ? "anglais" : "français")).join(" et ")} —{" "}
                    {topic.lastSearchedAt ? t("cherche", { formatRelativeTime: formatRelativeTime(topic.lastSearchedAt) }) : t("jamais_cherche")}
                  </span>
                </div>
                <form action={archiveTopicAction.bind(null, topic.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    {t("desactiver")}
                  </Button>
                </form>
              </div>
              <details className="group text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{t("modifier")}</summary>
                <div className="pt-3">
                  <TopicForm topic={topic} action={updateTopicAction.bind(null, topic.id)} submitLabel={t("enregistrer_le_sujet")} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <DetailsCard summary={t("ajouter_un_sujet")} defaultOpen={defaultOpen}>
        <TopicForm action={createTopicAction} submitLabel={t("ajouter_le_sujet")} />
      </DetailsCard>
      {archived.length > 0 && (
        <DetailsCard variant="archive" summary={t("sujets_desactives", { count: archived.length })} flush>
          <ul className="divide-y divide-border">
            {archived.map((topic) => (
              <li key={topic.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{topic.label}</span>
                <form action={restoreTopicAction.bind(null, topic.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    {t("reactiver")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </DetailsCard>
      )}
    </section>
  );
}

function sourceHealth(source: WatchSource, t: TranslatorOf<"watch.page">): { text: string; tone: "ok" | "warning" | "asleep" | "never" } {
  if (source.asleepAt) {
    return { text: t("en_sommeil_depuis_le_trente_jours_f5f9", { formatDate: formatDate(source.asleepAt), n: source.lastError ?? t("cause_inconnue") }), tone: "asleep" };
  }
  if (source.lastError) {
    const since = source.lastOkAt ?? source.createdAt;
    const due = sourceDueAt(source);
    return {
      text: t("injoignable_depuis_le", { formatDate: formatDate(since), lastError: source.lastError, value: due ? t("nouvel_essai", { replace: formatRelativeTime(due).replace(t("il_y_a"), "dans") }) : "" }),
      tone: "warning",
    };
  }
  if (source.lastOkAt) return { text: t("lue", { formatRelativeTime: formatRelativeTime(source.lastOkAt) }), tone: "ok" };
  return { text: t("pas_encore_lue"), tone: "never" };
}

function SourcesSection({ sources, archived, topics }: { sources: WatchSource[]; archived: WatchSource[]; topics: WatchTopic[] }) {
  const tr = useTranslations("watch.page");
  const topicLabel = (id: string | null) => (id ? (topics.find((t) => t.id === id)?.label ?? null) : null);
  return (
    <section id="sources" className="flex flex-col gap-3 scroll-mt-24">
      <h2 className="text-sm font-semibold tabular-nums">
        {tr("source_sources_suivie_suivies", { count: sources.length })}
      </h2>
      {sources.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {sources.map((source) => {
            const health = sourceHealth(source, tr);
            const topic = topicLabel(source.topicId);
            return (
              <li key={source.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <a href={source.siteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {source.label}
                      </a>
                      {source.kind === "competitor" && <Badge variant="secondary">{tr("concurrent")}</Badge>}
                      {!source.feedUrl && <Badge variant="outline">{tr("sans_flux_cherchee_par_domaine")}</Badge>}
                    </span>
                    <span className="truncate text-xs tabular-nums text-muted-foreground">
                      {[
                        formatCountry(source.country),
                        source.lang === "en" ? "anglais" : source.lang === "fr" ? "français" : null,
                        topic ? `sujet : ${topic}` : null,
                        source.feedUrl ? `flux : ${source.feedUrl}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {(health.tone === "warning" || health.tone === "asleep") && (
                      <form action={retrySourceAction.bind(null, source.id)}>
                        <Button type="submit" variant="outline" size="sm">
                          {health.tone === "asleep" ? tr("reveiller") : tr("reessayer")}
                        </Button>
                      </form>
                    )}
                    <form action={archiveSourceAction.bind(null, source.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        {tr("desactiver")}
                      </Button>
                    </form>
                  </div>
                </div>
                <p className={`text-xs ${health.tone === "warning" || health.tone === "asleep" ? "text-warning" : "text-muted-foreground"}`}>
                  {health.text}
                  {!source.feedUrl && !source.topicId && tr("sans_sujet_rattache_elle_n_est_3492")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <DetailsCard summary={tr("ajouter_une_source_ou_un_flux")}>
        <form action={createSourceAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={tr("adresse_du_site")} htmlFor="source-site" hint={tr("le_flux_rss_ou_atom_est_b45b")}>
              <Input id="source-site" name="siteUrl" required placeholder={tr("https_www_exemple_fr")} />
            </Field>
            <Field label={tr("nom")} htmlFor="source-label" hint={tr("vide_le_nom_de_domaine")}>
              <Input id="source-label" name="label" placeholder={tr("les_echos_immobilier")} />
            </Field>
            <Field label={tr("adresse_du_flux_si_tu_la_6bff")} htmlFor="source-feed">
              <Input id="source-feed" name="feedUrl" placeholder={tr("https_www_exemple_fr_feed")} />
            </Field>
            <Field label={tr("sujet_rattache")} htmlFor="source-topic" hint={tr("les_articles_de_cette_source_sont_a769")}>
              <select id="source-topic" name="topicId" className={SELECT_CLASS} defaultValue="">
                <option value="">{tr("aucun_classes_par_theme_au_resume")}</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tr("pays")} htmlFor="source-country">
              <select id="source-country" name="country" className={SELECT_CLASS} defaultValue="FR">
                {COUNTRY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {tr(`countries.${code || "unknown"}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tr("langue")} htmlFor="source-lang">
              <select id="source-lang" name="lang" className={SELECT_CLASS} defaultValue="fr">
                <option value="fr">{tr("francais")}</option>
                <option value="en">{tr("anglais")}</option>
                <option value="">{tr("autre")}</option>
              </select>
            </Field>
          </div>
          <input type="hidden" name="kind" value="source" />
          <p className="text-xs text-muted-foreground">
            {tr("les_concurrents_nommes_et_l_ecart_847f")}
          </p>
          <Button type="submit" className="w-fit">
            {tr("ajouter_la_source")}
          </Button>
        </form>
      </DetailsCard>
      {archived.length > 0 && (
        <DetailsCard variant="archive" summary={tr("sources_desactivees", { count: archived.length })} flush>
          <ul className="divide-y divide-border">
            {archived.map((source) => (
              <li key={source.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">{source.label}</span>
                <form action={restoreSourceAction.bind(null, source.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    {tr("reactiver")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </DetailsCard>
      )}
    </section>
  );
}
