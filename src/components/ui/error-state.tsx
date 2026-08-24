"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Le panneau d'erreur — ce que voit l'utilisateur à la place de l'écran
 * technique de Next.js quand un segment n'a pas pu se rendre (`error.tsx`).
 * Composant client parce que les frontières d'erreur le sont ; le texte
 * reste en français, ne montre jamais l'identifiant technique, dit que ce
 * n'est pas la faute de la personne, et propose de réessayer (`retry`
 * recharge les données du segment) ou de repartir d'un écran sûr.
 */
export function ErrorState({
  title,
  children,
  retry,
  backHref,
  backLabel = "Retour",
}: {
  title: string;
  /** L'explication — par défaut « passager, ce n'est pas toi ». */
  children?: ReactNode;
  retry?: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center"
    >
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-warning/10 text-warning [&_svg]:size-5"
      >
        <AlertTriangle />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground text-pretty">
          {children ??
            "C'est en général passager et ça ne vient pas de toi. Réessaie — si ça persiste, reviens dans quelques minutes."}
        </p>
      </div>
      {(retry || backHref) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {retry && (
            <Button onClick={retry} variant="outline">
              Réessayer
            </Button>
          )}
          {backHref && (
            <Link href={backHref} className={buttonVariants({ variant: "ghost" })}>
              {backLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
