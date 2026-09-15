import Link from "next/link";
import { Briefcase, Route } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { SectionHeading } from "@/components/ui/section-heading";
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
import { NativeSelect } from "@/components/ui/native-select";

/**
 * Le rapprochement des origines : la liste configurée par l'organisation,
 * le débordement libre à rattacher (rétroactivement), et les affaires sans
 * origine dont le contact a pourtant un lead — le cas « créée à la main,
 * lead identifié après coup », qui ne se rattache qu'à la main.
 */
export default async function OriginsPage() {
  const t = await getTranslations("analytics.origines");
  const fmt = await getFormats();
  const user = await requireUser();

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


      <section className="flex flex-col gap-3">
        <SectionHeading title={t("a_rapprocher_titre")} count={unmatched.length > 0 ? unmatched.length : undefined} />
        {/* Une bonne nouvelle tient en une ligne (audit UI du 2026-09-14) : un grand cadre en tête de page pour dire « rien à faire » repoussait la liste utile. */}
        {unmatched.length === 0 ? (
          <EmptyState icon={<Route />}>{t("rien_a_rapprocher_ligne")}</EmptyState>
        ) : (
          <ListCard>
            {unmatched.map((u) => (
              <li key={u.raw} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {t.rich("lead_leads_visite_visites_simulation_simulations_d0e8", { raw: u.raw, leads: u.leads, events: u.events, formatDateTime: fmt.dateTime(u.lastSeenAt), span: (chunks) => <span className="text-sm font-medium">{chunks}</span>, span2: (chunks) => <span className="text-xs tabular-nums text-muted-foreground">{chunks}</span> })}
                </div>
                <form action={attachOriginAction} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                  <input type="hidden" name="raw" value={u.raw} />
                  {origins.length > 0 && (
                    <Field label={t("origine_existante")} htmlFor={`origin-${u.raw}`}>
                      <NativeSelect id={`origin-${u.raw}`} name="originId" defaultValue="" className="w-full sm:w-auto">
                        <option value="">{t("choisir")}</option>
                        {origins.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                  <Field label={origins.length > 0 ? t("ou_nouvelle_origine") : t("nouvelle_origine")} htmlFor={`new-${u.raw}`}>
                    <Input id={`new-${u.raw}`} name="newLabel" placeholder={u.raw} className="w-full sm:w-56" />
                  </Field>
                  <Button type="submit" variant="outline" className="w-full sm:w-auto">{t("rattacher")}</Button>
                </form>
              </li>
            ))}
          </ListCard>
        )}
      </section>

      <section className="flex flex-col gap-3">
        {/* Le geste de création vit dans l'en-tête de section (audit UI du 2026-09-14) : sous la liste, son libellé en gras se lisait comme une quatrième section. */}
        <SectionHeading
          title={t("origines_configurees_titre")}
          count={origins.length > 0 ? origins.length : undefined}
          trailing={
            <form action={createOriginAction} className="flex w-full items-center gap-2 sm:w-auto">
              <Input id="new-origin" name="label" required placeholder={t("simulateur_credit")} aria-label={t("nouvelle_origine")} className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
              <Button type="submit" variant="outline" className="shrink-0">{t("ajouter")}</Button>
            </form>
          }
        />
        {origins.length === 0 ? (
          <EmptyState title={t("aucune_origine_configuree")}>
            {t("cree_les_origines_que_tu_veux_03ba")}
          </EmptyState>
        ) : (
          <ListCard>
            {/* Chaque origine ouvre le funnel filtré sur elle : une ligne inerte ne disait qu'une date de création. */}
            {origins.map((o) => (
              <ListRowLink
                key={o.id}
                href={`/analytique/funnel?origine=${o.id}`}
                title={o.label}
                subtitle={t("creee_le_texte", { formatDate: fmt.date(o.createdAt) })}
                trailing={<span className="text-xs text-muted-foreground">{t("voir_le_funnel")}</span>}
              />
            ))}
          </ListCard>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title={t("affaires_sans_origine_titre")}
          count={orphanDeals.length > 0 ? orphanDeals.length : undefined}
          description={t("une_affaire_creee_avant_l_arrivee_0df8")}
        />
        {orphanDeals.length === 0 ? (
          <EmptyState icon={<Briefcase />}>{t("aucune_chaque_affaire_d_un_contact_2ec0")}</EmptyState>
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
