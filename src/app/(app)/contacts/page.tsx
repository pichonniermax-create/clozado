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
import { getTranslations } from "next-intl/server";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; conseiller?: string; nouveau?: string }>;
}) {
  const t = await getTranslations("contacts.list");
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
        title={t("contacts")}
        description={t("tes_clients_et_prospects_personnes_et_1688")}
        actions={
          <Link href="/contacts/import" className={buttonVariants({ variant: "outline" })}>
            <Upload />
            {t("importer_un_csv")}
          </Link>
        }
      />

      <DetailsCard summary={t("nouveau_contact")} defaultOpen={params.nouveau === "1"}>
        <ContactCreateForm orgUsers={orgUsers} />
      </DetailsCard>

      {/* Recherche côté serveur : nom, email, société, téléphone. */}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Input
          key={q ?? ""}
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("rechercher_un_nom_un_email_une_15ed")}
          className="max-w-md"
        />
        {orgUsers.length > 1 && (
          <select
            name="conseiller"
            defaultValue={ownerId ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">{t("tous_les_conseillers")}</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          {t("rechercher")}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tabular-nums">
          {t("contact_contacts", { total, n: (q && t("pour", { q })) ?? "" })}
        </h2>

        {rows.length === 0 ? (
          q || ownerId ? (
            <EmptyState
              title={t("aucun_contact_ne_correspond_a_cette_e658")}
              action={
                <Link href="/contacts" className={buttonVariants({ variant: "outline" })}>
                  {t("tout_afficher")}
                </Link>
              }
            >
              {t("la_recherche_porte_sur_le_nom_b32c")}
            </EmptyState>
          ) : (
            <EmptyState
              title={t("aucun_contact_pour_l_instant")}
              action={
                <>
                  {t.rich("creer_une_fiche_importer_un_csv", { link: (chunks) => <Link href="/contacts?nouveau=1" className={buttonVariants()}>{chunks}</Link>, link2: (chunks) => <Link href="/contacts/import" className={buttonVariants({ variant: "outline" })}>{chunks}</Link> })}
                </>
              }
            >
              {t("tes_clients_et_prospects_personnes_et_e0e9")}
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
                trailing={c.kind === "company" ? <Badge variant="secondary">{t("societe")}</Badge> : undefined}
              />
            ))}
          </ListCard>
        )}

        {pageCount > 1 && (
          <nav className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("precedents")}
              </Link>
            ) : (
              <span />
            )}
            <span className="tabular-nums text-muted-foreground">
              {t("page_sur_par_page", { page, pageCount, contactsPageSize: CONTACTS_PAGE_SIZE })}
            </span>
            {page < pageCount ? (
              <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("suivants")}
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
