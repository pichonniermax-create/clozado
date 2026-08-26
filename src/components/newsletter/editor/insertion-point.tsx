"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { BLOCK_TYPES, type BlockType } from "@/lib/newsletter/blocks";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * Ajouter un bloc À L'ENDROIT VOULU, entre deux blocs existants — et non
 * seulement à la fin via une rangée de boutons.
 *
 * Le menu porte l'aide au moment du choix : une ligne par type disant ce
 * qu'il fait. C'est là qu'on en a besoin, pas dans une documentation.
 */
export function InsertionPoint({
  onInsert,
  trigger,
}: {
  onInsert: (type: BlockType) => void;
  /** Déclencheur personnalisé — sinon la ligne « + » discrète entre deux blocs. */
  trigger?: ReactNode;
}) {
  const t = useTranslations("newsletters.insertionPoint");
  const tb = useTranslations("newsletters");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", !trigger && "group/insert")}>
      {trigger ? (
        <button type="button" onClick={() => setOpen((v) => !v)}>
          {trigger}
        </button>
      ) : (
        // Discret au repos, révélé au survol : la ligne d'insertion ne doit
        // pas parasiter la lecture du document.
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={t("inserer_un_bloc_ici")}
          className="flex h-5 w-full items-center gap-2 px-6 opacity-0 transition-opacity group-hover/insert:opacity-100 focus-visible:opacity-100"
        >
          <span className="h-px flex-1 bg-primary/40" />
          <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-3" />
          </span>
          <span className="h-px flex-1 bg-primary/40" />
        </button>
      )}

      {open && (
        <div className="absolute left-1/2 z-20 mt-1 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <ul>
            {BLOCK_TYPES.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent"
                  onClick={() => {
                    onInsert(type);
                    setOpen(false);
                  }}
                >
                  <span className="text-sm font-medium">{tb(`blocks.${type}.label`)}</span>
                  <span className="text-xs text-muted-foreground">{tb(`blocks.${type}.hint`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
