import Link from "next/link";
import { Route } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRow, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  listDealsWithoutOriginButLeads,
  listOrigins,
  listUnmatchedOrigins,
} from "@/db/queries/acquisition";
import { attachOriginAction, createOriginAction } from "@/lib/acquisition/actions";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

/**
 * Le rapprochement des origines : la liste configurée par l'organisation,
 * le débordement libre à rattacher (rétroactivement), et les affaires sans
 * origine dont le contact a pourtant un lead — le cas « créée à la main,
 * lead identifié après coup », qui ne se rattache qu'à la main.
 */
export default async function OriginsPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const t = await getTranslations("analytics.origines");
  const fmt = await getFormats();
  const user = await requireUser();
  const { erreur } = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title={t("origines")} description={t("d_ou_viennent_les_leads_et_1ef8")} />
        <EmptyState title={t("tu_es_en_vue_globale")}>
          {t("choisis_une_organisation_dans_le_bandeau_a942")}
        </EmptyState>
      </>
    );
  }

  const [origins, unmatched, orphanDeals] = await Promise.all([
    listOrigins(user),
    listUnmatchedOrigins(user),
    listDealsWithoutOriginButLeads(user),
  ]);

  return (
    <>
      <PageHeader
        title={t("origines")}
        description={t("une_origine_un_simulateur_une_page_9378")}
      />

      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("a_rapprocher", { n: (unmatched.length > 0 && ` (${unmatched.length})`) || "" })}</h2>
        {unmatched.length === 0 ? (
          <EmptyState icon={<Route />} title={t("rien_a_rapprocher")}>
            {t("tout_ce_qui_est_arrive_porte_5717")}
          </EmptyState>
        ) : (
          <ListCard>
            {unmatched.map((u) => (
              <li key={u.raw} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {t.rich("lead_leads_visite_visites_simulation_simulations_d0e8", { raw: u.raw, leads: u.leads, events: u.events, formatDateTime: fmt.dateTime(u.lastSeenAt), span: (chunks) => <span className="text-sm font-medium">{chunks}</span>, span2: (chunks) => <span className="text-xs tabular-nums text-muted-foreground">{chunks}</span> })}
                </div>
                <form action={attachOriginAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="raw" value={u.raw} />
                  {origins.length > 0 && (
                    <Field label={t("origine_existante")} htmlFor={`origin-${u.raw}`}>
                      <select id={`origin-${u.raw}`} name="originId" defaultValue="" className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                        <option value="">{t("choisir")}</option>
                        {origins.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label={origins.length > 0 ? t("ou_nouvelle_origine") : t("nouvelle_origine")} htmlFor={`new-${u.raw}`}>
                    <Input id={`new-${u.raw}`} name="newLabel" placeholder={u.raw} className="w-56" />
                  </Field>
                  <Button type="submit" variant="outline">{t("rattacher")}</Button>
                </form>
              </li>
            ))}
          </ListCard>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("origines_configurees", { n: (origins.length > 0 && ` (${origins.length})`) || "" })}</h2>
        {origins.length === 0 ? (
          <EmptyState title={t("aucune_origine_configuree")}>
            {t("cree_les_origines_que_tu_veux_03ba")}
          </EmptyState>
        ) : (
          <ListCard>
            {origins.map((o) => (
              <ListRow key={o.id}>
                {t.rich("creee_le", { label: o.label, formatDate: fmt.date(o.createdAt), span: (chunks) => <span className="text-sm font-medium">{chunks}</span>, span2: (chunks) => <span className="text-xs tabular-nums text-muted-foreground">{chunks}</span> })}
              </ListRow>
            ))}
          </ListCard>
        )}
        <form action={createOriginAction} className="flex flex-wrap items-end gap-2">
          <Field label={t("nouvelle_origine")} htmlFor="new-origin" className="w-72">
            <Input id="new-origin" name="label" required placeholder={t("simulateur_credit")} />
          </Field>
          <Button type="submit" variant="outline">{t("ajouter")}</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {t("affaires_sans_origine_chez_des_contacts_f2d8", { n: (orphanDeals.length > 0 && ` (${orphanDeals.length})`) || "" })}
        </h2>
        <p className="-mt-1 text-xs text-muted-foreground">
          {t("une_affaire_creee_avant_l_arrivee_0df8")}
        </p>
        {orphanDeals.length === 0 ? (
          <EmptyState>{t("aucune_chaque_affaire_d_un_contact_2ec0")}</EmptyState>
        ) : (
          <ListCard>
            {orphanDeals.map((d) => (
              <ListRowLink
                key={d.dealId}
                href={`/affaires/${d.dealId}`}
                title={d.title}
                subtitle={t("lead_leads_creee_le", { contactName: d.contactName, leadCount: d.leadCount, formatDate: fmt.date(d.createdAt) })}
                trailing={<span className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("rattacher")}</span>}
                chevron={false}
              />
            ))}
          </ListCard>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {t.rich("les_cles_et_les_domaines_de_2000", { link: (chunks) => <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
      </p>
    </>
  );
}
