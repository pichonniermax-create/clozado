"use client";

import { useRef, type ComponentProps, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Un geste DESTRUCTIF derrière une confirmation (audit UI du 2026-09-14) :
 * régénérer l'adresse d'ingestion, retirer un domaine, révoquer une clé ou
 * une invitation, supprimer un motif soumettaient au premier clic — un clic
 * malheureux coupait la collecte ou l'ingestion, sans retour arrière. Le
 * formulaire reste un `<form action>` serveur ; le déclencheur ouvre le
 * dialogue du socle, et c'est la confirmation qui soumet. Les textes
 * viennent du composant serveur appelant : ce composant ne lit aucun
 * message, il sert tous les écrans.
 */
export function ConfirmSubmit({
  action,
  fields,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "ghost",
  size = "sm",
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** Les champs cachés du formulaire (un identifiant, le plus souvent). */
  fields?: Record<string, string>;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  /** Le libellé du déclencheur. */
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action}>
      {fields && Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <AlertDialog>
        <AlertDialogTrigger render={<Button type="button" variant={variant} size={size} className={className} />}>{children}</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            {/* Le dialogue vit hors du formulaire (portail) : la confirmation soumet par la référence. */}
            <AlertDialogAction type="button" variant="destructive" onClick={() => formRef.current?.requestSubmit()}>
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
