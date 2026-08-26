import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { DEFAULT_LOCALE, toAppLocale, type AppLocale } from "./locales";

/**
 * La langue d'UNE PERSONNE : son choix mémorisé (`users.locale`), sinon la
 * langue par défaut de son organisation, sinon le français. Une seule
 * lecture — la jointure utilisateur → organisation — et une seule
 * définition, pour la requête (l'interface) comme pour un email (le
 * destinataire n'est pas forcément la personne connectée). Ce module ne
 * dépend pas d'Auth.js : `auth.ts` l'importe pour écrire le lien de
 * connexion dans la langue de son destinataire.
 */
export async function localeOfUser(where: { id: string } | { email: string }): Promise<AppLocale> {
  const row = await db
    .select({ userLocale: users.locale, orgLocale: organizations.defaultLocale })
    .from(users)
    .leftJoin(organizations, eq(organizations.id, users.organizationId))
    .where("id" in where ? eq(users.id, where.id) : eq(users.email, where.email))
    .limit(1);
  const found = row[0];
  if (!found) return DEFAULT_LOCALE;
  return toAppLocale(found.userLocale ?? found.orgLocale);
}

/** La langue par défaut d'UNE ORGANISATION — pour ce qui s'écrit en son nom hors requête (tâches générées, chiffres synchronisés par le cron). */
export async function localeOfOrganization(organizationId: string): Promise<AppLocale> {
  const row = await db.select({ locale: organizations.defaultLocale }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return toAppLocale(row[0]?.locale);
}

