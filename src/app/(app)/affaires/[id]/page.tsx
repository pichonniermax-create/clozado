import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DealStatusBadge } from "@/components/deals/deal-status-badge";
import { ListCard } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConfirmCommissionButton } from "@/components/deal-shares/confirm-commission-button";
import { MarkCommissionSettledButton } from "@/components/deal-shares/mark-commission-settled-button";
import { ReissueShareButton } from "@/components/deal-shares/reissue-share-button";
import { ShareComposer } from "@/components/deal-shares/share-composer";
import { ShareStatusBadge } from "@/components/deal-shares/share-status-badge";
import { listCommissionsForDeal } from "@/db/queries/commissions";
import { listDealEvents } from "@/db/queries/deal-events";
import { listDealShares } from "@/db/queries/deal-shares";
import { revokeDealShareAction } from "@/lib/deals/actions";
import { listDealStatuses } from "@/db/queries/deal-statuses";
import { listDealTypes } from "@/db/queries/deal-types";
import { getDeal } from "@/db/queries/deals";
import { toRenderBrand } from "@/db/queries/newsletters";
import { getOrganizationOfRecord } from "@/db/queries/organizations";
import { listPartners } from "@/db/queries/partners";
import { formatCommission, formatDate, formatDateTime, formatEuros } from "@/lib/format";
import { requireUser } from "@/lib/session";

const COMMISSION_STATE_LABELS: Record<string, string> = {
  prevue: "prévue",
  confirmee: "confirmée",
  reglee: "réglée",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  deal_created: "Affaire créée",
  share_sent: "Partage envoyé",
  share_viewed: "Partage consulté",
  share_accepted: "Partage accepté",
  share_declined: "Partage refusé",
  share_revoked: "Partage révoqué",
  share_expired: "Partage expiré (constaté)",
  status_changed: "Statut changé",
  commented: "Commentaire",
  commission_updated: "Commission mise à jour",
};

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const deal = await getDeal(user, id).catch(() => null);
  if (!deal) notFound();

  const [org, types, statuses, partners, shares, commissions, events] = await Promise.all([
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
    listDealEvents(user, id),
  ]);

  const commissionByShareId = new Map(commissions.map((c) => [c.shareId, c]));
  const typeLabel = types.find((t) => t.id === deal.typeId)?.label ?? "—";
  const currentDealStatus = statuses.find((s) => s.id === deal.statusId) ?? {
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
            {typeLabel} · {deal.clientName}
            {deal.estimatedAmount && ` · ≈ ${formatEuros(deal.estimatedAmount)}`}
          </>
        }
        backTo={{ href: "/affaires", label: "Affaires" }}
        // Le statut est une information d'identité de l'affaire, pas une
        // section : il tenait une carte entière pour un seul badge. Il est
        // explicitement nommé « Statut de l'affaire » parce que la page
        // affiche juste en dessous des statuts de PARTAGE (acceptée,
        // refusée…) : deux vocabulaires proches, deux objets différents.
        actions={
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Statut de l&apos;affaire</span>
            <DealStatusBadge label={currentDealStatus.label} color={currentDealStatus.color} />
          </span>
        }
      />

      {shares.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {shares.length} partage{shares.length > 1 ? "s" : ""}
          </h2>
          <ListCard>
            {shares.map(({ share, partnerName }) => {
              const commission = commissionByShareId.get(share.id);
              return (
                <li key={share.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{partnerName}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        Envoyé le {formatDate(share.sentAt)}
                        {share.expiresAt && ` · expire le ${formatDate(share.expiresAt)}`}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <ShareStatusBadge status={share.status} />
                      {share.status !== "revoked" && (
                        <>
                          <ReissueShareButton shareId={share.id} />
                          <form action={revoke}>
                            <input type="hidden" name="shareId" value={share.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Révoquer
                            </Button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>

                  {commission && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
                      <span className="text-xs">
                        <span className="text-muted-foreground">Commission </span>
                        <span className="font-medium tabular-nums">
                          {formatCommission(commission)}
                        </span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {COMMISSION_STATE_LABELS[commission.state] ?? commission.state}
                        </span>
                      </span>
                      {commission.state === "prevue" && (
                        <ConfirmCommissionButton commissionId={commission.id} />
                      )}
                      {commission.state === "confirmee" && (
                        <MarkCommissionSettledButton commissionId={commission.id} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ListCard>
        </section>
      )}

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
        brand={toRenderBrand(org)}
        issuedByName={user.name ?? null}
        currentDealStatus={currentDealStatus}
        availableStatuses={statuses}
        partners={activePartners}
      />

      {/* Le journal ferme la page : c'est de la matière à consulter, pas une
          action. En file verticale avec un rail — chaque entrée horodatée et
          attribuée, jamais anonyme (cf. src/db/schema/deal-events.ts). */}
      {events.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="text-sm font-semibold">Historique</h2>
          <ol className="flex flex-col">
            {events.map((event, index) => (
              <li key={event.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                  />
                  {index < events.length - 1 && (
                    <span aria-hidden className="w-px flex-1 bg-border" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col pb-4">
                  <p className="text-sm">
                    <span className="font-medium">
                      {EVENT_TYPE_LABELS[event.type] ?? event.type}
                    </span>
                    {event.sharePartnerName && (
                      <span className="text-muted-foreground"> · {event.sharePartnerName}</span>
                    )}
                  </p>
                  {event.message && (
                    <p className="text-sm text-muted-foreground">{event.message}</p>
                  )}
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {event.actorLabel} · {formatDateTime(event.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
