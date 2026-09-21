import { isTimeZone, timezoneOffsetMinutes, toTimeZone } from "@/lib/timezone";

/**
 * L'HORAIRE D'UN ENVOI, selon le destinataire (chantier envoi, partie 4) —
 * le cœur déterministe, pur : aucune base, aucun réseau, aucune horloge
 * implicite (l'instant « maintenant » est toujours passé en argument, pour
 * que les mêmes faits donnent toujours le même départ).
 *
 * Deux questions, et deux seulement :
 *
 * 1. **Dans quel fuseau vit ce contact ?** Une échelle à quatre barreaux,
 *    du plus précis au plus général, qui dit TOUJOURS d'où vient sa
 *    réponse : ce qui est saisi sur la fiche, sinon la correspondance de sa
 *    ville ou de sa région (pour les pays à plusieurs fuseaux), sinon celle
 *    de son pays, sinon le fuseau de l'organisation. Un barreau dont la
 *    valeur n'est pas un fuseau connu du moteur est ignoré au lieu d'être
 *    cru : une saisie fautive ne décale pas un envoi, elle descend d'un
 *    cran — et la provenance le dit.
 *
 * 2. **À quel instant part son message ?** Trois modes : tout de suite, à
 *    une date fixe (choisie dans le fuseau de l'organisation, donc le même
 *    instant pour tout le monde), ou à une heure LOCALE du destinataire
 *    (donc un instant différent par fuseau). Dans ce dernier cas, la règle
 *    est écrite une fois et affichée à l'écran : si l'heure est déjà passée
 *    chez lui, c'est le lendemain.
 *
 * Le changement d'heure est traité, pas subi : `zonedTimeToUtc` relit le
 * décalage à l'instant CANDIDAT, pas à l'instant naïf — sans quoi une heure
 * du dernier dimanche de mars tombe une heure à côté.
 */

export const SCHEDULE_MODES = ["immediat", "date_fixe", "heure_locale"] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

export function toScheduleMode(raw: string | undefined | null): ScheduleMode {
  return (SCHEDULE_MODES as readonly string[]).includes(raw ?? "") ? (raw as ScheduleMode) : "immediat";
}

/** D'où vient le fuseau retenu — jamais caché : l'écran l'affiche à côté de l'heure. */
export const TIME_ZONE_SOURCES = ["contact", "ville", "pays", "organisation"] as const;
export type TimeZoneSource = (typeof TIME_ZONE_SOURCES)[number];

export type TimeZoneFacts = {
  /** Le fuseau saisi sur la fiche du contact. */
  contactTimeZone: string | null;
  /** La correspondance de sa ville ou de sa région (pays à plusieurs fuseaux). */
  cityTimeZone: string | null;
  /** La correspondance de son pays. */
  countryTimeZone: string | null;
  /** Le fuseau de l'organisation — le dernier barreau, toujours présent. */
  organizationTimeZone: string;
};

export type ResolvedTimeZone = { timeZone: string; source: TimeZoneSource };

export function resolveContactTimeZone(facts: TimeZoneFacts): ResolvedTimeZone {
  const ladder: [string | null, TimeZoneSource][] = [
    [facts.contactTimeZone, "contact"],
    [facts.cityTimeZone, "ville"],
    [facts.countryTimeZone, "pays"],
  ];
  for (const [value, source] of ladder) {
    if (isTimeZone(value)) return { timeZone: value, source };
  }
  return { timeZone: toTimeZone(facts.organizationTimeZone), source: "organisation" };
}

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };

/**
 * Une heure de la journée DANS un fuseau → l'instant UTC correspondant.
 *
 * Deux passes, et c'est le fond du problème : le décalage d'un fuseau
 * dépend de l'instant, et l'instant est justement ce qu'on cherche. On part
 * du décalage lu à l'instant naïf, on en déduit un candidat, puis on relit
 * le décalage AU CANDIDAT ; s'il a changé (on a traversé un changement
 * d'heure), on recalcule avec celui-là. Une heure qui n'existe pas (le
 * dimanche du passage à l'heure d'été) tombe alors juste après le saut,
 * comme partout ailleurs.
 */
