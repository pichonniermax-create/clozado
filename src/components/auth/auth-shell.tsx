import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Cadre commun à /login, /inscription et /login/verifier. Ces trois écrans
 * sont les seuls que voit quelqu'un qui n'a pas encore de compte : ils
 * doivent se ressembler et dire ce qu'est le produit, plutôt que d'être
 * trois cartes nues posées au centre d'une page blanche.
 *
 * Il ne réutilise pas `PageHeader`/la barre latérale à dessein : ici il n'y
 * a rien à naviguer, et aucune organisation dont afficher la marque.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link href="/" className="flex items-center gap-2.5 self-center">
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
            >
              C
            </span>
            <span className="text-lg font-semibold tracking-tight">Clozado</span>
          </Link>

          <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              {description && (
                <p className="text-sm text-muted-foreground text-pretty">{description}</p>
              )}
            </div>
            {children}
          </div>

          {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
