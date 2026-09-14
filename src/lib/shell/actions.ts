"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "@/lib/theme";

/**
 * Les gestes de la coquille qui ne touchent à aucune donnée métier
 * (chantier UI/UX) : le thème. Un cookie par navigateur — pas de session
 * requise (un visiteur de la démo peut préférer le sombre) et rien en
 * base : le choix d'un écran, pas d'un compte.
 */
export async function setThemeAction(formData: FormData): Promise<void> {
  const theme = parseTheme(String(formData.get("theme") ?? ""));
  const store = await cookies();
  if (theme === "system") store.delete(THEME_COOKIE);
  else store.set(THEME_COOKIE, theme, { path: "/", maxAge: THEME_COOKIE_MAX_AGE, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
}