export function zonedTimeToUtc(parts: LocalParts, timeZone: string): Date {
  const zone = toTimeZone(timeZone);
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const firstOffset = timezoneOffsetMinutes(zone, new Date(naive));
  const candidate = naive - firstOffset * 60_000;
  const secondOffset = timezoneOffsetMinutes(zone, new Date(candidate));
  return new Date(secondOffset === firstOffset ? candidate : naive - secondOffset * 60_000);
}

/** La date du jour (année, mois, jour) telle qu'elle est vécue dans un fuseau à un instant donné. */
export function localDateIn(timeZone: string, at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: toTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export type LocalDeparture = {
  at: Date;
  /** L'heure était déjà passée chez le destinataire : ce sera le lendemain. L'écran le dit AVANT le départ. */
  nextDay: boolean;
};

/**
 * Le départ d'un message en mode « heure locale du destinataire » :
 * aujourd'hui à `localMinutes` chez lui si ce n'est pas encore passé,
 * demain sinon.
 */
export function localDeparture(now: Date, localMinutes: number, timeZone: string): LocalDeparture {
  const minutes = Math.max(0, Math.min(24 * 60 - 1, Math.round(localMinutes)));
  const today = localDateIn(timeZone, now);
  const at = zonedTimeToUtc({ ...today, hour: Math.floor(minutes / 60), minute: minutes % 60 }, timeZone);
  if (at.getTime() > now.getTime()) return { at, nextDay: false };
  const tomorrow = localDateIn(timeZone, new Date(now.getTime() + 86_400_000));
  return { at: zonedTimeToUtc({ ...tomorrow, hour: Math.floor(minutes / 60), minute: minutes % 60 }, timeZone), nextDay: true };
}

export type DepartureInput = {
  mode: ScheduleMode;
  now: Date;
  /** Mode « date fixe » : l'instant choisi, déjà résolu depuis le fuseau de l'organisation. */
  fixedAt?: Date | null;
  /** Mode « heure locale » : minutes depuis minuit chez le destinataire (540 = 9 h). */
  localMinutes?: number | null;
  /** Le fuseau du destinataire, résolu par `resolveContactTimeZone`. */
  timeZone: string;
};

/**
 * L'instant de départ d'UN message. Le mode « date fixe » donne le même
 * instant à tout le monde ; le mode « heure locale » en donne un par
 * fuseau. Un mode mal renseigné (pas de date, pas d'heure) part tout de
 * suite plutôt que jamais : c'est le contrôle avant envoi qui refuse une
 * programmation incomplète, pas le calcul.
 */
export function departureAt(input: DepartureInput): LocalDeparture {
  if (input.mode === "date_fixe") return { at: input.fixedAt ?? input.now, nextDay: false };
  if (input.mode === "heure_locale" && typeof input.localMinutes === "number") {
    return localDeparture(input.now, input.localMinutes, input.timeZone);
  }
  return { at: input.now, nextDay: false };
}

/**
 * Les fuseaux d'une vague, chacun avec son nombre de destinataires et son
 * instant de départ — ce que l'écran montre avant de lancer, et ce que le
 * suivi montre après. Trié par départ, puis par fuseau : deux exécutions
 * rendent le même tableau.
 */
export type TimeZoneDeparture = { timeZone: string; count: number; at: Date; nextDay: boolean };

export function departuresByTimeZone(recipients: { timeZone: string }[], input: Omit<DepartureInput, "timeZone">): TimeZoneDeparture[] {
  const counts = new Map<string, number>();
  for (const recipient of recipients) counts.set(recipient.timeZone, (counts.get(recipient.timeZone) ?? 0) + 1);
  return [...counts.entries()]
    .map(([timeZone, count]) => {
      const departure = departureAt({ ...input, timeZone });
      return { timeZone, count, at: departure.at, nextDay: departure.nextDay };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.timeZone.localeCompare(b.timeZone));
}
