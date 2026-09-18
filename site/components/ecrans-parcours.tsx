import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { Cadre, FauxBouton } from "./ecran-produit";

/**
 * LES SIX ÉCRANS DU PARCOURS — un par étape, et six formes différentes.
 *
 * Aucune n'est reprise de l'accueil (liste à piles, tuiles, vague, tableau
 * de funnel) ni des pages métier (chronologie, tableau à totaux, jauge).
 * Une fiche, des colonnes, un va-et-vient, un aperçu de message, une barre
 * empilée, une série mensuelle : chacune montre ce que son étape fait, et
 * aucune ne reparaît deux fois dans la page.
 *
 * Comme les autres écrans du site, ils sont REDESSINÉS EN HTML — aucune
 * image, du texte sélectionnable, lisible à 390 px où les colonnes se
 * replient en rangées.
 *
 * Aucun mot n'est écrit ici : tout vient de `content/<langue>/parcours-produit.ts`.
 */

/** 01 — LA FICHE. Des couples libellé/valeur, deux par rangée. */
export function EcranFiche({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly champs: readonly { readonly libelle: string; readonly valeur: string }[];
  };
  className?: string;
}) {
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <dl className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
        {ecran.champs.map((champ) => (
          <div key={champ.libelle} data-ligne className="bg-card px-4 py-3 sm:px-5">
            <dt className="ecran-mention">{champ.libelle}</dt>
            <dd className="ecran-ligne-titre mt-1">{champ.valeur}</dd>
          </div>
        ))}
      </dl>
    </Cadre>
  );
}

