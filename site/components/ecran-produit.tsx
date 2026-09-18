import type { CSSProperties } from "react";
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
 * LE MOUVEMENT (accueil seulement) est porté par des ATTRIBUTS, pas par du
 * script ici : `data-ecran` marque la zone qu'on anime à son entrée dans
 * l'écran, `data-ligne` les lignes qui se posent en cascade, `data-compteur`
 * les nombres qui se comptent, et `--part` la largeur que rejoint une barre.
 * Hors de l'accueil — donc sans `[data-mouvement]` sur `<html>` — ces
 * attributs ne font rien du tout : le CSS qui les anime ne s'applique pas.
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
      <div data-ecran className="ecran-cadre">
        <header className="ecran-entete">
          <p className="ecran-nom">{nom}</p>
          <p className="ecran-resume">{resume}</p>
        </header>
        {children}
      </div>
      {legende && <figcaption className="text-sm text-muted-foreground">{legende}</figcaption>}
    </figure>
  );
}

/**
 * Un nombre qui se compte. La partie chiffrée est isolée du reste (« 4 476 »
 * dans « 4 476 € ») : c'est elle qui monte, l'unité ne clignote pas.
 */
function Nombre({ valeur }: { valeur: string }) {
  const morceaux = valeur.match(/^(\D*)([\d\s ]*\d)(.*)$/);
  if (!morceaux) return <>{valeur}</>;
  const [, avant, nombre, apres] = morceaux;
  return (
    <>
      {avant}
      <span data-compteur={nombre.replace(/\D/g, "")}>{nombre}</span>
      {apres}
    </>
  );
}

/**
 * Les durées en jours d'une ligne (« sans réponse depuis 24 j ») montent
 * elles aussi. Les dates, elles, n'y touchent pas : seul un nombre SUIVI
 * d'un « j » est un compteur.
 */
function avecJours(texte: string) {
  return texte.split(/(\d+(?=\s*j\b))/g).map((morceau, rang) =>
    rang % 2 === 1 ? (
      <span key={rang} data-compteur={morceau}>
        {morceau}
      </span>
    ) : (
      morceau
    )
  );
}

/** Une pastille de comptage — un nombre, pas un badge de couleur. */
function Compte({ children }: { children: React.ReactNode }) {
  return (
<span className="ecran-compte">{children}</span>
  );
}

/** Le faux bouton d'une ligne : un contour, jamais l'accent — l'accent est au vrai appel à l'action. */
function FauxBouton({ children, plein = false }: { children: React.ReactNode; plein?: boolean }) {
  return (
    <span
      className={cn("faux-bouton", plein && "faux-bouton-plein")}
    >
      {children}
    </span>
  );
}

function LigneEcran({ ligne }: { ligne: Ligne }) {
  return (
    <li
      data-ligne
      className="ecran-ligne"
    >
      <div className="min-w-0 flex-1">
        <p className="ecran-ligne-titre">{ligne.titre}</p>
        <p className="ecran-ligne-detail">{avecJours(ligne.detail)}</p>
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
          <header className="ecran-pile-entete">
            <p className="ecran-nom">{pile.titre}</p>
            <Compte>
              <Nombre valeur={pile.compte} />
            </Compte>
            <p className="ecran-mention w-full sm:w-auto">{pile.precision}</p>
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
  sansLegende = false,
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
      <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        {ecran.tuiles.map((tuile) => (
          <div key={tuile.libelle} className="ecran-tuile">
            <p className="ecran-mention">{tuile.libelle}</p>
            <p className="ecran-tuile-valeur">
              <Nombre valeur={tuile.valeur} />
            </p>
            <p className="ecran-mention mt-1">{tuile.precision}</p>
          </div>
        ))}
      </div>
      <section className="border-t border-border">
        <header className="ecran-pile-entete">
          <p className="ecran-nom">{ecran.listeTitre}</p>
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
          <p className="ecran-nom">
            <Nombre valeur={ecran.vague.titre} />
          </p>
          <p className="ecran-mention mt-1">{ecran.vague.precision}</p>
        </div>
        <FauxBouton plein>{ecran.vague.action}</FauxBouton>
      </div>
      <ul>
        {ecran.lignes.map((ligne) => (
          <li
            key={ligne.phrase}
            data-ligne
            className="ecran-ligne-bloc"
          >
            <p className="ecran-ligne-titre">{ligne.phrase}</p>
            <p className="ecran-mention mt-1">{ligne.detail}</p>
          </li>
        ))}
      </ul>
    </Cadre>
  );
}

/** « 32,1 % » → « 32.1% », la largeur que rejoint la barre. Sans taux, pas de barre. */
function part(taux: string): string | undefined {
  const nombre = taux.replace(",", ".").match(/[\d.]+/)?.[0];
  return nombre ? `${nombre}%` : undefined;
}

export function EcranFunnel({
  ecran,
  sansLegende = false,
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
      {/* Un tableau, pas un entonnoir dessiné : sur sept pas, la dernière
          forme ferait un pixel et mentirait. La seule barre est celle du TAUX
          DE PASSAGE, qui dit exactement ce que le nombre à côté d'elle dit. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="ecran-col">
                {ecran.colonnes.pas}
              </th>
              <th scope="col" className="ecran-col text-right">
                {ecran.colonnes.nombre}
              </th>
              <th scope="col" className="ecran-col text-right">
                {ecran.colonnes.taux}
              </th>
              <th scope="col" className="ecran-col text-right">
                {ecran.colonnes.perte}
              </th>
            </tr>
          </thead>
          <tbody>
            {ecran.pas.map((pas, rang) => {
              const largeur = part(pas.taux);
              return (
                <tr
                  key={pas.libelle}
                  data-ligne
                  className="ecran-rangee"
                >
                  <th scope="row" className="ecran-cellule font-medium text-foreground">
                    {pas.libelle}
                  </th>
                  <td className="ecran-cellule text-right font-semibold text-foreground">
                    <Nombre valeur={pas.nombre} />
                  </td>
                  <td className="ecran-cellule text-right text-muted-foreground">
                    {pas.taux}
                    {largeur && (
                      <span className="piste-passage">
                        <span
                          className="barre-passage"
                          style={{ "--part": largeur, "--delai": `${rang * 60}ms` } as CSSProperties}
                        />
                      </span>
                    )}
                  </td>
                  <td className="ecran-cellule text-right text-muted-foreground">{pas.perte}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Cadre>
  );
}
