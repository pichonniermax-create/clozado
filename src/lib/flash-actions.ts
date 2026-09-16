"use server";

import { readFlash } from "@/lib/flash";

/** Les deux paramètres d'URL par lesquels une action serveur revient à l'écran (`withError`). */
const FLASH_KEYS = ["erreur", "info"] as const;
export type FlashKey = (typeof FLASH_KEYS)[number];

/**
 * Les notifications de la coquille (`FlashToaster`) lisent l'adresse dans
 * le navigateur, qui ne détient pas le secret : elles demandent ici la
 * phrase derrière chaque jeton. Un jeton que le serveur n'a pas signé ne
 * rend rien — jamais une phrase venue d'un lien.
 */
export async function revealFlash(tokens: Partial<Record<FlashKey, string>>): Promise<Partial<Record<FlashKey, string>>> {
  const revealed: Partial<Record<FlashKey, string>> = {};
  for (const key of FLASH_KEYS) {
    const message = readFlash(tokens[key]);
    if (message) revealed[key] = message;
  }
  return revealed;
}
