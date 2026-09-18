import Link from "next/link";
import { nullIfNotFound } from "@/lib/errors";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Banknote, Mail, Phone, Trophy, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DealStatusBadge } from "@/components/deals/deal-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { InlineDetails } from "@/components/ui/inline-details";
import { Input } from "@/components/ui/input";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { MetricDefinitions } from "@/components/analytics/metric-definitions";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/components/app-shell/page-header";
import { ShareStatusBadge } from "@/components/deal-shares/share-status-badge";
import { StatTile } from "@/components/stat-tile";
import { Textarea } from "@/components/ui/textarea";
import { getPartner, listPartnerBrought, listPartnerFigures, PARTNER_RATE_MIN } from "@/db/queries/partners";
import { getPreferences } from "@/db/queries/preferences";
import { listDealSharesForPartner } from "@/db/queries/deal-shares";
import { updatePartnerAction } from "@/lib/deals/actions";
import { FILTER_PARAM, serializeFilters } from "@/lib/display/filters";
import { queryString } from "@/lib/display/state";
import { withRememberedPeriod } from "@/lib/display/period";
import { metricsOfFamily, parseMetricFilters } from "@/lib/metrics";
import { periodPhrase } from "@/lib/metrics/period-phrase";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

/**
 * LA FICHE D'UN CONFRÈRE (lot 3, étape 2) — EN LECTURE D'ABORD. Elle
 * s'ouvrait sur son formulaire d'édition : sept champs vides ou pleins,
 * aucun chiffre, et pour savoir ce que ce confrère avait apporté il fallait
 * aller sur un autre écran. Désormais elle répond d'abord à « où en
 * sommes-nous avec lui » — ses chiffres sur la période partagée, les fiches
 * qu'il a amenées, les affaires qui en sont nées, les affaires qu'on lui a
 * partagées — et le formulaire attend derrière « Modifier ».
 *
 * Les chiffres viennent de `listPartnerFigures`, la MÊME requête que le
 * tableau de la liste : une seule définition par indicateur, affichée en
 * bas de page (registre des métriques, famille `referrals`).
 *
 * Ce qui manque encore ici et attend la migration 0023 : le conseiller
 * responsable de la relation, le journal des échanges saisis à la main, les
 * tâches rattachées au confrère, et la veille « sans apport depuis N jours ».
 */
