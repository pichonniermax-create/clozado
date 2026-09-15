import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * LE BADGE DE STATUT (audit UI du 2026-09-14) : un même sens, une même
 * couleur sur tous les écrans — avant, « Envoyée » était un badge plein
 * couleur de marque (il ressemblait à un bouton), « Utilisée » plein bleu,
 * « Faite » gris alors que c'est un succès. Cinq tons, toujours en
 * contour teinté : le badge plein reste réservé aux compteurs de
 * navigation. Une fin normale (refusé, révoqué, archivé) est neutre, pas
 * rouge : le rouge dit un problème à traiter.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE: Record<StatusTone, string> = {
  neutral: "text-muted-foreground",
  info: "border-primary/30 bg-primary/10 text-primary-ink",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/50 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function StatusBadge({ tone = "neutral", className, ...props }: Omit<ComponentProps<typeof Badge>, "variant"> & { tone?: StatusTone }) {
  return <Badge variant="outline" className={cn("shrink-0", TONE[tone], className)} {...props} />;
}
