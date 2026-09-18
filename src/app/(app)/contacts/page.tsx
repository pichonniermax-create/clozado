import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ContactCreateForm } from "@/components/contacts/contact-create-form";
import { defaultOwnerId } from "@/lib/default-owner";
import { DetailsCard } from "@/components/ui/details-card";
import { DensityToggle } from "@/components/display/density-toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips, type FilterChip } from "@/components/display/filter-chips";
import { Input } from "@/components/ui/input";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { Upload } from "lucide-react";
import { CONTACT_SORTS, CONTACT_STALE_DAYS, CONTACTS_PAGE_SIZE, listContacts, listOrgUsers, type ContactSort } from "@/db/queries/contacts";
import { listPartners } from "@/db/queries/partners";
import { listContactTags } from "@/db/queries/contacts";
import { getFormats } from "@/i18n/formats";
import { FilterBuilder } from "@/components/display/filter-builder";
import { describeCondition } from "@/lib/display/filter-labels";
import { FILTER_PARAM, filterFields, parseFilters, resolveMe, serializeFilters, withoutCondition } from "@/lib/display/filters";
import { listOrigins } from "@/db/queries/acquisition";
import { PREF, preferenceString } from "@/db/queries/preferences";
import { requireUser } from "@/lib/session";
import { resolveDisplay } from "@/lib/display/resolve";
import { displayScreen } from "@/lib/display/screens";
import { DEFAULT_DENSITY, ME, queryString, resolveOwnerFilter, VIEW_PARAM, withParams } from "@/lib/display/state";
import { ViewsMenu } from "@/components/display/views-menu";
import { getTranslations } from "next-intl/server";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

