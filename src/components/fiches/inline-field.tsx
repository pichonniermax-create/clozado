"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AmountInput } from "@/components/ui/amount-input";
import { useFormats } from "@/components/i18n/formats-provider";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { searchEverythingAction } from "@/lib/search/actions";
import { cn } from "@/lib/utils";
import type { InlinePatch, InlineSaveResult } from "@/lib/fiches/inline";

/**
 * LA MODIFICATION EN PLACE (chantier « les fiches deviennent
 * modifiables ») — UN composant, les quatre fiches. Le geste est le même
 * partout : on clique sur une valeur, elle devient modifiable là où elle
 * est ; Entrée enregistre, Échap annule, Tab enregistre et passe au champ
 * suivant.
 *
 * Ce qui se passe à l'enregistrement, et l'ordre compte :
 * 1. le champ dit qu'il travaille (il reste lisible, il ne disparaît pas) ;
 * 2. le serveur valide, vérifie l'organisation et la VERSION de la fiche ;
 * 3. en cas de refus, la valeur précédente revient et la phrase dit
 *    pourquoi — jamais une valeur fantôme à l'écran ;
 * 4. si la fiche a changé ailleurs entre-temps, l'écran se recharge : on
 *    n'écrase pas le travail de quelqu'un d'autre en silence.
 *
 * Après un succès, `router.refresh()` : tout ce qui dépend de la valeur —
 * le bandeau des affaires, le montant pondéré, le tableau de bord, les
 * listes filtrées — se remet à jour sans rechargement complet.
 *
 * En lecture seule (démonstration publique), le champ n'est pas
 * modifiable : le clic affiche la phrase de lecture seule qui existe
 * déjà, à l'endroit même du clic.
 */

/**
 * LA VERSION PARTAGÉE D'UNE FICHE — trouvée au navigateur : sans elle,
 * corriger deux champs à la suite refusait le second. Chaque champ part
 * avec la version de la fiche ; la première écriture la fait changer, et
 * les autres champs, eux, portaient encore l'ancienne tant que la page
 * rafraîchie n'était pas revenue. La personne voyait « cette fiche a été
 * modifiée » alors qu'elle était seule.
 *
 * Ici, les champs d'une même fiche lisent et écrivent UNE version, tenue
 * côté client entre deux rendus du serveur : une écriture la met à jour
 * tout de suite, un rechargement du serveur la remplace. La garde contre
 * l'écrasement reste entière — une autre personne écrit, et sa version ne
 * correspond plus à celle qu'on porte.
 */
const VersionContext = createContext<{ value: string; adopt: (next: string) => void } | null>(null);

export function FicheVersion({ version, children }: { version: string; children: ReactNode }) {
  const [current, setCurrent] = useState(version);
  const [seen, setSeen] = useState(version);
  // Le serveur a rendu la fiche à nouveau : c'est SA version qui fait foi.
  if (version !== seen) {
    setSeen(version);
    setCurrent(version);
  }
  const shared = useMemo(() => ({ value: current, adopt: setCurrent }), [current]);
  return <VersionContext.Provider value={shared}>{children}</VersionContext.Provider>;
}

export type InlineOption = { value: string; label: string };

/**
 * Le type d'éditeur. « responsable » n'est pas un type à part : c'est une
 * `liste` dont les options sont les utilisateurs de l'organisation — une
 * seule mécanique, une seule validation côté serveur.
 */
export type InlineKind = "texte" | "texte_long" | "email" | "telephone" | "montant" | "date" | "liste" | "rattachement";

export type InlineFieldProps = {
  label: string;
  /** Le nom du champ, connu de la liste blanche du serveur. */
  field: string;
  kind: InlineKind;
  /** La valeur brute, celle que l'éditeur reçoit. */
  value: string;
  /** Ce qui s'affiche hors édition (un montant formaté, le libellé d'une liste) ; la valeur brute à défaut. */
  display?: string;
  options?: InlineOption[];
  /** Un champ obligatoire ne peut pas être vidé — refusé à l'écran ET au serveur. */
  required?: boolean;
  /** Ce que cherche un rattachement : une fiche contact, ou un confrère. */
  search?: "contact" | "partner";
  /** La version de la fiche, chargée avec elle. */
  version: string;
  save: (patch: InlinePatch) => Promise<InlineSaveResult>;
  readOnly?: boolean;
  /** Une phrase sous le champ (la devise, une règle métier) — déjà traduite. */
  hint?: string;
  className?: string;
};

type Hit = { id: string; title: string; subtitle: string | null };

