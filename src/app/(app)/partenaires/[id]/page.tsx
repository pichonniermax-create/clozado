import Link from "next/link";
import { nullIfNotFound } from "@/lib/errors";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Banknote, Mail, Phone, Trophy, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DealStatusBadge } from "@/components/deals/deal-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { MetricDefinitions } from "@/components/analytics/metric-definitions";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/components/app-shell/page-header";
import { ShareStatusBadge } from "@/components/deal-shares/share-status-badge";
import { StatTile } from "@/components/stat-tile";
import { getPartner, listPartnerBrought, listPartnerFigures, PARTNER_RATE_MIN } from "@/db/queries/partners";
import { listPartnerJournal } from "@/db/queries/activities";
import { listOpenTasksForPartner } from "@/db/queries/tasks";
import { listOrgUsers } from "@/db/queries/contacts";
import { Journal } from "@/components/activities/journal";
import { JOURNAL_ERROR_PARAM } from "@/components/activities/labels";
import { TaskSection } from "@/components/tasks/task-section";
import { readFlash } from "@/lib/flash";
import { getPreferences } from "@/db/queries/preferences";
import { listDealSharesForPartner } from "@/db/queries/deal-shares";
import { patchPartnerFieldAction } from "@/lib/deals/actions";
import { FicheVersion, InlineField } from "@/components/fiches/inline-field";
import { versionOf } from "@/lib/fiches/inline";
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
  const ta = await getTranslations("activities.queries");
  const [figures, brought, history, journal, partnerTasks, orgUsers] = await Promise.all([
    listPartnerFigures(user, { from: parsed.filters.from, to: parsed.filters.to }),
    listPartnerBrought(user, id),
    listDealSharesForPartner(user, id),
    // Le journal du confrère et ce qu'on doit faire de lui (lot 3, migration 0023).
    listPartnerJournal(user, id, ta),
    listOpenTasksForPartner(user, id),
    listOrgUsers(user),
  ]);
  const owner = orgUsers.find((u) => u.id === partner.ownerId) ?? null;
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

  /** La version de la fiche, l'action serveur, la lecture seule — les trois choses que tout champ en place reçoit. */
  const champ = { version: versionOf(partner), save: patchPartnerFieldAction.bind(null, id), readOnly: user.readOnly } as const;

  // Ses contacts, sur l'écran des contacts : le constructeur de filtres du lot 3 porte la question, écrite par
  // le module qui possède la syntaxe (jamais une adresse assemblée à la main ici).
  const broughtFilter = serializeFilters([{ field: "apporteur", type: "liste", operator: "eq", values: [id] }]);
  const broughtHref = `/contacts${queryString({ [FILTER_PARAM]: broughtFilter })}`;
  const addContactHref = `/contacts${queryString({ [FILTER_PARAM]: broughtFilter, nouveau: "1" })}`;


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
          {/*
            MODIFICATION EN PLACE (chantier « les fiches deviennent
            modifiables ») : la fiche ne se lit plus d'un côté et ne se
            corrige plus de l'autre derrière « Modifier » — on clique sur
            la valeur. Le même composant que les fiches contact, société et
            affaire : un seul geste dans toute l'application.
          */}
          <FicheVersion version={champ.version}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InlineField {...champ} label={t("nom")} field="name" kind="texte" value={partner.name} required />
            <InlineField {...champ} label={t("societe")} field="company" kind="texte" value={partner.company ?? ""} />
            <InlineField {...champ} label={t("metier")} field="profession" kind="texte" value={partner.profession ?? ""} />
            <InlineField {...champ} label={t("telephone")} field="phone" kind="telephone" value={partner.phone ?? ""} />
            <InlineField {...champ} label={t("email")} field="email" kind="email" value={partner.email ?? ""} className="sm:col-span-2" />
            {/* Le conseiller qui tient la RELATION — pas le propriétaire d'une fiche : la personne à qui
                l'on demande « où en es-tu avec lui », et qui hérite de la tâche quand il s'endort. */}
            <InlineField
              {...champ}
              label={t("responsable")}
              field="ownerId"
              kind="liste"
              value={partner.ownerId ?? ""}
              display={owner ? owner.name || owner.email : ""}
              options={orgUsers.map((u) => ({ value: u.id, label: u.name || u.email }))}
              hint={t("le_conseiller_qui_tient_la_relation")}
            />
            {/* Le statut n'est pas un champ qu'on corrige : c'est une décision, avec son geste et sa confirmation. */}
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("statut")}</span>
              <span className="flex min-h-8 items-center">
                {partner.active ? <Badge variant="secondary">{t("actif")}</Badge> : <Badge variant="outline">{t("inactif")}</Badge>}
              </span>
            </div>
            <InlineField {...champ} label={t("notes")} field="notes" kind="texte_long" value={partner.notes ?? ""} className="sm:col-span-2" />
          </div>
          </FicheVersion>
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

      {/* Ce qu'il y a à faire avec lui. Toutes générées : la base n'accepte un confrère comme sujet de tâche
          que pour une règle (ici « sans apport depuis N jours »). */}
      <TaskSection
        tasks={partnerTasks}
        backTo={`/partenaires/${id}`}
        partnerId={id}
        showAdd={false}
        emptyText={t("aucune_tache_pour_ce_confrere")}
      />

      {/* Le journal du confrère (lot 3) : les échanges saisis à la main, et ce qu'il a fait des affaires
          partagées — la même chronologie que sur une fiche contact. C'est lui qui date « dernier échange ». */}
      <Journal
        journal={journal}
        backTo={`/partenaires/${id}`}
        partnerId={id}
        context="partner"
        erreur={readFlash(raw[JOURNAL_ERROR_PARAM])}
        description={t("appels_dejeuners_notes_et_ce_qu_il_a_fait_des_partages")}
      />

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
