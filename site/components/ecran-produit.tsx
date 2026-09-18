import { cn } from "@/lib/cn";

/**
 * LES ÉCRANS DU PRODUIT, REDESSINÉS EN HTML — jamais photographiés.
 *
 * Le site n'affiche aucune image : ni photo, ni illustration, ni capture.
 * Ce qui montre le produit est donc du texte et des filets, dans la palette
 * du site. Les avantages ne sont pas que doctrinaires : rien à télécharger
 * (la page ne pèse plus que son HTML), le texte est sélectionnable, lu par
 * une synthèse vocale, indexable, et net à toutes les densités d'écran.
 *
 * Ce ne sont PAS des commandes : les boutons sont des `<span>`, pas des
 * `<button>` — un bouton mort dans une page est un piège au clavier. La
 * légende de chaque écran dit que c'est une reproduction, et la page dit
 * une fois que les données viennent du cabinet fictif de la démonstration.
 *
 * Aucun mot n'est écrit ici : tout vient de `content/<langue>/accueil.ts`.
 */

type Ligne = { readonly titre: string; readonly detail: string; readonly action?: string };

/** Le cadre commun : un bloc blanc, un filet, 16 px de rayon, aucune ombre. */
function Cadre({
  nom,
  resume,
  legende,
  children,
  className,
}: {
  nom: string;
  resume: string;
  /** Absente dans le premier écran : la mention générale de la page la dit déjà. */
  legende?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("flex flex-col gap-4", className)}>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-foreground">{nom}</p>
          <p className="text-sm text-muted-foreground">{resume}</p>
        </header>
        {children}
      </div>
      {legende && <figcaption className="text-sm text-muted-foreground">{legende}</figcaption>}
    </figure>
  );
}

/** Une pastille de comptage — un nombre, pas un badge de couleur. */
function Compte({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
      {children}
    </span>
  );
}

/** Le faux bouton d'une ligne : un contour, jamais l'accent — l'accent est au vrai appel à l'action. */
function FauxBouton({ children, plein = false }: { children: React.ReactNode; plein?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium",
        plein
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-card text-foreground"
      )}
    >
      {children}
    </span>
  );
}

function LigneEcran({ ligne }: { ligne: Ligne }) {
  return (
    <li className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{ligne.titre}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{ligne.detail}</p>
      </div>
      {ligne.action && <FauxBouton>{ligne.action}</FauxBouton>}
    </li>
  );
}

export function EcranSuivi({
  ecran,
  sansLegende = false,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly piles: readonly {
      readonly titre: string;
      readonly compte: string;
      readonly precision: string;
      readonly lignes: readonly Ligne[];
    }[];
  };
  sansLegende?: boolean;
  className?: string;
}) {
  return (
    <Cadre
      nom={ecran.nom}
      resume={ecran.resume}
      legende={sansLegende ? undefined : ecran.legende}
      className={className}
    >
      {ecran.piles.map((pile) => (
        <section key={pile.titre} className="border-b border-border last:border-b-0">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-muted/60 px-4 py-3 sm:px-5">
            <p className="text-sm font-semibold text-foreground">{pile.titre}</p>
            <Compte>{pile.compte}</Compte>
            <p className="w-full text-xs text-muted-foreground sm:w-auto">{pile.precision}</p>
          </header>
          <ul>
            {pile.lignes.map((ligne) => (
              <LigneEcran key={ligne.titre} ligne={ligne} />
            ))}
          </ul>
        </section>
      ))}
    </Cadre>
  );
}

export function EcranTableauDeBord({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly tuiles: readonly { readonly libelle: string; readonly valeur: string; readonly precision: string }[];
    readonly listeTitre: string;
    readonly lignes: readonly Ligne[];
  };
  className?: string;
}) {
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        {ecran.tuiles.map((tuile) => (
          <div key={tuile.libelle} className="bg-card px-4 py-4 sm:px-5">
            <p className="text-xs text-muted-foreground">{tuile.libelle}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground">{tuile.valeur}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tuile.precision}</p>
          </div>
        ))}
      </div>
      <section className="border-t border-border">
        <header className="bg-muted/60 px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold text-foreground">{ecran.listeTitre}</p>
        </header>
        <ul>
          {ecran.lignes.map((ligne) => (
            <LigneEcran key={ligne.titre} ligne={ligne} />
          ))}
        </ul>
      </section>
    </Cadre>
  );
}

export function EcranRegles({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly vague: { readonly titre: string; readonly precision: string; readonly action: string };
    readonly lignes: readonly { readonly phrase: string; readonly detail: string }[];
  };
  className?: string;
}) {
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      {/* LA VAGUE : le seul bouton plein de l'écran, parce que c'est le seul
          geste qui envoie quelque chose. Le produit ne montre rien d'autre ici. */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border bg-primary-soft px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{ecran.vague.titre}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ecran.vague.precision}</p>
        </div>
        <FauxBouton plein>{ecran.vague.action}</FauxBouton>
      </div>
      <ul>
        {ecran.lignes.map((ligne) => (
          <li key={ligne.phrase} className="border-b border-border px-4 py-4 last:border-b-0 sm:px-5">
            <p className="text-sm font-medium text-foreground">{ligne.phrase}</p>
            <p className="mt-1 text-xs text-muted-foreground">{ligne.detail}</p>
          </li>
        ))}
      </ul>
    </Cadre>
  );
}

export function EcranFunnel({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly colonnes: { readonly pas: string; readonly nombre: string; readonly taux: string; readonly perte: string };
    readonly pas: readonly {
      readonly libelle: string;
      readonly nombre: string;
      readonly taux: string;
      readonly perte: string;
    }[];
  };
  className?: string;
}) {
  const entete = "px-4 py-3 text-xs font-semibold text-muted-foreground sm:px-5";
  const cellule = "px-4 py-3 text-sm tabular-nums sm:px-5";
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      {/* Un tableau, pas des barres : sur sept pas, la dernière barre ferait
          un pixel et mentirait sur ce qu'elle montre. Les nombres, eux, sont lisibles. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={entete}>
                {ecran.colonnes.pas}
              </th>
              <th scope="col" className={cn(entete, "text-right")}>
                {ecran.colonnes.nombre}
              </th>
              <th scope="col" className={cn(entete, "text-right")}>
                {ecran.colonnes.taux}
              </th>
              <th scope="col" className={cn(entete, "text-right")}>
                {ecran.colonnes.perte}
              </th>
            </tr>
          </thead>
          <tbody>
            {ecran.pas.map((pas) => (
              <tr key={pas.libelle} className="border-b border-border last:border-b-0">
                <th scope="row" className={cn(cellule, "font-medium text-foreground")}>
                  {pas.libelle}
                </th>
                <td className={cn(cellule, "text-right font-semibold text-foreground")}>{pas.nombre}</td>
                <td className={cn(cellule, "text-right text-muted-foreground")}>{pas.taux}</td>
                <td className={cn(cellule, "text-right text-muted-foreground")}>{pas.perte}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cadre>
  );
}
