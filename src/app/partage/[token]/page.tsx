import type { Metadata } from "next";
import { PartnerShareView } from "@/components/deal-shares/partner-share-view";
import { resolvePublicShare } from "@/db/queries/deal-shares-public";

/**
 * Page publique, sans compte — accès par jeton uniquement. Ne jamais
 * appeler `auth()` ici : le seul chemin de données est
 * `resolvePublicShare`, le module isolé (voir son commentaire de tête pour
 * ce qu'il refuse). Toujours rendue dynamiquement : ce n'est jamais une
 * page qu'on veut voir mise en cache/statique.
 */
export const dynamic = "force-dynamic";

// Un lien de partage n'est pas une page publique à découvrir.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PartnerSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await resolvePublicShare(token);

  if (!result.ok) {
    return <ErrorState reason={result.reason} />;
  }

  return <PartnerShareView token={token} initialView={result.view} />;
}

function ErrorState({ reason }: { reason: string }) {
  const message =
    reason === "revoked"
      ? "Ce lien a été révoqué. Contactez directement votre interlocuteur pour en obtenir un nouveau."
      : reason === "expired"
        ? "Ce lien a expiré. Contactez directement votre interlocuteur pour en obtenir un nouveau."
        : "Ce lien n'est pas valide.";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
