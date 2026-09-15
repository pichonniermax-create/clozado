import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

/**
 * Le statut d'un PARTAGE (pas de l'affaire) — l'inventaire relevait deux
 * traitements concurrents : un `<Badge>` neutre ici, un `<span>` coloré à
 * la main là. Un seul désormais, sur la grammaire commune des statuts
 * (`StatusBadge`). Les libellés vivent dans les messages
 * (`shares.shareStatusBadge.status.<statut>`) ; un statut inconnu
 * s'affiche tel quel.
 */
const SHARE_STATUSES = ["pending", "accepted", "declined", "revoked"] as const;

/** Refusé et révoqué restent neutres : ce sont des fins normales, pas des échecs. */
const SHARE_STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  accepted: "success",
  declined: "neutral",
  revoked: "neutral",
};

export function ShareStatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("shares.shareStatusBadge");
  const label = (SHARE_STATUSES as readonly string[]).includes(status) ? t(`status.${status as (typeof SHARE_STATUSES)[number]}`) : status;
  return (
    <StatusBadge tone={SHARE_STATUS_TONE[status] ?? "neutral"} className={className}>
      {label}
    </StatusBadge>
  );
}