/** 02 — LES COLONNES. La filière, ses cartes et son total. */
export function EcranColonnes({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly colonnes: readonly {
      readonly titre: string;
      readonly compte: string;
      readonly montant: string;
      readonly cartes: readonly { readonly titre: string; readonly detail: string }[];
    }[];
    readonly total: { readonly libelle: string; readonly compte: string; readonly montant: string };
  };
  className?: string;
}) {
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
        {ecran.colonnes.map((colonne) => (
          <section key={colonne.titre} data-ligne className="bg-card px-4 py-4 sm:px-3">
            <header className="flex items-baseline justify-between gap-2">
              <p className="ecran-nom">{colonne.titre}</p>
              <p className="tabulaire text-detail text-muted-foreground">{colonne.compte}</p>
            </header>
            <p className="tabulaire mt-1 text-detail text-muted-foreground">{colonne.montant}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {colonne.cartes.map((carte) => (
                <li key={carte.titre} className="rounded-xl border border-border px-3 py-2">
                  {/* Une colonne est étroite : le nom passe à la ligne, il ne se coupe pas. */}
                  <p className="ecran-ligne-titre whitespace-normal">{carte.titre}</p>
                  <p className="ecran-ligne-detail whitespace-normal">{carte.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t border-border px-4 py-3 sm:px-5">
        <p className="ecran-nom">{ecran.total.libelle}</p>
        <p className="tabulaire text-sm font-semibold text-foreground">
          {ecran.total.compte} · {ecran.total.montant}
        </p>
      </div>
    </Cadre>
  );
}

/** 03 — LE VA-ET-VIENT. Deux côtés, des gestes horodatés, et l'écart entre eux. */
export function EcranVaEtVient({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly cotes: { readonly vous: string; readonly confrere: string };
    readonly gestes: readonly {
      readonly cote: "vous" | "confrere";
      readonly libelle: string;
      readonly horodatage: string;
      readonly ecart?: string;
    }[];
    readonly pied: { readonly libelle: string; readonly valeur: string };
  };
  className?: string;
}) {
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
        <p className="ecran-mention bg-card px-4 py-2 sm:px-5">{ecran.cotes.vous}</p>
        <p className="ecran-mention bg-card px-4 py-2 text-right sm:px-5">{ecran.cotes.confrere}</p>
      </div>
      <ul className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        {ecran.gestes.map((geste) => (
          <li
            key={geste.libelle}
            data-ligne
            className={cn("flex", geste.cote === "confrere" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-xl border px-3 py-2",
                geste.cote === "confrere" ? "border-border bg-muted/60" : "border-border bg-card"
              )}
            >
              <p className="ecran-ligne-titre whitespace-normal">{geste.libelle}</p>
              <p className="ecran-ligne-detail whitespace-normal">
                {geste.horodatage}
                {geste.ecart && <span className="tabulaire ml-2 text-primary-ink">+{geste.ecart}</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-4 border-t border-border px-4 py-3 sm:px-5">
        <p className="ecran-mention">{ecran.pied.libelle}</p>
        <p className="tabulaire text-sm font-semibold text-foreground">{ecran.pied.valeur}</p>
      </div>
    </Cadre>
  );
}

/** 04 — L'APERÇU. Le message tel qu'il partira, et ce qui a été revérifié. */
export function EcranApercu({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly destinataire: string;
    readonly objet: string;
    readonly corps: readonly string[];
    readonly piedTitre: string;
    readonly piedElements: readonly string[];
    readonly controlesTitre: string;
    readonly controles: readonly { readonly libelle: string; readonly etat: string }[];
    readonly action: string;
  };
  className?: string;
}) {
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <p className="ecran-ligne-detail whitespace-normal">{ecran.destinataire}</p>
        <p className="ecran-ligne-titre mt-1 whitespace-normal">{ecran.objet}</p>
      </div>
      <div data-ligne className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:px-5">
        {ecran.corps.map((paragraphe) => (
          <p key={paragraphe} className="text-detail leading-relaxed text-foreground">
            {paragraphe}
          </p>
        ))}
        <div className="mt-2 rounded-xl border border-border bg-muted/60 px-3 py-2">
          <p className="ecran-mention">{ecran.piedTitre}</p>
          {ecran.piedElements.map((element) => (
            <p key={element} className="ecran-ligne-detail whitespace-normal">
              {element}
            </p>
          ))}
        </div>
      </div>
      <div className="px-4 py-3 sm:px-5">
        <p className="ecran-mention">{ecran.controlesTitre}</p>
        <ul className="mt-2 flex flex-col gap-1">
          {ecran.controles.map((controle) => (
            <li key={controle.libelle} data-ligne className="flex items-baseline justify-between gap-3">
              <span className="ecran-ligne-detail whitespace-normal">{controle.libelle}</span>
              <span className="text-detail font-medium text-foreground">{controle.etat}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end border-t border-border px-4 py-3 sm:px-5">
        <FauxBouton plein>{ecran.action}</FauxBouton>
      </div>
    </Cadre>
  );
}

/** 05 — LA BARRE EMPILÉE. Trois états d'une même somme. */
export function EcranCommission({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly total: string;
    readonly parts: readonly {
      readonly libelle: string;
      readonly montant: string;
      readonly part: string;
      readonly date: string;
    }[];
    readonly rappel: { readonly libelle: string; readonly valeur: string };
  };
  className?: string;
}) {
  const opacites = [1, 0.55, 0.25];
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <div className="px-4 py-4 sm:px-5">
        <p className="tabulaire text-2xl font-semibold text-foreground">{ecran.total}</p>
        {/* La barre : trois parts d'une même somme, dans l'ordre où elles arrivent. */}
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full border border-border">
          {ecran.parts.map((part, rang) => (
            <span
              key={part.libelle}
              aria-hidden
              className="h-full bg-primary"
              style={{ width: part.part.replace(",", "."), opacity: opacites[rang] ?? 0.25 } as CSSProperties}
            />
          ))}
        </div>
        <ul className="mt-4 flex flex-col">
          {ecran.parts.map((part, rang) => (
            <li
              key={part.libelle}
              data-ligne
              className="flex flex-wrap items-baseline gap-x-3 border-b border-border py-2 last:border-b-0"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-primary"
                style={{ opacity: opacites[rang] ?? 0.25 } as CSSProperties}
              />
              <span className="ecran-ligne-titre">{part.libelle}</span>
              <span className="tabulaire text-sm font-semibold text-foreground">{part.montant}</span>
              <span className="tabulaire text-detail text-muted-foreground">{part.part}</span>
              <span className="ecran-ligne-detail ml-auto whitespace-normal">{part.date}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t border-border px-4 py-3 sm:px-5">
        <p className="ecran-mention">{ecran.rappel.libelle}</p>
        <p className="text-detail font-medium text-foreground">{ecran.rappel.valeur}</p>
      </div>
    </Cadre>
  );
}

/** 06 — LA SÉRIE. Six mois, une barre par mois, et ce qu'ils cumulent. */
export function EcranSerie({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly mois: readonly { readonly libelle: string; readonly valeur: string }[];
    readonly total: { readonly libelle: string; readonly valeur: string };
    readonly variation: { readonly libelle: string; readonly valeur: string };
    readonly definition: string;
  };
  className?: string;
}) {
  const maximum = Math.max(...ecran.mois.map((mois) => Number(mois.valeur)));
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <div className="flex items-end gap-2 px-4 py-4 sm:px-5">
        {ecran.mois.map((mois) => (
          <div key={mois.libelle} data-ligne className="flex flex-1 flex-col items-center gap-2">
            <span className="tabulaire text-detail font-semibold text-foreground">{mois.valeur}</span>
            <span
              aria-hidden
              className="w-full rounded-t-sm bg-primary"
              style={{ height: `${(Number(mois.valeur) / maximum) * 88}px`, opacity: 0.85 } as CSSProperties}
            />
            <span className="ecran-mention">{mois.libelle}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-border bg-border">
        <div className="bg-card px-4 py-3 sm:px-5">
          <p className="ecran-mention">{ecran.total.libelle}</p>
          <p className="tabulaire mt-1 text-sm font-semibold text-foreground">{ecran.total.valeur}</p>
        </div>
        <div className="bg-card px-4 py-3 sm:px-5">
          <p className="ecran-mention">{ecran.variation.libelle}</p>
          <p className="tabulaire mt-1 text-sm font-semibold text-primary-ink">{ecran.variation.valeur}</p>
        </div>
      </div>
      <p className="ecran-mention border-t border-border px-4 py-3 sm:px-5">{ecran.definition}</p>
    </Cadre>
  );
}
