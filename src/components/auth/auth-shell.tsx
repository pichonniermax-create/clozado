import type { ReactNode } from "react";
import { BrandMark } from "@/components/app-shell/brand-mark";

/**
 * Cadre commun à tous les écrans PUBLICS : connexion, code, inscription,
 * erreur d'authentification, déconnexion, 404, désinscription. Ce sont les
 * seuls écrans que voit quelqu'un qui n'a pas de compte — et, depuis
 * clozado.fr, les premiers qu'il voit après le site.
 *
 * Ils portent donc LA CHARTE DU SITE (`data-charte="site"`, définie dans
 * globals.css) : bordeaux, blanc cassé chaud, filet de 1 px à la place de
 * l'ombre, un rayon de carte de 16 px, un corps de 17 px, une action en
 * pilule de 48 px. Aucune icône décorative — c'est la règle du site, et
 * c'est ce qui les distingue du produit, qui reste bleu et dense.
 *
 * Il ne réutilise pas `PageHeader`/la barre latérale à dessein : ici il n'y
 * a rien à naviguer, et aucune organisation dont afficher la marque.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  lang,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** La langue de la page quand elle n'est pas celle de la requête (la désinscription parle la langue de l'organisation). */
  lang?: string;
}) {
  // `min-h-svh` plutôt que `min-h-screen` : sur Safari iOS, 100vh compte la barre d'adresse et la carte sautait au défilement.
  return (
    <div lang={lang} data-charte="site" className="flex min-h-svh flex-col bg-background">
      {/* La gouttière du site : 20 px, 40 px à partir de `md`. Identique à gauche et à droite. */}
      <div className="flex flex-1 items-center justify-center px-5 py-12 md:px-10">
        <div className="flex w-full max-w-md flex-col gap-8">
          <BrandMark size="lg" href="/" className="self-center" />

          <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
              {description && (
                <p className="text-base text-muted-foreground text-pretty">{description}</p>
              )}
            </div>
            {children}
          </div>

          {footer && <div className="text-center text-base text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
