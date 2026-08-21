import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkCommissionSettledButton } from "@/components/deal-shares/mark-commission-settled-button";
import { ReissueShareButton } from "@/components/deal-shares/reissue-share-button";
import {
  getFollowUpBoard,
  type AcceptedStale,
  type FollowUpShare,
  type PendingAlert,
  type UnpaidCommission,
} from "@/db/queries/deal-follow-up";
import { formatCommission, formatDate } from "@/lib/deal-shares/format";
import { requireUser } from "@/lib/session";

const SHARE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  declined: "Refusée",
  revoked: "Révoquée",
};

export default async function FollowUpPage() {
  const user = await requireUser();
  const board = await getFollowUpBoard(user);

  const unpaidTotal = board.unpaidCommissions.reduce(
    (sum, c) => sum + (Number(c.computedAmount) || 0),
    0
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Retour au tableau de bord
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Suivi</h1>
        <p className="text-sm text-muted-foreground">
          {board.pendingAlerts.length} à relancer · {board.acceptedStale.length} acceptée
          {board.acceptedStale.length > 1 ? "s" : ""} sans suite · {board.unpaidCommissions.length}{" "}
          commission{board.unpaidCommissions.length > 1 ? "s" : ""} confirmée
          {board.unpaidCommissions.length > 1 ? "s" : ""} non réglée
          {board.unpaidCommissions.length > 1 ? "s" : ""}
          {unpaidTotal > 0 && ` (${unpaidTotal.toLocaleString("fr-FR")} €)`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Partages sans réponse ({board.pendingAlerts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {board.pendingAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien à relancer ici.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.pendingAlerts.map((row) => (
                <PendingAlertRow key={row.shareId} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acceptées sans suite ({board.acceptedStale.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {board.acceptedStale.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien de stagnant ici.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.acceptedStale.map((row) => (
                <AcceptedStaleRow key={row.shareId} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commissions confirmées non réglées ({board.unpaidCommissions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {board.unpaidCommissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien en attente de règlement.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.unpaidCommissions.map((row) => (
                <UnpaidCommissionRow key={row.commissionId} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>En cours ({board.inProgress.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {board.inProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rien en cours pour l&apos;instant.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {board.inProgress.map((row) => (
                <NeutralRow key={row.shareId} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {board.closed.length > 0 && (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Affaires closes ({board.closed.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {board.closed.map((row) => (
              <NeutralRow key={row.shareId} row={row} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RowShell({
  dealTitle,
  partnerName,
  dealId,
  detail,
  critical,
  action,
}: {
  dealTitle: string;
  partnerName: string;
  dealId: string;
  detail: string;
  critical?: boolean;
  action?: ReactNode;
}) {
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
        critical ? "border-destructive/40 bg-destructive/5" : ""
      }`}
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {partnerName} · {dealTitle}
        </span>
        <span className={`text-xs ${critical ? "text-destructive" : "text-muted-foreground"}`}>
          {detail}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {action}
        <Link
          href={`/affaires/${dealId}`}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Ouvrir l&apos;affaire
        </Link>
      </div>
    </li>
  );
}

function PendingAlertRow({ row }: { row: PendingAlert }) {
  const expiry =
    row.daysUntilExpiry === null
      ? null
      : row.daysUntilExpiry <= 0
        ? "a expiré"
        : `expire dans ${row.daysUntilExpiry} j`;
  const detail = [`en attente depuis ${row.daysSinceSent} j`, expiry].filter(Boolean).join(" · ");

  return (
    <RowShell
      dealTitle={row.dealTitle}
      partnerName={row.partnerName}
      dealId={row.dealId}
      detail={detail}
      critical={row.critical}
      action={<ReissueShareButton shareId={row.shareId} />}
    />
  );
}

function AcceptedStaleRow({ row }: { row: AcceptedStale }) {
  return (
    <RowShell
      dealTitle={row.dealTitle}
      partnerName={row.partnerName}
      dealId={row.dealId}
      detail={`acceptée le ${formatDate(row.respondedAt?.toISOString() ?? row.sentAt.toISOString())} · rien depuis ${row.daysSinceActivity} j`}
    />
  );
}

function UnpaidCommissionRow({ row }: { row: UnpaidCommission }) {
  return (
    <RowShell
      dealTitle={row.dealTitle}
      partnerName={row.partnerName}
      dealId={row.dealId}
      detail={`${formatCommission(row)} · confirmée le ${formatDate(row.confirmedAt.toISOString())}`}
      action={<MarkCommissionSettledButton commissionId={row.commissionId} />}
    />
  );
}

function NeutralRow({ row }: { row: FollowUpShare }) {
  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-2">
      <Link href={`/affaires/${row.dealId}`} className="text-sm font-medium hover:underline">
        {row.partnerName} · {row.dealTitle}
      </Link>
      <Badge variant="secondary">{SHARE_STATUS_LABELS[row.status] ?? row.status}</Badge>
    </li>
  );
}
