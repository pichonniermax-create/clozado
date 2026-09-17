import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import NextAuth, { AuthError, type NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";
import { isKnownSignInEmail, magicLinkMayBeSentTo } from "@/lib/auth/magic-link-guard";
import { renderMagicLinkEmail } from "@/lib/email/magic-link";
import { transactionalMail } from "@/lib/email/resend";
import { productSender } from "@/lib/email/sender";
import { db } from "@/db";
import { DEFAULT_AUTH_SETTINGS, getAuthSettings, type AuthSettingsValues } from "@/db/queries/auth-settings";
import { accounts, users, verificationTokens } from "@/db/schema";

/**
 * Un envoi de lien refusé par le fournisseur, sous la forme qu'Auth.js
 * RELAIE : une `AuthError`. En mode action (`signIn("resend", …)`), Auth.js
 * lève telle quelle une `AuthError` venue du fournisseur — et `sendMagicLink`
 * la traduit en « impossible d'envoyer ». Une erreur ordinaire, elle, n'est
 * pas relayée : Auth.js la journalise et REDIRIGE vers sa page d'erreur
 * (désormais la nôtre, `/login/erreur`). Type et genre de
 * `EmailSignInError`, pour que les écrans d'Auth.js la classent comme un
 * échec de connexion.
 */
class MagicLinkSendError extends AuthError {
  static type = "EmailSignInError";
  static kind = "signIn";
  constructor(cause: unknown) {
    // La cause sous `cause.err`, la convention d'Auth.js : son journal la montre, `sendMagicLink` la sérialise.
    super("magic_link_send_failed", { cause: { err: cause instanceof Error ? cause : new Error(String(cause)) } });
  }
}

/**
 * NOS pages, pour les quatre écrans qu'Auth.js rend sinon lui-même, en
 * anglais et hors de notre design (correctif du 2026-09-17) : connexion,
 * « vérifie ta boîte », erreur (lien expiré ou déjà servi, accès refusé,
 * configuration) et déconnexion. Plus aucun écran du produit n'est servi
 * par la bibliothèque.
 */
const PAGES: NonNullable<NextAuthConfig["pages"]> = {
  signIn: "/login",
  verifyRequest: "/login/verifier",
  error: "/login/erreur",
  signOut: "/deconnexion",
};

/**
 * LE LIEN MAGIQUE PAR L'API HTTP DE RESEND (audit, constat Q2 / décision
 * D7) — plus de transport SMTP ni de `nodemailer`. Le fournisseur `Resend`
 * d'Auth.js ne sert que de coquille (identifiant `resend`, type `email`,
 * jetons de vérification) : l'email est NOTRE gabarit
 * (`renderMagicLinkEmail`, dans la langue du destinataire) et part par
 * NOTRE client (`sendEmail`, src/lib/email/resend.ts), pas par le `fetch`
 * du fournisseur. L'expéditeur est lu à l'envoi, jamais à l'import.
 */
async function sendVerificationRequest(
  { identifier, url, token }: { identifier: string; url: string; token: string },
  settings: AuthSettingsValues
): Promise<void> {
  // LA DÉMO (docs/module-demo.md §1.2) : jamais d'email vers une adresse réservée aux
  // exemples — toutes les personas de la démo en portent une — ; la page « vérifie ta
  // boîte » s'affiche quand même, rien ne le dit à un inconnu. La garde vit dans
  // src/lib/auth/magic-link-guard.ts, exercée par test-isolation contre la base.
  if (!magicLinkMayBeSentTo(identifier)) return;
  const email = await renderMagicLinkEmail(identifier, url, { validityMinutes: settings.linkValidityMinutes });
  // La clé d'idempotence : l'empreinte du jeton — unique par demande, jamais le jeton lui-même chez un tiers.
  const idempotencyKey = `magic-link/${createHash("sha256").update(token).digest("hex")}`;
  // Toute erreur (clé refusée, quota, délai, EMAIL_FROM absente) remonte en `AuthError`,
  // que `sendMagicLink` (src/lib/auth/actions.ts) traduit en « impossible d'envoyer ».
  try {
    await transactionalMail.sendEmail({ from: productSender().from, to: [identifier], subject: email.subject, html: email.html, text: email.text }, idempotencyKey);
  } catch (error) {
    throw new MagicLinkSendError(error);
  }
}

/**
 * La configuration pour des réglages donnés. Les DURÉES viennent de la
 * base (`auth_settings`, modifiables par le super admin) : la validité du
 * lien (`maxAge` du fournisseur, en secondes) et celle de la session
 * (`session.maxAge`) — plus jamais 24 heures et 30 jours écrits en dur.
 */
function buildConfig(settings: AuthSettingsValues): NextAuthConfig {
  return {
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      verificationTokensTable: verificationTokens,
    }),
    session: { strategy: "jwt", maxAge: settings.sessionDays * 24 * 60 * 60 },
    pages: PAGES,
    providers: [
      Resend({
        maxAge: settings.linkValidityMinutes * 60,
        sendVerificationRequest: (params) => sendVerificationRequest(params, settings),
      }),
    ],
    callbacks: {
      // Pas d'auto-inscription : seul un email déjà créé en base (par un
      // super_admin ou l'admin de son organisation) peut se connecter.
      async signIn({ user }) {
        return isKnownSignInEmail(user.email);
      },
      // On enrichit le jeton avec le rôle et l'organisation, lus en base.
      async jwt({ token, user }) {
        const email = user?.email ?? token.email;
        if (email) {
          const dbUser = await db.query.users.findFirst({
            where: eq(users.email, email),
          });
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.organizationId = dbUser.organizationId;
          }
        }
        return token;
      },
      // On expose rôle et organisation dans la session, utilisés partout
      // ensuite comme garde-fou d'isolation.
      async session({ session, token }) {
        if (session.user) {
          // token.id/role sont posés par le callback jwt ci-dessus dès qu'un
          // utilisateur valide se connecte : non-null assertion volontaire.
          session.user.id = token.id!;
          session.user.role = token.role!;
          session.user.organizationId = token.organizationId ?? null;
        }
        return session;
      },
    },
  };
}

/** La configuration avec les durées PAR DÉFAUT — exportée pour rester exerçable hors requête (`Auth(request, { ...authConfig, raw })`). */
export const authConfig: NextAuthConfig = buildConfig(DEFAULT_AUTH_SETTINGS);

// La configuration se calcule À CHAQUE REQUÊTE (forme différée de NextAuth) : les durées lues en base s'appliquent sans redéploiement.
export const { handlers, auth, signIn, signOut } = NextAuth(async () => buildConfig(await getAuthSettings()));
