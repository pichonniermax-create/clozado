"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchEverythingAction } from "@/lib/search/actions";
import { useTranslations } from "next-intl";

type Hit = { id: string; title: string; subtitle: string | null };

/**
 * LE CLIENT D'UNE AFFAIRE, par son nom (stabilisation, P1) : on tape, les
 * fiches de l'organisation qui correspondent se proposent (la recherche de
 * la palette, cinq résultats, bornée à l'organisation), on en choisit une
 * — ou on garde le nom tel quel quand la fiche n'existe pas encore. Deux
 * champs partent avec le formulaire : le nom saisi (`clientName`) et
 * l'identifiant de la fiche choisie (`contactId`, vide sinon). Avant, la
 * création d'affaire n'avait aucun sélecteur : l'affaire naissait sans
 * fiche et ne pouvait plus en recevoir.
 */
export function ContactPicker({
  inputId,
  initialName,
  initialContactId,
  placeholder,
  required = false,
  allowFreeText = true,
  nameField = "clientName",
  idField = "contactId",
}: {
  inputId: string;
  initialName: string;
  initialContactId: string | null;
  placeholder?: string;
  required?: boolean;
  /** Faux quand seule une fiche existante a un sens (rattacher) : l'aide ne promet pas de garder un nom libre. */
  allowFreeText?: boolean;
  nameField?: string;
  idField?: string;
}) {
  const t = useTranslations("contacts.contactPicker");
  const listId = useId();
  const [query, setQuery] = useState(initialName);
  const [selected, setSelected] = useState<Hit | null>(initialContactId ? { id: initialContactId, title: initialName, subtitle: null } : null);
  const [hits, setHits] = useState<{ needle: string; rows: Hit[] }>({ needle: "", rows: [] });
  const [open, setOpen] = useState(false);
  const sequence = useRef(0);

  const needle = query.trim();
  // Rien à chercher : moins de deux lettres, ou la fiche choisie est exactement ce qui est écrit.
  const idle = needle.length < 2 || Boolean(selected && query === selected.title);

  useEffect(() => {
    if (idle) return;
    const mine = ++sequence.current;
    const handle = setTimeout(() => {
      searchEverythingAction(needle)
        .then((all) => {
          if (sequence.current !== mine) return;
          setHits({ needle, rows: all.filter((h) => h.kind === "contact").map((h) => ({ id: h.id, title: h.title, subtitle: h.subtitle })) });
          setOpen(true);
        })
        .catch(() => {
          if (sequence.current === mine) setHits({ needle, rows: [] });
        });
    }, 180);
    return () => clearTimeout(handle);
  }, [idle, needle]);

  // Les propositions ne valent que pour ce qui est écrit maintenant : jamais celles d'une frappe précédente.
  const shown = !idle && hits.needle === needle ? hits.rows : [];

  function choose(hit: Hit) {
    setSelected(hit);
    setQuery(hit.title);
    setOpen(false);
  }

  const help = selected
    ? t("reliee_a_la_fiche", { name: selected.title })
    : needle.length >= 2 && hits.needle === needle && shown.length === 0
      ? allowFreeText
        ? t("aucune_fiche_le_nom_reste")
        : t("aucune_fiche_a_ce_nom")
      : t("tape_un_nom");

  return (
    <div className="relative flex flex-col gap-1">
      <Input
        id={inputId}
        name={nameField}
        value={query}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (selected && value !== selected.title) setSelected(null);
        }}
        onFocus={() => shown.length > 0 && setOpen(true)}
        // Le clic sur une proposition arrive après la perte de focus : un court délai le laisse passer.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      <input type="hidden" name={idField} value={selected?.id ?? ""} />
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md">
          {shown.map((hit) => (
            <li key={hit.id} role="option" aria-selected={selected?.id === hit.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(hit)}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{hit.title}</span>
                {hit.subtitle && <span className="text-xs text-muted-foreground">{hit.subtitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}
