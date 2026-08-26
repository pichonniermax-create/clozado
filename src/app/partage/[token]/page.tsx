import type { Metadata } from "next";
import { cache } from "react";
import { BrandStyle } from "@/components/brand/brand-style";
import { PartnerShareView } from "@/components/deal-shares/partner-share-view";
import { resolvePublicShare } from "@/db/queries/deal-shares-public";
import { deriveBrandTokens } from "@/lib/brand/derive";

/**
 * Page publique, sans compte — accès par jeton uniquement. Ne jamais
 * appeler `auth()` ici : le seul chemin de données est
 * `resolvePublicShare`, le module isolé (voir son commentaire de tête pour
 * ce qu'il refuse). Toujours rendue dynamiquement : ce n'est jamais une
 * page qu'on veut voir mise en cache/statique.
 */
export const dynamic = "force-dynamic";

// Une seule résolution par requête, partagée entre les métadonnées et la
// page — un partage expiré journalise son accès, pas deux fois.
const resolveShare = cache(resolvePublicShare);

/**
 * Un lien de partage n'est pas une page publique à découvrir. La page
 * porte la marque de l'organisation émettrice jusque dans l'onglet (son
 * nom, son icône) — et rien de tout ça sur un lien invalide : la page
 * d'erreur reste anonyme (voir `ErrorState`).
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const result = await resolveShare(token);
  const robots = { index: false, follow: false };
  if (!result.ok) return { robots };
  const { organization, iconUrl } = result.view;
  return {
    robots,
    title: organization.name,
    ...(iconUrl ? { icons: { icon: [{ url: iconUrl, type: "image/png", sizes: "128x128" }] } } : {}),
  };
}

export default async function PartnerSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await resolveShare(token);

  if (!result.ok) {
    return <ErrorState reason={result.reason} />;
  }

  // Les jetons dérivés de la couleur de l'organisation émettrice, posés sur
  // le document : la même fonction que la coquille et que l'aperçu des
  // réglages — la vitrine montre ce que l'organisation a vu.
  const hex = result.view.brand.primaryColor ?? "";
  return (
    <>
      <BrandStyle light={deriveBrandTokens(hex, "light").tokens} dark={deriveBrandTokens(hex, "dark").tokens} />
      <div className="min-h-screen bg-muted/40 px-4">
        <PartnerShareView token={token} initialView={result.view} />
      </div>
    </>
  );
}

/**
 * Sobre, non brandée (aucun nom d'organisation ni de personne — quelqu'un
 * tombant sur une vieille URL ne doit rien apprendre), mais utile : dit à
 * la personne quoi faire, pas juste que ça ne marche pas.
 *
 * Deux catégories seulement, jamais plus finement distinguées :
 * - révoqué/expiré : le partage a existé, invite à recontacter la personne
 *   qui l'a envoyé (sans dire qui) ;
 * - introuvable : message neutre, VOLONTAIREMENT identique quelle que soit
 *   la raison exacte (jeton mal formé, jamais existé…) — ne jamais laisser
 *   deviner "ce jeton n'existe pas" de "ce jeton existe mais n'est plus
 *   valable" en testant des variantes en masse.
 */
function ErrorState({ reason }: { reason: string }) {
  const message =
    reason === "revoked" || reason === "expired"
      ? "Ce lien n'est plus valable. Contactez directement la personne qui vous l'a envoyé pour en obtenir un nouveau."
      : "Ce lien n'est pas valide. Vérifiez que vous l'avez copié en entier, ou contactez la personne qui vous l'a envoyé.";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
