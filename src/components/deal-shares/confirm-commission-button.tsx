"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmCommissionAction } from "@/lib/deals/actions";
import { useTranslations } from "next-intl";

/** Fiche affaire : prevue → confirmee, une fois l'affaire aboutie et le montant arrêté. */
export function ConfirmCommissionButton({ commissionId }: { commissionId: string }) {
  const t = useTranslations("shares.confirmCommissionButton");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // L'action rend son échec traduit ; une coupure réseau se dit aussi (stabilisation, E7 : avant, un `try/finally`
  // sans `catch` laissait un rejet muet et le bouton se réactivait sans message).
  async function run() {
    setPending(true);
    setError(null);
    try {
      const result = await confirmCommissionAction(commissionId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    } catch {
      setError(t("echec_reseau"));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
      {pending ? "…" : t("confirmer")}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
