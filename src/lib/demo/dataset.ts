import data from "./dataset.json";

/**
 * L'HISTOIRE de l'organisation de démonstration (docs/module-demo.md §1.6)
 * — Vasseur Courtage, un cabinet nantais de courtage en crédit immobilier
 * et assurance emprunteur, entièrement inventé : personnes, cabinets,
 * montants, articles, éditeurs. Aucune donnée réelle, aucune adresse
 * réelle : tous les domaines sont réservés par l'IETF (`.example`), rien
 * ne les route.
 *
 * Les textes vivent dans `dataset.json` : ce sont des DONNÉES (le nom d'un
 * contact, le titre d'une affaire, le corps d'une newsletter fictive), dans
 * la langue du cabinet fictif, comme les données de n'importe quel client
 * — pas des textes d'interface. Ce module ne porte que les types et un
 * remplissage de gabarit ; la génération et l'insertion vivent dans
 * `seed.ts`.
 */

export type Stage = "nouveau" | "partagee" | "en_negociation" | "acceptee" | "perdue";
export type Owner = "claire" | "thomas";

export type DemoDeal = { title: string; type: number; amount: number; stage: Stage; ageDays: number; loss?: number; contact: number; owner: Owner; fromLead?: boolean };
export type DemoShare = {
  deal: number;
  partner: number;
  status: "pending" | "accepted" | "declined" | "revoked";
  ageDays: number;
  expiresInDays: number | null;
  commission: { basis: "percentage"; rate: number } | { basis: "fixed"; amount: number };
  commissionState: "prevue" | "confirmee" | "reglee";
  confirmedDaysAgo?: number;
  settledDaysAgo?: number;
  viewed?: boolean;
  reissuedFrom?: number;
};
export type DemoTask = { title: string; due: number | null; done?: boolean; priority?: "low" | "normal" | "high"; contact?: number; deal?: number; owner: Owner; notes?: string; recurWeekly?: boolean };
export type DemoAppointment = { contact: number; inDays: number; hour: number; title: string; owner: Owner; canceled?: boolean };
export type DemoTarget = { slug: string; label: string; persona: string; audienceLabel: string; tag: number; concerns: string; knowledgeLevel: string; editorialVoice: string; interests: string; avoid: string; accentColor: string };
export type DemoBlock =
  | { type: "titre"; payload: { text: string; level: 1 | 2 | 3; eyebrow: string } }
  | { type: "texte"; payload: { text: string } }
  | { type: "chiffre_cle"; payload: { value: string; label: string; caption: string } }
  | { type: "fiches"; payload: { cards: { title: string; text: string }[] } }
  | { type: "cta"; payload: { title: string; text: string; buttonLabel: string; url: string } }
  | { type: "separateur"; payload: Record<string, never> };
export type DemoNewsletter = {
  title: string;
  subject: string;
  preheader: string;
  brief: string;
  topics: string[];
  target: number;
  sentDaysAgo: number | null;
  /** Fractions des messages remis : ouverts, cliqués ; nombre de rebonds et de désinscriptions. */
  stats: { opened: number; clicked: number; bounced: number; unsubscribed: number };
  blocks: DemoBlock[];
};
export type DemoRule = { name: string; trigger: string; thresholdDays: number; action: string; conditions: { tags?: number[] }; templateSubject?: string; templateBody?: string };
export type DemoInbound = {
  kind: "confirmed" | "pending" | "ignored";
  contact: number | null;
  subject: string;
  counterpartName: string;
  counterpartEmail?: string;
  body: string;
  daysAgo: number;
  proposal: { name: string | null; phone: string | null; company: string | null; jobTitle: string | null };
};
export type DemoWatchItem = { title: string; url: string; publisher: string; daysAgo: number; source: number | null; competitor?: number; topic: number | null; summary: string; themes: string[]; angle: string };

