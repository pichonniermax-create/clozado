"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Columns3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * UN TABLEAU DONT ON CHOISIT LES COLONNES (chantier C, correctif 4) : par
 * défaut les colonnes essentielles — assez peu pour tenir sans défilement
 * horizontal sur un ordinateur portable —, la première colonne toujours
 * là et collée à gauche, les autres à cocher dans un menu « Colonnes ». Le
 * choix vit dans le navigateur de la personne (`localStorage`, par
 * tableau) : une commodité d'affichage, pas une donnée — les vues
 * enregistrées du chantier C (partie 3) le porteront en base. Les cellules
 * arrivent RENDUES par l'écran serveur : ce composant ne calcule rien, il
 * montre ou cache.
 */
export type ChooserColumn = {
  key: string;
  label: ReactNode;
  align?: "left" | "right";
  /** Visible tant que la personne n'a rien choisi. La première colonne l'est toujours. */
  defaultVisible?: boolean;
};

export type ChooserRow = { key: string; cells: Record<string, ReactNode> };

const STORAGE_PREFIX = "clozado:colonnes:";
/** Le signal d'un changement fait ici même (l'événement `storage` natif ne part que vers les AUTRES onglets). */
const CHANGE_EVENT = "clozado:colonnes";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Le choix brut mémorisé (une chaîne, stable d'un rendu à l'autre), ou null : rien de choisi, navigateur sans stockage, rendu serveur. */
function readRaw(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + storageKey);
  } catch {
    return null;
  }
}

function parseChoice(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((k) => typeof k === "string") ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function writeChoice(storageKey: string, keys: string[] | null) {
  try {
    if (keys === null) window.localStorage.removeItem(STORAGE_PREFIX + storageKey);
    else window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(keys));
  } catch {
    /* navigateur sans stockage : le choix ne survit pas — le tableau garde ses colonnes par défaut */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ColumnChooserTable({
  storageKey,
  columns,
  rows,
  foot,
  caption,
  className,
}: {
  /** Identifie le tableau dans le navigateur (« analytique-partenaires »). */
  storageKey: string;
  columns: ChooserColumn[];
  rows: ChooserRow[];
  /** La ligne de total, par colonne ; absente = pas de pied. */
  foot?: Record<string, ReactNode>;
  caption: string;
  className?: string;
}) {
  const t = useTranslations("ui.columnChooser");
  const first = columns[0];
  const optional = columns.slice(1);
  const defaults = optional.filter((c) => c.defaultVisible !== false).map((c) => c.key);
  // Le choix mémorisé est un magasin externe : le rendu serveur (et l'hydratation) voit « rien de choisi », le
  // navigateur voit sa mémoire — sans écart d'hydratation ni état posé dans un effet.
  const raw = useSyncExternalStore(subscribe, () => readRaw(storageKey), () => null);
  const stored = parseChoice(raw);
  const chosen = stored ? stored.filter((key) => optional.some((c) => c.key === key)) : defaults;

  const toggle = (key: string, checked: boolean) => {
    const next = checked ? optional.map((c) => c.key).filter((k) => k === key || chosen.includes(k)) : chosen.filter((k) => k !== key);
    writeChoice(storageKey, next);
  };
  const reset = () => writeChoice(storageKey, null);

  const visible = [first, ...optional.filter((c) => chosen.includes(c.key))];
  const cellClass = (column: ChooserColumn, extra?: string) =>
    cn("px-3 py-3 align-top", column.align === "left" ? "text-left" : "text-right whitespace-nowrap tabular-nums", extra);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
            <Columns3 />
            {t("colonnes")}
            <span className="text-muted-foreground tabular-nums">
              {visible.length}/{columns.length}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {/* Le libellé de groupe vit DANS un groupe : Base UI l'exige (vu au navigateur, erreur #31 à l'ouverture). */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("colonnes_affichees")}</DropdownMenuLabel>
              {optional.map((column) => (
                <DropdownMenuCheckboxItem key={column.key} checked={chosen.includes(column.key)} onCheckedChange={(checked) => toggle(column.key, checked)}>
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={reset}>{t("reinitialiser")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              {visible.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 font-medium",
                    column.align === "left" || index === 0 ? "text-left" : "text-right whitespace-nowrap",
                    index === 0 && "sticky left-0 z-10 bg-card"
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.key}>
                {visible.map((column, index) =>
                  index === 0 ? (
                    <th key={column.key} scope="row" className="sticky left-0 z-10 min-w-40 bg-card px-3 py-3 text-left align-top font-medium">
                      {row.cells[column.key]}
                    </th>
                  ) : (
                    <td key={column.key} className={cellClass(column)}>
                      {row.cells[column.key]}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
          {foot && (
            <tfoot>
              <tr className="border-t border-border bg-muted/40 font-medium">
                {visible.map((column, index) =>
                  index === 0 ? (
                    <th key={column.key} scope="row" className="sticky left-0 z-10 bg-muted px-3 py-3 text-left align-top">
                      {foot[column.key]}
                    </th>
                  ) : (
                    <td key={column.key} className={cellClass(column)}>
                      {foot[column.key]}
                    </td>
                  )
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
