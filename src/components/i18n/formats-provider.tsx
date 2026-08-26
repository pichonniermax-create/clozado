"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createFormats, PRODUCT_FORMATS, type Formats, type FormatSettings } from "@/lib/format";

const FormatsContext = createContext<Formats | null>(null);

/**
 * Les formats des composants CLIENT — les mêmes réglages que le serveur
 * (langue, devise, fuseau), posés par la coquille racine ; la vitrine de
 * partage en pose d'autres, ceux de l'organisation émettrice. Rendu
 * identique au serveur et dans le navigateur : pas de décalage d'hydratation.
 */
export function FormatsProvider({ settings, children }: { settings: FormatSettings; children: ReactNode }) {
  const formats = useMemo(() => createFormats(settings), [settings]);
  return <FormatsContext.Provider value={formats}>{children}</FormatsContext.Provider>;
}

export function useFormats(): Formats {
  const formats = useContext(FormatsContext);
  return formats ?? createFormats(PRODUCT_FORMATS);
}
