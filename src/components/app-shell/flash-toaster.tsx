"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";
import { revealFlash, type FlashKey } from "@/lib/flash-actions";

/** Les deux paramètres d'URL par lesquels une action serveur revient à l'écran (`withError`, src/lib/form-actions.ts). */
const FLASH_PARAMS: Record<FlashKey, "error" | "success"> = { erreur: "error", info: "success" };

/**
 * LES MESSAGES ÉPHÉMÈRES de la coquille (chantier UI/UX) : une action
 * serveur revient sur son écran avec `?erreur=` ou `?info=` (la convention
 * du produit, 190 usages) ; avant, chaque page rendait la phrase dans un
 * encadré en haut, à sa manière, et l'adresse gardait le paramètre — un
 * rechargement le remontrait, un lien copié l'emportait. Ici : la phrase
 * devient une notification (rouge pour une erreur, verte pour une
 * confirmation), et l'adresse est NETTOYÉE aussitôt (`replace`, sans
 * rechargement) — l'écran, lui, reste tel que l'action l'a laissé.
 *
 * Le paramètre porte un jeton SIGNÉ par le serveur (stabilisation, S5),
 * pas la phrase : le navigateur demande la phrase à `revealFlash`, qui ne
 * rend que ce que le serveur a écrit — un lien forgé n'affiche rien.
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
    const entries = (Object.keys(FLASH_PARAMS) as FlashKey[])
      .map((key) => [key, params.get(key)] as const)
      .filter((entry): entry is readonly [FlashKey, string] => Boolean(entry[1]));
    if (entries.length === 0) return;
    const signature = `${pathname}?${entries.map(([k, v]) => `${k}=${v}`).join("&")}`;
    if (shown.current === signature) return;
    shown.current = signature;
    const next = new URLSearchParams(params.toString());
    for (const key of Object.keys(FLASH_PARAMS)) next.delete(key);
    const query = next.toString();
    // `history.replaceState` natif, que le routeur de Next intègre (usePathname/useSearchParams suivent) :
    // l'adresse change sans qu'aucune donnée ne soit rechargée — `router.replace` referait un rendu serveur.
    window.history.replaceState(window.history.state, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    // Pas d'annulation au démontage : la notification vit dans un magasin global, et le second montage du mode
    // strict s'arrête sur `shown` — une seule demande, une seule notification.
    revealFlash(Object.fromEntries(entries))
      .then((messages) => {
        for (const [key] of entries) {
          const message = messages[key];
          if (message) toast.add({ type: FLASH_PARAMS[key], description: message, timeout: key === "erreur" ? 9000 : 5000 });
        }
      })
      .catch(() => {
        // Le serveur n'a pas répondu : l'écran est déjà dans l'état que l'action a laissé, rien à montrer.
      });
  }, [params, pathname]);

  return null;
}