/**
 * LA LISTE DES CONTACTS — l'écran de référence de l'affichage mémorisé
 * (lot 1). Tout ce qui cadre la liste vit dans l'adresse (recherche,
 * conseiller, nature, activité, tri, page, densité, vue) : un lien se
 * copie et montre la même chose à tout le monde. Le compte de la personne
 * en garde le dernier état — revenir par la navigation, recharger ou
 * ouvrir depuis un autre poste retrouve l'écran — et ses vues nommées.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getTranslations("contacts.list");
  const td = await getTranslations("ui.display");
  const tf = await getTranslations("ui.filters");
  const user = await requireUser();
  const raw = await searchParams;
  const screen = displayScreen("contacts")!;
  // La résolution de l'affichage (préférences + vues) part EN MÊME TEMPS que les conseillers : elle ne dépend pas
  // d'eux, et l'attendre seule ajoutait un aller-retour en série sur chaque ouverture de l'écran.
  // Tout ce qui ne dépend pas des paramètres part ensemble : l'affichage, les conseillers, et de quoi
  // renseigner l'apport et l'origine à la création (lot 2).
  const [display, orgUsers, partners, origins, tags, fmt] = await Promise.all([
    resolveDisplay(user, screen, raw),
    listOrgUsers(user),
    listPartners(user),
    listOrigins(user),
    listContactTags(user),
    getFormats(),
  ]);
  const p = display.params;

  const q = p.q?.trim() || undefined;
  const page = Number(p.page) > 0 ? Number(p.page) : 1;
  const ownerParam = p.conseiller;
  const ownerId = resolveOwnerFilter(ownerParam, user.id);
  const kind = p.type === "person" || p.type === "company" ? p.type : undefined;
  const stale = p.activite && p.activite in CONTACT_STALE_DAYS ? p.activite : undefined;
  const sort = (CONTACT_SORTS as readonly string[]).includes(p.tri ?? "") ? (p.tri as ContactSort) : "nom";
  const dir = p.dir === "desc" ? "desc" : "asc";
  const density = display.density ?? DEFAULT_DENSITY;

  // Le constructeur de filtres (lot 3) : lu dans l'adresse, « moi » résolu, combiné en ET avec les raccourcis.
  const conditions = parseFilters("contacts", p[FILTER_PARAM]);
  const { rows, total, pageCount } = await listContacts(user, {
    q,
    page,
    ownerId,
    kind,
    stale,
    sort,
    dir,
    filters: resolveMe(conditions, user.id),
    timeZone: fmt.timeZone,
  });

  /** Un lien vers CE MÊME écran, un paramètre changé — la page repart à 1 dès qu'un filtre bouge. */
  const hrefWith = (changes: Record<string, string | undefined>) =>
    `/contacts${queryString(withParams(p, { page: undefined, ...changes }))}`;
  const nameOf = (id: string) => {
    const found = orgUsers.find((u) => u.id === id);
    return found ? found.name || found.email : id;
  };

  // Les choix des champs de type liste, résolus une fois pour le constructeur ET pour les pastilles.
  const options: Record<string, { value: string; label: string }[]> = {
    conseiller: orgUsers.map((u) => ({ value: u.id, label: u.name || u.email })),
    apporteur: partners.filter((x) => x.active).map((x) => ({ value: x.id, label: x.name })),
    origine: origins.map((o) => ({ value: o.id, label: o.label })),
    etiquette: tags.map((tag) => ({ value: tag.id, label: tag.label })),
    nature: [
      { value: "person", label: t("personnes") },
      { value: "company", label: t("societes") },
    ],
  };
  const labelOf = (field: string, value: string) => options[field]?.find((o) => o.value === value)?.label ?? null;
  const builderFields = filterFields("contacts").map((f) => ({ key: f.key, type: f.type, me: f.me, options: options[f.key] }));
  // L'apporteur désigné par le filtre, s'il n'y en a qu'un : ce que le formulaire de création reprend (lot 3).
  const apporteurConditions = conditions.filter((c) => c.field === "apporteur");
  const broughtFromPartnerId =
    apporteurConditions.length === 1 && apporteurConditions[0].operator === "eq" && apporteurConditions[0].values.length === 1
      ? apporteurConditions[0].values[0]
      : null;
  // Une condition retirée : le même écran, cette condition en moins.
  const conditionChips: FilterChip[] = conditions.map((condition, index) => ({
    key: `f-${index}`,
    label: describeCondition(condition, (k, vals) => tf(k as never, vals as never), labelOf),
    href: hrefWith({ [FILTER_PARAM]: serializeFilters(withoutCondition(conditions, index)) || undefined }),
  }));

  // Ce qui restreint la liste, dit et retirable (lot 1, étape 4).
  const chips: FilterChip[] = [
    q ? { key: "q", label: td("recherche_valeur", { valeur: q }), href: hrefWith({ q: undefined }) } : null,
    ownerParam
      ? {
          key: "conseiller",
          label: ownerParam === ME ? td("conseiller_moi") : td("conseiller_valeur", { valeur: nameOf(ownerParam) }),
          href: hrefWith({ conseiller: undefined }),
        }
      : null,
    kind ? { key: "type", label: kind === "company" ? t("societes") : t("personnes"), href: hrefWith({ type: undefined }) } : null,
    stale ? { key: "activite", label: td("sans_activite_jours", { jours: CONTACT_STALE_DAYS[stale] }), href: hrefWith({ activite: undefined }) } : null,
  ].filter(Boolean) as FilterChip[];
  chips.push(...conditionChips);

  const sortHref = (key: ContactSort) => hrefWith({ tri: key === "nom" ? undefined : key, dir: sort === key && dir === "asc" ? "desc" : undefined });
  const pageHref = (n: number) => `/contacts${queryString(withParams(p, { page: n > 1 ? String(n) : undefined }))}`;

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

      {/* Les vues enregistrées, la densité : le cadrage de la liste, au-dessus de ses filtres. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ViewsMenu
          screen="contacts"
          basePath="/contacts"
          views={display.views.map((v) => ({ id: v.id, name: v.name, builtin: v.builtin, shared: v.shared, editable: v.editable, mine: v.mine }))}
          currentId={display.view?.id ?? null}
          modified={display.modified}
          state={new URLSearchParams(Object.entries(p).filter(([k]) => k !== VIEW_PARAM)).toString()}
          isAdmin={user.role === "admin"}
          defaultViewId={preferenceString(display.preferences, PREF.defaultView("contacts")) ?? null}
        />
        <div className="flex items-center gap-2">
          {/* Le constructeur : le champ, l'opérateur de son type, la valeur dans sa forme (lot 3). */}
          <FilterBuilder
            fields={builderFields}
            conditions={conditions}
            basePath="/contacts"
            keep={Object.fromEntries(Object.entries(p).filter(([k]) => k !== FILTER_PARAM && k !== "page"))}
          />
          <DensityToggle current={density} hrefFor={(d) => hrefWith({ densite: d === DEFAULT_DENSITY ? undefined : d })} />
        </div>
      </div>

      {/* Recherche côté serveur : nom, email, société, téléphone — juste sous l'en-tête (audit UI du 2026-09-14 :
          trois affordances de création la reléguaient en quatrième position). Une colonne à 390 px, une ligne dès sm. */}
      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Les autres choix suivent la recherche : filtrer ne fait pas perdre sa vue ni son tri. */}
        {Object.entries(p).map(([name, value]) => (name === "q" || name === "page" ? null : <input key={name} type="hidden" name={name} value={value} />))}
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
              defaultValue={ownerParam ?? ""}
              aria-label={t("conseiller")}
              className="min-w-0 flex-1 sm:w-auto sm:flex-none"
            >
              <option value="">{t("tous_les_conseillers")}</option>
              <option value={ME}>{td("conseiller_moi")}</option>
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

      {/* Les filtres rapides : un clic, pas un formulaire — « moi », la nature de la fiche, l'endormissement. */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <QuickFilter href={hrefWith({ conseiller: ownerParam === ME ? undefined : ME })} active={ownerParam === ME}>
          {td("conseiller_moi")}
        </QuickFilter>
        <QuickFilter href={hrefWith({ type: kind === "person" ? undefined : "person" })} active={kind === "person"}>
          {t("personnes")}
        </QuickFilter>
        <QuickFilter href={hrefWith({ type: kind === "company" ? undefined : "company" })} active={kind === "company"}>
          {t("societes")}
        </QuickFilter>
        <QuickFilter href={hrefWith({ activite: stale === "sans-90j" ? undefined : "sans-90j" })} active={stale === "sans-90j"}>
          {td("sans_activite_jours", { jours: 90 })}
        </QuickFilter>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          {td("trier_par")}
          <SortLink href={sortHref("nom")} active={sort === "nom"} dir={dir}>
            {td("tri_nom")}
          </SortLink>
          <SortLink href={sortHref("creation")} active={sort === "creation"} dir={dir}>
            {td("tri_creation")}
          </SortLink>
          <SortLink href={sortHref("activite")} active={sort === "activite"} dir={dir}>
            {td("tri_activite")}
          </SortLink>
        </span>
      </div>

      <FilterChips chips={chips} clearHref="/contacts" clearLabel={td("retirer_ce_filtre")} />

      {/* Reste dans le DOM même repliée : la visite guidée l'éclaire (`contacts-nouveau`) et `?nouveau=1` l'ouvre. */}
      <DetailsCard summary={t("nouveau_contact")} defaultOpen={raw.nouveau === "1"} tour="contacts-nouveau">
        {/* Le responsable proposé : la personne connectée, ou l'admin le plus ancien pour un super admin en substitution. */}
        <ContactCreateForm
          orgUsers={orgUsers}
          currentUserId={defaultOwnerId(user, orgUsers) ?? ""}
          // Arrivé depuis la fiche d'un confrère (`?f=apporteur:eq:<id>&nouveau=1`) : le filtre dit de qui on
          // parle, le formulaire le reprend. Un seul apporteur désigné, sinon rien — « ou l'un ou l'autre » ne
          // se préremplit pas.
          initialPartnerId={broughtFromPartnerId}
          // Seuls les confrères ACTIFS sont proposés : on n'apporte pas une fiche par quelqu'un qu'on a rangé.
          partners={partners.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, company: p.company, profession: p.profession }))}
          origins={origins.map((o) => ({ id: o.id, label: o.label }))}
        />
      </DetailsCard>

      <section className="flex flex-col gap-3">
        {/* Un compte, pas un titre de section : il ne pèse plus autant que les noms de la liste. */}
        <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
          {/* L'espace est posé ICI, pas dans la traduction : « 44 contactspour « a » » se lisait à l'écran. */}
          {t("contact_contacts", { total, n: q ? ` ${t("pour", { q })}` : "" })}
        </p>

        {rows.length === 0 ? (
          q || chips.length > 0 ? (
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
                dense={density === "compacte"}
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

/** Un filtre d'un clic : actif, il se retire du même clic — jamais deux gestes pour revenir en arrière. */
function QuickFilter({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "border-primary bg-primary/10 font-medium text-primary-ink" : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

function SortLink({ href, active, dir, children }: { href: string; active: boolean; dir: "asc" | "desc"; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("rounded px-1.5 py-0.5", active ? "font-medium text-foreground" : "hover:text-foreground")}>
      {children}
      {active && <span aria-hidden>{dir === "asc" ? " ↑" : " ↓"}</span>}
    </Link>
  );
}
