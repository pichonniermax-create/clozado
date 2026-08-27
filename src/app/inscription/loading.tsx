import { PublicCardSkeleton } from "@/components/app-shell/public-card-skeleton";

/** Chargement de l'inscription — même silhouette que la connexion (voir login/loading.tsx pour la raison du squelette par segment). */
export default function SignupLoading() {
  return <PublicCardSkeleton />;
}
