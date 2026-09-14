import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import NextAuth, { AuthError, type NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";
import { isReservedExampleAddress } from "@/lib/demo/constants";
import { isDemoOrganization } from "@/lib/demo/guard";
import { renderMagicLinkEmail } from "@/lib/email/magic-link";
import { sendEmail } from "@/lib/email/resend";
import { productSender } from "@/lib/email/sender";
import { db } from "@/db";
import { accounts, users, verificationTokens } from "@/db/schema";

/**
 * Un envoi de lien refusé par le fournisseur, sous la forme qu'Auth.js
 * RELAIE : une `AuthError`. En mode action (`signIn("resend", …)`), Auth.js
 * lève telle quelle une `AuthError` venue du fournisseur — et `sendMagicLink`
 * la traduit en « impossible d'envoyer ». Une erreur ordinaire, elle, n'est
 * pas relayée : Auth.js la journalise et REDIRIGE vers sa page d'erreur brute
 * (`/api/auth/error?error=Configuration`) — exactement l'écran qu'on ne veut
 * plus montrer. Type et genre de `EmailSignInError`, pour que les écrans
 * d'Auth.js la classent comme un échec de connexion.
 */
class MagicLinkSendError extends AuthError {
  static type = "EmailSignInError";
  static kind = "signIn";
  constructor(cause: unknown) {
    // La cause sous `cause.err`, la convention d'Auth.js : son journal la montre, `sendMagicLink` la sérialise.
    super("magic_link_send_failed", { cause: { err: cause instanceof Error ? cause : new Error(String(cause)) } });
  }
}

/** La configuration, séparée de `NextAuth(...)` et exportée pour rester exerçable hors requête (`Auth(request, { ...authConfig, raw })`) — aucun script ne s'en sert aujourd'hui, l'export ne coûte rien. */
export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verifier",
  },
  providers: [
    /**
     * LE LIEN MAGIQUE PAR L'API HTTP DE RESEND (audit, constat Q2 / décision
     * D7) — plus de transport SMTP ni de `nodemailer` (dépendance vulnérable
     * que le produit n'utilisait que pour cet envoi). Le fournisseur `Resend`
     * d'Auth.js ne sert que de coquille (identifiant `resend`, type `email`,
     * jetons de vérification) : l'email est NOTRE gabarit
     * (`renderMagicLinkEmail`, dans la langue du destinataire) et part par
     * NOTRE client (`sendEmail`, src/lib/email/resend.ts — délai, erreurs
     * typées, refus des adresses d'exemple), pas par le `fetch` du
     * fournisseur. L'expéditeur est lu à l'envoi, jamais à l'import : sans
     * EMAIL_FROM, c'est la demande de lien qui refuse et le dit — pas tout
     * écran authentifié qui plante au chargement du module.
     */
    Resend({
      async sendVerificationRequest({ identifier, url, token }) {
        // LA DÉMO (docs/module-demo.md §1.2) : jamais d'email vers une adresse réservée aux
        // exemples, ni vers un membre d'une organisation de démo — la page « vérifie ta
        // boîte » s'affiche quand même, rien ne le dit à un inconnu.
        if (isReservedExampleAddress(identifier)) return;
        const recipient = await db.query.users.findFirst({ where: eq(users.email, identifier), columns: { organizationId: true } });
        if (await isDemoOrganization(recipient?.organizationId)) return;
        const email = await renderMagicLinkEmail(identifier, url);
        // La clé d'idempotence : l'empreinte du jeton — unique par demande, jamais le jeton lui-même chez un tiers.
        const idempotencyKey = `magic-link/${createHash("sha256").update(token).digest("hex")}`;
        // Toute erreur (clé refusée, quota, délai, EMAIL_FROM absente) remonte en `AuthError`,
        // que `sendMagicLink` (src/lib/auth/actions.ts) traduit en « impossible d'envoyer ».
        try {
          await sendEmail({ from: productSender().from, to: [identifier], subject: email.subject, html: email.html, text: email.text }, idempotencyKey);
        } catch (error) {
          throw new MagicLinkSendError(error);
        }
      },
    }),
  ],
  callbacks: {
    // Pas d'auto-inscription : seul un email déjà créé en base (par un
    // super_admin ou l'admin de son organisation) peut se connecter.
    async signIn({ user }) {
      if (!user.email) return false;
      const existing = await db.query.users.findFirst({
        where: eq(users.email, user.email),
      });
      return Boolean(existing);
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

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
