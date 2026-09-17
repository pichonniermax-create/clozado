"use client";

import { useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cleanPasted, formatAmount, rawAmount, reformatTyped } from "@/lib/amount-input";

/**
 * LE CHAMP MONTANT DU SOCLE (chantier « champs de saisie » du 2026-09-17) :
 * ce que la personne voit est formaté — « 300 000 », « 1 234,50 » — et ce
 * que le serveur reçoit est un nombre brut — « 300000 », « 1234.50 » —,
 * porté par un champ caché qui seul porte le `name`. La logique (frappe,
 * curseur, collage, valeur brute) vit dans `src/lib/amount-input.ts`, testée
 * seule ; ce composant ne fait que la brancher sur un `<input>` texte au
 * clavier numérique décimal.
 *
 * Deux usages : NON CONTRÔLÉ dans un `<form action>` (`name` +
 * `defaultValue` brute, la valeur voyage par le champ caché) ; CONTRÔLÉ dans
 * un formulaire client (`value` brute + `onChange(raw)`), sans `name`.
 * Le symbole monétaire reste dans le libellé du champ, jamais dedans.
 */
export function AmountInput({
  name,
  value,
  defaultValue,
  onChange,
  ...props
}: Omit<ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange" | "inputMode"> & {
  /** Le nom du champ CACHÉ qui porte la valeur brute vers le serveur. */
  name?: string;
  /** La valeur brute, contrôlée (« 300000.5 »). */
  value?: string | number | null;
  /** La valeur brute initiale, non contrôlée. */
  defaultValue?: string | number | null;
  /** La valeur brute à chaque frappe (« 300000.5 », vide pour vide). */
  onChange?: (raw: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [display, setDisplay] = useState(() => formatAmount(value ?? defaultValue));
  const pendingCaret = useRef<number | null>(null);
  // Contrôlé : une valeur venue d'ailleurs (un autre champ, une réinitialisation) se reflète — sans toucher à une frappe
  // en cours qui vaut déjà cette valeur (« 1 234, » et « 1234 » sont le même nombre). Le motif React « ajuster l'état
  // pendant le rendu » : l'état mémorise la dernière valeur vue, jamais une ref lue au rendu.
  const [seenValue, setSeenValue] = useState(value);
  if (value !== undefined && value !== seenValue) {
    setSeenValue(value);
    const external = value === null ? "" : String(value);
    if (external !== rawAmount(display)) setDisplay(formatAmount(external));
  }

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !inputRef.current) return;
    pendingCaret.current = null;
    inputRef.current.setSelectionRange(caret, caret);
  }, [display]);

  function commit(next: { display: string; caret: number }) {
    pendingCaret.current = next.caret;
    setDisplay(next.display);
    onChange?.(rawAmount(next.display));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const el = event.currentTarget;
    commit(reformatTyped(el.value, el.selectionStart ?? el.value.length));
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const el = event.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const inserted = cleanPasted(event.clipboardData.getData("text"));
    const text = el.value.slice(0, start) + inserted + el.value.slice(end);
    commit(reformatTyped(text, start + inserted.length));
  }

  return (
    <>
      <Input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        onPaste={handlePaste}
        className="tabular-nums"
        {...props}
      />
      {name && <input type="hidden" name={name} value={rawAmount(display)} />}
    </>
  );
}
