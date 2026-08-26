import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRow, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { Journal } from "@/components/activities/journal";
import { JOURNAL_ERROR_PARAM } from "@/components/activities/labels";
import { TaskSection } from "@/components/tasks/task-section";
import { Textarea } from "@/components/ui/textarea";
import { listContactJournal } from "@/db/queries/activities";
import {
  findDuplicateCandidates,
  getContactPageData,
  listContactAccessLog,
  listOrgUsers,
  logContactAccess,
} from "@/db/queries/contacts";
import {
  listMailTargets,
  listNewslettersReceivedByContact,
  listTargetsOfContact,
} from "@/db/queries/mail-targets";
import {
  createNewsletterForContactAction,
  deleteContactAction,
  mergeContactsAction,
  saveContactTagsAction,
  updateContactAction,
} from "@/lib/contacts/actions";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { TranslatorOf } from "@/i18n/translator";

/** Les gestes du journal d'accès, en mots — `contacts.detail.access.<geste>` ; un geste inconnu s'affiche tel quel. */
const ACCESS_ACTIONS = ["view", "export", "delete", "merge"] as const;
function accessLabel(action: string, t: TranslatorOf<"contacts.detail">): string {
  return (ACCESS_ACTIONS as readonly string[]).includes(action) ? t(`access.${action as (typeof ACCESS_ACTIONS)[number]}`) : action;
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `erreur` : section tâches ; `erreurJournal` : journal ; `erreurNewsletter` : rédaction depuis la fiche. */
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const tr = await getTranslations("contacts.detail");
  const fmt = await getFormats();
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;

  const data = await getContactPageData(user, id).catch(() => null);
  if (!data) notFound();

  const { contact, tags, allTags, deals, tasks, company, employees, owner } = data;
  const isPerson = contact.kind === "person";

  // Journal des accès : la consultation est tracée côté serveur, dédupliquée
  // à l'heure (exigence données personnelles, docs/module-relationnel.md §C).
  await logContactAccess(contact, user.id, "view");

  const [accessLog, orgUsers, duplicates, journal, mailTargets, contactTargets, received] = await Promise.all([
    listContactAccessLog(user, id),
    listOrgUsers(user),
    contact.deletedAt
      ? Promise.resolve([])
      : findDuplicateCandidates(user, { name: contact.name, email: contact.email }, id),
    contact.deletedAt ? Promise.resolve(null) : listContactJournal(user, id, await getTranslations("activities.queries")),
    contact.deletedAt ? Promise.resolve([]) : listMailTargets(user),
    // De quelles cibles cette fiche fait partie — recalculé maintenant, jamais une liste figée.
    contact.deletedAt ? Promise.resolve([]) : listTargetsOfContact(user, id),
    // Ce qu'elle a reçu : la photographie des envois marqués, même si la fiche est une tombale.
    listNewslettersReceivedByContact(user, id),
  ]);

  // -------------------------------------------------------------------
  // Pierre tombale : l'identité a été détruite, seule la traçabilité
  // des affaires demeure. Aucune modification possible.
  // -------------------------------------------------------------------
  if (contact.deletedAt) {
    return (
      <>
        <PageHeader
          title={contact.name}
          description={tr("fiche_supprimee_le_identite_effacee_tracabilite_32e3", { formatDate: fmt.date(contact.deletedAt) })}
          backTo={{ href: "/contacts", label: tr("contacts") }}
          actions={<Badge variant="secondary">{tr("supprimee")}</Badge>}
        />
        <DealsSection deals={deals} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={contact.name}
        description={
          [isPerson ? contact.jobTitle : null, isPerson ? contact.companyName : null, contact.city]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        backTo={{ href: "/contacts", label: tr("contacts") }}
        actions={
          <span className="flex items-center gap-2">
            {!isPerson && <Badge variant="secondary">{tr("societe")}</Badge>}
            {owner && (
              <span className="text-xs text-muted-foreground">{tr("suivi_par", { n: owner.name ?? owner.email })}</span>
            )}
          </span>
        }
      />

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge
              key={t.id}
              variant="outline"
              style={t.color ? { borderColor: t.color, color: t.color } : undefined}
            >
              {t.label}
            </Badge>
          ))}
        </div>
      )}

      {/* Les cibles dont cette fiche fait partie AUJOURD'HUI : un segment se
          recalcule, une étiquette posée ou retirée change la réponse. */}
      <p className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">{tr("dans_les_cibles")}</span>
        {contactTargets.length === 0 ? (
          <span className="text-muted-foreground">
            {tr.rich("aucune_pour_l_instant_voir_les_4a14", { link: (chunks) => <Link href="/cibles" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
          </span>
        ) : (
          contactTargets.map((t) => (
            <Badge key={t.id} variant="secondary" render={<Link href={`/cibles/${t.id}`} />}>
              {t.label}
            </Badge>
          ))
        )}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{tr("fiche")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            // Remonté quand la fiche change (édition, fusion) : des champs
            // non contrôlés dont les defaultValue bougent sous un composant
            // monté déclenchent l'avertissement Base UI et gardent l'ancienne
            // saisie à l'écran.
            key={contact.updatedAt.getTime()}
            action={updateContactAction.bind(null, contact.id)}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="kind" value={contact.kind} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {isPerson ? (
                <>
                  <Field label={tr("prenom")} htmlFor="firstName">
                    <Input id="firstName" name="firstName" defaultValue={contact.firstName ?? ""} />
                  </Field>
                  <Field label={tr("nom")} htmlFor="lastName">
                    <Input id="lastName" name="lastName" defaultValue={contact.lastName ?? ""} />
                  </Field>
                </>
              ) : (
                <Field label={tr("raison_sociale")} htmlFor="name" className="sm:col-span-2">
                  <Input id="name" name="name" defaultValue={contact.name} required />
                </Field>
              )}
              {isPerson && (
                <input type="hidden" name="name" value="" />
              )}
              <Field label={tr("email")} htmlFor="email">
                <Input id="email" name="email" type="email" defaultValue={contact.email ?? ""} />
              </Field>
              <Field label={tr("telephone")} htmlFor="phone">
                <Input id="phone" name="phone" defaultValue={contact.phone ?? ""} />
              </Field>
              {isPerson && (
                <>
                  <Field label={tr("societe")} htmlFor="companyName">
                    <Input id="companyName" name="companyName" defaultValue={contact.companyName ?? ""} />
                  </Field>
                  <Field label={tr("fonction")} htmlFor="jobTitle">
                    <Input id="jobTitle" name="jobTitle" defaultValue={contact.jobTitle ?? ""} />
                  </Field>
                  <Field label={tr("date_de_naissance")} htmlFor="birthDate">
                    <Input id="birthDate" name="birthDate" type="date" defaultValue={contact.birthDate ?? ""} />
                  </Field>
                </>
              )}
              <Field label={tr("ville")} htmlFor="city">
                <Input id="city" name="city" defaultValue={contact.city ?? ""} />
              </Field>
              <Field label={tr("code_postal")} htmlFor="postalCode">
                <Input id="postalCode" name="postalCode" defaultValue={contact.postalCode ?? ""} />
              </Field>
              <Field label={tr("pays")} htmlFor="country">
                <Input id="country" name="country" defaultValue={contact.country ?? ""} />
              </Field>
              {orgUsers.length > 0 && (
                <Field label={tr("conseiller_attribue")} htmlFor="ownerId">
                  <select
                    id="ownerId"
                    name="ownerId"
                    defaultValue={contact.ownerId ?? ""}
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">{tr("personne")}</option>
                    {orgUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <Field label={tr("notes")} htmlFor="notes">
              <Textarea id="notes" name="notes" defaultValue={contact.notes ?? ""} className="min-h-16" />
            </Field>
            <Button type="submit" className="w-fit">
              {tr("enregistrer")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Étiquettes — configurables par organisation, posées ici. */}
      <DetailsCard summary={tr("etiquettes")} variant="archive">
        <form action={saveContactTagsAction.bind(null, contact.id)} className="flex flex-col gap-3 p-4">
          {allTags.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {allTags.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={t.id}
                    defaultChecked={tags.some((x) => x.id === t.id)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {tr("aucune_etiquette_dans_ton_organisation_pour_4ff3")}
            </p>
          )}
          <Field label={tr("nouvelle_etiquette")} htmlFor="newTag" hint={tr("creee_pour_toute_l_organisation_et_98c8")}>
            <Input id="newTag" name="newTag" placeholder={tr("vip_prospect_notaire")} className="max-w-60" />
          </Field>
          <Button type="submit" variant="outline" className="w-fit">
            {tr("enregistrer_les_etiquettes")}
          </Button>
        </form>
      </DetailsCard>

      {!isPerson && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{tr("personnes_rattachees")}</h2>
          {employees.length === 0 ? (
            <EmptyState>
              {tr("aucune_personne_rattachee_a_cette_societe_ec5c")}
            </EmptyState>
          ) : (
            <ListCard>
              {employees.map((e) => (
                <ListRowLink
                  key={e.id}
                  href={`/contacts/${e.id}`}
                  title={e.name}
                  subtitle={[e.jobTitle, e.email].filter(Boolean).join(" · ") || "—"}
                />
              ))}
            </ListCard>
          )}
        </section>
      )}

      {isPerson && company && (
        <p className="text-sm text-muted-foreground">
          {tr.rich("rattache_a_la_societe", { name: company.name, link: (chunks) => <Link href={`/contacts/${company.id}`} className="font-medium underline underline-offset-2">{chunks}</Link> })}
        </p>
      )}

      <DealsSection deals={deals} contactId={contact.id} />

      <TaskSection
        tasks={tasks}
        backTo={`/contacts/${contact.id}`}
        contactId={contact.id}
        emptyText={tr("aucune_tache_pour_ce_contact_l_20ff")}
        erreur={query.erreur}
      />

      {/* Le journal unifié : ce qui s'est passé avec cette personne — ses
          interactions, et ce qui est arrivé à ses affaires (étapes, partages,
          tâches achevées) dans la même chronologie. */}
      {journal && (
        <Journal
          journal={journal}
          backTo={`/contacts/${contact.id}`}
          contactId={contact.id}
          context="contact"
          erreur={query[JOURNAL_ERROR_PARAM]}
          description={tr("appels_emails_rendez_vous_et_notes_920c")}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {tr("newsletters_recues", { n: (received.length > 0 && ` (${received.length})`) || "" })}
        </h2>
        {received.length === 0 ? (
          <EmptyState>
            {tr("aucune_newsletter_marquee_envoyee_a_cette_15d7")}
          </EmptyState>
        ) : (
          <ListCard>
            {received.map((n) => (
              <ListRowLink
                key={n.id}
                href={`/newsletters/${n.id}`}
                title={n.subject || n.title}
                subtitle={tr("envoyee_le", { value: n.sentAt ? fmt.date(n.sentAt) : "—", value2: n.topics.length > 0 ? tr("sujets", { join: n.topics.join(", ") }) : "" })}
              />
            ))}
          </ListCard>
        )}
        {query.erreurNewsletter && (
          <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
            {query.erreurNewsletter}
          </p>
        )}
        {mailTargets.length > 0 ? (
          <form
            action={createNewsletterForContactAction.bind(null, contact.id)}
            className="flex flex-wrap items-center gap-2"
          >
            {mailTargets.length > 1 ? (
              <select
                name="targetId"
                defaultValue={mailTargets[0].id}
                aria-label={tr("cible")}
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {mailTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="targetId" value={mailTargets[0].id} />
            )}
            <Button type="submit" variant="outline">
              <Mail />
              {tr("rediger_une_newsletter_pour_ce_contact")}
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              {tr("ouvre_l_editeur_sur_un_brouillon_5a8a")}
            </p>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            {tr.rich("pour_rediger_une_newsletter_depuis_cette_d057", { link: (chunks) => <Link href="/cibles" className="underline underline-offset-2">{chunks}</Link> })}
          </p>
        )}
      </section>

      {duplicates.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <h2 className="text-sm font-semibold">{tr("doublons_possibles")}</h2>
          <p className="text-sm text-muted-foreground">
            {tr.rich("cette_fiche_porte_ces_fiches_portent_6dd9", { count: duplicates.length, span: (chunks) => <span className="font-medium">{chunks}</span> })}
          </p>
          <ul className="flex flex-col gap-2">
            {duplicates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <Link href={`/contacts/${d.id}`} className="font-medium underline underline-offset-2">
                    {d.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {[d.email, d.companyName].filter(Boolean).map((x) => ` · ${x}`)}
                  </span>
                </span>
                <form action={mergeContactsAction.bind(null, contact.id, d.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    {tr("fusionner_dans_cette_fiche")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DetailsCard variant="archive" summary={tr("journal_des_acces", { count: accessLog.length })} flush>
        <ul className="divide-y divide-border">
          {accessLog.map((entry) => (
            <ListRow key={entry.id} className="py-2.5">
              <span className="text-sm">
                {accessLabel(entry.action, tr)}
                <span className="text-muted-foreground">
                  {" · "}
                  {entry.userName || entry.userEmail || tr("systeme")}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {fmt.dateTime(entry.createdAt)}
              </span>
            </ListRow>
          ))}
        </ul>
      </DetailsCard>

      <DetailsCard variant="archive" summary={tr("export_et_suppression")}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {tr("toutes_les_donnees_de_cette_fiche_873e")}
            </p>
            <a
              href={`/api/contacts/${contact.id}/export`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download />
              {tr("exporter_les_donnees")}
            </a>
          </div>
          <form
            action={deleteContactAction.bind(null, contact.id)}
            className="flex flex-col gap-3 border-t border-border pt-4"
          >
            <p className="text-sm text-muted-foreground">
              {tr("la_suppression_detruit_l_identite_nom_8228")}
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" required className="mt-0.5" />
              {tr("je_comprends_que_cette_suppression_est_efda")}
            </label>
            <Button type="submit" variant="destructive" className="w-fit" size="sm">
              {tr("supprimer_ce_contact")}
            </Button>
          </form>
        </div>
      </DetailsCard>
    </>
  );
}

function DealsSection({
  deals,
  contactId,
}: {
  deals: { id: string; title: string; estimatedAmount: string | null; createdAt: Date }[];
  contactId?: string;
}) {
  const t = useTranslations("contacts.detail");
  const fmt = use(getFormats());
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("affaires_liees")}</h2>
        {contactId && (
          <Link
            href={`/affaires?contact=${contactId}`}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("nouvelle_affaire_pour_ce_contact")}
          </Link>
        )}
      </div>
      {deals.length === 0 ? (
        <EmptyState>
          {t("aucune_affaire_reliee_a_cette_fiche")}{" "}
          {contactId ? (
            <Link href={`/affaires?contact=${contactId}`} className="underline underline-offset-2 hover:text-foreground">
              {t("cree_la_premiere_depuis_le_pipeline")}
            </Link>
          ) : (
            t("elles_apparaitront_ici")
          )}
          .
        </EmptyState>
      ) : (
        <ListCard>
          {deals.map((d) => (
            <ListRowLink
              key={d.id}
              href={`/affaires/${d.id}`}
              title={d.title}
              subtitle={t("creee_le", { formatDate: fmt.date(d.createdAt) })}
              trailing={
                d.estimatedAmount ? (
                  <span className="text-sm font-medium tabular-nums">
                    {fmt.money(d.estimatedAmount)}
                  </span>
                ) : undefined
              }
            />
          ))}
        </ListCard>
      )}
    </section>
  );
}
