import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";

/**
 * Le statut d'une AFFAIRE. Sa couleur vient de la base : c'est une donnée
 * métier que l'organisation configure (comme une étiquette), pas son
 * identité visuelle — elle a donc le droit de teinter ce badge, et
 * seulement lui.
 */
export function DealStatusBadge({ label, color }: { label: string; color: string | null }) {
  const style: CSSProperties | undefined = color ? { borderColor: color, color } : undefined;
  return (
    <Badge variant="outline" style={style}>
      {label}
    </Badge>
  );
}
