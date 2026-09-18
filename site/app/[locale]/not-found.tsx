import { NotFoundContent } from "@/components/not-found-content";
import { DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * La page introuvable d'une langue : elle est rendue DANS la coquille
 * (en-tête et pied de page présents), pour toute adresse qui n'existe pas
 * sous une langue connue — « /fr/quelque-chose ».
 *
 * Elle ne reçoit pas de props (Next n'en passe pas à `not-found`) : la
 * langue par défaut suffit tant qu'il n'y en a qu'une. Avec deux langues,
 * elle se lira par `next/root-params`.
 */
export default function Introuvable() {
  return <NotFoundContent locale={DEFAULT_LOCALE} />;
}
