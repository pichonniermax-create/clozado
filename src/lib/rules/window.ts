import type { Organization } from "@/db/schema";
import { timezoneOffsetMinutes, toTimeZone } from "@/lib/timezone";

/**
 * La fenêtre d'envoi (§5.3) : jours ouvrés lundi–vendredi, heures de
 * bureau dans le FUSEAU DE L'ORGANISATION. Depuis la consigne du
 * 2026-09-02 (validation humaine par vague), elle n'est plus un blocage :
 * c'est le clic humain qui donne l'heure — l'écran de la vague AVERTIT
 * quand on est hors fenêtre, et la personne décide.
 */
export function inOfficeWindow(
  org: Pick<Organization, "timezone" | "officeHoursStart" | "officeHoursEnd">,
  now = new Date()
): boolean {
  const timeZone = toTimeZone(org.timezone);
  const local = new Date(now.getTime() + timezoneOffsetMinutes(timeZone, now) * 60 * 1000);
  const isoDay = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
  if (isoDay > 5) return false;
  const hour = local.getUTCHours();
  return hour >= org.officeHoursStart && hour < org.officeHoursEnd;
}
