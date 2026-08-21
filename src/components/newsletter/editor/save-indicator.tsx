"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { formatSavedAt, type SaveState } from "./use-autosave";

/**
 * Discret par principe — sauf en cas d'échec, où il doit se voir : croire
 * son travail enregistré alors qu'il ne l'est pas est le pire des états.
 */
export function SaveIndicator({ state }: { state: SaveState }) {
  const [now, setNow] = useState(() => Date.now());

  // L'horloge ne tourne que pendant qu'un « il y a X » est affiché.
  useEffect(() => {
    if (state.status !== "saved") return;
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [state.status]);

  if (state.status === "idle") return null;

  if (state.status === "error") {
    return (
      <span
        role="alert"
        className="flex items-center gap-1.5 text-xs font-medium text-destructive"
      >
        <AlertTriangle className="size-3.5" />
        Non enregistré — {state.message}
      </span>
    );
  }

  if (state.status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Enregistrement…
      </span>
    );
  }

  if (state.status === "pending") {
    return <span className="text-xs text-muted-foreground">Modifications en cours…</span>;
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="size-3.5 text-success" />
      Enregistré {formatSavedAt(state.at, now)}
    </span>
  );
}
