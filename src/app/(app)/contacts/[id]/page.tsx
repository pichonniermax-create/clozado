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
import { formatDate, formatDateTime, formatEuros } from "@/lib/format";
import { requireUser } from "@/lib/session";

const ACCESS_LABELS: Record<string, string> = {
  view: "Consultation",
  export: "Export",
  delete: "Suppression",
  merge: "Fusion",
};

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `erreur` : section tâches ; `erreurJournal` : journal ; `erreurNewsletter` : rédaction depuis la fiche. */
  searchParams: Promise<Record<string, string | undefined>>;
}) {
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
    contact.deletedAt ? Promise.resolve(null) : listContactJournal(user, id),
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
          description={`Fiche supprimée le ${formatDate(contact.deletedAt)} — identité effacée, traçabilité des affaires conservée.`}
          backTo={{ href: "/contacts", label: "Contacts" }}
          actions={<Badge variant="secondary">Supprimée</Badge>}
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
        backTo={{ href: "/contacts", label: "Contacts" }}
        actions={
          <span className="flex items-center gap-2">
            {!isPerson && <Badge variant="secondary">Société</Badge>}
            {owner && (
              <span className="text-xs text-muted-foreground">Suivi par {owner.name ?? owner.email}</span>
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
        <span className="text-muted-foreground">Dans les cibles :</span>
        {contactTargets.length === 0 ? (
          <span className="text-muted-foreground">
            aucune pour l&apos;instant —{" "}
            <Link href="/cibles" className="underline underline-offset-2 hover:text-foreground">
              voir les cibles
            </Link>
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
          <CardTitle>Fiche</CardTitle>
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
                  <Field label="Prénom" htmlFor="firstName">
                    <Input id="firstName" name="firstName" defaultValue={contact.firstName ?? ""} />
                  </Field>
                  <Field label="Nom" htmlFor="lastName">
                    <Input id="lastName" name="lastName" defaultValue={contact.lastName ?? ""} />
                  </Field>
                </>
              ) : (
                <Field label="Raison sociale" htmlFor="name" className="sm:col-span-2">
                  <Input id="name" name="name" defaultValue={contact.name} required />
                </Field>
              )}
              {isPerson && (
                <input type="hidden" name="name" value="" />
              )}
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" defaultValue={contact.email ?? ""} />
              </Field>
              <Field label="Téléphone" htmlFor="phone">
                <Input id="phone" name="phone" defaultValue={contact.phone ?? ""} />
              </Field>
              {isPerson && (
                <>
                  <Field label="Société" htmlFor="companyName">
                    <Input id="companyName" name="companyName" defaultValue={contact.companyName ?? ""} />
                  </Field>
                  <Field label="Fonction" htmlFor="jobTitle">
                    <Input id="jobTitle" name="jobTitle" defaultValue={contact.jobTitle ?? ""} />
                  </Field>
                  <Field label="Date de naissance" htmlFor="birthDate">
                    <Input id="birthDate" name="birthDate" type="date" defaultValue={contact.birthDate ?? ""} />
                  </Field>
                </>
              )}
              <Field label="Ville" htmlFor="city">
                <Input id="city" name="city" defaultValue={contact.city ?? ""} />
              </Field>
              <Field label="Code postal" htmlFor="postalCode">
                <Input id="postalCode" name="postalCode" defaultValue={contact.postalCode ?? ""} />
              </Field>
              <Field label="Pays" htmlFor="country">
                <Input id="country" name="country" defaultValue={contact.country ?? ""} />
              </Field>
              {orgUsers.length > 0 && (
                <Field label="Conseiller attribué" htmlFor="ownerId">
                  <select
                    id="ownerId"
                    name="ownerId"
                    defaultValue={contact.ownerId ?? ""}
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">Personne</option>
                    {orgUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" defaultValue={contact.notes ?? ""} className="min-h-16" />
            </Field>
            <Button type="submit" className="w-fit">
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Étiquettes — configurables par organisation, posées ici. */}
      <DetailsCard summary="Étiquettes" variant="archive">
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
              Aucune étiquette dans ton organisation pour l&apos;instant — crée la première ci-dessous.
            </p>
          )}
          <Field label="Nouvelle étiquette" htmlFor="newTag" hint="Créée pour toute l'organisation et posée sur cette fiche.">
            <Input id="newTag" name="newTag" placeholder="VIP, Prospect, Notaire…" className="max-w-60" />
          </Field>
          <Button type="submit" variant="outline" className="w-fit">
            Enregistrer les étiquettes
          </Button>
        </form>
      </DetailsCard>

      {!isPerson && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Personnes rattachées</h2>
          {employees.length === 0 ? (
            <EmptyState>
              Aucune personne rattachée à cette société. Le lien se pose depuis la fiche d&apos;une
              personne.
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
          Rattaché à la société{" "}
          <Link href={`/contacts/${company.id}`} className="font-medium underline underline-offset-2">
            {company.name}
          </Link>
          .
        </p>
      )}

      <DealsSection deals={deals} contactId={contact.id} />

      <TaskSection
        tasks={tasks}
        backTo={`/contacts/${contact.id}`}
        contactId={contact.id}
        emptyText="Aucune tâche pour ce contact — l'ajout rapide ci-dessous la rattache à cette fiche."
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
          description="Appels, emails, rendez-vous et notes — et ce que ses affaires racontent : étapes franchies, partages, tâches achevées."
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          Newsletters reçues{received.length > 0 && ` (${received.length})`}
        </h2>
        {received.length === 0 ? (
          <EmptyState>
            Aucune newsletter marquée envoyée à cette personne. L&apos;historique se construit quand une newsletter
            est marquée « envoyée » à une cible dont elle fait partie — l&apos;envoi lui-même se fait depuis ton
            outil d&apos;emailing.
          </EmptyState>
        ) : (
          <ListCard>
            {received.map((n) => (
              <ListRowLink
                key={n.id}
                href={`/newsletters/${n.id}`}
                title={n.subject || n.title}
                subtitle={`Envoyée le ${n.sentAt ? formatDate(n.sentAt) : "—"}${n.topics.length > 0 ? ` · sujets : ${n.topics.join(", ")}` : ""}`}
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
                aria-label="Cible"
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
              Rédiger une newsletter pour ce contact
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              Ouvre l&apos;éditeur sur un brouillon dont le brief est déjà rempli depuis cette fiche
              (nom, fonction, société, étiquettes, affaires en cours) — jamais les notes.
            </p>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            Pour rédiger une newsletter depuis cette fiche, il faut d&apos;abord{" "}
            <Link href="/cibles" className="underline underline-offset-2">
              une cible
            </Link>{" "}
            dans ton organisation.
          </p>
        )}
      </section>

      {duplicates.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <h2 className="text-sm font-semibold">Doublons possibles</h2>
          <p className="text-sm text-muted-foreground">
            {duplicates.length > 1 ? "Ces fiches portent" : "Cette fiche porte"} le même nom ou le
            même email. Fusionner verse l&apos;autre fiche dans <span className="font-medium">celle-ci</span> :
            ses affaires, tâches et étiquettes arrivent ici, ses champs remplissent les tiens
            restés vides, puis elle est fermée.
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
                    Fusionner dans cette fiche
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DetailsCard variant="archive" summary={`Journal des accès (${accessLog.length})`} flush>
        <ul className="divide-y divide-border">
          {accessLog.map((entry) => (
            <ListRow key={entry.id} className="py-2.5">
              <span className="text-sm">
                {ACCESS_LABELS[entry.action] ?? entry.action}
                <span className="text-muted-foreground">
                  {" · "}
                  {entry.userName || entry.userEmail || "système"}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatDateTime(entry.createdAt)}
              </span>
            </ListRow>
          ))}
        </ul>
      </DetailsCard>

      <DetailsCard variant="archive" summary="Export et suppression">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Toutes les données de cette fiche — identité, étiquettes, affaires, tâches,
              interactions, journal des accès — dans un fichier JSON.
            </p>
            <a
              href={`/api/contacts/${contact.id}/export`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download />
              Exporter les données
            </a>
          </div>
          <form
            action={deleteContactAction.bind(null, contact.id)}
            className="flex flex-col gap-3 border-t border-border pt-4"
          >
            <p className="text-sm text-muted-foreground">
              La suppression détruit l&apos;identité (nom, coordonnées, notes, interactions,
              tâches) — définitivement. Les affaires restent, reliées à une fiche anonyme, et le
              nom du client y est effacé.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" required className="mt-0.5" />
              Je comprends que cette suppression est définitive.
            </label>
            <Button type="submit" variant="destructive" className="w-fit" size="sm">
              Supprimer ce contact
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
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Affaires liées</h2>
        {contactId && (
          <Link
            href={`/affaires?contact=${contactId}`}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Nouvelle affaire pour ce contact →
          </Link>
        )}
      </div>
      {deals.length === 0 ? (
        <EmptyState>
          Aucune affaire reliée à cette fiche —{" "}
          {contactId ? (
            <Link href={`/affaires?contact=${contactId}`} className="underline underline-offset-2 hover:text-foreground">
              crée la première depuis le pipeline
            </Link>
          ) : (
            "elles apparaîtront ici"
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
              subtitle={`Créée le ${formatDate(d.createdAt)}`}
              trailing={
                d.estimatedAmount ? (
                  <span className="text-sm font-medium tabular-nums">
                    {formatEuros(d.estimatedAmount)}
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
