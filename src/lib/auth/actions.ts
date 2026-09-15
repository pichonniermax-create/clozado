"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { createOrganizationWithAdmin, type SignUpResult } from "@/db/queries/signup";
import { attachInvitationOrganization, claimInvitation, releaseInvitation, type PublicInvitation } from "@/db/queries/workspace-invitations";
import { isPlausibleEmail } from "@/lib/email/address";
import { isInvitationTokenShape } from "@/lib/invitations/token";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { log } from "@/lib/log";
import { getTranslations } from "next-intl/server";
import { isReservedExampleAddress } from "@/lib/demo/constants";

/**
 * Les deux seules actions déclenchables par un anonyme. Elles écrivent en
 * base et envoient un email : elles sont donc limitées en débit, et elles
 * ne révèlent jamais si une adresse a déjà un compte.
 */

export type AuthFormState = { error: string | null };


/** La même lecture d'IP que toutes les routes publiques (`clientIp`, audit S8). */
async function ipKey(prefix: string): Promise<string> {
  return `${prefix}:${clientIp(await headers())}`;
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const t = await getTranslations("auth.actions");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isPlausibleEmail(email)) {
    return { error: t("cette_adresse_email_ne_semble_pas_da6f") };
  }
  if (!checkRateLimit(await ipKey("signin"), { limit: 10, windowMs: 60_000 })) {
    return { error: t("rate_limited") };
  }
  // Et par ADRESSE (chasse aux failles du 2026-09-14) : trois liens par adresse et par dix minutes, d'où que
  // viennent les demandes — le bombardement d'une boîte ne dépend pas d'une seule IP. La clé est une empreinte,
  // jamais l'adresse en clair dans une structure en mémoire.
  if (!checkRateLimit(`signin:email:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`, { limit: 3, windowMs: 600_000 })) {
    return { error: t("rate_limited") };
  }

  return sendMagicLink(email);
}

/**
 * `signIn` se termine par une redirection LEVÉE, pas retournée : un
 * try/catch nu l'avalerait et la navigation n'aurait jamais lieu. On ne
 * rattrape donc que les `AuthError` (envoi refusé par le fournisseur,
 * adaptateur en échec…) et on relaie tout le reste — dont la redirection.
 *
 * Une adresse INCONNUE (le callback `signIn` de src/auth.ts refuse : pas
 * d'auto-inscription) arrive ici en `AccessDenied` : la réponse est LA
 * MÊME que pour une adresse connue — la page « vérifie tes emails » —
 * sinon le formulaire disait qui a un compte et qui n'en a pas (chasse aux
 * failles du 2026-09-14). Un envoi refusé par le fournisseur, lui, est
 * journalisé : « impossible d'envoyer » à l'écran, la cause dans le
 * journal (audit, constat Q4) — sans ça, une page d'erreur brute
 * s'affichait juste après avoir créé l'espace de la personne.
 */
async function sendMagicLink(email: string): Promise<AuthFormState> {
  const t = await getTranslations("auth.actions");
  try {
    await signIn("resend", { email, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError && error.type === "AccessDenied") {
      log.info("magic_link_unknown_email");
      redirect("/login/verifier");
    }
    if (error instanceof AuthError) {
      log.error("magic_link_send_failed", { error });
      return {
        error:
          t("impossible_d_envoyer_le_lien_a_58cc"),
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
  const t = await getTranslations("auth.actions");
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Le jeton d'une invitation à créer un espace (docs/module-invitations.md §1.2), porté par un champ caché du formulaire.
  const invitationToken = String(formData.get("invitation") ?? "").trim();

  if (organizationName.length < 2) {
    return { error: t("indique_le_nom_de_ton_cabinet_8c02") };
  }
  if (organizationName.length > 120) {
    return { error: t("ce_nom_est_trop_long_120_d600") };
  }
  // Une adresse sur un domaine réservé aux exemples (.example, example.com…) ne recevra jamais de lien :
  // l'accepter créerait une organisation orpheline, que rien ne peut supprimer.
  if (!isPlausibleEmail(email) || isReservedExampleAddress(email)) {
    return { error: t("cette_adresse_email_ne_semble_pas_da6f") };
  }
  // Plus strict que la connexion : chaque inscription crée une organisation.
  if (!checkRateLimit(await ipKey("signup"), { limit: 3, windowMs: 60_000 })) {
    return { error: t("rate_limited") };
  }

  // L'invitation est CONSOMMÉE AVANT la création, atomiquement (`claimInvitation`) :
  // deux soumissions du même lien ne créent jamais deux espaces. Un lien qui
  // n'est plus valable (servi, expiré, révoqué, inconnu) ou réservé à une
  // autre adresse arrête ici, avant toute écriture.
  let claimed: PublicInvitation | null = null;
  if (invitationToken) {
    if (!isInvitationTokenShape(invitationToken)) return { error: t("invitation_plus_valable") };
    const claim = await claimInvitation(invitationToken, email);
    if (!claim.ok) {
      return { error: claim.reason === "email_mismatch" ? t("invitation_reservee_a_une_autre_adresse") : t("invitation_plus_valable") };
    }
    claimed = claim.invitation;
  }

  let result: SignUpResult;
  try {
    // Si l'email a déjà un compte, la fonction ne crée RIEN et le signale.
    // On ne le dit pas à l'écran : ce serait un moyen de tester quelles
    // adresses sont inscrites. La personne reçoit simplement un lien de
    // connexion et retrouve son espace existant — issue identique, message
    // identique, aucune organisation en double.
    result = await createOrganizationWithAdmin({ organizationName, email, defaultLocale: claimed?.locale });
  } catch (error) {
    // Course sur le slug ou sur l'email : on ne détaille pas, et surtout on
    // ne laisse pas fuiter qu'une organisation homonyme existe déjà. La
    // cause va au journal ; l'invitation, si elle a été consommée, est rendue.
    log.error("signup_failed", { error, invited: Boolean(claimed) });
    if (claimed) await releaseInvitation(claimed.id).catch(() => undefined);
    return { error: t("generic_error") };
  }

  if (claimed) {
    // L'espace créé est rattaché à son invitation ; une adresse déjà inscrite
    // ne crée rien — l'invitation reste en attente, la personne retrouve son
    // espace existant par le lien de connexion.
    if (result.ok) await attachInvitationOrganization(claimed.id, result.organizationId);
    else await releaseInvitation(claimed.id).catch(() => undefined);
  }

  return sendMagicLink(email);
}
