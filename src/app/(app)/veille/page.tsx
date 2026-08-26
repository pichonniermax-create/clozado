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

/** La collecte lancée à la visite s'exécute après la réponse : la fonction reste en vie le temps de son budget (120 s) et d'une marge. */
export const maxDuration = 180;

const DESCRIPTION =
  "La matière de tes newsletters : ce que publient les sources que tu suis, classé par sujet et résumé avec nos mots — jamais un extrait d'article.";

const SELECT_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

const COUNTRIES = [
  ["", "Pays inconnu"],
  ["FR", "France"],
  ["BE", "Belgique"],
  ["CH", "Suisse"],
  ["LU", "Luxembourg"],
  ["EU", "Union européenne"],
  ["GB", "Royaume-Uni"],
  ["US", "États-Unis"],
  ["DE", "Allemagne"],
  ["ES", "Espagne"],
  ["IT", "Italie"],
] as const;

export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; info?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title="Veille" description={DESCRIPTION} />
        <EmptyState>
          Tu es en vue globale : choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir
          sa veille.
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
  const missing = missingPackWatch(pack, topics, sources, followedKeys);
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
  const packLabel = `Suivre la veille du métier « ${pack.label} » (${missing.topics.length} sujet${missing.topics.length > 1 ? "s" : ""}, ${missing.sources.length} source${missing.sources.length > 1 ? "s" : ""}, ${missing.indicators.length} indicateur${missing.indicators.length > 1 ? "s" : ""})`;

  return (
    <>
      <PageHeader
        title="Veille"
        description={DESCRIPTION}
        actions={
          <form action={refreshWatchAction}>
            <Button type="submit" variant="outline" disabled={!hasSetup || Boolean(running)}>
              <RefreshCw />
              {running ? "Collecte en cours…" : "Actualiser maintenant"}
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
          title="Aucune veille pour l'instant"
          action={
            <>
              {missingCount > 0 && (
                <form action={createPackWatchAction}>
                  <Button type="submit">{packLabel}</Button>
                </form>
              )}
              <a href="#sujets" className={buttonVariants({ variant: "outline" })}>
                Ajouter un sujet à la main
              </a>
            </>
          }
        >
          Déclare les sujets qui comptent pour tes lecteurs et les sites ou flux que tu suis : à chaque collecte, les
          nouveaux articles arrivent datés, classés par sujet et résumés avec nos mots. Ton métier en propose pour
          commencer — chaque élément se modifie ensuite.
          {!chosen && (
            <>
              {" "}
              Aucun pack métier n&apos;est choisi : ce sont les sujets « Tout métier ».{" "}
              <Link href="/settings#pack-metier" className="underline underline-offset-2">
                Choisir mon métier
              </Link>
              .
            </>
          )}
        </EmptyState>
      ) : (
        <>
          <BasketSection basket={basket} targets={targets.map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 }))} />

          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold tabular-nums">
              {items.length} article{items.length > 1 ? "s" : ""} collecté{items.length > 1 ? "s" : ""}
            </h2>
            {items.length === 0 ? (
              <EmptyState>
                {running
                  ? "La collecte est en cours : les premiers articles apparaissent dans quelques secondes."
                  : "Aucun article pour l'instant. Lance une collecte, ou vérifie que tes sources ont un flux et que tes sujets ont des termes de recherche."}
              </EmptyState>
            ) : (
              <>
                {activeTopics.map((topic) => {
                  const rows = byTopic.get(topic.id) ?? [];
                  if (rows.length === 0) return null;
                  return <TopicArticles key={topic.id} title={topic.label} rows={rows} />;
                })}
                {others.length > 0 && <TopicArticles title="Autres articles" rows={others} />}
                <p className="text-xs text-muted-foreground">
                  Rien du texte des articles n&apos;est conservé : un titre, un lien, une date, un éditeur, un pays, et un
                  résumé écrit avec nos mots. Un résumé qui reprenait douze mots d&apos;un article a été refusé et n&apos;a pas
                  été gardé.
                </p>
              </>
            )}
          </section>
        </>
      )}

      {missingCount > 0 && hasSetup && (
        <DetailsCard variant="archive" summary={`Proposé par ton métier — ${pack.label} (${missingCount})`}>
          <div className="flex flex-col gap-3 text-sm">
            {missing.topics.length > 0 && (
              <p>
                <span className="font-medium">Sujets :</span> {missing.topics.map((t) => t.label).join(", ")}
              </p>
            )}
            {missing.sources.length > 0 && (
              <p>
                <span className="font-medium">Sources :</span> {missing.sources.map((s) => s.label).join(", ")}
              </p>
            )}
            {missing.indicators.length > 0 && (
              <p>
                <span className="font-medium">Indicateurs de marché :</span> {missing.indicators.length} — visibles sur l&apos;écran{" "}
                <Link href="/chiffres" className="underline underline-offset-2">
                  Chiffres
                </Link>
                .
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
        <DetailsCard variant="archive" summary={`Dernières collectes (${runs.length})`} flush>
          <ul className="divide-y divide-border text-sm">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                <span className="tabular-nums">
                  {formatDateTime(run.startedAt)} — {run.trigger === "manual" ? "à la main" : run.trigger === "cron" ? "programmée" : "à la visite"}
                  {run.finishedAt ? "" : " — en cours"}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {run.finishedAt
                    ? `${run.itemsNew} nouveau${run.itemsNew > 1 ? "x" : ""}, ${run.itemsSummarized} résumé${run.itemsSummarized > 1 ? "s" : ""}, ${run.sourcesOk} source${run.sourcesOk > 1 ? "s" : ""} lue${run.sourcesOk > 1 ? "s" : ""}${run.sourcesFailed ? `, ${run.sourcesFailed} en échec` : ""}`
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
  if (running) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Collecte en cours — démarrée {formatRelativeTime(running.startedAt)}. Les nouveautés apparaissent au fil de l&apos;eau ;
        la page se met à jour d&apos;elle-même.
      </p>
    );
  }
  if (!latestFinished?.finishedAt) {
    return <p className="text-sm text-muted-foreground">Aucune collecte terminée pour l&apos;instant.</p>;
  }
  const r = latestFinished;
  return (
    <p className="text-sm tabular-nums text-muted-foreground">
      Dernière collecte {formatRelativeTime(r.finishedAt!)} : {r.itemsNew} nouveau{r.itemsNew > 1 ? "x" : ""} article
      {r.itemsNew > 1 ? "s" : ""}, {r.itemsSummarized} résumé{r.itemsSummarized > 1 ? "s" : ""}, {r.sourcesOk} source
      {r.sourcesOk > 1 ? "s" : ""} lue{r.sourcesOk > 1 ? "s" : ""}
      {r.sourcesFailed ? `, ${r.sourcesFailed} en échec` : ""}.{r.error ? ` ${r.error}` : ""}
    </p>
  );
}

function BasketSection({ basket, targets }: { basket: WatchItemRow[]; targets: { id: string; label: string; count: number }[] }) {
  if (basket.length === 0) {
    return (
      <p id="panier" className="text-sm text-muted-foreground">
        <ShoppingBasket className="mr-1 inline size-4" />
        Le panier est vide : mets de côté les articles qui t&apos;intéressent, puis écris une newsletter à partir d&apos;eux.
      </p>
    );
  }
  return (
    <section id="panier" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tabular-nums">
          <ShoppingBasket className="size-4" />
          Panier — {basket.length} article{basket.length > 1 ? "s" : ""} mis de côté
        </h2>
        <form action={clearBasketAction}>
          <Button type="submit" variant="ghost" size="sm">
            Vider le panier
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
                {item.usedIn > 0 ? ` · déjà utilisé dans ${item.usedIn} newsletter${item.usedIn > 1 ? "s" : ""}` : ""}
              </span>
            </span>
            <form action={removeFromBasketAction.bind(null, item.id)}>
              <Button type="submit" variant="ghost" size="sm">
                Retirer
              </Button>
            </form>
          </li>
        ))}
      </ul>
      {targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Il faut une cible pour écrire :{" "}
          <Link href="/cibles" className="underline underline-offset-2">
            créer une cible
          </Link>
          .
        </p>
      ) : (
        <form action={writeFromBasketAction} className="flex flex-wrap items-end gap-3">
          <Field label="Pour quelle cible" htmlFor="basket-target">
            <select id="basket-target" name="targetId" className={SELECT_CLASS} defaultValue={targets[0]?.id} required>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {t.count} contact{t.count > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit">
            <Sparkles />
            Écrire une newsletter à partir de ça
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

function summaryStateLabel(item: WatchItemRow): string {
  switch (item.summaryState) {
    case "pending":
      return "Résumé en attente — à la prochaine collecte.";
    case "refused":
      return "Résumé refusé : la formulation reprenait l'article — rien n'a été conservé.";
    case "failed":
      return item.angle ? `Résumé impossible : ${item.angle}.` : "Résumé impossible : page non lisible.";
    default:
      return "";
  }
}

function ArticleRow({ item }: { item: WatchItemRow }) {
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
          {item.usedIn > 0 && <Badge variant="secondary">{item.usedSent ? "Déjà envoyé" : "Déjà utilisé"}</Badge>}
          {item.inBasket ? (
            <form action={removeFromBasketAction.bind(null, item.id)}>
              <Button type="submit" variant="outline" size="sm">
                Retirer du panier
              </Button>
            </form>
          ) : (
            <form action={addToBasketAction.bind(null, item.id)}>
              <Button type="submit" variant="outline" size="sm">
                Mettre de côté
              </Button>
            </form>
          )}
          <form action={dismissItemAction.bind(null, item.id)}>
            <Button type="submit" variant="ghost" size="sm">
              Écarter
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
          <span>{summaryStateLabel(item)}</span>
          {(item.summaryState === "refused" || item.summaryState === "failed") && (
            <form action={resummarizeAction.bind(null, item.id)}>
              <Button type="submit" variant="ghost" size="sm">
                Résumer à nouveau
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
  const id = topic?.id ?? "new";
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Sujet" htmlFor={`topic-label-${id}`}>
          <Input id={`topic-label-${id}`} name="label" defaultValue={topic?.label ?? ""} required placeholder="Crédit immobilier" />
        </Field>
        <Field label="Langues des recherches" htmlFor={`topic-lang-fr-${id}`}>
          <span className="flex flex-wrap items-center gap-4 pt-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input id={`topic-lang-fr-${id}`} type="checkbox" name="languages" value="fr" defaultChecked={topic ? topic.searchLanguages.includes("fr") : true} />
              français
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="languages" value="en" defaultChecked={topic?.searchLanguages.includes("en") ?? false} />
              anglais
            </label>
          </span>
        </Field>
      </div>
      <Field
        label="Termes de recherche"
        htmlFor={`topic-terms-${id}`}
        hint="Un par ligne. La collecte en cherche un à chaque tour, à tour de rôle. Vide : le sujet lui-même."
      >
        <Textarea id={`topic-terms-${id}`} name="searchTerms" defaultValue={topic?.searchTerms.join("\n") ?? ""} className="min-h-16" placeholder={"taux crédit immobilier\nprêt immobilier banques"} />
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
  return (
    <section id="sujets" className="flex flex-col gap-3 scroll-mt-24">
      <h2 className="text-sm font-semibold tabular-nums">
        {topics.length} sujet{topics.length > 1 ? "s" : ""} suivi{topics.length > 1 ? "s" : ""}
      </h2>
      {topics.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {topics.map((topic) => (
            <li key={topic.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex flex-col">
                  <span className="text-sm font-medium">{topic.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {topic.searchTerms.length ? topic.searchTerms.join(" · ") : "recherché par son libellé"} —{" "}
                    {topic.searchLanguages.map((l) => (l === "en" ? "anglais" : "français")).join(" et ")}
                  </span>
                </div>
                <form action={archiveTopicAction.bind(null, topic.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    Désactiver
                  </Button>
                </form>
              </div>
              <details className="group text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Modifier</summary>
                <div className="pt-3">
                  <TopicForm topic={topic} action={updateTopicAction.bind(null, topic.id)} submitLabel="Enregistrer le sujet" />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <DetailsCard summary="Ajouter un sujet" defaultOpen={defaultOpen}>
        <TopicForm action={createTopicAction} submitLabel="Ajouter le sujet" />
      </DetailsCard>
      {archived.length > 0 && (
        <DetailsCard variant="archive" summary={`Sujets désactivés (${archived.length})`} flush>
          <ul className="divide-y divide-border">
            {archived.map((topic) => (
              <li key={topic.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{topic.label}</span>
                <form action={restoreTopicAction.bind(null, topic.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    Réactiver
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

function sourceHealth(source: WatchSource): { text: string; tone: "ok" | "warning" | "asleep" | "never" } {
  if (source.asleepAt) {
    return { text: `En sommeil depuis le ${formatDate(source.asleepAt)} : trente jours d'échecs (${source.lastError ?? "cause inconnue"}).`, tone: "asleep" };
  }
  if (source.lastError) {
    const since = source.lastOkAt ?? source.createdAt;
    const due = sourceDueAt(source);
    return {
      text: `Injoignable depuis le ${formatDate(since)} (${source.lastError})${due ? ` — nouvel essai ${formatRelativeTime(due).replace("il y a", "dans")}` : ""}.`,
      tone: "warning",
    };
  }
  if (source.lastOkAt) return { text: `Lue ${formatRelativeTime(source.lastOkAt)}.`, tone: "ok" };
  return { text: "Pas encore lue.", tone: "never" };
}

function SourcesSection({ sources, archived, topics }: { sources: WatchSource[]; archived: WatchSource[]; topics: WatchTopic[] }) {
  const topicLabel = (id: string | null) => (id ? (topics.find((t) => t.id === id)?.label ?? null) : null);
  return (
    <section id="sources" className="flex flex-col gap-3 scroll-mt-24">
      <h2 className="text-sm font-semibold tabular-nums">
        {sources.length} source{sources.length > 1 ? "s" : ""} suivie{sources.length > 1 ? "s" : ""}
      </h2>
      {sources.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {sources.map((source) => {
            const health = sourceHealth(source);
            const topic = topicLabel(source.topicId);
            return (
              <li key={source.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <a href={source.siteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {source.label}
                      </a>
                      {source.kind === "competitor" && <Badge variant="secondary">Concurrent</Badge>}
                      {!source.feedUrl && <Badge variant="outline">Sans flux — cherchée par domaine</Badge>}
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
                          {health.tone === "asleep" ? "Réveiller" : "Réessayer"}
                        </Button>
                      </form>
                    )}
                    <form action={archiveSourceAction.bind(null, source.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Désactiver
                      </Button>
                    </form>
                  </div>
                </div>
                <p className={`text-xs ${health.tone === "warning" || health.tone === "asleep" ? "text-warning" : "text-muted-foreground"}`}>
                  {health.text}
                  {!source.feedUrl && !source.topicId && " Sans sujet rattaché, elle n'est pas cherchée : rattache-la à un sujet."}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <DetailsCard summary="Ajouter une source ou un flux">
        <form action={createSourceAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Adresse du site" htmlFor="source-site" hint="Le flux RSS ou Atom est cherché sur la page d'accueil. Sans flux, la source est cherchée par son domaine.">
              <Input id="source-site" name="siteUrl" required placeholder="https://www.exemple.fr" />
            </Field>
            <Field label="Nom" htmlFor="source-label" hint="Vide : le nom de domaine.">
              <Input id="source-label" name="label" placeholder="Les Échos — immobilier" />
            </Field>
            <Field label="Adresse du flux (si tu la connais)" htmlFor="source-feed">
              <Input id="source-feed" name="feedUrl" placeholder="https://www.exemple.fr/feed/" />
            </Field>
            <Field label="Sujet rattaché" htmlFor="source-topic" hint="Les articles de cette source sont classés dans ce sujet ; obligatoire pour une source sans flux.">
              <select id="source-topic" name="topicId" className={SELECT_CLASS} defaultValue="">
                <option value="">Aucun — classés par thème au résumé</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pays" htmlFor="source-country">
              <select id="source-country" name="country" className={SELECT_CLASS} defaultValue="FR">
                {COUNTRIES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Langue" htmlFor="source-lang">
              <select id="source-lang" name="lang" className={SELECT_CLASS} defaultValue="fr">
                <option value="fr">français</option>
                <option value="en">anglais</option>
                <option value="">autre</option>
              </select>
            </Field>
          </div>
          <input type="hidden" name="kind" value="source" />
          <p className="text-xs text-muted-foreground">
            Les concurrents nommés et l&apos;écart de contenu arrivent à l&apos;étape suivante du chantier.
          </p>
          <Button type="submit" className="w-fit">
            Ajouter la source
          </Button>
        </form>
      </DetailsCard>
      {archived.length > 0 && (
        <DetailsCard variant="archive" summary={`Sources désactivées (${archived.length})`} flush>
          <ul className="divide-y divide-border">
            {archived.map((source) => (
              <li key={source.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">{source.label}</span>
                <form action={restoreSourceAction.bind(null, source.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    Réactiver
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
