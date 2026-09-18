"use client";

import { useEffect } from "react";
import { installer } from "@/lib/mouvement";

/**
 * Le seul point d'entrée du mouvement de la page : il pose les
 * observateurs au montage et les retire au démontage. Il n'affiche rien —
 * ce qui se voit est déjà dans le HTML du serveur, et le reste est du CSS.
 */
export function MiseEnMouvement() {
  useEffect(() => installer(), []);
  return null;
}
