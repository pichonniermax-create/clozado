"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

/**
 * « Copier » — un enregistrement DNS, une adresse : le presse-papiers du
 * navigateur, avec le retour « Copié » deux secondes. Sans presse-papiers
 * (contexte non sécurisé), le bouton sélectionne le texte voisin : rien
 * n'échoue en silence.
 */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useTranslations("ui.copyButton");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("copie_manuelle"), value);
    }
  }
  return (
    <Button type="button" variant="ghost" size="xs" onClick={copy} aria-label={label ?? t("copier")}>
      {copied ? <Check /> : <Copy />}
      {copied ? t("copie") : t("copier")}
    </Button>
  );
}
