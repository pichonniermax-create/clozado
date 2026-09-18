import Link from "next/link";
import { errorMessage, withError } from "@/lib/form-actions";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Banknote, Trophy, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app-shell/page-header";
import { StatTile } from "@/components/stat-tile";
import { Textarea } from "@/components/ui/textarea";
import { listDormantPartners, listPartnerFigures, listPartners, PARTNER_RATE_MIN } from "@/db/queries/partners";
import { getOwnOrganization } from "@/db/queries/organizations";
import { listOrgUsers } from "@/db/queries/contacts";
import { defaultOwnerId } from "@/lib/default-owner";
import { PREF, preferenceList, preferenceString } from "@/db/queries/preferences";
import { ColumnChooserTable } from "@/components/ui/column-chooser-table";
import { PeriodPicker } from "@/components/display/period-picker";
import { getFormats } from "@/i18n/formats";
import { metricsOfFamily, parseMetricFilters } from "@/lib/metrics";
import { MetricDefinitions } from "@/components/analytics/metric-definitions";
import { withRememberedPeriod } from "@/lib/display/period";
import { DensityToggle } from "@/components/display/density-toggle";
import { FilterChips, type FilterChip } from "@/components/display/filter-chips";
import { ViewsMenu } from "@/components/display/views-menu";
import { resolveDisplay } from "@/lib/display/resolve";
import { displayScreen } from "@/lib/display/screens";
import { DEFAULT_DENSITY, ME, queryString, resolveOwnerFilter, VIEW_PARAM, withParams } from "@/lib/display/state";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { createPartnerAction } from "@/lib/deals/actions";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

