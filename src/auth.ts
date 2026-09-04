import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { createTransport } from "nodemailer";
import { isReservedExampleAddress } from "@/lib/demo/constants";
import { isDemoOrganization } from "@/lib/demo/guard";
import { renderMagicLinkEmail } from "@/lib/email/magic-link";
import { productSender } from "@/lib/email/sender";
import { db } from "@/db";
import { accounts, users, verificationTokens } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
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
    Nodemailer({
      server: {
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: { user: "resend", pass: process.env.RESEND_API_KEY },
      },
      // L'expéditeur du produit : une adresse RÉELLE (chantier engagement) — sans EMAIL_FROM, l'envoi refuse et le dit.
      from: productSender().from,
      // Le lien de connexion dans la langue de son destinataire (chantier
      // i18n, étape 4) — à la place du modèle anglais d'Auth.js. Le
      // transport est le même que le sien ; ce qui change, c'est le texte.
      async sendVerificationRequest({ identifier, url, provider }) {
        // LA DÉMO (docs/module-demo.md §1.2) : jamais d'email vers une adresse réservée aux
        // exemples, ni vers un membre d'une organisation de démo — la page « vérifie ta
        // boîte » s'affiche quand même, rien ne le dit à un inconnu.
        if (isReservedExampleAddress(identifier)) return;
        const recipient = await db.query.users.findFirst({ where: eq(users.email, identifier), columns: { organizationId: true } });
        if (await isDemoOrganization(recipient?.organizationId)) return;
        const email = await renderMagicLinkEmail(identifier, url);
        const result: { rejected?: unknown[]; pending?: unknown[] } = await createTransport(provider.server).sendMail({
          to: identifier,
          from: provider.from,
          ...email,
        });
        const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
        if (failed.length > 0) throw new Error(`magic-link: rejected ${failed.map(String).join(", ")}`);
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
});
