import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, Ellipsis, Mail, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DetailsCard } from "@/components/ui/details-card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListCard, ListRow, ListRowLink } from "@/components/ui/list-card";
import { SectionHeading } from "@/components/ui/section-heading";
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
import { getFormats } from "@/i18n/formats";
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
import { getTranslations } from "next-intl/server";

export default async function TargetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; q?: string; erreur?: string }>;
}) {
  const t = await getTranslations("targets.detail");
  const tt = await getTranslations("targets");
  const fmt = await getFormats();
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
  const summary = describeTarget(target, options, tt);
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
        backTo={{ href: "/cibles", label: t("cibles") }}
        actions={
          archived ? (
            <>
              <Badge variant="secondary">{t("desactivee")}</Badge>
              <form action={restoreTargetAction.bind(null, target.id)}>
                <Button type="submit" variant="outline">
                  {t("reactiver")}
                </Button>
              </form>
            </>
          ) : (
            <>
              {/* Un seul bouton visible ; dupliquer et désactiver derrière « ⋯ » — trois boutons débordaient de 150 px à 390 px.
                  Les formulaires vivent hors du menu (portail) : chaque entrée les vise par `form=`. */}
              <Link href={`/newsletters/new?cible=${target.id}`} className={buttonVariants()}>
                <Mail />
                {t("ecrire_une_newsletter_pour_cette_cible")}
              </Link>
              <form id={`duplicate-${target.id}`} action={duplicateTargetAction.bind(null, target.id)} />
              <form id={`archive-${target.id}`} action={archiveTargetAction.bind(null, target.id)} />
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label={t("plus_d_actions")} />}>
                  <Ellipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem render={<button type="submit" form={`duplicate-${target.id}`} />}>
                    <Copy />
                    {t("dupliquer")}
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<button type="submit" form={`archive-${target.id}`} />}>
                    <PowerOff />
                    {t("desactiver")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      {archived && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("desactivee_le_elle_n_est_plus_159e", { formatDate: fmt.date(target.archivedAt!) })}
        </p>
      )}

      {/* Une note, pas un risque : le ton neutre, comme les deux autres encadrés. */}
      {sentCount > 0 && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          {t.rich("newsletter_a_s_ont_ete_marquee_5a1f", { sentCount, span: (chunks) => <span className="font-medium tabular-nums">{chunks}</span> })}
        </p>
      )}

      {missing.length > 0 && !archived && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("identite_editoriale_incomplete_le_composer_ecrit_efd3", { toLowerCase: missing.map((key) => tt(`facets.${key}.label`)).join(", ").toLowerCase() })}
        </p>
      )}

      {/* La liste RÉELLE d'abord (recalculée à chaque consultation, jamais figée) : c'est ce qu'on vient voir. Le formulaire
          de 2 000 px — critères et identité éditoriale — est replié plus bas, ouvert d'office quand l'identité est incomplète. */}
      <section className="flex flex-col gap-3">
        <SectionHeading title={t("contacts_dans_cette_cible")} count={members.total} />

        {isStatic && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <form method="get" className="flex flex-wrap items-center gap-2">
              <Input
                key={q}
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("ajouter_des_contacts_nom_email_societe")}
                className="max-w-md"
                aria-label={t("rechercher_des_contacts_a_ajouter")}
              />
              <Button type="submit" variant="outline">
                {t("rechercher")}
              </Button>
            </form>
            {q &&
              (candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("aucun_contact_ne_correspond_a", { q })}</p>
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
                          {c.alreadyMember && <Badge variant="secondary">{t("deja_dans_la_cible")}</Badge>}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Button type="submit" variant="outline" className="w-fit">
                    {t("ajouter_les_contacts_coches")}
                  </Button>
                </form>
              ))}
          </div>
        )}

        {members.rows.length === 0 ? (
          <EmptyState>
            {isStatic
              ? t("aucun_contact_dans_cette_selection_pour_f17f")
              : t("aucun_contact_ne_repond_a_ces_85ef")}
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
                  <ConfirmSubmit
                    action={removeMemberAction.bind(null, target.id, c.id)}
                    title={t("retirer_titre", { name: c.name })}
                    description={t("retirer_texte")}
                    confirmLabel={t("retirer")}
                    cancelLabel={t("annuler")}
                  >
                    {t("retirer")}
                  </ConfirmSubmit>
                </ListRow>
              ) : (
                <ListRowLink
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  title={c.name}
                  subtitle={[c.email, c.kind === "person" ? c.companyName : null, c.city].filter(Boolean).join(" · ") || "—"}
                  trailing={c.kind === "company" ? <Badge variant="secondary">{t("societe")}</Badge> : undefined}
                />
              )
            )}
          </ListCard>
        )}

        {members.pageCount > 1 && (
          <nav className="flex items-center justify-between text-sm">
            {members.page > 1 ? (
              <Link href={pageHref(members.page - 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("precedents")}
              </Link>
            ) : (
              <span />
            )}
            <span className="tabular-nums text-muted-foreground">
              {t("page_sur_par_page", { page: members.page, pageCount: members.pageCount, targetMembersPageSize: TARGET_MEMBERS_PAGE_SIZE })}
            </span>
            {members.page < members.pageCount ? (
              <Link href={pageHref(members.page + 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("suivants")}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>

      {/* L'anti-répétition : lue dans la photographie des envois, pas dans les critères. */}
      <section className="flex flex-col gap-3">
        <SectionHeading title={t("deja_envoye_a_ces_contacts")} count={recentSends.length} />
        {recentSends.length === 0 ? (
          <EmptyState>
            {t("aucune_newsletter_marquee_envoyee_ne_recoupe_89da")}
          </EmptyState>
        ) : (
          <ListCard>
            {recentSends.map((s) => (
              <ListRowLink
                key={s.id}
                href={`/newsletters/${s.id}`}
                title={s.subject || s.title}
                // Une seule clé ICU (pluriel, parenthèse et sujets facultatifs) : la phrase était assemblée en français en dur.
                subtitle={t("envoi_recap", {
                  date: fmt.date(s.sentAt),
                  recipients: s.recipients,
                  overlap: s.overlap,
                  percent: s.overlapPercent === null ? "none" : String(s.overlapPercent),
                  topics: s.topics.length > 0 ? s.topics.join(", ") : "none",
                })}
              />
            ))}
          </ListCard>
        )}
      </section>

      <DetailsCard variant="archive" summary={t("modifier_les_criteres")} defaultOpen={missing.length > 0 && !archived}>
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
          submitLabel={t("enregistrer_la_cible")}
        />
      </DetailsCard>
    </>
  );
}
