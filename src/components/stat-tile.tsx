import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Contrat d'une tuile de statistique : un libellé en casse de phrase, une
 * valeur, et — seulement si elle en a une — une note de contexte.
 *
 * Deux règles tenues ici :
 * - la valeur reste en encre normale, jamais en couleur d'état. C'est
 *   l'icône à côté qui porte la couleur : un nombre écrit en rouge est
 *   illisible avant d'être signifiant, et la couleur seule n'est pas un
 *   canal accessible. État = icône + mot + couleur, jamais couleur seule.
 * - pas de `tabular-nums` sur ces valeurs : la chasse fixe est faite pour
 *   aligner des colonnes de chiffres, elle fait respirer trop large un
 *   nombre isolé en gros corps.
 */
export type StatTone = "neutral" | "warning" | "critical" | "success";

const TONE_ICON: Record<StatTone, string> = {
  neutral: "text-muted-foreground",
  warning: "text-warning",
  critical: "text-destructive",
  success: "text-success",
};

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  /** Ne prend une couleur que si la valeur est non nulle — zéro n'est pas une alerte. */
  tone?: StatTone;
  href?: string;
}) {
  const isZero = value === 0 || value === "0";
  const effectiveTone: StatTone = isZero ? "neutral" : tone;

  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className={cn("[&_svg]:size-4", TONE_ICON[effectiveTone])}>{icon}</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </>
  );

  const className = cn(
    "flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 shadow-xs",
    href && "transition-colors hover:border-primary/40 hover:bg-accent/40"
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
