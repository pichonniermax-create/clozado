import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ContactCreateForm } from "@/components/contacts/contact-create-form";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { Upload } from "lucide-react";
import { CONTACTS_PAGE_SIZE, listContacts, listOrgUsers } from "@/db/queries/contacts";
import { requireUser } from "@/lib/session";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; conseiller?: string; nouveau?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;
  const ownerId = params.conseiller || undefined;

  const [{ rows, total, pageCount }, orgUsers] = await Promise.all([
    listContacts(user, { q, page, ownerId }),
    listOrgUsers(user),
  ]);

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (ownerId) sp.set("conseiller", ownerId);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return `/contacts${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Tes clients et prospects — personnes et sociétés, avec leurs affaires, tâches et échanges."
        actions={
          <Link href="/contacts/import" className={buttonVariants({ variant: "outline" })}>
            <Upload />
            Importer un CSV
          </Link>
        }
      />

      <DetailsCard summary="Nouveau contact" defaultOpen={params.nouveau === "1"}>
        <ContactCreateForm orgUsers={orgUsers} />
      </DetailsCard>

      {/* Recherche côté serveur : nom, email, société, téléphone. */}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input
          key={q ?? ""}
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Rechercher un nom, un email, une société, un téléphone…"
          className="max-w-md"
        />
        {orgUsers.length > 1 && (
          <select
            name="conseiller"
            defaultValue={ownerId ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Tous les conseillers</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Rechercher
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tabular-nums">
          {total} contact{total > 1 ? "s" : ""}
          {q && ` pour « ${q} »`}
        </h2>

        {rows.length === 0 ? (
          q || ownerId ? (
            <EmptyState
              title="Aucun contact ne correspond à cette recherche"
              action={
                <Link href="/contacts" className={buttonVariants({ variant: "outline" })}>
                  Tout afficher
                </Link>
              }
            >
              La recherche porte sur le nom, l&apos;email, la société et le téléphone — espaces et
              points compris.
            </EmptyState>
          ) : (
            <EmptyState
              title="Aucun contact pour l'instant"
              action={
                <>
                  <Link href="/contacts?nouveau=1" className={buttonVariants()}>
                    Créer une fiche
                  </Link>
                  <Link href="/contacts/import" className={buttonVariants({ variant: "outline" })}>
                    Importer un CSV
                  </Link>
                </>
              }
            >
              Tes clients et prospects, personnes et sociétés : chaque fiche relie ses affaires,
              ses tâches et ses échanges. Un import CSV depuis ton CRM est le plus rapide.
            </EmptyState>
          )
        ) : (
          <ListCard>
            {rows.map((c) => (
              <ListRowLink
                key={c.id}
                href={`/contacts/${c.id}`}
                title={c.name}
                subtitle={
                  [c.email, c.phone, c.kind === "person" ? c.companyName : null, c.city]
                    .filter(Boolean)
                    .join(" · ") || "—"
                }
                trailing={c.kind === "company" ? <Badge variant="secondary">Société</Badge> : undefined}
              />
            ))}
          </ListCard>
        )}

        {pageCount > 1 && (
          <nav className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                ← Précédents
              </Link>
            ) : (
              <span />
            )}
            <span className="tabular-nums text-muted-foreground">
              Page {page} sur {pageCount} · {CONTACTS_PAGE_SIZE} par page
            </span>
            {page < pageCount ? (
              <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Suivants →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </>
  );
}
