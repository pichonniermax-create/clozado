"use client";

import { useState, type ReactNode } from "react";
import { Copy, GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * Le cadre autour d'une unité du document : ce qui la rend saisissable,
 * duplicable et supprimable depuis elle-même.
 *
 * Au repos, rien ne s'affiche — on lit un email, pas un outil. La barre
 * n'apparaît qu'au survol ou au focus clavier.
 *
 * Le glisser-déposer est écrit sur l'API native `draggable` plutôt qu'avec
 * une bibliothèque : le besoin est une liste verticale simple, et
 * l'alternative coûterait une dépendance de plus pour ce seul écran.
 * `draggable` n'est activé qu'au contact de la poignée, sinon le simple fait
 * de sélectionner du texte dans un bloc démarrerait un glissement.
 */
export function UnitFrame({
  children,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragging,
  dropBefore,
  dropAfter,
  editing,
}: {
  children: ReactNode;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (position: "before" | "after") => void;
  onDrop: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  /** Bloc ouvert en édition : il porte alors ses propres commandes. */
  editing: boolean;
}) {
  const t = useTranslations("newsletters.unitFrame");
  const [handleHeld, setHandleHeld] = useState(false);

  return (
    <div
      className={cn("group/unit relative", dragging && "opacity-40")}
      draggable={handleHeld}
      onDragStart={(e) => {
        // Firefox exige des données pour amorcer un glissement.
        e.dataTransfer.setData("text/plain", "bloc");
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={() => {
        setHandleHeld(false);
        onDragEnd();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        onDragOver(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      {/* Trait d'insertion : montre où le bloc atterrira. */}
      {dropBefore && <div className="absolute inset-x-0 -top-px z-10 h-0.5 bg-primary" />}
      {dropAfter && <div className="absolute inset-x-0 -bottom-px z-10 h-0.5 bg-primary" />}

      {/* Absente pendant l'édition : le bloc ouvert a déjà ses commandes, et
          la barre flottante venait se poser dessus.
          `pointer-events-none` tant qu'elle est invisible : l'opacité à zéro
          ne la retire PAS du test de survol, et la barre avalait les clics
          dans le coin haut-droit de chaque bloc — donc sur le texte qu'on
          voulait éditer. */}
      {!editing && (
      <div className="pointer-events-none absolute top-1 right-1 z-10 flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within/unit:pointer-events-auto group-focus-within/unit:opacity-100 group-hover/unit:pointer-events-auto group-hover/unit:opacity-100">
        <button
          type="button"
          aria-label={t("deplacer_ce_bloc")}
          title={t("glisser_pour_deplacer")}
          onMouseDown={() => setHandleHeld(true)}
          onMouseUp={() => setHandleHeld(false)}
          className="flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("dupliquer_ce_bloc")}
          title={t("dupliquer")}
          onClick={onDuplicate}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("supprimer_ce_bloc")}
          title={t("supprimer")}
          onClick={onDelete}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      )}

      {children}
    </div>
  );
}
