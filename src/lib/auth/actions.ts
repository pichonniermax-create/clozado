"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { createOrganizationWithAdmin } from "@/db/queries/signup";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Les deux seules actions déclenchables par un anonyme. Elles écrivent en
 * base et envoient un email : elles sont donc limitées en débit, et elles
 * ne révèlent jamais si une adresse a déjà un compte.
 */

export type AuthFormState = { error: string | null };

const GENERIC_ERROR = "Une erreur est survenue. Réessaie dans un instant.";
const RATE_LIMITED = "Trop de tentatives. Réessaie dans une minute.";

/** Même lecture d'IP que la route publique par jeton (voir /api/partage/[token]). */
async function ipKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "inconnue";
  return `${prefix}:${ip}`;
}

/** Volontairement permissif : la validation qui fait foi est l'email qui arrive — ou pas. */
function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isPlausibleEmail(email)) {
    return { error: "Cette adresse email ne semble pas valide." };
  }
  if (!checkRateLimit(await ipKey("signin"), { limit: 10, windowMs: 60_000 })) {
    return { error: RATE_LIMITED };
  }

  return sendMagicLink(email);
}

/**
 * `signIn` se termine par une redirection LEVÉE, pas retournée : un
 * try/catch nu l'avalerait et la navigation n'aurait jamais lieu. On ne
 * rattrape donc que les `AuthError` (envoi SMTP refusé, adaptateur en
 * échec…) et on relaie tout le reste — dont la redirection.
 *
 * Sans ça, un envoi refusé par le fournisseur d'email affichait une page
 * d'erreur brute, juste après avoir créé l'espace de la personne.
 */
async function sendMagicLink(email: string): Promise<AuthFormState> {
  try {
    await signIn("nodemailer", { email, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          "Impossible d'envoyer le lien à cette adresse pour le moment. Vérifie-la, puis réessaie.",
      };
    }
    throw error;
  }
  return { error: null };
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (organizationName.length < 2) {
    return { error: "Indique le nom de ton cabinet ou de ta société." };
  }
  if (organizationName.length > 120) {
    return { error: "Ce nom est trop long (120 caractères maximum)." };
  }
  if (!isPlausibleEmail(email)) {
    return { error: "Cette adresse email ne semble pas valide." };
  }
  // Plus strict que la connexion : chaque inscription crée une organisation.
  if (!checkRateLimit(await ipKey("signup"), { limit: 3, windowMs: 60_000 })) {
    return { error: RATE_LIMITED };
  }

  try {
    // Si l'email a déjà un compte, la fonction ne crée RIEN et le signale.
    // On ne le dit pas à l'écran : ce serait un moyen de tester quelles
    // adresses sont inscrites. La personne reçoit simplement un lien de
    // connexion et retrouve son espace existant — issue identique, message
    // identique, aucune organisation en double.
    await createOrganizationWithAdmin({ organizationName, email });
  } catch {
    // Course sur le slug ou sur l'email : on ne détaille pas, et surtout on
    // ne laisse pas fuiter qu'une organisation homonyme existe déjà.
    return { error: GENERIC_ERROR };
  }

  return sendMagicLink(email);
}
