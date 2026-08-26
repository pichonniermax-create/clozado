import { cache } from "react";
import { createFormats, type Formats } from "@/lib/format";
import { resolveRequestSettings } from "./locale";

/**
 * Les formats de la requête (langue de la personne, devise et fuseau de
 * l'organisation), construits une fois par requête. Un composant serveur
 * asynchrone les `await`, un composant serveur synchrone les lit par
 * `use(getFormats())` ; un composant client passe par `useFormats()`.
 */
export const getFormats = cache(async (): Promise<Formats> => createFormats(await resolveRequestSettings()));