async function addPartner(formData: FormData) {
  "use server";
  await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(withError("/partenaires?nouveau=1", (await getTranslations("errors"))("le_nom_du_partenaire_est_obligatoire")));

  let destination = "/partenaires";
  try {
    await createPartnerAction({
      name,
      company: String(formData.get("company") ?? "").trim() || null,
      profession: String(formData.get("profession") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      ownerId: String(formData.get("ownerId") ?? "").trim() || null,
    });
  } catch (error) {
    destination = withError("/partenaires?nouveau=1", await errorMessage(error));
  }
  redirect(destination);
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getTranslations("partners.list");
  const td = await getTranslations("ui.display");
  const user = await requireUser();
  const params = await searchParams;
  const screen = displayScreen("partenaires")!;
  // Même chose qu'ailleurs : l'affichage et le répertoire partent ensemble (le second ne dépend d'aucun paramètre).
  const [display, all, fmt, orgUsers] = await Promise.all([resolveDisplay(user, screen, params), listPartners(user), getFormats(), listOrgUsers(user)]);
  const p = display.params;
  const density = display.density ?? DEFAULT_DENSITY;
  // LA période du produit (lot 1), désormais sur cet écran aussi : les chiffres d'apport sont datés (lot 3).
  const parsed = parseMetricFilters(withRememberedPeriod(p, display.preferences), fmt.timeZone);
  const figures = await listPartnerFigures(user, { from: parsed.filters.from, to: parsed.filters.to });
  // Le répertoire tient en mémoire (quelques dizaines de lignes) : filtrer et trier ici évite une requête par geste.
  const q = p.q?.trim().toLowerCase() || undefined;
  const metier = p.metier?.trim().toLowerCase() || undefined;
  const statut = p.statut === "actifs" || p.statut === "inactifs" || p.statut === "endormis" ? p.statut : undefined;
  // « Endormis » : la MÊME définition que la veille qui crée les tâches (`listDormantPartners`) — jamais une
  // seconde règle qui finirait par ne plus dire la même chose. Le seuil est celui de l'organisation.
  const org = user.organizationId ? await getOwnOrganization(user) : null;
  const dormant = org ? await listDormantPartners(org.id, org.partnerStaleDays, new Date()) : [];
  const dormantIds = new Set(dormant.map((d) => d.id));
  // « Les miens » (lot 3) : `moi` est résolu pour QUI REGARDE, jamais figé — une vue partagée dit « les tiens » à chacun.
  const ownerParam = p.conseiller;
  const ownerId = resolveOwnerFilter(ownerParam, user.id);
  const dir = p.dir === "desc" ? -1 : 1;
  const zero = { broughtInPeriod: 0, dealsOpen: 0, dealsWon: 0, wonAmount: 0, transformationRate: null, missingForRate: PARTNER_RATE_MIN, lastBroughtAt: null, lastExchangeAt: null };
  const figuresOf = (id: string) => figures.get(id) ?? { partnerId: id, ...zero };
  const filtered = all
    .filter((row) => (statut === "actifs" ? row.active : statut === "inactifs" ? !row.active : statut === "endormis" ? dormantIds.has(row.id) : true))
    .filter((row) => (ownerId ? row.ownerId === ownerId : true))
    .filter((row) => (metier ? (row.profession ?? "").toLowerCase() === metier : true))
    .filter((row) =>
      q ? [row.name, row.company, row.profession, row.email, row.phone].some((field) => (field ?? "").toLowerCase().includes(q)) : true
    )
    .sort((a, b) => {
      const fa = figuresOf(a.id);
      const fb = figuresOf(b.id);
      const byName = a.name.localeCompare(b.name);
      switch (p.tri) {
        case "metier":
          return dir * ((a.profession ?? "").localeCompare(b.profession ?? "") || byName);
        case "apports":
          return dir * (fb.broughtInPeriod - fa.broughtInPeriod || byName);
        case "montant":
          return dir * (fb.wonAmount - fa.wonAmount || byName);
        case "dernier-apport":
          // « Jamais » passe en dernier dans les deux sens : l'absence n'est pas la date la plus ancienne.
          if (!fa.lastBroughtAt && !fb.lastBroughtAt) return byName;
          if (!fa.lastBroughtAt) return 1;
          if (!fb.lastBroughtAt) return -1;
          return dir * (fb.lastBroughtAt.getTime() - fa.lastBroughtAt.getTime() || byName);
        default:
          return dir * byName;
      }
    });
  // Les totaux de l'en-tête portent sur CE qui est affiché : filtrer change les totaux, et c'est voulu.
  const totals = filtered.reduce(
    (acc, row) => {
      const f = figuresOf(row.id);
      return {
        brought: acc.brought + f.broughtInPeriod,
        won: acc.won + f.dealsWon,
        amount: acc.amount + f.wonAmount,
        active: acc.active + (row.active ? 1 : 0),
      };
    },
    { brought: 0, won: 0, amount: 0, active: 0 }
  );
  const professions = [...new Set(all.map((row) => row.profession?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));

  const nameOf = (userId: string) => {
    const found = orgUsers.find((u) => u.id === userId);
    return found ? found.name || found.email : userId;
  };
  const hrefWith = (changes: Record<string, string | undefined>) => `/partenaires${queryString(withParams(p, changes))}`;
  const chips: FilterChip[] = [
    q ? { key: "q", label: td("recherche_valeur", { valeur: p.q! }), href: hrefWith({ q: undefined }) } : null,
    statut ? { key: "statut", label: statut === "actifs" ? t("actifs") : statut === "inactifs" ? t("inactifs") : t("endormis"), href: hrefWith({ statut: undefined }) } : null,
    metier ? { key: "metier", label: p.metier!, href: hrefWith({ metier: undefined }) } : null,
    ownerParam
      ? {
          key: "conseiller",
          label: ownerParam === ME ? td("conseiller_moi") : td("conseiller_valeur", { valeur: nameOf(ownerParam) }),
          href: hrefWith({ conseiller: undefined }),
        }
      : null,
  ].filter(Boolean) as FilterChip[];

  return (
    <>
      <PageHeader
        title={t("partenaires")}
        description={t("les_confreres_vers_qui_tu_partages_8084")}
      />

      {/* Le cadrage de la liste : vues enregistrées, recherche, métier, statut, densité (lot 1). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ViewsMenu
          screen="partenaires"
          basePath="/partenaires"
          views={display.views.map((v) => ({ id: v.id, name: v.name, builtin: v.builtin, shared: v.shared, editable: v.editable, mine: v.mine }))}
          currentId={display.view?.id ?? null}
          modified={display.modified}
          state={new URLSearchParams(Object.entries(p).filter(([k]) => k !== VIEW_PARAM)).toString()}
          isAdmin={user.role === "admin"}
          defaultViewId={preferenceString(display.preferences, PREF.defaultView("partenaires")) ?? null}
        />
        <DensityToggle current={density} hrefFor={(d) => hrefWith({ densite: d === DEFAULT_DENSITY ? undefined : d })} />
      </div>

      {/* LA période du produit (lot 1), désormais ici : les chiffres d'apport de ce tableau en dépendent. */}
      <PeriodPicker basePath="/partenaires" parsed={parsed} keep={{ ...p, periode: undefined, du: undefined, au: undefined }} />

      {/* Ce que la période raconte, en tête — sur ce qui est AFFICHÉ : filtrer change les totaux, et c'est voulu. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("apports_sur_la_periode")} value={totals.brought} icon={<UserPlus />} />
        <StatTile label={t("affaires_gagnees")} value={totals.won} icon={<Trophy />} />
        <StatTile label={t("montant_gagne")} value={totals.amount > 0 ? (fmt.money(totals.amount) ?? "—") : "—"} icon={<Banknote />} />
        <StatTile label={t("confreres_actifs")} value={totals.active} icon={<Users />} />
      </div>

      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {Object.entries(p).map(([name, value]) => (name === "q" || name === "metier" ? null : <input key={name} type="hidden" name={name} value={value} />))}
        <Input
          key={p.q ?? ""}
          type="search"
          name="q"
          defaultValue={p.q ?? ""}
          placeholder={t("rechercher_un_partenaire")}
          aria-label={t("rechercher")}
          className="min-w-0 sm:max-w-md"
        />
        <div className="flex gap-2">
          {professions.length > 1 && (
            <NativeSelect name="metier" defaultValue={p.metier ?? ""} aria-label={t("metier")} className="min-w-0 flex-1 sm:w-auto sm:flex-none">
              <option value="">{t("tous_les_metiers")}</option>
              {professions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          )}
          <Button type="submit" variant="outline">
            {t("rechercher")}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <QuickFilter href={hrefWith({ statut: statut === "actifs" ? undefined : "actifs" })} active={statut === "actifs"}>
          {t("actifs")}
        </QuickFilter>
        <QuickFilter href={hrefWith({ statut: statut === "inactifs" ? undefined : "inactifs" })} active={statut === "inactifs"}>
          {t("inactifs")}
        </QuickFilter>
        {/* « Endormis » : ceux que la veille ira chercher — le compte est dans le libellé, pas dans une tuile
            de plus (quatre chiffres en tête suffisent, et celui-ci est une PILE à traiter, pas une mesure). */}
        {dormantIds.size > 0 && (
          <QuickFilter href={hrefWith({ statut: statut === "endormis" ? undefined : "endormis" })} active={statut === "endormis"}>
            {t("endormis_n", { n: dormantIds.size })}
          </QuickFilter>
        )}
        {/* « Les miens » : les confrères dont JE tiens la relation (lot 3). */}
        <QuickFilter href={hrefWith({ conseiller: ownerParam === ME ? undefined : ME })} active={ownerParam === ME}>
          {t("les_miens")}
        </QuickFilter>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          {td("trier_par")}
          <SortLink href={hrefWith({ tri: undefined, dir: !p.tri && dir === 1 ? "desc" : undefined })} active={!p.tri} descending={dir === -1}>
            {td("tri_nom")}
          </SortLink>
          <SortLink href={hrefWith({ tri: "metier", dir: p.tri === "metier" && dir === 1 ? "desc" : undefined })} active={p.tri === "metier"} descending={dir === -1}>
            {t("metier")}
          </SortLink>
          <SortLink href={hrefWith({ tri: "apports", dir: p.tri === "apports" && dir === 1 ? "desc" : undefined })} active={p.tri === "apports"} descending={dir === -1}>
            {t("tri_apports")}
          </SortLink>
          <SortLink href={hrefWith({ tri: "montant", dir: p.tri === "montant" && dir === 1 ? "desc" : undefined })} active={p.tri === "montant"} descending={dir === -1}>
            {t("tri_montant")}
          </SortLink>
          <SortLink href={hrefWith({ tri: "dernier-apport", dir: p.tri === "dernier-apport" && dir === 1 ? "desc" : undefined })} active={p.tri === "dernier-apport"} descending={dir === -1}>
            {t("tri_dernier_apport")}
          </SortLink>
        </span>
      </div>

      <FilterChips chips={chips} clearHref="/partenaires" clearLabel={td("retirer_ce_filtre")} />

      <DetailsCard summary={t("ajouter_un_partenaire")} defaultOpen={params.nouveau === "1"} tour="partenaires-nouveau">
        <form action={addPartner} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("nom")} htmlFor="name">
              <Input id="name" name="name" placeholder={t("camille_rousseau")} required />
            </Field>
            <Field label={t("societe")} htmlFor="company">
              <Input id="company" name="company" placeholder={t("rousseau_patrimoine")} />
            </Field>
            <Field label={t("metier")} htmlFor="profession">
              <Input id="profession" name="profession" placeholder={t("cgp_courtier_credit")} />
            </Field>
            <Field label={t("telephone")} htmlFor="phone">
              <Input id="phone" name="phone" type="tel" />
            </Field>
            {/* Qui tient la relation — proposé à celui qui crée la fiche, c'est presque toujours lui. */}
            <Field label={t("responsable")} htmlFor="ownerId">
              <NativeSelect id="ownerId" name="ownerId" defaultValue={defaultOwnerId(user, orgUsers) ?? ""}>
                <option value="">{t("personne")}</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {/* Le même ordre que la fiche : l'email sur toute la ligne, les notes en dessous — aucune cellule vide. */}
            <Field label={t("email")} htmlFor="email" className="sm:col-span-2">
              <Input id="email" name="email" type="email" />
            </Field>
            <Field label={t("notes")} htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" name="notes" className="min-h-16" />
            </Field>
          </div>
          <Button type="submit" className="w-fit">
            {t("ajouter_le_partenaire")}
          </Button>
        </form>
      </DetailsCard>

      {filtered.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? t("aucun_partenaire_pour_l_instant") : t("aucun_partenaire_ne_correspond")}
          action={
            <Link href={all.length === 0 ? "/partenaires?nouveau=1" : "/partenaires"} className={buttonVariants({ variant: "outline" })}>
              {all.length === 0 ? t("ajouter_un_partenaire") : t("tout_afficher")}
            </Link>
          }
        >
          {t("les_confreres_vers_qui_tu_partages_12b6")}
        </EmptyState>
      ) : (
        /* UN tableau, plus deux listes séparées : le statut est une COLONNE, pas une section — on trie et on
           filtre sur lui comme sur le reste. Les colonnes se choisissent et se mémorisent (lot 1). */
        <ColumnChooserTable
          storageKey="partenaires"
          stored={user.organizationId ? (preferenceList(display.preferences, PREF.columns("partenaires")) ?? null) : undefined}
          density={density}
          caption={t("les_confreres_et_ce_qu_ils_apportent")}
          columns={[
            { key: "partenaire", label: t("partenaire"), align: "left" },
            { key: "apportes", label: t("contacts_apportes") },
            { key: "en_cours", label: t("en_cours") },
            { key: "gagnees", label: t("gagnees") },
            { key: "montant", label: t("montant_gagne") },
            { key: "transformation", label: t("transformation") },
            { key: "dernier_apport", label: t("dernier_apport") },
            { key: "dernier_echange", label: t("dernier_echange"), defaultVisible: false },
            { key: "metier", label: t("metier"), align: "left", defaultVisible: false },
            { key: "responsable", label: t("responsable"), align: "left" },
            { key: "statut", label: t("statut"), align: "left" },
          ]}
          rows={filtered.map((row) => {
            const f = figuresOf(row.id);
            return {
              key: row.id,
              cells: {
                partenaire: (
                  <Link href={`/partenaires/${row.id}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                ),
                apportes: f.broughtInPeriod,
                en_cours: f.dealsOpen,
                gagnees: f.dealsWon,
                montant: f.wonAmount > 0 ? fmt.money(f.wonAmount) : "—",
                // Sous le seuil, on DIT pourquoi le taux manque plutôt que d'afficher un pourcentage qui ment.
                transformation:
                  f.transformationRate === null ? (
                    <span title={t("masque_sous_contacts", { n: PARTNER_RATE_MIN })}>—</span>
                  ) : (
                    fmt.percent(Math.round(f.transformationRate * 1000) / 10)
                  ),
                dernier_apport: f.lastBroughtAt ? fmt.date(f.lastBroughtAt) : "—",
                dernier_echange: f.lastExchangeAt ? fmt.date(f.lastExchangeAt) : "—",
                metier: [row.profession, row.company].filter(Boolean).join(" · ") || "—",
                responsable: row.ownerId ? nameOf(row.ownerId) : <span className="text-muted-foreground">{t("personne")}</span>,
                statut: !row.active ? (
                  <Badge variant="outline">{t("inactif")}</Badge>
                ) : dormantIds.has(row.id) ? (
                  <StatusBadge tone="warning" title={t("plus_rien_depuis_jours", { n: org?.partnerStaleDays ?? 0 })}>{t("endormi")}</StatusBadge>
                ) : (
                  <Badge variant="secondary">{t("actif")}</Badge>
                ),
              },
            };
          })}
          foot={{
            partenaire: t("partenaire_partenaires", { count: filtered.length }),
            apportes: totals.brought,
            en_cours: "",
            gagnees: totals.won,
            montant: totals.amount > 0 ? fmt.money(totals.amount) : "—",
            transformation: "",
            dernier_apport: "",
            dernier_echange: "",
            metier: "",
            responsable: "",
            statut: t("actif_actifs", { count: totals.active }),
          }}
        />
      )}

      {/* Les quatre chiffres de ce tableau, définis une fois pour toutes — le même texte que celui qui gouverne
          le calcul (registre des métriques, famille `referrals`), jamais une paraphrase d'écran. */}
      <MetricDefinitions metrics={metricsOfFamily("referrals")} />
    </>
  );
}

/** Un filtre d'un clic : actif, il se retire du même clic. */
function QuickFilter({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
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

function SortLink({ href, active, descending, children }: { href: string; active: boolean; descending: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("rounded px-1.5 py-0.5", active ? "font-medium text-foreground" : "hover:text-foreground")}>
      {children}
      {active && <span aria-hidden>{descending ? " ↓" : " ↑"}</span>}
    </Link>
  );
}
