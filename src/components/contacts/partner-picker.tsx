"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { quickCreatePartnerAction } from "@/lib/contacts/actions";
import { cn } from "@/lib/utils";

/**
 * « APPORTÉ PAR » (lot 2) — le confrère qui a amené ce contact. Facultatif,
 * et jamais une liste déroulante de deux cents lignes : on tape, les
 * partenaires ACTIFS qui correspondent se proposent, et si le confrère
 * n'existe pas encore on le crée sans quitter le formulaire.
 *
 * Le répertoire tient en mémoire (quelques dizaines de fiches) : il arrive
 * entier depuis le serveur et le filtre se fait ici. Pas d'aller-retour à
 * chaque lettre, pas de recherche serveur à écrire — et le choix reste
 * possible hors ligne, une fois la page rendue.
 *
 * Un seul champ part avec le formulaire : `partnerId`, vide quand personne
 * n'est désigné. Un nom tapé sans choix ne crée RIEN tout seul : l'apport
 * est un lien, pas une étiquette — il faut cliquer pour créer.
 */
export type PickablePartner = { id: string; name: string; company: string | null; profession: string | null };

export function PartnerPicker({
  inputId,
  partners,
  initialId = null,
  fieldName = "partnerId",
}: {
  inputId: string;
  partners: PickablePartner[];
  initialId?: string | null;
  fieldName?: string;
}) {
  const t = useTranslations("contacts.partnerPicker");
  const listId = useId();
  const [all, setAll] = useState(partners);
  const initial = all.find((p) => p.id === initialId) ?? null;
  const [selected, setSelected] = useState<PickablePartner | null>(initial);
  const [query, setQuery] = useState(initial?.name ?? "");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return all.slice(0, 8);
    return all
      .filter((p) => [p.name, p.company, p.profession].some((field) => (field ?? "").toLowerCase().includes(needle)))
      .slice(0, 8);
  }, [all, needle]);
  const exact = all.some((p) => p.name.trim().toLowerCase() === needle);

  const choose = (partner: PickablePartner | null) => {
    setSelected(partner);
    setQuery(partner?.name ?? "");
    setOpen(false);
    setError(null);
  };

  const createNow = () => {
    const name = query.trim();
    if (!name || creating) return;
    startCreate(async () => {
      const result = await quickCreatePartnerAction(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const created = { id: result.value.id, name: result.value.name, company: null, profession: null };
      setAll((rows) => [...rows, created].sort((a, b) => a.name.localeCompare(b.name)));
      choose(created);
    });
  };

  return (
    <div className="relative">
      <input type="hidden" name={fieldName} value={selected?.id ?? ""} />
      <Input
        id={inputId}
        // Jamais le champ qui part au serveur : c'est une aide à la saisie, l'identifiant seul fait foi.
        name={`${fieldName}-recherche`}
        value={query}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        placeholder={t("un_nom_un_cabinet_un_metier")}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setOpen(true);
          setError(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Laisser le clic sur une proposition arriver avant de refermer.
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
      />
      {selected && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("apporte_par_nom", { nom: selected.name })}{" "}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => choose(null)}>
            {t("retirer")}
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
      {open && (matches.length > 0 || (needle && !exact)) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
        >
          {matches.map((partner) => (
            <li key={partner.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected?.id === partner.id}
                onClick={() => choose(partner)}
                className={cn(
                  "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  selected?.id === partner.id && "bg-accent"
                )}
              >
                <span className="font-medium">{partner.name}</span>
                {(partner.company || partner.profession) && (
                  <span className="text-xs text-muted-foreground">{[partner.profession, partner.company].filter(Boolean).join(" · ")}</span>
                )}
              </button>
            </li>
          ))}
          {needle && !exact && (
            <li>
              <button
                type="button"
                onClick={createNow}
                disabled={creating}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary-ink hover:bg-accent disabled:opacity-60"
              >
                <Plus className="size-3.5" aria-hidden />
                {creating ? t("creation") : t("creer_le_partenaire", { nom: query.trim() })}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
