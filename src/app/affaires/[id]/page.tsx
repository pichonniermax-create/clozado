import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmCommissionButton } from "@/components/deal-shares/confirm-commission-button";
import { MarkCommissionSettledButton } from "@/components/deal-shares/mark-commission-settled-button";
import { ReissueShareButton } from "@/components/deal-shares/reissue-share-button";
import { ShareComposer } from "@/components/deal-shares/share-composer";
import { listCommissionsForDeal } from "@/db/queries/commissions";
import { listDealEvents } from "@/db/queries/deal-events";
import { listDealShares } from "@/db/queries/deal-shares";
import { revokeDealShareAction } from "@/lib/deals/actions";
import { listDealStatuses } from "@/db/queries/deal-statuses";
import { listDealTypes } from "@/db/queries/deal-types";
import { getDeal } from "@/db/queries/deals";
import { getOwnOrganizationOrThrow, toRenderBrand } from "@/db/queries/newsletters";
import { listPartners } from "@/db/queries/partners";
import { formatCommission, formatDate, formatDateTime, formatEuros } from "@/lib/deal-shares/format";
import { requireUser } from "@/lib/session";

const SHARE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  declined: "Refusée",
  revoked: "Révoquée",
};

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
    getOwnOrganizationOrThrow(user),
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
  const activePartners = partners.filter((p) => p.active);

  async function revoke(formData: FormData) {
    "use server";
    const shareId = String(formData.get("shareId") ?? "");
    if (!shareId) return;
    await revokeDealShareAction(shareId);
    redirect(`/affaires/${id}`);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <div>
        <Link href="/affaires" className="text-sm text-muted-foreground hover:underline">
          ← Retour aux affaires
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{deal.title}</h1>
        <p className="text-sm text-muted-foreground">
          {typeLabel} · {deal.clientName}
          {deal.estimatedAmount && ` · ≈ ${formatEuros(deal.estimatedAmount)}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Statut actuel</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge
            variant="outline"
            style={
              currentDealStatus.color
                ? { borderColor: currentDealStatus.color, color: currentDealStatus.color }
                : undefined
            }
          >
            {currentDealStatus.label}
          </Badge>
        </CardContent>
      </Card>

      {shares.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Partages existants</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {shares.map(({ share, partnerName }) => {
                const commission = commissionByShareId.get(share.id);
                return (
                  <li key={share.id} className="flex flex-col gap-2 rounded-md border px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{partnerName}</span>
                        <span className="text-xs text-muted-foreground">
                          Envoyé le {formatDate(share.sentAt.toISOString())}
                          {share.expiresAt && ` · expire le ${formatDate(share.expiresAt.toISOString())}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {SHARE_STATUS_LABELS[share.status] ?? share.status}
                        </Badge>
                        {share.status !== "revoked" && (
                          <>
                            <form action={revoke}>
                              <input type="hidden" name="shareId" value={share.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                Révoquer
                              </Button>
                            </form>
                            <ReissueShareButton shareId={share.id} />
                          </>
                        )}
                      </div>
                    </div>
                    {commission && (
                      <div className="flex items-center justify-between border-t pt-2 text-xs">
                        <span className="text-muted-foreground">
                          Commission {formatCommission(commission)} —{" "}
                          {COMMISSION_STATE_LABELS[commission.state] ?? commission.state}
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
            </ul>
          </CardContent>
        </Card>
      )}

      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historique</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {events.map((event) => (
                <li key={event.id} className="text-sm">
                  <span className="font-medium">
                    {EVENT_TYPE_LABELS[event.type] ?? event.type}
                  </span>
                  {event.sharePartnerName && (
                    <span className="text-muted-foreground"> · {event.sharePartnerName}</span>
                  )}
                  {event.message && <span> — {event.message}</span>}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {event.actorLabel} · {formatDateTime(event.createdAt.toISOString())}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
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
    </div>
  );
}
