import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRow, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { Textarea } from "@/components/ui/textarea";
import {
  findDuplicateCandidates,
  getContactPageData,
  listContactAccessLog,
  listOrgUsers,
  logContactAccess,
} from "@/db/queries/contacts";
import {
  deleteContactAction,
  mergeContactsAction,
  saveContactTagsAction,
  updateContactAction,
} from "@/lib/contacts/actions";
import { formatDate, formatDateTime, formatEuros } from "@/lib/format";
import { requireUser } from "@/lib/session";

const ACTIVITY_LABELS: Record<string, string> = {
  call: "Appel",
  email: "Email",
  meeting: "Rendez-vous",
  note: "Note",
};

const ACCESS_LABELS: Record<string, string> = {
  view: "Consultation",
  export: "Export",
  delete: "Suppression",
  merge: "Fusion",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
};

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const data = await getContactPageData(user, id).catch(() => null);
  if (!data) notFound();

  const { contact, tags, allTags, deals, tasks, activities, company, employees, owner } = data;
  const isPerson = contact.kind === "person";

  // Journal des accès : la consultation est tracée côté serveur, dédupliquée
  // à l'heure (exigence données personnelles, docs/module-relationnel.md §C).
  await logContactAccess(contact, user.id, "view");

  const [accessLog, orgUsers, duplicates] = await Promise.all([
    listContactAccessLog(user, id),
    listOrgUsers(user),
    contact.deletedAt
      ? Promise.resolve([])
      : findDuplicateCandidates(user, { name: contact.name, email: contact.email }, id),
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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Tâches ouvertes</h2>
        {tasks.length === 0 ? (
          <EmptyState>Aucune tâche pour ce contact.</EmptyState>
        ) : (
          <ListCard>
            {tasks.map((t) => (
              <ListRow key={t.id}>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{t.title}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t.dueAt ? `Échéance le ${formatDate(t.dueAt)}` : "Sans échéance"}
                    {` · priorité ${PRIORITY_LABELS[t.priority] ?? t.priority}`}
                  </span>
                </div>
              </ListRow>
            ))}
          </ListCard>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Interactions</h2>
        {activities.length === 0 ? (
          <EmptyState>
            Aucune interaction enregistrée. Appels, rendez-vous et notes se consigneront ici.
          </EmptyState>
        ) : (
          <ListCard>
            {activities.map((a) => (
              <ListRow key={a.id}>
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{ACTIVITY_LABELS[a.type] ?? a.type}</span>
                  {a.content && <span className="truncate text-sm text-muted-foreground">{a.content}</span>}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDateTime(a.occurredAt)}
                </span>
              </ListRow>
            ))}
          </ListCard>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Newsletters reçues</h2>
        <EmptyState>
          Rien à montrer : l&apos;outil compose les newsletters mais ne les envoie pas — l&apos;envoi
          se fait depuis ton outil d&apos;emailing. Cette section se remplira quand une
          synchronisation ramènera l&apos;historique d&apos;envoi.
        </EmptyState>
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
