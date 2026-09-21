import Link from "next/link";

import { nullIfNotFound } from "@/lib/errors";
import { notFound, redirect } from "next/navigation";
import { safeColor } from "@/lib/brand/color";
import { Button } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { DealStatusBadge } from "@/components/deals/deal-status-badge";
import { FicheVersion, InlineField } from "@/components/fiches/inline-field";
import { versionOf } from "@/lib/fiches/inline";
import { commissionOnOldAmount } from "@/lib/deals/commission-gap";
import { ListCard } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { Journal } from "@/components/activities/journal";
import { JOURNAL_ERROR_PARAM } from "@/components/activities/labels";
import { ConfirmCommissionButton } from "@/components/deal-shares/confirm-commission-button";
import { MarkCommissionSettledButton } from "@/components/deal-shares/mark-commission-settled-button";
import { ReissueShareButton } from "@/components/deal-shares/reissue-share-button";
import { ShareComposer } from "@/components/deal-shares/share-composer";
import { ShareStatusBadge } from "@/components/deal-shares/share-status-badge";
import { TaskSection } from "@/components/tasks/task-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { leadOriginLabel, listLeadsForContact } from "@/db/queries/acquisition";
import { listDealJournal } from "@/db/queries/activities";
import { setDealOriginAction } from "@/lib/acquisition/actions";
import { listCommissionsForDeal } from "@/db/queries/commissions";
import { listLossReasonsOf } from "@/db/queries/loss-reasons";
import { listOrgUsersOf } from "@/db/queries/contacts";
import { listDealShares } from "@/db/queries/deal-shares";
import {
  patchDealFieldAction,
  revokeDealShareAction,
} from "@/lib/deals/actions";
import { listDealStatuses } from "@/db/queries/deal-statuses";
import { listDealTypes } from "@/db/queries/deal-types";
import { getDeal, getDealStageDurations } from "@/db/queries/deals";
import { listOpenTasksForDeal } from "@/db/queries/tasks";
import { toRenderBrand } from "@/db/queries/newsletters";
import { listOrganizationAssetMeta } from "@/db/queries/organization-assets";
import { getOrganizationOfRecord } from "@/db/queries/organizations";
import { listPartners } from "@/db/queries/partners";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import type { TranslatorOf } from "@/i18n/translator";
import { NativeSelect } from "@/components/ui/native-select";
import { readFlash } from "@/lib/flash";

