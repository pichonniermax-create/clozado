import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListCard, ListRow, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { TargetForm } from "@/components/targets/target-form";
import {
  TARGET_MEMBERS_PAGE_SIZE,
  countSentNewslettersForTarget,
  describeTarget,
  getMailTarget,
  listMembers,
  listRecentSendsForTarget,
  listSignatories,
  loadCriteriaOptions,
  searchContactsToAdd,
} from "@/db/queries/mail-targets";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import {
  addMembersAction,
  archiveTargetAction,
  duplicateTargetAction,
  removeMemberAction,
  restoreTargetAction,
  updateTargetAction,
} from "@/lib/targets/actions";
import { missingIdentityFacets, parseCriteria } from "@/lib/targets/criteria";

export default async function TargetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; q?: string; erreur?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;

  const target = await getMailTarget(user, id).catch(() => null);
  if (!target) notFound();

  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const q = query.q?.trim() || "";
  const isStatic = target.kind === "static";

  const [options, signatories, members, sentCount, candidates] = await Promise.all([
    loadCriteriaOptions(target.organizationId),
    listSignatories(target.organizationId),
    listMembers(target, page),
    countSentNewslettersForTarget(target.id),
    isStatic && q ? searchContactsToAdd(user, target, q) : Promise.resolve([]),
  ]);
  const recentSends = await listRecentSendsForTarget(target, members.total);
  const summary = describeTarget(target, options);
  const missing = missingIdentityFacets(target);
  const archived = Boolean(target.archivedAt);

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return `/cibles/${target.id}${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title={target.label}
        description={
          <>
            {summary.join(" · ")}
            {target.description && <span className="text-muted-foreground"> — {target.description}</span>}
          </>
        }
        backTo={{ href: "/cibles", label: "Cibles" }}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {archived ? (
              <>
                <Badge variant="secondary">Désactivée</Badge>
                <form action={restoreTargetAction.bind(null, target.id)}>
                  <Button type="submit" variant="outline">
                    Réactiver
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Link href={`/newsletters/new?cible=${target.id}`} className={buttonVariants()}>
                  <Mail />
                  Écrire une newsletter pour cette cible
                </Link>
                <form action={duplicateTargetAction.bind(null, target.id)}>
                  <Button type="submit" variant="outline">
                    <Copy />
                    Dupliquer
                  </Button>
                </form>
                <form action={archiveTargetAction.bind(null, target.id)}>
                  <Button type="submit" variant="ghost">
                    Désactiver
                  </Button>
                </form>
              </>
            )}
          </span>
        }
      />

      {query.erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{query.erreur}</p>
      )}

      {archived && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Désactivée le {formatDate(target.archivedAt!)} : elle n&apos;est plus proposée dans le composer ni sur les fiches,
          mais les newsletters qui lui ont été envoyées la gardent en historique.
        </p>
      )}

      {sentCount > 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{sentCount}</span> newsletter{sentCount > 1 ? "s ont" : " a"} été
          marquée{sentCount > 1 ? "s" : ""} envoyée{sentCount > 1 ? "s" : ""} à cette cible. Leur historique — les
          destinataires et les critères du jour — ne change pas si tu modifies la cible. Pour un nouveau découpage,
          duplique-la plutôt.
        </p>
      )}

      {missing.length > 0 && !archived && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Identité éditoriale incomplète : {missing.join(", ").toLowerCase()}. Le composer écrit avec ce qui est rempli.
        </p>
      )}

      <TargetForm
        key={target.updatedAt.getTime()}
        action={updateTargetAction.bind(null, target.id)}
        options={options}
        signatories={signatories}
        initial={{
          label: target.label,
          description: target.description ?? "",
          kind: isStatic ? "static" : "segment",
          criteria: parseCriteria(target.criteria),
          audienceLabel: target.audienceLabel ?? "",
          defaultSignatoryId: target.defaultSignatoryId ?? "",
          persona: target.persona ?? "",
          concerns: target.concerns ?? "",
          knowledgeLevel: target.knowledgeLevel ?? "",
          editorialVoice: target.editorialVoice ?? "",
          interests: target.interests ?? "",
          avoid: target.avoid ?? "",
        }}
        submitLabel="Enregistrer la cible"
      />

      {/* La liste RÉELLE : recalculée à chaque consultation, jamais figée. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tabular-nums">
          {members.total} contact{members.total > 1 ? "s" : ""} dans cette cible aujourd&apos;hui
        </h2>

        {isStatic && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <form method="get" className="flex flex-wrap items-center gap-2">
              <Input
                key={q}
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Ajouter des contacts : nom, email, société…"
                className="max-w-md"
                aria-label="Rechercher des contacts à ajouter"
              />
              <Button type="submit" variant="outline">
                Rechercher
              </Button>
            </form>
            {q &&
              (candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun contact ne correspond à « {q} ».</p>
              ) : (
                <form action={addMembersAction.bind(null, target.id)} className="flex flex-col gap-3">
                  <input type="hidden" name="q" value={q} />
                  <ul className="flex flex-col gap-1.5">
                    {candidates.map((c) => (
                      <li key={c.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="contactIds" value={c.id} disabled={c.alreadyMember} />
                          <span className={c.alreadyMember ? "text-muted-foreground" : undefined}>{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {[c.email, c.city].filter(Boolean).join(" · ")}
                          </span>
                          {c.alreadyMember && <Badge variant="secondary">Déjà dans la cible</Badge>}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Button type="submit" variant="outline" className="w-fit">
                    Ajouter les contacts cochés
                  </Button>
                </form>
              ))}
          </div>
        )}

        {members.rows.length === 0 ? (
          <EmptyState>
            {isStatic
              ? "Aucun contact dans cette sélection pour l'instant — cherche-les ci-dessus et coche-les."
              : "Aucun contact ne répond à ces critères aujourd'hui. Élargis-les, ou vérifie les étiquettes et les fiches concernées."}
          </EmptyState>
        ) : (
          <ListCard>
            {members.rows.map((c) =>
              isStatic ? (
                <ListRow key={c.id}>
                  <Link href={`/contacts/${c.id}`} className="flex min-w-0 flex-col hover:underline">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <span className="truncate text-xs tabular-nums text-muted-foreground">
                      {[c.email, c.kind === "person" ? c.companyName : null, c.city].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </Link>
                  <form action={removeMemberAction.bind(null, target.id, c.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Retirer
                    </Button>
                  </form>
                </ListRow>
              ) : (
                <ListRowLink
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  title={c.name}
                  subtitle={[c.email, c.kind === "person" ? c.companyName : null, c.city].filter(Boolean).join(" · ") || "—"}
                  trailing={c.kind === "company" ? <Badge variant="secondary">Société</Badge> : undefined}
                />
              )
            )}
          </ListCard>
        )}

        {members.pageCount > 1 && (
          <nav className="flex items-center justify-between text-sm">
            {members.page > 1 ? (
              <Link href={pageHref(members.page - 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                ← Précédents
              </Link>
            ) : (
              <span />
            )}
            <span className="tabular-nums text-muted-foreground">
              Page {members.page} sur {members.pageCount} · {TARGET_MEMBERS_PAGE_SIZE} par page
            </span>
            {members.page < members.pageCount ? (
              <Link href={pageHref(members.page + 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Suivants →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>

      {/* L'anti-répétition : lue dans la photographie des envois, pas dans les critères. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Déjà envoyé à ces contacts</h2>
        {recentSends.length === 0 ? (
          <EmptyState>
            Aucune newsletter marquée envoyée ne recoupe cette cible sur les douze derniers mois. L&apos;historique se
            construit quand tu marques une newsletter « envoyée ».
          </EmptyState>
        ) : (
          <ListCard>
            {recentSends.map((s) => (
              <ListRowLink
                key={s.id}
                href={`/newsletters/${s.id}`}
                title={s.subject || s.title}
                subtitle={
                  `Envoyée le ${formatDate(s.sentAt)} à ${s.recipients} contact${s.recipients > 1 ? "s" : ""} · ${s.overlap} dans la cible actuelle` +
                  (s.overlapPercent !== null ? ` (${s.overlapPercent} %)` : "") +
                  (s.topics.length > 0 ? ` · sujets : ${s.topics.join(", ")}` : "")
                }
              />
            ))}
          </ListCard>
        )}
      </section>
    </>
  );
}
