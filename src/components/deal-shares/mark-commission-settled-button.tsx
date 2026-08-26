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

  async function run() {
    setPending(true);
    try {
      await markCommissionSettledAction(commissionId);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
      {pending ? "…" : t("marquer_reglee")}
    </Button>
  );
}