export function InlineField(props: InlineFieldProps) {
  const { label, field, kind, value, display, options, required, search, version, save, readOnly, hint, className } = props;
  const t = useTranslations("fiches.inline");
  const tDemo = useTranslations("demo.banner");
  const shared = useContext(VersionContext);
  const fmt = useFormats();
  const router = useRouter();
  const inputId = useId();
  const messageId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, startTransition] = useTransition();
  /** La valeur affichée après un enregistrement réussi, en attendant que la page se rafraîchisse. */
  const [saved, setSaved] = useState<{ value: string; display: string } | null>(null);
  const savingRef = useRef(false);

  /**
   * La fiche a été rechargée (rafraîchissement après écriture, modification
   * venue d'ailleurs) : la valeur du serveur reprend la main. Motif React
   * « ajuster l'état pendant le rendu » — le même que le champ montant du
   * socle : l'état mémorise la dernière valeur vue, jamais un effet qui
   * déclencherait un second rendu.
   */
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    setDraft(value);
    setSaved(null);
  }

  const shownValue = saved?.value ?? value;
  const shownDisplay = saved?.display ?? display ?? value;

  /**
   * Ce qu'il faut afficher pour une valeur qu'on vient d'écrire, en
   * attendant que la page rafraîchie renvoie la sienne : un montant se lit
   * avec la devise de l'organisation, une date au format du pays, une liste
   * par son libellé — jamais la valeur brute, qui ferait clignoter un
   * « 1500 » puis un « 1 500,00 € ».
   */
  function displayFor(next: string, chosen?: string): string {
    if (!next) return "";
    if (chosen) return chosen;
    if (kind === "montant") return fmt.money(next) ?? next;
    if (kind === "date") {
      const parsed = new Date(`${next}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? next : fmt.date(parsed);
    }
    if (kind === "liste") return options?.find((option) => option.value === next)?.label ?? next;
    return next;
  }

  function cancel() {
    setDraft(shownValue);
    setError(null);
    setEditing(false);
  }

  function commit(next: string, chosen?: string) {
    const trimmed = kind === "texte_long" ? next : next.trim();
    if (trimmed === shownValue) {
      setEditing(false);
      setError(null);
      return;
    }
    if (required && !trimmed) {
      setError(t("obligatoire"));
      return;
    }
    savingRef.current = true;
    setError(null);
    startTransition(async () => {
      const result = await save({ field, value: trimmed, version: shared?.value ?? version });
      savingRef.current = false;
      if (result.ok) {
        // La fiche a une nouvelle version : les autres champs la reprennent, sinon le prochain se croirait périmé.
        shared?.adopt(result.version);
        setSaved({ value: trimmed, display: result.display ?? displayFor(trimmed, chosen) });
        setEditing(false);
        // Tout ce qui dépend de cette valeur ailleurs sur l'écran se remet à jour.
        router.refresh();
        return;
      }
      // La valeur précédente revient : l'écran ne montre jamais ce qui n'a pas été écrit.
      setDraft(shownValue);
      setError(result.error);
      setEditing(false);
      if (result.stale) router.refresh();
    });
  }

  // ---------------------------------------------------------------------
  // Hors édition : la valeur, cliquable — ou inerte en lecture seule
  // ---------------------------------------------------------------------
  if (!editing) {
    const empty = shownDisplay.trim() === "";
    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          type="button"
          // Le bouton porte le libellé ET la valeur : au clavier comme au lecteur d'écran, on sait ce qu'on modifie.
          aria-label={t("modifier_le_champ", { label, value: empty ? t("vide") : shownDisplay })}
          aria-describedby={error || blocked ? messageId : undefined}
          onClick={() => {
            if (readOnly) {
              setBlocked(true);
              return;
            }
            setDraft(shownValue);
            setEditing(true);
          }}
          className={cn(
            "-mx-1 flex min-h-8 w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm transition-colors",
            "hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            // Au doigt, une cible d'au moins 40 px (390 px de large, gants compris).
            "pointer-coarse:min-h-10",
            empty && "text-muted-foreground"
          )}
        >
          <span className={cn("min-w-0 flex-1", kind === "texte_long" ? "whitespace-pre-line" : "truncate")}>{empty ? t("vide") : shownDisplay}</span>
          {pending && <span className="shrink-0 text-xs text-muted-foreground">{t("enregistrement")}</span>}
        </button>
        {(error || blocked) && (
          <p id={messageId} role="alert" className="text-xs text-destructive">
            {blocked ? tDemo("lecture_seule_notice") : error}
          </p>
        )}
        {hint && !error && !blocked && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // En édition
  // ---------------------------------------------------------------------
  const keyboard = {
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
      if (event.key === "Enter" && kind !== "texte_long") {
        event.preventDefault();
        commit(draft);
      }
    },
    // Tab, un clic ailleurs : on enregistre plutôt que de perdre la saisie.
    onBlur: () => {
      if (!savingRef.current) commit(draft);
    },
  };

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <label htmlFor={inputId} className="text-xs text-muted-foreground">
        {label}
      </label>
      {kind === "liste" ? (
        <NativeSelect
          id={inputId}
          autoFocus
          value={draft}
          disabled={pending}
          onChange={(event) => {
            setDraft(event.target.value);
            commit(event.target.value);
          }}
          {...keyboard}
        >
          {!required && <option value="">{t("vide")}</option>}
          {(options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      ) : kind === "rattachement" ? (
        <SearchEditor
          inputId={inputId}
          kind={search ?? "contact"}
          initial={shownDisplay}
          disabled={pending}
          onCancel={cancel}
          onChoose={(hit) => commit(hit?.id ?? "", hit?.title)}
          allowEmpty={!required}
        />
      ) : kind === "texte_long" ? (
        <Textarea
          id={inputId}
          autoFocus
          value={draft}
          disabled={pending}
          className="min-h-16"
          onChange={(event) => setDraft(event.target.value)}
          {...keyboard}
        />
      ) : kind === "montant" ? (
        // Le montant du socle : ce qui s'affiche est formaté, ce qui remonte est brut (« 300000.5 »).
        <AmountInput id={inputId} autoFocus value={draft} disabled={pending} onChange={(raw) => setDraft(raw)} {...keyboard} />
      ) : (
        <Input
          id={inputId}
          autoFocus
          type={kind === "email" ? "email" : kind === "telephone" ? "tel" : kind === "date" ? "date" : "text"}
          inputMode={kind === "telephone" ? "tel" : undefined}
          value={draft}
          disabled={pending}
          required={required}
          onChange={(event) => setDraft(event.target.value)}
          {...keyboard}
        />
      )}
      <p className="text-xs text-muted-foreground">{pending ? t("enregistrement") : t("aide_clavier")}</p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Le rattachement par RECHERCHE : on tape, les fiches de l'organisation
 * qui correspondent se proposent (la recherche de la palette, bornée à
 * l'organisation par le serveur), on en choisit une — ou on détache.
 * Aucun nom libre : un rattachement est une fiche ou rien.
 */
function SearchEditor({
  inputId,
  kind,
  initial,
  disabled,
  allowEmpty,
  onChoose,
  onCancel,
}: {
  inputId: string;
  kind: "contact" | "partner";
  initial: string;
  disabled: boolean;
  allowEmpty: boolean;
  onChoose: (hit: Hit | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("fiches.inline");
  const listId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ needle: string; rows: Hit[] }>({ needle: "", rows: [] });
  const sequence = useRef(0);
  const needle = query.trim();
  const idle = needle.length < 2;

  useEffect(() => {
    if (idle) return;
    const mine = ++sequence.current;
    const handle = setTimeout(() => {
      searchEverythingAction(needle)
        .then((all) => {
          if (sequence.current !== mine) return;
          setHits({ needle, rows: all.filter((h) => h.kind === kind).map((h) => ({ id: h.id, title: h.title, subtitle: h.subtitle })) });
        })
        .catch(() => {
          if (sequence.current === mine) setHits({ needle, rows: [] });
        });
    }, 180);
    return () => clearTimeout(handle);
  }, [idle, kind, needle]);

  const shown = !idle && hits.needle === needle ? hits.rows : [];

  return (
    <div className="relative flex flex-col gap-1">
      <Input
        id={inputId}
        autoFocus
        value={query}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        placeholder={initial || t("chercher_une_fiche")}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      {shown.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md">
          {shown.map((hit) => (
            <li key={hit.id} role="option" aria-selected={false}>
              <button
                type="button"
                // Le clic arrive après la perte de focus : on empêche celle-ci de fermer l'éditeur avant le choix.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onChoose(hit)}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{hit.title}</span>
                {hit.subtitle && <span className="text-xs text-muted-foreground">{hit.subtitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">{idle ? t("tapez_deux_lettres") : shown.length === 0 ? t("aucune_fiche") : t("choisissez_une_fiche")}</span>
        {allowEmpty && (
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onChoose(null)} className="text-xs underline underline-offset-2">
            {t("detacher")}
          </button>
        )}
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onCancel} className="text-xs underline underline-offset-2">
          {t("annuler")}
        </button>
      </div>
    </div>
  );
}
