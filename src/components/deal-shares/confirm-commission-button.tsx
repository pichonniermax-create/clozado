"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmCommissionAction } from "@/lib/deals/actions";

/** Fiche affaire : prevue → confirmee, une fois l'affaire aboutie et le montant arrêté. */
export function ConfirmCommissionButton({ commissionId }: { commissionId: string }) {
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
      {pending ? "…" : "Confirmer"}
    </Button>
  );
}
