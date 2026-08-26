import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Le statut d'un PARTAGE (pas de l'affaire) — l'inventaire relevait deux
 * traitements concurrents : un `<Badge>` neutre ici, un `<span>` coloré à
 * la main là. Un seul désormais. Les libellés vivent dans les messages
 * (`shares.shareStatusBadge.status.<statut>`) ; un statut inconnu
 * s'affiche tel quel.
 */
const SHARE_STATUSES = ["pending", "accepted", "declined", "revoked"] as const;

/** Refusé et révoqué restent neutres : ce sont des fins normales, pas des échecs. */
const SHARE_STATUS_TONE: Record<string, string> = {
  pending: "border-warning/40 text-warning",
  accepted: "border-success/40 text-success",
  declined: "text-muted-foreground",
  revoked: "text-muted-foreground",
};

export function ShareStatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("shares.shareStatusBadge");
  const label = (SHARE_STATUSES as readonly string[]).includes(status) ? t(`status.${status as (typeof SHARE_STATUSES)[number]}`) : status;
  return (
    <Badge variant="outline" className={cn("shrink-0", SHARE_STATUS_TONE[status], className)}>
      {label}
    </Badge>
  );
}
