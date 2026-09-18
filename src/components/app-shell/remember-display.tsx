"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberDisplayAction } from "@/lib/display/actions";
import { screenForPath } from "@/lib/display/screens";
import { sameScreenState, sanitizeScreenState, type ScreenState } from "@/lib/display/state";

/**
 * LA MÉMOIRE D'AFFICHAGE, côté navigateur (lot 1, étape 1) : après chaque
 * navigation, l'état de l'écran part vers le compte de la personne. Monté
 * une fois dans la coquille — aucun écran n'a à s'en occuper.
 *
 * Pourquoi ici et pas pendant le rendu du serveur ? Un rendu ne doit rien
 * écrire (React Server Components), et une page peut être rendue pour un
 * préchargement que la personne n'ouvrira jamais : on mémorise ce qu'elle
 * REGARDE, pas ce que le routeur a préparé.
 *
 * Trois précautions qui évitent d'en faire un coût :
 * - la liste blanche de l'écran filtre les paramètres AVANT l'envoi (rien
 *   d'inutile ne part, et deux adresses équivalentes ne se distinguent pas) ;
 * - un délai laisse passer les rafales (on tape dans la recherche, la page
 *   change à chaque lettre : un seul envoi à la fin) ;
 * - un état identique au dernier envoyé n'est pas renvoyé.
 */
const DELAY_MS = 700;

export function RememberDisplay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<{ screen: string; state: ScreenState } | null>(null);

  useEffect(() => {
    const screen = screenForPath(pathname);
    if (!screen) return;
    const raw: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) if (!(key in raw)) raw[key] = value;
    const state = sanitizeScreenState(screen, raw);
    const last = lastSent.current;
    if (last && last.screen === screen.key && sameScreenState(last.state, state)) return;
    const timer = setTimeout(() => {
      lastSent.current = { screen: screen.key, state };
      // Une mémoire d'affichage qui échoue ne doit rien casser : l'écran reste juste comme il est.
      void rememberDisplayAction({ screen: screen.key, params: state }).catch(() => undefined);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  return null;
}
