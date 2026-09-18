import { cn } from "@/lib/cn";

/** La gouttière unique du site : 16 px au doigt, 1120 px au plus sur grand écran. */
export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[70rem] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/**
 * Une section de page : son rythme vertical, son filet de séparation, et
 * l'intitulé qui l'annonce. Le titre est toujours un `h2` — la hiérarchie
 * des titres est une exigence d'accessibilité, pas une décoration.
 */
export function Section({
  intitule,
  titre,
  chapo,
  children,
  bordered = true,
  id,
}: {
  intitule?: string;
  titre?: string;
  chapo?: string;
  children: React.ReactNode;
  bordered?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn("py-16 sm:py-20 lg:py-24", bordered && "border-t border-border")}>
      <Container>
        {(intitule || titre || chapo) && (
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
        <div className={cn(intitule || titre || chapo ? "mt-10 sm:mt-12" : undefined)}>{children}</div>
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
