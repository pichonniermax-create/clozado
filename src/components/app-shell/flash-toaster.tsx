"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";

/** Les deux paramètres d'URL par lesquels une action serveur revient à l'écran (`withError`, src/lib/form-actions.ts). */
const FLASH_PARAMS = { erreur: "error", info: "success" } as const;

/**
 * LES MESSAGES ÉPHÉMÈRES de la coquille (chantier UI/UX) : une action
 * serveur revient sur son écran avec `?erreur=` ou `?info=` (la convention
 * du produit, 135 usages) ; avant, chaque page rendait la phrase dans un
 * encadré en haut, à sa manière, et l'adresse gardait le paramètre — un
 * rechargement le remontrait, un lien copié l'emportait. Ici : la phrase
 * devient une notification (rouge pour une erreur, verte pour une
 * confirmation), et l'adresse est NETTOYÉE aussitôt (`replace`, sans
 * rechargement) — l'écran, lui, reste tel que l'action l'a laissé.
 *
 * Le paramètre `demo=lecture-seule` (la démo publique) garde son bandeau
 * dédié : ce n'est pas un retour d'action.
 */
export function FlashToaster() {
  const params = useSearchParams();
  const pathname = usePathname();
  // Une seule notification par adresse : React 19 en mode strict monte deux fois, et le même
  // paramètre ne doit pas sonner deux fois.
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const entries = (Object.keys(FLASH_PARAMS) as (keyof typeof FLASH_PARAMS)[])
      .map((key) => [key, params.get(key)] as const)
      .filter((entry): entry is readonly [keyof typeof FLASH_PARAMS, string] => Boolean(entry[1]));
    if (entries.length === 0) return;
    const signature = `${pathname}?${entries.map(([k, v]) => `${k}=${v}`).join("&")}`;
    if (shown.current === signature) return;
    shown.current = signature;
    for (const [key, message] of entries) {
      toast.add({ type: FLASH_PARAMS[key], description: message, timeout: key === "erreur" ? 9000 : 5000 });
    }
    const next = new URLSearchParams(params.toString());
    for (const key of Object.keys(FLASH_PARAMS)) next.delete(key);
    const query = next.toString();
    // `history.replaceState` natif, que le routeur de Next intègre (usePathname/useSearchParams suivent) :
    // l'adresse change sans qu'aucune donnée ne soit rechargée — `router.replace` referait un rendu serveur.
    window.history.replaceState(window.history.state, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [params, pathname]);

  return null;
}
