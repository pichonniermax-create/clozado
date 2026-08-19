import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
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
      from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
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
