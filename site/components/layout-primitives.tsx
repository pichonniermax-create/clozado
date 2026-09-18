import { cn } from "@/lib/cn";

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

/** La gouttière unique du site : 16 px au doigt, et la largeur demandée au plus. */
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
    <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", LARGEURS[largeur], className)}>{children}</div>
  );
}

const TONS = {
  normal: "",
  doux: "bg-muted/50",
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
      className={cn("py-16 sm:py-20 lg:py-24", bordered && "border-t border-border", TONS[ton])}
    >
      <Container largeur={largeur}>
        {aEnTete && (
          <header className="max-w-2xl">
            {intitule && (
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{intitule}</p>
            )}
            {titre && (
              <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{titre}</h2>
            )}
            {chapo && <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">{chapo}</p>}
          </header>
        )}
        <div className={cn(aEnTete && "mt-10 sm:mt-12")}>{children}</div>
      </Container>
    </section>
  );
}

/** Une carte de contenu : le même fond, le même filet et le même rayon partout. */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6 text-card-foreground", className)}>{children}</div>
  );
}

/** La puce des listes en prose — un point, pas un caractère typographique qu'une synthèse vocale lirait. */
export function Puce() {
  return <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />;
}