export const ORGANIZATION = data.ORGANIZATION;
export const PEOPLE = data.PEOPLE;
export const SIGNATORY = data.SIGNATORY;
export const DEAL_TYPES: readonly string[] = data.DEAL_TYPES;
export const LOSS_REASONS: readonly string[] = data.LOSS_REASONS;
export const TAGS: readonly { label: string; color: string }[] = data.TAGS;
export const ORIGINS: readonly string[] = data.ORIGINS;
export const PARTNERS: readonly { name: string; company: string; profession: string; email: string; phone: string }[] = data.PARTNERS;
export const FIRST_NAMES: readonly string[] = data.FIRST_NAMES;
export const LAST_NAMES: readonly string[] = data.LAST_NAMES;
export const CITIES: readonly { city: string; postalCode: string }[] = data.CITIES;
export const MAIL_PROVIDERS: readonly string[] = data.MAIL_PROVIDERS;
export const JOB_TITLES: readonly string[] = data.JOB_TITLES;
export const COMPANIES: readonly { name: string; city: string; postalCode: string; notes: string }[] = data.COMPANIES;
export const DEALS: readonly DemoDeal[] = data.DEALS as DemoDeal[];
export const SHARES: readonly DemoShare[] = data.SHARES as DemoShare[];
export const TASKS: readonly DemoTask[] = data.TASKS as DemoTask[];
export const ACTIVITY_LINES: { call: string[]; emailOut: string[]; emailIn: string[]; meeting: string[]; note: string[] } = data.ACTIVITY_LINES;
export const APPOINTMENTS: readonly DemoAppointment[] = data.APPOINTMENTS as DemoAppointment[];
export const TARGETS: readonly DemoTarget[] = data.TARGETS;
export const FIGURES: readonly { label: string; value: string; sourceName: string; asOf: string }[] = data.FIGURES;
export const CTA_PRESETS: readonly { label: string; url: string }[] = data.CTA_PRESETS;
export const NEWSLETTERS: readonly DemoNewsletter[] = data.NEWSLETTERS as DemoNewsletter[];
export const RULES: readonly DemoRule[] = data.RULES as DemoRule[];
export const INBOUND: readonly DemoInbound[] = data.INBOUND as DemoInbound[];
export const WATCH_TOPICS: readonly { label: string; searchTerms: string[]; position: number }[] = data.WATCH_TOPICS;
export const WATCH_SOURCES: readonly { label: string; siteUrl: string; feedUrl: string; topic: number }[] = data.WATCH_SOURCES;
export const COMPETITORS: readonly { label: string; siteUrl: string; feedUrl: string }[] = data.COMPETITORS;
export const WATCH_ITEMS: readonly DemoWatchItem[] = data.WATCH_ITEMS as DemoWatchItem[];
export const INDICATOR_KEYS: readonly string[] = data.INDICATOR_KEYS;

/** « Commission de {rate} % … » → avec ses valeurs ; une accolade inconnue reste telle quelle (aucune invention). */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Les phrases composées par le semis (données, pas interface) — gabarits dans le JSON, remplissage ici. */
export const TEXTS = {
  apiKeyLabel: data.TEXTS.apiKeyLabel,
  leadProject: data.TEXTS.leadProject,
  termsPercentage: (rate: string) => fill(data.TEXTS.termsPercentage, { rate }),
  termsFixed: (amount: number) => fill(data.TEXTS.termsFixed, { amount }),
  shareMessage: (firstName: string, title: string) => fill(data.TEXTS.shareMessage, { firstName, title }),
  shareAccepted: data.TEXTS.shareAccepted,
  shareDeclined: data.TEXTS.shareDeclined,
  commissionConfirmed: data.TEXTS.commissionConfirmed,
  commissionSettled: data.TEXTS.commissionSettled,
  partnerComment: data.TEXTS.partnerComment,
  audienceSummary: (tag: string) => fill(data.TEXTS.audienceSummary, { tag }),
  dealDescription: (amount: string, type: string) => fill(data.TEXTS.dealDescription, { amount, type }),
} as const;
