"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ONBOARDING_COOKIE, ONBOARDING_COOKIE_MAX_AGE } from "@/lib/onboarding/steps";

/**
 * Masquer (ou remontrer) les premiers pas : un cookie par navigateur, comme
 * la visite guidée — un visiteur de la démo peut le poser, rien n'est
 * écrit en base. La liste revient d'elle-même depuis le menu « Visite
 * guidée » ? Non : par ce même geste, inversé (`afficher`).
 */
export async function setOnboardingVisibilityAction(formData: FormData): Promise<void> {
  const store = await cookies();
  if (String(formData.get("visibilite") ?? "") === "masque") {
    store.set(ONBOARDING_COOKIE, "masque", { path: "/", maxAge: ONBOARDING_COOKIE_MAX_AGE, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  } else {
    store.delete(ONBOARDING_COOKIE);
  }
  revalidatePath("/dashboard");
}
