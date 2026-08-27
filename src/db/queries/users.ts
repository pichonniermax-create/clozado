import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { toAppLocale, type AppLocale } from "@/i18n/locales";
import { AppError } from "@/lib/errors";

/** Le choix de langue mémorisé d'une personne — null quand elle suit son organisation. */
export async function getUserLocaleChoice(userId: string): Promise<AppLocale | null> {
  const row = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  const value = row[0]?.locale;
  return value ? toAppLocale(value) : null;
}

/** Mémorise la langue d'une personne (null = suivre l'organisation). Chacun ne change que la sienne. */
export async function updateUserLocale(userId: string, locale: AppLocale | null): Promise<void> {
  await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, userId));
}

export type UserProfile = { replyToEmail: string | null; bookingUrl: string | null };

/** Le profil d'une personne : ce qu'elle règle pour elle-même (chantier engagement). */
export async function getUserProfile(userId: string): Promise<UserProfile & { email: string; name: string | null }> {
  const rows = await db.select({ email: users.email, name: users.name, replyToEmail: users.replyToEmail, bookingUrl: users.bookingUrl }).from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw new AppError("utilisateur_introuvable", undefined, 404);
  return row;
}

/** Chacun ne modifie que son propre profil : le WHERE porte sur l'id de session, jamais sur un id fourni. Les valeurs sont validées par l'écran. */
export async function updateUserProfile(userId: string, profile: UserProfile): Promise<void> {
  await db.update(users).set({ ...profile, updatedAt: new Date() }).where(eq(users.id, userId));
}
