import Link from "next/link";
import type { ReactNode } from "react";
import { AlarmClock, Banknote, CheckCircle2, PauseCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { MarkCommissionSettledButton } from "@/components/deal-shares/mark-commission-settled-button";
import { ReissueShareButton } from "@/components/deal-shares/reissue-share-button";
import { ShareStatusBadge } from "@/components/deal-shares/share-status-badge";
import {
  getFollowUpBoard,
  type AcceptedStale,
  type FollowUpShare,
  type PendingAlert,
  type UnpaidCommission,
} from "@/db/queries/deal-follow-up";
import { formatCommission, formatDate, formatDays, formatEuros } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

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
        <EmptyState>
          Tu es en vue globale : le suivi n&apos;existe que rapporté à une organisation précise.
          Choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir
          ses relances.
        </EmptyState>
      </>
    );
  }

  const board = await getFollowUpBoard(user);

  // Aucun partage, jamais : les trois piles vides diraient « rien en
  // souffrance » — vrai, mais l'écran doit d'abord dire à quoi il sert.
  const everShared =
    board.pendingAlerts.length +
    board.acceptedStale.length +
    board.unpaidCommissions.length +
    board.inProgress.length +
    board.closed.length;
  if (everShared === 0) {
    return (
      <>
        <PageHeader title="Suivi" description="Ce qu'il faut relancer, classé par nature — pas par date." />
        <EmptyState
          title="Rien à suivre pour l'instant"
          action={
            <Link href="/affaires" className={buttonVariants({ variant: "outline" })}>
              Voir les affaires
            </Link>
          }
        >
          Le suivi se remplit dès que tu partages une affaire à un confrère : partages sans
          réponse, acceptés sans suite, commissions à encaisser.
        </EmptyState>
      </>
    );
  }

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
        aside={unpaidTotal > 0 ? (formatEuros(unpaidTotal) ?? undefined) : undefined}
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
          <ListCard>
            {board.inProgress.map((row) => (
              <NeutralRow key={row.shareId} row={row} />
            ))}
          </ListCard>
        </section>
      )}

      {/* Niveau 3 — l'historique clos, replié : présent pour être retrouvé,
          jamais dans le champ de vision du travail du jour. */}
      {board.closed.length > 0 && (
        <DetailsCard variant="archive" flush summary={`Partages clos (${board.closed.length})`}>
          <ul className="divide-y divide-border">
            {board.closed.map((row) => (
              <NeutralRow key={row.shareId} row={row} />
            ))}
          </ul>
        </DetailsCard>
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
        <EmptyState icon={<CheckCircle2 className="size-4 text-success" />}>{empty}</EmptyState>
      ) : (
        <ListCard>{children}</ListCard>
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
    <ListRow
      className={cn("flex-wrap gap-3", critical && "border-l-2 border-l-destructive")}
    >
      <div className="flex min-w-0 flex-col">
        <Link
          href={`/affaires/${dealId}`}
          className="truncate text-sm font-medium hover:underline"
        >
          {dealTitle}
        </Link>
        <span className="truncate text-xs tabular-nums text-muted-foreground">
          {partnerName} · {detail}
        </span>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </ListRow>
  );
}

function PendingAlertRow({ row }: { row: PendingAlert }) {
  const expiry =
    row.daysUntilExpiry === null
      ? null
      : row.daysUntilExpiry <= 0
        ? "lien expiré"
        : `expire dans ${formatDays(row.daysUntilExpiry)}`;

  return (
    <ActionRow
      dealTitle={row.dealTitle}
      partnerName={row.partnerName}
      dealId={row.dealId}
      critical={row.critical}
      detail={
        <>
          <span className={row.critical ? "font-medium text-destructive" : undefined}>
            sans réponse depuis {formatDays(row.daysSinceSent)}
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
      detail={`acceptée le ${formatDate(row.respondedAt ?? row.sentAt)} · rien depuis ${formatDays(row.daysSinceActivity)}`}
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
      detail={`${formatCommission(row)} · ${row.confirmedAt ? `confirmée le ${formatDate(row.confirmedAt)}` : "date de confirmation inconnue"}`}
      action={<MarkCommissionSettledButton commissionId={row.commissionId} />}
    />
  );
}

function NeutralRow({ row }: { row: FollowUpShare }) {
  return (
    <ListRow className="gap-3 py-2.5">
      <Link href={`/affaires/${row.dealId}`} className="min-w-0 truncate text-sm hover:underline">
        <span className="font-medium">{row.dealTitle}</span>
        <span className="text-muted-foreground"> · {row.partnerName}</span>
      </Link>
      <ShareStatusBadge status={row.status} />
    </ListRow>
  );
}
