import { use } from "react";
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
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export default async function FollowUpPage() {
  const t = await getTranslations("followup.page");
  const fmt = await getFormats();
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
          title={t("suivi")}
          description={t("cet_ecran_suit_les_relances_d_e7be")}
        />
        <EmptyState>
          {t("tu_es_en_vue_globale_le_21fb")}
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
        <PageHeader title={t("suivi")} description={t("ce_qu_il_faut_relancer_classe_5e23")} />
        <EmptyState
          title={t("rien_a_suivre_pour_l_instant")}
          action={
            <Link href="/affaires" className={buttonVariants({ variant: "outline" })}>
              {t("voir_les_affaires")}
            </Link>
          }
        >
          {t("le_suivi_se_remplit_des_que_44be")}
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
        title={t("suivi")}
        description={
          todo === 0
            ? t("rien_n_attend_d_action_de_57be")
            : t("element_elements_a_traiter_classe_classes_cd54", { todo })
        }
      />

      {/* Les trois piles d'action. Ordre fixe : ce qui se perd si on ne fait
          rien d'abord, ce qui se rattrape ensuite. Jamais fusionnées, jamais
          triées ensemble par date. */}
      <Pile
        icon={<AlarmClock />}
        title={t("partages_sans_reponse")}
        count={board.pendingAlerts.length}
        empty={t("aucun_partage_en_souffrance")}
        subtitle={t("le_confrere_n_a_pas_repondu_fa04")}
      >
        {board.pendingAlerts.map((row) => (
          <PendingAlertRow key={row.shareId} row={row} />
        ))}
      </Pile>

      <Pile
        icon={<PauseCircle />}
        title={t("acceptees_sans_suite")}
        count={board.acceptedStale.length}
        empty={t("aucun_dossier_accepte_ne_stagne")}
        subtitle={t("acceptees_puis_plus_rien_depuis_jours_9418", { acceptedStaleDays: board.thresholds.acceptedStaleDays })}
      >
        {board.acceptedStale.map((row) => (
          <AcceptedStaleRow key={row.shareId} row={row} />
        ))}
      </Pile>

      <Pile
        icon={<Banknote />}
        title={t("commissions_a_encaisser")}
        count={board.unpaidCommissions.length}
        empty={t("aucune_commission_en_attente_de_reglement")}
        subtitle={t("confirmees_pas_encore_reglees_aucune_echeance_748a")}
        aside={unpaidTotal > 0 ? (fmt.money(unpaidTotal) ?? undefined) : undefined}
      >
        {board.unpaidCommissions.map((row) => (
          <UnpaidCommissionRow key={row.commissionId} row={row} />
        ))}
      </Pile>

      {/* Niveau 2 — constat, pas action. Volontairement plus discret. */}
      {board.inProgress.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{t("en_cours")}</h2>
            <span className="text-sm text-muted-foreground">
              {t("rien_a_faire_pour_l_instant", { count: board.inProgress.length })}
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
        <DetailsCard variant="archive" flush summary={t("partages_clos", { count: board.closed.length })}>
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
  const t = useTranslations("followup.page");
  const fmt = use(getFormats());
  const expiry =
    row.daysUntilExpiry === null
      ? null
      : row.daysUntilExpiry <= 0
        ? t("lien_expire")
        : t("expire_dans", { formatDays: fmt.days(row.daysUntilExpiry) });

  return (
    <ActionRow
      dealTitle={row.dealTitle}
      partnerName={row.partnerName}
      dealId={row.dealId}
      critical={row.critical}
      detail={
        <>
          {t.rich("sans_reponse_depuis", { formatDays: fmt.days(row.daysSinceSent), n: (expiry && ` · ${expiry}`) ?? "", span: (chunks) => <span className={row.critical ? "font-medium text-destructive" : undefined}>{chunks}</span> })}
        </>
      }
      action={<ReissueShareButton shareId={row.shareId} />}
    />
  );
}

function AcceptedStaleRow({ row }: { row: AcceptedStale }) {
  const t = useTranslations("followup.page");
  const fmt = use(getFormats());
  return (
    <ActionRow
      dealTitle={row.dealTitle}
      partnerName={row.partnerName}
      dealId={row.dealId}
      detail={t("acceptee_le_rien_depuis", { formatDate: fmt.date(row.respondedAt ?? row.sentAt), formatDays: fmt.days(row.daysSinceActivity) })}
      // Pas de bouton : rien à déclencher automatiquement sur du
      // relationnel. Le titre est déjà le lien vers l'affaire.
    />
  );
}

function UnpaidCommissionRow({ row }: { row: UnpaidCommission }) {
  const fmt = use(getFormats());
  return (
    <ActionRow
      dealTitle={row.dealTitle}
      partnerName={row.partnerName}
      dealId={row.dealId}
      detail={`${fmt.commission(row)} · ${row.confirmedAt ? `confirmée le ${fmt.date(row.confirmedAt)}` : "date de confirmation inconnue"}`}
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
