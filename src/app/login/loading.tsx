import { PublicCardSkeleton } from "@/components/app-shell/public-card-skeleton";

/**
 * Chargement de la connexion (et de /login/verifier). Le squelette vivait à
 * la racine d'app/ : cette Suspense enveloppait TOUTES les pages publiques,
 * la coquille partait en 200 avant que /desinscription/[id] ne puisse
 * répondre 404 à un lien inconnu — chaque segment porte donc le sien.
 */
export default function LoginLoading() {
  return <PublicCardSkeleton />;
}
