import Link from "next/link";
import { errorMessage, withError } from "@/lib/form-actions";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { Textarea } from "@/components/ui/textarea";
import { listPartners } from "@/db/queries/partners";
import { PREF, preferenceString } from "@/db/queries/preferences";
import { DensityToggle } from "@/components/display/density-toggle";
import { FilterChips, type FilterChip } from "@/components/display/filter-chips";
import { ViewsMenu } from "@/components/display/views-menu";
import { resolveDisplay } from "@/lib/display/resolve";
import { displayScreen } from "@/lib/display/screens";
import { DEFAULT_DENSITY, queryString, VIEW_PARAM, withParams } from "@/lib/display/state";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { createPartnerAction } from "@/lib/deals/actions";
import { requireUser } from "@/lib/session";
import { useTranslations } from "next-intl";
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
  const [display, all] = await Promise.all([resolveDisplay(user, screen, params), listPartners(user)]);
  const p = display.params;
  const density = display.density ?? DEFAULT_DENSITY;
  // Le répertoire tient en mémoire (quelques dizaines de lignes) : filtrer et trier ici évite une requête par geste.
  const q = p.q?.trim().toLowerCase() || undefined;
  const metier = p.metier?.trim().toLowerCase() || undefined;
  const statut = p.statut === "actifs" || p.statut === "inactifs" ? p.statut : undefined;
  const dir = p.dir === "desc" ? -1 : 1;
  const filtered = all
    .filter((row) => (statut === "actifs" ? row.active : statut === "inactifs" ? !row.active : true))
    .filter((row) => (metier ? (row.profession ?? "").toLowerCase() === metier : true))
    .filter((row) =>
      q ? [row.name, row.company, row.profession, row.email, row.phone].some((field) => (field ?? "").toLowerCase().includes(q)) : true
    )
    .sort((a, b) =>
      dir * (p.tri === "metier" ? (a.profession ?? "").localeCompare(b.profession ?? "") || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))
    );
  const active = filtered.filter((row) => row.active);
  const inactive = filtered.filter((row) => !row.active);
  const professions = [...new Set(all.map((row) => row.profession?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));

  const hrefWith = (changes: Record<string, string | undefined>) => `/partenaires${queryString(withParams(p, changes))}`;
  const chips: FilterChip[] = [
    q ? { key: "q", label: td("recherche_valeur", { valeur: p.q! }), href: hrefWith({ q: undefined }) } : null,
    statut ? { key: "statut", label: statut === "actifs" ? t("actifs") : t("inactifs"), href: hrefWith({ statut: undefined }) } : null,
    metier ? { key: "metier", label: p.metier!, href: hrefWith({ metier: undefined }) } : null,
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
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          {td("trier_par")}
          <SortLink href={hrefWith({ tri: undefined, dir: !p.tri && dir === 1 ? "desc" : undefined })} active={!p.tri} descending={dir === -1}>
            {td("tri_nom")}
          </SortLink>
          <SortLink href={hrefWith({ tri: "metier", dir: p.tri === "metier" && dir === 1 ? "desc" : undefined })} active={p.tri === "metier"} descending={dir === -1}>
            {t("metier")}
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

      <PartnerList
        title={t("partenaire_partenaires_actif_actifs", { count: active.length })}
        partners={active}
        dense={density === "compacte"}
        emptyState={
          <EmptyState
            title={t("aucun_partenaire_pour_l_instant")}
            action={
              <Link href="/partenaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>
                {t("ajouter_un_partenaire")}
              </Link>
            }
          >
            {t("les_confreres_vers_qui_tu_partages_12b6")}
          </EmptyState>
        }
      />

      {/* Les partenaires se désactivent, ne se suppriment pas — cohérent
          avec un journal qui n'efface jamais son historique. Ils restent
          donc visibles, mais rangés à part. */}
      {inactive.length > 0 && statut !== "actifs" && (
        <PartnerList
          title={t("inactif_inactifs", { count: inactive.length })}
          partners={inactive}
          dense={density === "compacte"}
          emptyState={null}
        />
      )}
    </>
  );
}

function PartnerList({
  title,
  partners,
  emptyState,
  dense,
}: {
  title: string;
  partners: Awaited<ReturnType<typeof listPartners>>;
  /** Ce qu'on montre quand la liste est vide — un état structuré qui dit quoi faire. */
  emptyState: ReactNode;
  dense?: boolean;
}) {
  const t = useTranslations("partners.list");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {partners.length === 0 ? (
        emptyState
      ) : (
        <ListCard>
          {partners.map((p) => (
            <ListRowLink
              key={p.id}
              href={`/partenaires/${p.id}`}
              dense={dense}
              title={p.name}
              subtitle={[p.profession, p.company].filter(Boolean).join(" · ") || "—"}
              trailing={!p.active ? <Badge variant="secondary">{t("inactif")}</Badge> : undefined}
            />
          ))}
        </ListCard>
      )}
    </section>
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