/** L'état d'une commission, en mots — `deals.detail.commissionStates.<état>` ; un état inconnu s'affiche tel quel. */
const COMMISSION_STATES = ["prevue", "confirmee", "reglee"] as const;
function commissionStateLabel(state: string, t: TranslatorOf<"deals.detail">): string {
  return (COMMISSION_STATES as readonly string[]).includes(state) ? t(`commissionStates.${state as (typeof COMMISSION_STATES)[number]}`) : state;
}

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `erreur` : section tâches ; `erreurJournal` : journal. */
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const tr = await getTranslations("deals.detail");
  const tq = await getTranslations("settings.queries");
  const fmt = await getFormats();
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;

  const deal = await nullIfNotFound(getDeal(user, id));
  if (!deal) notFound();

  const [org, types, statuses, partners, shares, commissions, journal, lossReasons, durations, orgUsers, dealTasks, contactLeads, assetMeta] = await Promise.all([
    // L'organisation de L'AFFAIRE, pas celle de l'utilisateur connecté :
    // c'est sa marque qui s'affiche dans l'aperçu du partage, et c'est en
    // son nom que le partage est émis. Identique pour un admin (il ne voit
    // que ses propres affaires), mais un super_admin n'a pas d'organisation
    // propre — `getOwnOrganizationOrThrow` levait alors une erreur et la
    // page renvoyait un 500.
    getOrganizationOfRecord(user, deal.organizationId),
    listDealTypes(user),
    listDealStatuses(user),
    listPartners(user),
    listDealShares(user, id),
    listCommissionsForDeal(user, id),
    listDealJournal(user, id, await getTranslations("activities.queries")),
    // Les motifs et les conseillers de L'ORGANISATION DE L'AFFAIRE (stabilisation, S4) : pour un super admin en
    // vue globale, `listLossReasons(user)` rendait ceux de toutes les organisations et `listOrgUsers(user)` aucun.
    listLossReasonsOf(deal.organizationId),
    getDealStageDurations(user, id),
    listOrgUsersOf(deal.organizationId),
    listOpenTasksForDeal(user, id),
    deal.contactId ? listLeadsForContact(user, deal.contactId) : Promise.resolve([]),
    // Le logo téléversé de l'organisation de l'affaire : l'aperçu du partage montre ce que le partenaire verra.
    listOrganizationAssetMeta(deal.organizationId),
  ]);
  const currentLead = contactLeads.find((l) => l.id === deal.leadId) ?? null;

  // Les étapes du pipeline de CETTE affaire — et ce qu'on en montre au
  // partenaire : jamais les étapes gagné/perdu (clore est un geste de
  // l'organisation, décision A du module relationnel).
  const pipelineStages = statuses.filter((s) => s.pipelineId === deal.pipelineId);
  const partnerStages = pipelineStages.filter((s) => s.outcome === null);

  const commissionByShareId = new Map(commissions.map((c) => [c.shareId, c]));
  /** La version de l'affaire, l'action serveur, la lecture seule — les trois choses que tout champ en place reçoit. */
  const champ = { version: versionOf(deal), save: patchDealFieldAction.bind(null, id), readOnly: user.readOnly } as const;
  const typeLabel = types.find((t) => t.id === deal.typeId)?.label ?? "—";
  const currentDealStatus = pipelineStages.find((s) => s.id === deal.statusId) ?? {
    id: deal.statusId,
    label: "—",
    color: null,
  };
  // Bornés à l'organisation de l'affaire, pas seulement à ceux que
  // l'appelant a le droit de voir : `listPartners` ne filtre rien pour un
  // super_admin, qui se voyait donc proposer les partenaires d'une AUTRE
  // organisation sur cette affaire. Le partage aurait été refusé à
  // l'enregistrement (createDealShare + FK composite), mais mieux vaut ne
  // pas proposer un choix qui ne peut pas aboutir. Sans effet pour un
  // admin : ses partenaires sont déjà ceux de l'affaire.
  const activePartners = partners.filter(
    (p) => p.active && p.organizationId === deal.organizationId
  );

  async function revoke(formData: FormData) {
    "use server";
    const shareId = String(formData.get("shareId") ?? "");
    if (!shareId) return;
    await revokeDealShareAction(shareId);
    redirect(`/affaires/${id}`);
  }

  return (
    <>
      <PageHeader
        title={deal.title}
        description={
          <>
            {typeLabel} ·{" "}
            {/* Le client mène à sa fiche : la parenté affaire → contact manquait (audit UI du 2026-09-14). */}
            {deal.contactId ? (
              <Link href={`/contacts/${deal.contactId}`} className="text-foreground underline-offset-2 hover:underline">
                {deal.clientName}
              </Link>
            ) : (
              deal.clientName
            )}
            {deal.estimatedAmount && ` · ≈ ${fmt.money(deal.estimatedAmount)}`}
          </>
        }
        backTo={{ href: "/affaires", label: tr("affaires") }}
        // Le statut est une information d'identité de l'affaire, pas une
        // section : il tenait une carte entière pour un seul badge. Il est
        // explicitement nommé « Statut de l'affaire » parce que la page
        // affiche juste en dessous des statuts de PARTAGE (acceptée,
        // refusée…) : deux vocabulaires proches, deux objets différents.
        actions={
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{tr("statut_de_l_affaire")}</span>
            <DealStatusBadge label={currentDealStatus.label} color={currentDealStatus.color} />
          </span>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{tr("pipeline")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/*
            MODIFICATION EN PLACE (chantier « les fiches deviennent
            modifiables ») : le formulaire d'ensemble a laissé la place au
            composant partagé des quatre fiches. L'ÉTAPE reste à part dans
            le fond — elle passe par le changement d'étape, qui écrit
            l'historique et le journal — mais le geste, lui, est le même.
          */}
          <FicheVersion version={champ.version}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InlineField {...champ} label={tr("nom_de_l_affaire")} field="title" kind="texte" value={deal.title} required className="sm:col-span-2" />
            <InlineField
              {...champ}
              label={tr("type_d_affaire")}
              field="typeId"
              kind="liste"
              required
              value={deal.typeId}
              display={typeLabel}
              options={types.map((type) => ({ value: type.id, label: type.label }))}
            />
            <InlineField
              {...champ}
              label={tr("etape")}
              field="statusId"
              kind="liste"
              required
              value={deal.statusId}
              display={currentDealStatus.label}
              options={pipelineStages.map((stage) => ({ value: stage.id, label: `${stage.label}${stage.outcome ? ` ${stage.outcome === "won" ? tr("gagne") : tr("perdu")}` : ""}` }))}
            />
            <InlineField
              {...champ}
              label={tr("montant_estime", { currency: fmt.currency })}
              field="estimatedAmount"
              kind="montant"
              value={deal.estimatedAmount ?? ""}
              display={fmt.money(deal.estimatedAmount) ?? ""}
            />
            <InlineField
              {...champ}
              label={tr("probabilite")}
              field="probability"
              kind="texte"
              value={deal.probability ? String(Number(deal.probability)) : ""}
              hint={
                "outcome" in currentDealStatus && currentDealStatus.probability != null
                  ? tr("vide_celle_de_l_etape", { formatPercent: fmt.percent(currentDealStatus.probability) ?? "" })
                  : tr("vide_celle_de_l_etape_f17a")
              }
            />
            <InlineField
              {...champ}
              label={tr("cloture_prevue")}
              field="expectedCloseDate"
              kind="date"
              value={deal.expectedCloseDate ?? ""}
              display={deal.expectedCloseDate ? fmt.date(new Date(`${deal.expectedCloseDate}T00:00:00`)) : ""}
            />
            <InlineField
              {...champ}
              label={tr("responsable")}
              field="ownerId"
              kind="liste"
              value={deal.ownerId ?? ""}
              display={orgUsers.find((u) => u.id === deal.ownerId)?.name || orgUsers.find((u) => u.id === deal.ownerId)?.email || ""}
              options={orgUsers.map((u) => ({ value: u.id, label: u.name || u.email }))}
            />
            {/* Le client : une vraie fiche, choisie par recherche. Une affaire née d'un nom libre en reçoit une ici. */}
            <InlineField
              {...champ}
              label={tr("client")}
              field="contactId"
              kind="rattachement"
              search="contact"
              value={deal.contactId ?? ""}
              display={deal.clientName}
            />
            {"outcome" in currentDealStatus && currentDealStatus.outcome === "lost" && (
              <InlineField
                {...champ}
                label={tr("motif_de_perte")}
                field="lossReasonId"
                kind="liste"
                value={deal.lossReasonId ?? ""}
                display={lossReasons.find((r) => r.id === deal.lossReasonId)?.label ?? ""}
                options={lossReasons.map((r) => ({ value: r.id, label: r.label }))}
                hint={tr("la_liste_se_configure_dans_marque_d1d6")}
                className="sm:col-span-2"
              />
            )}
          </div>
          </FicheVersion>
          {"outcome" in currentDealStatus && currentDealStatus.outcome === "lost" && !deal.lossReasonId && (
            <p className="text-xs text-muted-foreground">{tr("affaire_perdue", { value: tr("renseigne_le_motif_ci_dessous") })}</p>
          )}

          {durations.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {tr("temps_par_etape")}
              </h3>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {durations.map((d) => {
                  const days = Math.floor(d.ms / 86400000);
                  return (
                    <li key={d.label + String(d.current)} className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: safeColor(d.color, "var(--muted-foreground)") }}
                      />
                      <span>{d.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {/* Une étape terminale n'est pas « en cours » : « Perdue depuis 77 j ». */}
                        {d.current && "outcome" in currentDealStatus && currentDealStatus.outcome
                          ? tr("depuis_n", { n: days < 1 ? tr("moins_d_un_jour") : fmt.days(days) })
                          : `${days < 1 ? tr("moins_d_un_jour") : fmt.days(days)}${d.current ? tr("en_cours") : ""}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* L'origine : figée à la création depuis le dernier lead reçu avant,
          jamais rattachée toute seule après coup — ici, le geste humain, journalisé. */}
      <Card>
        <CardHeader>
          <CardTitle>{tr("origine")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Une seule phrase quand il n'y a rien : « Aucune origine » ne se dit pas deux fois. */}
          {(currentLead || contactLeads.length > 0) && (
            <p className="text-sm">
              {currentLead ? (
                <>
                  {tr.rich("lead_du", { formatDate: fmt.date(currentLead.receivedAt), leadOriginLabel: leadOriginLabel(currentLead, tq), span: (chunks) => <span className="font-medium">{chunks}</span> })}
                  {currentLead.pageUrl && <span className="text-muted-foreground"> · {currentLead.pageUrl}</span>}
                </>
              ) : (
                <span className="text-muted-foreground">{tr("aucune_origine_rattachee")}</span>
              )}
            </p>
          )}
          {!deal.contactId ? (
            // Le rattachement se fait dans le champ « Client » de la carte du haut : un seul geste, un seul endroit.
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">{tr("sans_fiche_contact_aucun_lead_ne_fe08")}</p>
              <p className="text-sm">{tr("rattachez_dans_le_champ_client")}</p>
            </div>
          ) : contactLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("ce_contact_n_a_recu_aucun_7e40")}</p>
          ) : (
            <form action={setDealOriginAction.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field
                label={tr("lead_a_l_origine_de_l_9387")}
                htmlFor="leadId"
                hint={tr("pose_automatiquement_a_la_creation_depuis_4f3d")}
              >
                <NativeSelect id="leadId" name="leadId" defaultValue={deal.leadId ?? ""} className="w-full sm:w-auto sm:min-w-64">
                  <option value="">{tr("aucune_origine")}</option>
                  {contactLeads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {fmt.date(l.receivedAt)} — {leadOriginLabel(l, tq)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Button type="submit" variant="outline">{tr("enregistrer")}</Button>
            </form>
          )}
        </CardContent>
      </Card>

      {shares.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {tr("partage_partages", { count: shares.length })}
          </h2>
          <ListCard>
            {shares.map(({ share, partnerName }) => {
              const commission = commissionByShareId.get(share.id);
              return (
                <li key={share.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      {tr.rich("envoye_le", { partnerName, formatDate: fmt.date(share.sentAt), n: (share.expiresAt && tr("expire_le", { formatDate: fmt.date(share.expiresAt) })) ?? "", span: (chunks) => <span className="truncate text-sm font-medium">{chunks}</span>, span2: (chunks) => <span className="text-xs tabular-nums text-muted-foreground">{chunks}</span> })}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <ShareStatusBadge status={share.status} />
                      {share.status !== "revoked" && (
                        <>
                          {/* Seul un partage en attente se renvoie (la requête le refuse de toute façon). */}
                          {share.status === "pending" && <ReissueShareButton shareId={share.id} />}
                          <form action={revoke}>
                            <input type="hidden" name="shareId" value={share.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              {tr("revoquer")}
                            </Button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>

                  {commission && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
                      <span className="text-xs">
                        {tr.rich("commission", { formatCommission: fmt.commission(commission), n: commissionStateLabel(commission.state, tr), span: (chunks) => <span className="text-muted-foreground">{chunks}</span>, span2: (chunks) => <span className="font-medium tabular-nums">{chunks}</span>, span3: (chunks) => <span className="text-muted-foreground">{chunks}</span> })}
                      </span>
                      {commission.state === "prevue" && (
                        <ConfirmCommissionButton commissionId={commission.id} />
                      )}
                      {commission.state === "confirmee" && (
                        <MarkCommissionSettledButton commissionId={commission.id} />
                      )}
                      {/*
                        LE MONTANT A CHANGÉ, LA COMMISSION NON : aucun recalcul
                        silencieux — ce qui a été convenu avec le confrère fait foi.
                        La fiche montre les deux chiffres et dit lequel est lequel.
                      */}
                      {commissionOnOldAmount(commission, deal.estimatedAmount) && (
                        <p className="w-full text-xs text-warning text-pretty">
                          {tr("commission_sur_ancien_montant", { base: fmt.money(commission.baseAmount) ?? "", actuel: fmt.money(deal.estimatedAmount) ?? "" })}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ListCard>
        </section>
      )}

      {/* Partager une affaire CLOSE n'a pas de sens : le composeur ne s'affiche pas. Sur une affaire vivante déjà
          partagée, il se replie derrière un « + » — les partages existants pèsent plus que le formulaire. */}
      {"outcome" in currentDealStatus && currentDealStatus.outcome ? (
        <EmptyState>{tr("affaire_close_pas_de_partage")}</EmptyState>
      ) : (
        <DetailsCard summary={tr("partager_cette_affaire")} defaultOpen={shares.length === 0}>
          <ShareComposer
            dealId={id}
            deal={{
              title: deal.title,
              clientName: deal.clientName,
              typeLabel,
              estimatedAmount: deal.estimatedAmount,
              description: deal.description,
            }}
            organizationName={org.name}
            brand={toRenderBrand(org, assetMeta)}
            issuedByName={user.name ?? null}
            currentDealStatus={currentDealStatus}
            availableStatuses={partnerStages}
            partners={activePartners}
          />
        </DetailsCard>
      )}

      <TaskSection
        tasks={dealTasks}
        backTo={`/affaires/${id}`}
        dealId={id}
        emptyText={tr("aucune_tache_pour_cette_affaire_celles_2ca0")}
      />

      {/* Le journal unifié ferme la page : interactions consignées ici,
          passages d'étape (avant → après), histoire PRM (partages,
          commentaires, commissions) et tâches achevées, dans la même
          chronologie — chaque entrée horodatée et attribuée, jamais anonyme. */}
      <div className="border-t border-border pt-6">
        <Journal
          journal={journal}
          backTo={`/affaires/${id}`}
          dealId={id}
          context="deal"
          erreur={readFlash(query[JOURNAL_ERROR_PARAM])}
          description={tr("interactions_etapes_franchies_partages_et_taches_3236")}
        />
      </div>
    </>
  );
}
