"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Le « rafraîchissement automatique léger » de la veille : tant qu'une
 * collecte est en cours, la page se recharge toutes les cinq secondes
 * (données seulement, sans perdre la position), pendant trois minutes au
 * plus — le budget d'une collecte. Aucun état local : rien à synchroniser.
 */
export function RefreshWhileRunning({ active, intervalMs = 5000, maxMs = 180_000 }: { active: boolean; intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > maxMs) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, maxMs, router]);
  return null;
}
