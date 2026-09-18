import { cn } from "@/lib/cn";
import { sansOrphelin } from "@/lib/titres";

/**
 * LES LARGEURS DU SITE. Elles ne sont pas décoratives : une largeur de
 * lecture confortable tient autour de 70 caractères, et un tableau de
 * cartes respire à 80 rem. Varier la largeur d'une section à l'autre est ce
 * qui donne son rythme à la page — une colonne unique de bout en bout
 * l'aplatit.
 */
const LARGEURS = {
  etroite: "max-w-3xl", // une liste, un paragraphe : la largeur de lecture
  lisible: "max-w-5xl", // deux colonnes de texte dense
  normale: "max-w-[70rem]",
  large: "max-w-[80rem]", // les sections qui portent une capture
} as const;

export type Largeur = keyof typeof LARGEURS;

/** La gouttière unique du site (`--gouttiere`), identique des deux côtés, et la largeur demandée au plus. */
export function Container({
  children,
  className,
  largeur = "normale",
}: {
  children: React.ReactNode;
  className?: string;
  largeur?: Largeur;
}) {
  return (
    <div className={cn("gouttiere mx-auto w-full", LARGEURS[largeur], className)}>{children}</div>
  );
}

const TONS = {
  normal: "",
  /* Un aplat neutre à peine plus soutenu que la page — jamais l'accent. */
  doux: "bg-muted",
} as const;

/**
 * Une section de page : son rythme vertical, son filet ou son fond, et
 * l'intitulé qui l'annonce. Le titre est toujours un `h2` — la hiérarchie
 * des titres est une exigence d'accessibilité, pas une décoration.
 */
export function Section({
  intitule,
  titre,
  chapo,
  children,
  bordered = true,
  largeur = "normale",
  ton = "normal",
  id,
}: {
  intitule?: string;
  titre?: string;
  chapo?: string;
  children: React.ReactNode;
  bordered?: boolean;
  largeur?: Largeur;
  ton?: keyof typeof TONS;
  id?: string;
}) {
  const aEnTete = Boolean(intitule || titre || chapo);
  return (
    <section
      id={id}
      className={cn("py-20 sm:py-24 lg:py-32", bordered && "border-t border-border", TONS[ton])}
    >
      <Container largeur={largeur}>
        {aEnTete && (
          <header data-entree className="max-w-2xl">
            {intitule && (
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{intitule}</p>
            )}
            {titre && (
              <h2 className="mt-4 text-balance text-titre-2">{sansOrphelin(titre)}</h2>
            )}
            {chapo && <p className="mt-6 max-w-2xl text-pretty text-chapo text-muted-foreground">{chapo}</p>}
          </header>
        )}
        <div className={cn(aEnTete && "mt-12 sm:mt-16")}>{children}</div>
      </Container>
    </section>
  );
}

/** Une carte de contenu : le même fond, le même filet et le même rayon partout. */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-6 text-card-foreground transition-colors duration-200 ease-out hover:border-primary",
      className
    )}>{children}</div>
  );
}

/** La puce des listes en prose — un point, pas un caractère typographique qu'une synthèse vocale lirait. */
export function Puce() {
  return <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-muted-foreground" />;
}