export default async function PartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getTranslations("partners.detail");
  const tm = await getTranslations("metrics");
  const fmt = await getFormats();
  const user = await requireUser();
  const { id } = await params;
  const raw = await searchParams;

  const partner = await nullIfNotFound(getPartner(user, id));
  if (!partner) notFound();

  // LA période du produit (lot 1) : celle de l'adresse, sinon celle dont la personne se souvient. Elle ne se
  // choisit PAS ici — une fiche n'est pas un écran de liste, son adresse ne se mémorise pas (screens.ts) ; la
  // page dit donc sur quelle fenêtre elle compte, et renvoie à la liste pour en changer.
  const parsed = parseMetricFilters(withRememberedPeriod({ periode: raw.periode, du: raw.du, au: raw.au }, await getPreferences(user)), fmt.timeZone);
  const [figures, brought, history] = await Promise.all([
    listPartnerFigures(user, { from: parsed.filters.from, to: parsed.filters.to }),
    listPartnerBrought(user, id),
    listDealSharesForPartner(user, id),
  ]);
  const f = figures.get(id) ?? {
    partnerId: id,
    broughtInPeriod: 0,
    dealsOpen: 0,
    dealsWon: 0,
    wonAmount: 0,
    transformationRate: null,
    missingForRate: PARTNER_RATE_MIN,
    lastBroughtAt: null,
    lastExchangeAt: null,
  };

  // Ses contacts, sur l'écran des contacts : le constructeur de filtres du lot 3 porte la question, écrite par
  // le module qui possède la syntaxe (jamais une adresse assemblée à la main ici).
  const broughtFilter = serializeFilters([{ field: "apporteur", type: "liste", operator: "eq", values: [id] }]);
  const broughtHref = `/contacts${queryString({ [FILTER_PARAM]: broughtFilter })}`;
  const addContactHref = `/contacts${queryString({ [FILTER_PARAM]: broughtFilter, nouveau: "1" })}`;

  async function savePartner(formData: FormData) {
    "use server";
    // Pas de requireUser() ici : updatePartnerAction en fait déjà un
    // (src/lib/deals/actions.ts) — jamais deux vérifications qui pourraient diverger.
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    await updatePartnerAction(id, {
      name,
      company: String(formData.get("company") ?? "").trim() || null,
      profession: String(formData.get("profession") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      active: formData.get("active") === "on",
    });
    redirect(`/partenaires/${id}`);
  }

  return (
    <>
      <PageHeader
        title={partner.name}
        description={[partner.profession, partner.company].filter(Boolean).join(" · ") || undefined}
        backTo={{ href: "/partenaires", label: t("partenaires") }}
        // La première chose qu'on fait sur une fiche partenaire : l'appeler ou lui écrire (audit UI du 2026-09-14).
        actions={
          <>
            {!partner.active && <Badge variant="secondary">{t("inactif")}</Badge>}
            <Link href={addContactHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <UserPlus />
              {t("ajouter_un_contact")}
            </Link>
            {partner.email && (
              <a href={`mailto:${partner.email}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Mail />
                {t("ecrire")}
              </a>
            )}
            {partner.phone && (
              <a href={`tel:${partner.phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Phone />
                {t("appeler")}
              </a>
            )}
          </>
        }
      />

      {/* Ce qu'il a apporté, sur la période partagée — les quatre mêmes chiffres que le tableau de la liste. */}
      <section className="flex flex-col gap-3">
        <SectionHeading title={t("ce_qu_il_apporte")} description={t("sur_la_periode_partagee", { periodPhrase: periodPhrase(parsed, tm, fmt) })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label={t("contacts_apportes")} value={f.broughtInPeriod} icon={<UserPlus />} />
          <StatTile label={t("affaires_en_cours")} value={f.dealsOpen} icon={<Users />} />
          <StatTile label={t("affaires_gagnees")} value={f.dealsWon} icon={<Trophy />} />
          <StatTile label={t("montant_gagne")} value={f.wonAmount > 0 ? (fmt.money(f.wonAmount) ?? "—") : "—"} icon={<Banknote />} />
        </div>
        {/* Trois FAITS, hors période : un taux qui ment est masqué et le dit, une date absente s'écrit « Jamais ». */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm sm:grid-cols-3">
          <Fact
            label={t("transformation")}
            value={
              f.transformationRate === null ? (
                <span title={t("masque_sous_contacts", { n: PARTNER_RATE_MIN })}>—</span>
              ) : (
                fmt.percent(Math.round(f.transformationRate * 1000) / 10)
              )
            }
          />
          <Fact label={t("dernier_apport")} value={f.lastBroughtAt ? fmt.date(f.lastBroughtAt) : t("jamais")} />
          <Fact label={t("dernier_echange")} value={f.lastExchangeAt ? fmt.date(f.lastExchangeAt) : t("jamais")} />
        </dl>
      </section>

      {/* L'identité, EN LECTURE. Le formulaire attend derrière « Modifier » : on consulte une fiche bien plus
          souvent qu'on ne la corrige (même choix que partout ailleurs dans le produit). */}
      <Card>
        <CardHeader>
          <CardTitle>{t("fiche")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label={t("societe")} value={partner.company} />
            <Fact label={t("metier")} value={partner.profession} />
            <Fact
              label={t("email")}
              value={
                partner.email ? (
                  <a href={`mailto:${partner.email}`} className="break-words hover:underline">
                    {partner.email}
                  </a>
                ) : null
              }
            />
            <Fact
              label={t("telephone")}
              value={
                partner.phone ? (
                  <a href={`tel:${partner.phone.replace(/\s/g, "")}`} className="hover:underline">
                    {partner.phone}
                  </a>
                ) : null
              }
            />
            <Fact label={t("statut")} value={partner.active ? <Badge variant="secondary">{t("actif")}</Badge> : <Badge variant="outline">{t("inactif")}</Badge>} />
            <Fact label={t("notes")} value={partner.notes ? <span className="whitespace-pre-wrap">{partner.notes}</span> : null} className="sm:col-span-2" />
          </dl>

          <InlineDetails summary={t("modifier")}>
            <form action={savePartner} className="mt-3 flex flex-col gap-4">
              {/* Une colonne à 390 px (deux colonnes forcées tronquaient l'email), deux dès sm ; l'email — long — sur
                  toute la ligne et les notes en dessous : plus de cellule vide dans la grille. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("nom")} htmlFor="name">
                  <Input id="name" name="name" defaultValue={partner.name} required />
                </Field>
                <Field label={t("societe")} htmlFor="company">
                  <Input id="company" name="company" defaultValue={partner.company ?? ""} />
                </Field>
                <Field label={t("metier")} htmlFor="profession">
                  <Input id="profession" name="profession" defaultValue={partner.profession ?? ""} />
                </Field>
                <Field label={t("telephone")} htmlFor="phone">
                  <Input id="phone" name="phone" type="tel" defaultValue={partner.phone ?? ""} />
                </Field>
                <Field label={t("email")} htmlFor="email" className="sm:col-span-2">
                  <Input id="email" name="email" type="email" defaultValue={partner.email ?? ""} />
                </Field>
                <Field label={t("notes")} htmlFor="notes" className="sm:col-span-2">
                  <Textarea id="notes" name="notes" defaultValue={partner.notes ?? ""} className="min-h-16" />
                </Field>
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={partner.active} />
                {t("partenaire_actif")}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" className="w-fit">
                  {t("enregistrer")}
                </Button>
                <Button type="reset" variant="ghost">
                  {t("annuler")}
                </Button>
              </div>
            </form>
          </InlineDetails>
        </CardContent>
      </Card>

      {/* Les fiches qu'il a amenées — les dernières ; la liste filtrée déroule le reste. */}
      <section className="flex flex-col gap-3">
        <SectionHeading
          title={t("contacts_apportes")}
          count={brought.contactsTotal}
          trailing={
            brought.contactsTotal > brought.contacts.length ? (
              <Link href={broughtHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("voir_tous")}
              </Link>
            ) : undefined
          }
        />
        {brought.contacts.length === 0 ? (
          <EmptyState
            title={t("aucun_contact_apporte")}
            action={
              <Link href={addContactHref} className={buttonVariants({ variant: "outline" })}>
                {t("ajouter_un_contact")}
              </Link>
            }
          >
            {t("sur_une_fiche_contact_apporte_par")}
          </EmptyState>
        ) : (
          <ListCard>
            {brought.contacts.map((contact) => (
              <ListRowLink
                key={contact.id}
                href={`/contacts/${contact.id}`}
                title={contact.name}
                subtitle={contact.attributedAt ? t("apporte_le", { formatDate: fmt.date(contact.attributedAt) }) : t("apporte_date_inconnue")}
                trailing={contact.city ? <span className="text-xs text-muted-foreground">{contact.city}</span> : undefined}
              />
            ))}
          </ListCard>
        )}
      </section>

      {/* Ce que ces apports ont donné : les affaires des contacts qu'il a amenés. */}
      <section className="flex flex-col gap-3">
        <SectionHeading title={t("affaires_issues")} count={brought.dealsTotal} description={t("les_affaires_des_contacts_qu_il_a_amenes")} />
        {brought.deals.length === 0 ? (
          <EmptyState title={t("aucune_affaire_issue")}>{t("les_affaires_creees_sur_la_fiche")}</EmptyState>
        ) : (
          <ListCard>
            {brought.deals.map((deal) => (
              <ListRowLink
                key={deal.id}
                href={`/affaires/${deal.id}`}
                title={deal.title}
                subtitle={t("client_creee_le", { client: deal.contactName, formatDate: fmt.date(deal.createdAt) })}
                trailing={
                  <>
                    {deal.amount !== null && <span className="text-xs tabular-nums text-muted-foreground">{fmt.money(deal.amount)}</span>}
                    <DealStatusBadge label={deal.statusLabel} color={deal.statusColor} />
                  </>
                }
                chevron={false}
              />
            ))}
          </ListCard>
        )}
      </section>

      {/* Même motif que partout ailleurs (liste en carte sous un titre de
          section) — l'historique n'a pas de raison d'être « en carte dans
          une carte » alors que la même liste vit nue sur les autres écrans. */}
      <section className="flex flex-col gap-3">
        <SectionHeading title={t("affaires_partagees")} count={history.length} />
        {history.length === 0 ? (
          <EmptyState
            title={t("aucune_affaire_partagee_avec_ce_partenaire")}
            action={
              <Link href="/affaires" className={buttonVariants({ variant: "outline" })}>
                {t("voir_les_affaires")}
              </Link>
            }
          >
            {t("le_partage_se_fait_depuis_la_143b")}
          </EmptyState>
        ) : (
          <ListCard>
            {history.map(({ share, deal }) => (
              <ListRowLink
                key={share.id}
                href={`/affaires/${deal.id}`}
                title={deal.title}
                subtitle={t("envoyee_le", { formatDate: fmt.date(share.sentAt) })}
                trailing={<ShareStatusBadge status={share.status} />}
                chevron={false}
              />
            ))}
          </ListCard>
        )}
      </section>

      {/* Une seule définition par indicateur, celle qui gouverne le calcul — jamais une paraphrase. */}
      <MetricDefinitions metrics={metricsOfFamily("referrals")} />
    </>
  );
}

/** Un fait de la fiche : son nom, sa valeur, « — » quand il n'y en a pas. */
function Fact({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value === null || value === undefined || value === "" ? "—" : value}</dd>
    </div>
  );
}
