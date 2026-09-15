import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";

/**
 * Le statut d'une AFFAIRE. Sa couleur vient de la base : c'est une donnée
 * métier que l'organisation configure (comme une étiquette), pas son
 * identité visuelle — elle a donc le droit de teinter ce badge, et
 * seulement lui. Le texte n'est jamais la couleur brute (audit UI du
 * 2026-09-14) : un jaune ou un vert clair tombait sous 3:1 sur fond
 * blanc. Le fond porte l'identité (12 %), le texte est la couleur mêlée
 * au premier plan (le contraste tient dans les deux thèmes).
 */
export function DealStatusBadge({ label, color }: { label: string; color: string | null }) {
  const style: CSSProperties | undefined = color
    ? {
        borderColor: `color-mix(in oklch, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
        color: `color-mix(in oklch, ${color} 55%, var(--foreground))`,
      }
    : undefined;
  return (
    <Badge variant="outline" style={style}>
      {label}
    </Badge>
  );
}
