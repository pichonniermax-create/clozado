import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlarmClock,
  Banknote,
  CheckCircle2,
  ChevronRight,
  PauseCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell/page-header";
import { MarkCommissionSettledButton } from "@/components/deal-shares/mark-commission-settled-button";
import { ReissueShareButton } from "@/components/deal-shares/reissue-share-button";
import {
  getFollowUpBoard,
  type AcceptedStale,
  type FollowUpShare,
  type PendingAlert,
  type UnpaidCommission,
} from "@/db/queries/deal-follow-up";
import { formatCommission, formatDate, formatEuros } from "@/lib/deal-shares/format";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const SHARE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  declined: "Refusée",
  revoked: "Révoquée",
};

export default async function FollowUpPage() {
  const user = await requireUser();

  // Cet écran n'existe que rapporté à UNE organisation : il lit ses seuils
  // et ne remonte que ses partages. Un super_admin n'a pas d'organisation
  // propre — `getFollowUpBoard` levait alors « Aucune organisation associée
  // à cet utilisateur » et la page renvoyait un 500. On l'explique plutôt
  // que de rediriger en silence : arriver ici est légitime, la barre
  // latérale ne propose simplement pas l'entrée dans ce cas.
  if (!user.organizationId) {
    return (
      <>
        <PageHeader
          title="Suivi"
          description="Cet écran suit les relances d'une organisation donnée."
        />
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Ton compte super admin n&apos;est rattaché à aucune organisation : il n&apos;y a donc
          pas de relances qui te soient propres. Les affaires et partenaires de toutes les
          organisations restent consultables depuis{" "}
          <Link href="/affaires" className="underline underline-offset-2 hover:text-foreground">
            Affaires
          </Link>
          .
        </p>
      </>
    );
  }

  const board = await getFollowUpBoard(user);

  const unpaidTotal = board.unpaidCommissions.reduce(
    (sum, c) => sum + (Number(c.computedAmount) || 0),
    0
  );
  const todo =
    board.pendingAlerts.length + board.acceptedStale.length + board.unpaidCommissions.length;

  return (
    <>
      <PageHeader
        title="Suivi"
        description={
          todo === 0
            ? "Rien n'attend d'action de ta part."
            : `${todo} élément${todo > 1 ? "s" : ""} à traiter, classé${todo > 1 ? "s" : ""} par nature — pas par date.`
        }
      />

      {/* Les trois piles d'action. Ordre fixe : ce qui se perd si on ne fait
          rien d'abord, ce qui se rattrape ensuite. Jamais fusionnées, jamais
          triées ensemble par date. */}
      <Pile
        icon={<AlarmClock />}
        title="Partages sans réponse"
        count={board.pendingAlerts.length}
        empty="Aucun partage en souffrance."
        subtitle="Le confrère n'a pas répondu, ou le lien va expirer."
      >
        {board.pendingAlerts.map((row) => (
          <PendingAlertRow key={row.shareId} row={row} />
        ))}
      </Pile>

      <Pile
        icon={<PauseCircle />}
        title="Acceptées sans suite"
        count={board.acceptedStale.length}
        empty="Aucun dossier accepté ne stagne."
        subtitle={`Acceptées, puis plus rien depuis ${board.thresholds.acceptedStaleDays} jours ou plus.`}
      >
        {board.acceptedStale.map((row) => (
          <AcceptedStaleRow key={row.shareId} row={row} />
        ))}
      </Pile>

      <Pile
        icon={<Banknote />}
        title="Commissions à encaisser"
        count={board.unpaidCommissions.length}
        empty="Aucune commission en attente de règlement."
        subtitle="Confirmées, pas encore réglées — aucune échéance, elles restent dues."
        aside={unpaidTotal > 0 ? (formatEuros(String(unpaidTotal)) ?? undefined) : undefined}
      >
        {board.unpaidCommissions.map((row) => (
          <UnpaidCommissionRow key={row.commissionId} row={row} />
        ))}
      </Pile>

      {/* Niveau 2 — constat, pas action. Volontairement plus discret. */}
      {board.inProgress.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">En cours</h2>
            <span className="text-sm text-muted-foreground">
              {board.inProgress.length} · rien à faire pour l&apos;instant
            </span>
          </div>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {board.inProgress.map((row) => (
              <NeutralRow key={row.shareId} row={row} />
            ))}
          </ul>
        </section>
      )}

      {/* Niveau 3 — l'historique clos, replié : présent pour être retrouvé,
          jamais dans le champ de vision du travail du jour. */}
      {board.closed.length > 0 && (
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            Partages clos ({board.closed.length})
          </summary>
          <ul className="border-t border-border">
            {board.closed.map((row) => (
              <NeutralRow key={row.shareId} row={row} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/**
 * Une pile d'action. Elle garde sa place et son compteur même à zéro : voir
 * « aucun partage en souffrance » est une information utile, une pile qui
 * disparaît laisse un doute sur ce qui a été vérifié.
 */
function Pile({
  icon,
  title,
  count,
  subtitle,
  empty,
  aside,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  subtitle: string;
  empty: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "[&_svg]:size-4",
              count === 0 ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {icon}
          </span>
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        </div>
        {aside && <span className="text-sm font-semibold tabular-nums">{aside}</span>}
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">{subtitle}</p>

      {count === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" />
          {empty}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">{children}</ul>
      )}
    </section>
  );
}

/**
 * Ligne d'une pile d'action. Le rouge n'apparaît que sur `critical` — pas
 * un fond entier saturé mais un filet à gauche, pour que trois lignes
 * critiques d'affilée restent lisibles.
 */
function ActionRow({
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
  detail: ReactNode;
  critical?: boolean;
  action?: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0",
        critical && "border-l-2 border-l-destructive"
      )}
    >
      <div className="flex min-w-0 flex-col">
        <Link
          href={`/affaires/${dealId}`}
          className="truncate text-sm font-medium hover:underline"
        >
          {dealTitle}
        </Link>
        <span className="truncate text-xs text-muted-foreground">
          {partnerName} · {detail}
        </span>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </li>
  );
}

function PendingAlertRow({ row }: { row: PendingAlert }) {
  const expiry =
    row.daysUntilExpiry === null
      ? null
      : row.daysUntilExpiry <= 0
        ? "lien expiré"
        : `expire dans ${row.daysUntilExpiry} j`;

  return (
    <ActionRow
      dealTitle={row.dealTitle}
      partnerName={row.partnerName}
      dealId={row.dealId}
      critical={row.critical}
      detail={
        <>
          <span className={row.critical ? "font-medium text-destructive" : undefined}>
            sans réponse depuis {row.daysSinceSent} j
          </span>
          {expiry && ` · ${expiry}`}
        </>
      }
      action={<ReissueShareButton shareId={row.shareId} />}
    />
  );
}

function AcceptedStaleRow({ row }: { row: AcceptedStale }) {
  return (
    <ActionRow
      dealTitle={row.dealTitle}
      partnerName={row.partnerName}
      dealId={row.dealId}
      detail={`acceptée le ${formatDate(
        row.respondedAt?.toISOString() ?? row.sentAt.toISOString()
      )} · rien depuis ${row.daysSinceActivity} j`}
      // Pas de bouton : rien à déclencher automatiquement sur du
      // relationnel. Le titre est déjà le lien vers l'affaire.
    />
  );
}

function UnpaidCommissionRow({ row }: { row: UnpaidCommission }) {
  return (
    <ActionRow
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
    <li className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <Link href={`/affaires/${row.dealId}`} className="min-w-0 truncate text-sm hover:underline">
        <span className="font-medium">{row.dealTitle}</span>
        <span className="text-muted-foreground"> · {row.partnerName}</span>
      </Link>
      <Badge variant="secondary" className="shrink-0">
        {SHARE_STATUS_LABELS[row.status] ?? row.status}
      </Badge>
    </li>
  );
}
