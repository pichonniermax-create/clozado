import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Le statut d'un PARTAGE (pas de l'affaire) — l'inventaire relevait deux
 * traitements concurrents : un `<Badge>` neutre ici, un `<span>` coloré à
 * la main là. Un seul désormais. Les libellés vivaient en trois
 * exemplaires identiques dans trois écrans.
 */
export const SHARE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  declined: "Refusée",
  revoked: "Révoquée",
};

/** Refusé et révoqué restent neutres : ce sont des fins normales, pas des échecs. */
const SHARE_STATUS_TONE: Record<string, string> = {
  pending: "border-warning/40 text-warning",
  accepted: "border-success/40 text-success",
  declined: "text-muted-foreground",
  revoked: "text-muted-foreground",
};

export function ShareStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("shrink-0", SHARE_STATUS_TONE[status], className)}>
      {SHARE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
