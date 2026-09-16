"use client";

import { useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * Le type d'une interaction saisie à la main — et, pour un email, son SENS
 * (stabilisation, P4) : « reçu » vaut « a répondu » et arrête la vague
 * automatique, comme la confirmation d'un email ingéré ; avant, un email
 * consigné à la main n'avait pas de sens, et le contact continuait de
 * recevoir la vague. Le choix est exigé : rien n'est supposé.
 * Les libellés arrivent du serveur — l'espace `activities` n'est pas envoyé au navigateur.
 */
export function QuickEntryType({
  types,
  defaultType,
  typeLabel,
  direction,
}: {
  types: { value: string; label: string }[];
  defaultType: string;
  typeLabel: string;
  direction: { legend: string; inbound: string; outbound: string };
}) {
  const [type, setType] = useState(defaultType);
  return (
    <>
      <NativeSelect name="type" value={type} onChange={(event) => setType(event.target.value)} aria-label={typeLabel} className="w-auto max-w-full">
        {types.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </NativeSelect>
      {type === "email" && (
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <legend className="sr-only">{direction.legend}</legend>
          <label className="flex min-h-9 items-center gap-1.5 sm:min-h-0">
            <input type="radio" name="direction" value="inbound" required />
            {direction.inbound}
          </label>
          <label className="flex min-h-9 items-center gap-1.5 sm:min-h-0">
            <input type="radio" name="direction" value="outbound" required />
            {direction.outbound}
          </label>
        </fieldset>
      )}
    </>
  );
}
