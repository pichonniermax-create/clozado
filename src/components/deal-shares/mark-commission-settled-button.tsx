"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { markCommissionSettledAction } from "@/lib/deals/actions";
import { useTranslations } from "next-intl";

/** L'action réelle de la pile "commissions confirmées non réglées" — une constatation, jamais un paiement déclenché. */
export function MarkCommissionSettledButton({ commissionId }: { commissionId: string }) {
  const t = useTranslations("shares.markCommissionSettledButton");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // L'action rend son échec traduit ; une coupure réseau se dit aussi (stabilisation, E7 : avant, un `try/finally`
  // sans `catch` laissait un rejet muet et le bouton se réactivait sans message).
  async function run() {
    setPending(true);
    setError(null);
    try {
      const result = await markCommissionSettledAction(commissionId);
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
      <Button type="button" variant="outline" size="sm" className="h-10 px-3 sm:h-7 sm:px-2.5" onClick={run} disabled={pending}>
      {pending ? "…" : t("marquer_reglee")}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
