"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { formatSavedAt, type SaveState } from "./use-autosave";
import { useTranslations } from "next-intl";
import { useFormats } from "@/components/i18n/formats-provider";

/**
 * Discret par principe — sauf en cas d'échec, où il doit se voir : croire
 * son travail enregistré alors qu'il ne l'est pas est le pire des états.
 */
export function SaveIndicator({ state }: { state: SaveState }) {
  const tr = useTranslations("newsletters.saveIndicator");
  const fmt = useFormats();
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
        {tr("non_enregistre", { message: state.message })}
      </span>
    );
  }

  if (state.status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {tr("enregistrement")}
      </span>
    );
  }

  if (state.status === "pending") {
    return <span className="text-xs text-muted-foreground">{tr("modifications_en_cours")}</span>;
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="size-3.5 text-success" />
      {tr("enregistre", { formatSavedAt: formatSavedAt(state.at, now, fmt.tag) })}
    </span>
  );
}
