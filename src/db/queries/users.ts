import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { toAppLocale, type AppLocale } from "@/i18n/locales";

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
