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

  async function run() {
    setPending(true);
    try {
      await confirmCommissionAction(commissionId);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
      {pending ? "…" : t("confirmer")}
    </Button>
  );
}
