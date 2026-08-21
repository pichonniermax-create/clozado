"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnyBlock } from "@/lib/newsletter/blocks";

/**
 * Annulation des ACTIONS DE BLOC : insérer, supprimer, dupliquer, réordonner.
 *
 * Volontairement pas des frappes au clavier. Un instantané par caractère
 * saisi noierait les actions structurelles — celles qu'on regrette vraiment
 * et qu'on ne sait pas refaire à la main — sous des centaines d'étapes.
 * La frappe garde son annulation native du navigateur, à l'intérieur du
 * champ : c'est pourquoi le raccourci global s'efface dès que le curseur est
 * dans une zone de saisie (voir plus bas), sinon on volerait ⌘Z à l'endroit
 * où l'utilisateur l'attend le plus.
 */
const LIMIT = 50;

export function useBlockHistory(
  blocks: AnyBlock[],
  setBlocks: (next: AnyBlock[]) => void
) {
  const [past, setPast] = useState<AnyBlock[][]>([]);
  const [future, setFuture] = useState<AnyBlock[][]>([]);

  // Lu par les raccourcis sans les faire dépendre de `blocks` : sinon
  // l'écouteur clavier serait détaché/réattaché à chaque frappe. Mis à jour
  // dans un effet et non pendant le rendu — écrire une ref pendant le rendu
  // casse les rendus concurrents. Sans risque de retard ici : annuler part
  // toujours d'une interaction, donc après que les effets ont tourné.
  const current = useRef(blocks);
  useEffect(() => {
    current.current = blocks;
  }, [blocks]);

  /** À appeler AVANT une action de bloc, avec l'état d'avant. */
  const commit = useCallback((before: AnyBlock[]) => {
    setPast((p) => [...p.slice(-(LIMIT - 1)), before]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [current.current, ...f].slice(0, LIMIT));
      setBlocks(previous);
      return p.slice(0, -1);
    });
  }, [setBlocks]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p.slice(-(LIMIT - 1)), current.current]);
      setBlocks(next);
      return f.slice(1);
    });
  }, [setBlocks]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== "z") return;

      // Dans un champ de saisie, ⌘Z appartient au navigateur : il annule la
      // frappe, ce que notre historique ne sait pas faire.
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;

      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return { commit, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
