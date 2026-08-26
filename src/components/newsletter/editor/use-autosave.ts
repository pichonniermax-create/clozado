"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Enregistrement automatique.
 *
 * Le bouton « Enregistrer » ne peut pas être la seule protection contre la
 * perte de travail : il suppose qu'on y pense, et on n'y pense justement pas
 * quand on est en train d'écrire.
 *
 * Trois règles qui évitent les dégâts classiques d'un autosave :
 *
 * 1. Rien n'est écrit tant que le document est VIDE. Sinon ouvrir l'écran et
 *    le refermer sèmerait un brouillon fantôme dans la liste à chaque fois.
 * 2. Un seul enregistrement en vol à la fois. Une modification survenue
 *    pendant l'écriture n'est pas perdue : elle est marquée et relancée
 *    juste après — deux requêtes concurrentes pourraient s'écraser l'une
 *    l'autre, la dernière arrivée n'étant pas forcément la plus récente.
 * 3. L'échec est VISIBLE. Un enregistrement automatique qui échoue en
 *    silence est pire que pas d'enregistrement du tout, parce qu'on croit
 *    son travail à l'abri.
 */
export type SaveState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; message: string };

export function useAutosave({
  data,
  hasContent,
  save,
  delay = 800,
}: {
  /** Sérialisation du document — une nouvelle valeur déclenche l'écriture. */
  data: string;
  /** Faux tant qu'il n'y a rien à enregistrer. */
  hasContent: boolean;
  save: () => Promise<void>;
  delay?: number;
}) {
  const tr = useTranslations("newsletters.useAutosave");
  const [state, setState] = useState<SaveState>({ status: "idle" });

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const inFlight = useRef(false);
  const dirtyAgain = useRef(false);
  /**
   * L'état au MONTAGE, capturé une fois. Il sert de point de comparaison :
   * ouvrir un brouillon existant n'écrit rien (rien n'a changé), et la
   * première frappe diffère donc déclenche l'écriture.
   *
   * Première version ratée : la référence n'était posée qu'au premier
   * passage où le document avait du contenu. Sur un document NEUF, ce
   * premier passage est justement la frappe initiale — elle était donc
   * mémorisée comme « état de départ » et jamais enregistrée. Saisir un
   * objet, puis fermer l'onglet, perdait le travail.
   */
  const lastSaved = useRef(data);

  const run = useCallback(async () => {
    if (inFlight.current) {
      // Une écriture est déjà en vol : on note qu'il faudra recommencer
      // plutôt que d'en lancer une deuxième en parallèle.
      dirtyAgain.current = true;
      return;
    }
    inFlight.current = true;
    try {
      // Boucle plutôt que rappel récursif : elle rejoue tant que des
      // modifications sont arrivées pendant l'écriture précédente.
      do {
        dirtyAgain.current = false;
        setState({ status: "saving" });
        try {
          await saveRef.current();
          setState({ status: "saved", at: Date.now() });
        } catch (err) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : tr("enregistrement_impossible"),
          });
          break;
        }
      } while (dirtyAgain.current);
    } finally {
      inFlight.current = false;
    }
  }, [tr]);

  useEffect(() => {
    if (!hasContent) return;
    if (lastSaved.current === data) return;

    setState({ status: "pending" });
    const t = setTimeout(() => {
      lastSaved.current = data;
      void run();
    }, delay);
    return () => clearTimeout(t);
  }, [data, hasContent, delay, run]);

  return state;
}

/** « il y a 3 s », « il y a 2 min », « maintenant » — par `Intl.RelativeTimeFormat` (aucun mot en dur), sans faire tourner d'horloge inutilement. */
export function formatSavedAt(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  const relative = new Intl.RelativeTimeFormat("fr-FR", { style: "short", numeric: "auto" });
  if (s < 5) return relative.format(0, "second");
  if (s < 60) return relative.format(-s, "second");
  const m = Math.round(s / 60);
  if (m < 60) return relative.format(-m, "minute");
  return relative.format(-Math.round(m / 60), "hour");
}
