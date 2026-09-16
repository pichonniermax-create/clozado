import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { NativeSelect } from "@/components/ui/native-select";

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

      {/* Recherche côté serveur : nom, email, société, téléphone — juste sous l'en-tête (audit UI du 2026-09-14 :
          trois affordances de création la reléguaient en quatrième position). Une colonne à 390 px, une ligne dès sm. */}
      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          key={q ?? ""}
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("rechercher_un_nom_un_email_une_15ed")}
          aria-label={t("rechercher")}
          className="min-w-0 sm:max-w-md"
        />
        <div className="flex gap-2">
          {orgUsers.length > 1 && (
            <NativeSelect
              name="conseiller"
              defaultValue={ownerId ?? ""}
              aria-label={t("conseiller")}
              className="min-w-0 flex-1 sm:w-auto sm:flex-none"
            >
              <option value="">{t("tous_les_conseillers")}</option>
              {orgUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </NativeSelect>
          )}
          {/* Le bouton reste sur mobile : le filtre conseiller n'a pas d'auto-soumission. */}
          <Button type="submit" variant="outline">
            {t("rechercher")}
          </Button>
        </div>
      </form>

      {/* Reste dans le DOM même repliée : la visite guidée l'éclaire (`contacts-nouveau`) et `?nouveau=1` l'ouvre. */}
      <DetailsCard summary={t("nouveau_contact")} defaultOpen={params.nouveau === "1"} tour="contacts-nouveau">
        <ContactCreateForm orgUsers={orgUsers} currentUserId={user.id} />
      </DetailsCard>

      <section className="flex flex-col gap-3">
        {/* Un compte, pas un titre de section : il ne pèse plus autant que les noms de la liste. */}
        <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
          {t("contact_contacts", { total, n: (q && t("pour", { q })) ?? "" })}
        </p>

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
                // Sur mobile, l'email (ou le téléphone) seul — le reste dès sm : la ville disparaissait derrière une ellipse.
                subtitle={
                  <>
                    {c.email ?? c.phone ?? "—"}
                    {c.email && c.phone && (
                      <span className="hidden sm:inline">
                        {" · "}
                        {c.phone}
                      </span>
                    )}
                    {c.kind === "person" && c.companyName && (
                      <span className="hidden sm:inline">
                        {" · "}
                        {c.companyName}
                      </span>
                    )}
                    {c.city && (
                      <span className="hidden sm:inline">
                        {" · "}
                        {c.city}
                      </span>
                    )}
                  </>
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
