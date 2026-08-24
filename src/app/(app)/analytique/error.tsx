"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Erreur de chargement d'un écran analytique — jamais l'écran technique brut. */
export default function AnalyticsError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState title="Cet écran analytique n'a pas pu être chargé." retry={retry} backHref="/dashboard" backLabel="Tableau de bord" />;
}
