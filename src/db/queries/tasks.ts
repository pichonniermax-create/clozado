import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, tasks, users, type NewTask, type Task } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import { formatCommission, formatDate, formatDays } from "@/lib/format";
import type { OrgScopeUser } from "@/lib/session";
import { PRODUCT_TIMEZONE } from "@/lib/timezone";
import { daysBetween, getFollowUpBoard, type FollowUpBoard } from "./deal-follow-up";
import { getOwnOrganizationOrThrow } from "./newsletters";
import { AppError } from "@/lib/errors";
import { toAppLocale } from "@/i18n/locales";
import { translatorFor } from "@/i18n/translator";

/**
 * Le module tâches : la liste, le cycle open → done, la récurrence
 * (matérialisée à l'achèvement — jamais de tâche de fond), et la
 * génération automatique depuis le PRM. La génération réutilise
 * `getFollowUpBoard` : ce que l'écran de suivi signale et ce que les
 * tâches matérialisent sont, par construction, la même chose.
 */

// ---------------------------------------------------------------------------
// Dates calendrier
// ---------------------------------------------------------------------------

/**
 * Les échéances sont des JOURS, pas des instants : stockées à minuit UTC de
 * la date choisie, comparées à la date calendrier du produit — le
 * « aujourd'hui » d'Europe/Paris (lib/timezone.ts), pas celui du serveur.
 */
/** La date du jour (calendrier Europe/Paris), représentée à minuit UTC — même convention que les échéances stockées. */
export function todayAsStoredDate(): Date {
  // en-CA donne « YYYY-MM-DD » directement.
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRODUCT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${day}T00:00:00.000Z`);
}

/** « 2026-08-24 » (champ <input type=date>) → minuit UTC. Chaîne vide ou invalide → null. */
function parseDueDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Échéance stockée → valeur du champ <input type=date> (« YYYY-MM-DD »). */
export function dueDateInputValue(dueAt: Date | null): string {
  return dueAt ? dueAt.toISOString().slice(0, 10) : "";
}

type RecurUnit = NonNullable<Task["recurUnit"]>;

/**
 * Ajout de mois avec plafonnement au dernier jour du mois cible (31 janvier
 * + 1 mois = 28/29 février). Une récurrence mensuelle posée un 31 glisse
 * donc au dernier jour des mois courts et y reste — assumé pour la v1.
 */
function addUtcMonths(date: Date, months: number): Date {
  const dayOfMonth = date.getUTCDate();
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(dayOfMonth, lastDay));
  return next;
}

function addInterval(date: Date, unit: RecurUnit, every: number): Date {
  const next = new Date(date);
  switch (unit) {
    case "day":
      next.setUTCDate(next.getUTCDate() + every);
      return next;
    case "week":
      next.setUTCDate(next.getUTCDate() + 7 * every);
      return next;
    case "month":
      return addUtcMonths(date, every);
    case "year":
      return addUtcMonths(date, 12 * every);
  }
}

/**
 * Prochaine occurrence à l'achèvement : la cadence part de l'échéance
 * PRÉVUE (pas de la date d'achèvement — finir en avance ne décale pas le
 * rythme), et les occurrences déjà passées sont sautées : achever
 * aujourd'hui une tâche hebdomadaire en retard d'un mois crée UNE tâche à
 * venir, pas quatre tâches déjà en retard.
 */
function nextOccurrence(dueAt: Date, unit: RecurUnit, every: number): Date {
  const today = todayAsStoredDate();
  let next = addInterval(dueAt, unit, every);
  while (next <= today) {
    next = addInterval(next, unit, every);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  priority: Task["priority"];
  status: Task["status"];
  completedAt: Date | null;
  autoRule: Task["autoRule"];
  recurUnit: Task["recurUnit"];
  recurEvery: number | null;
  assigneeId: string | null;
  assigneeLabel: string | null;
  contactId: string | null;
  contactName: string | null;
  dealId: string | null;
  dealTitle: string | null;
};

export type TasksBoard = {
  /** Échéance passée — la pile d'en haut, la plus en retard d'abord. */
  overdue: TaskRow[];
  today: TaskRow[];
  upcoming: TaskRow[];
  /** Sans échéance : ni en retard ni du jour, par définition (schema tasks.dueAt). */
  noDue: TaskRow[];
  /** Les dernières achevées — matière à consulter, pas à traiter. */
  done: TaskRow[];
  /** Totaux par pile, calculés en base — les piles ci-dessus ne portent que la page courante. */
  counts: { overdue: number; today: number; upcoming: number; noDue: number; open: number };
  page: number;
  pageCount: number;
};

/**
 * Les tâches ouvertes se lisent par pages de 50 — même taille que les
 * contacts et les affaires — les plus urgentes d'abord (échéance
 * croissante, sans échéance en dernier) : la première page est le travail
 * du jour, les suivantes le reste. Mesuré à 1 334 tâches ouvertes : rendre
 * toutes les lignes (chacune avec son panneau d'édition) coûtait 2,5 s —
 * la requête, elle, 41 ms.
 */
export const TASKS_PAGE_SIZE = 50;

function taskSelection() {
  return {
    id: tasks.id,
    title: tasks.title,
    notes: tasks.notes,
    dueAt: tasks.dueAt,
    priority: tasks.priority,
    status: tasks.status,
    completedAt: tasks.completedAt,
    autoRule: tasks.autoRule,
    recurUnit: tasks.recurUnit,
    recurEvery: tasks.recurEvery,
    assigneeId: tasks.assigneeId,
    assigneeName: users.name,
    assigneeEmail: users.email,
    contactId: tasks.contactId,
    contactName: contacts.name,
    dealId: tasks.dealId,
    dealTitle: deals.title,
  };
}

type RawRow = {
  assigneeName: string | null;
  assigneeEmail: string | null;
} & Omit<TaskRow, "assigneeLabel">;

function toTaskRow({ assigneeName, assigneeEmail, ...row }: RawRow): TaskRow {
  return { ...row, assigneeLabel: assigneeName || assigneeEmail || null };
}

const DONE_LIMIT = 30;

export async function listTasksBoard(
  user: OrgScopeUser,
  filters: { assigneeId?: string; page?: number } = {}
): Promise<TasksBoard> {
  const page = Math.max(1, filters.page ?? 1);
  const assigneeFilter = filters.assigneeId ? eq(tasks.assigneeId, filters.assigneeId) : undefined;
  const open = and(orgScope(user, tasks.organizationId), eq(tasks.status, "open"), assigneeFilter);
  const today = todayAsStoredDate();
  const tomorrow = addInterval(today, "day", 1);

  const base = () =>
    db
      .select(taskSelection())
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .leftJoin(deals, eq(tasks.dealId, deals.id));
  const countOpen = (extra: SQL) =>
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(open, extra))
      .then(([r]) => r?.n ?? 0);

  const [openRows, doneRows, overdue, dueToday, upcoming, noDue] = await Promise.all([
    base()
      .where(open)
      // ASC met les NULL en dernier : les tâches datées d'abord, les sans
      // échéance à la fin ; à échéance égale, la priorité la plus haute d'abord.
      .orderBy(asc(tasks.dueAt), desc(tasks.priority), asc(tasks.createdAt))
      .limit(TASKS_PAGE_SIZE)
      .offset((page - 1) * TASKS_PAGE_SIZE),
    base()
      .where(and(orgScope(user, tasks.organizationId), eq(tasks.status, "done"), assigneeFilter))
      .orderBy(desc(tasks.completedAt))
      .limit(DONE_LIMIT),
    countOpen(lt(tasks.dueAt, today)),
    countOpen(and(gte(tasks.dueAt, today), lt(tasks.dueAt, tomorrow))!),
    countOpen(gte(tasks.dueAt, tomorrow)),
    countOpen(isNull(tasks.dueAt)),
  ]);

  const openTotal = overdue + dueToday + upcoming + noDue;
  const board: TasksBoard = {
    overdue: [],
    today: [],
    upcoming: [],
    noDue: [],
    done: doneRows.map(toTaskRow),
    counts: { overdue, today: dueToday, upcoming, noDue, open: openTotal },
    page,
    pageCount: Math.max(1, Math.ceil(openTotal / TASKS_PAGE_SIZE)),
  };
  for (const raw of openRows) {
    const row = toTaskRow(raw);
    if (!row.dueAt) board.noDue.push(row);
    else if (row.dueAt < today) board.overdue.push(row);
    else if (row.dueAt < tomorrow) board.today.push(row);
    else board.upcoming.push(row);
  }
  return board;
}

/** Le compteur de la barre latérale : tâches ouvertes en retard ou du jour. */
export async function countTasksDueNow(user: OrgScopeUser): Promise<number> {
  const tomorrow = addInterval(todayAsStoredDate(), "day", 1);
  const [row] = await db
    .select({ value: count() })
    .from(tasks)
    .where(
      and(
        orgScope(user, tasks.organizationId),
        eq(tasks.status, "open"),
        isNotNull(tasks.dueAt),
        lt(tasks.dueAt, tomorrow)
      )
    );
  return row?.value ?? 0;
}

export type TasksDueSummary = {
  overdue: number;
  today: number;
  /** Les premières à traiter : en retard d'abord (la plus ancienne en tête), puis celles du jour. */
  rows: TaskRow[];
};

/**
 * Le « à faire maintenant » du tableau de bord : deux compteurs et une
 * courte liste — jamais toutes les tâches ouvertes de l'organisation
 * (c'est l'écran des tâches qui les montre).
 */
export async function getTasksDueSummary(user: OrgScopeUser, limit: number): Promise<TasksDueSummary> {
  const today = todayAsStoredDate();
  const tomorrow = addInterval(today, "day", 1);
  const openDated = and(
    orgScope(user, tasks.organizationId),
    eq(tasks.status, "open"),
    isNotNull(tasks.dueAt)
  );

  const [[overdue], [dueToday], rows] = await Promise.all([
    db.select({ n: count() }).from(tasks).where(and(openDated, lt(tasks.dueAt, today))),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(openDated, gte(tasks.dueAt, today), lt(tasks.dueAt, tomorrow))),
    db
      .select(taskSelection())
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .leftJoin(contacts, eq(tasks.contactId, contacts.id))
      .leftJoin(deals, eq(tasks.dealId, deals.id))
      .where(and(openDated, lt(tasks.dueAt, tomorrow)))
      .orderBy(asc(tasks.dueAt), desc(tasks.priority), asc(tasks.createdAt))
      .limit(limit),
  ]);

  return { overdue: overdue?.n ?? 0, today: dueToday?.n ?? 0, rows: rows.map(toTaskRow) };
}

/** Les tâches ouvertes d'une fiche (affaire ou contact) — les fiches n'affichent pas les achevées. */
async function listOpenTasksFor(user: OrgScopeUser, subject: SQL) {
  const rows = await db
    .select(taskSelection())
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .leftJoin(deals, eq(tasks.dealId, deals.id))
    .where(and(orgScope(user, tasks.organizationId), subject, eq(tasks.status, "open")))
    .orderBy(asc(tasks.dueAt), desc(tasks.priority));
  return rows.map(toTaskRow);
}

export async function listOpenTasksForDeal(user: OrgScopeUser, dealId: string) {
  return listOpenTasksFor(user, eq(tasks.dealId, dealId));
}

export async function listOpenTasksForContact(user: OrgScopeUser, contactId: string) {
  return listOpenTasksFor(user, eq(tasks.contactId, contactId));
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export type TaskInput = {
  title: string;
  notes?: string | null;
  /** « YYYY-MM-DD » (champ date) — vide = sans échéance. */
  dueDate?: string | null;
  priority?: Task["priority"];
  /** undefined = défaut (le créateur) ; null = explicitement personne. */
  assigneeId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  recurUnit?: Task["recurUnit"];
  recurEvery?: number | null;
};

function validateRecurrence(input: { recurUnit?: Task["recurUnit"]; recurEvery?: number | null; dueAt: Date | null }) {
  if (!input.recurUnit) return { recurUnit: null, recurEvery: null };
  if (!input.dueAt) {
    throw new AppError("une_recurrence_sans_echeance_ne_veut_rien_3108");
  }
  const every = input.recurEvery ?? 1;
  if (!Number.isInteger(every) || every < 1) {
    throw new AppError("le_pas_de_recurrence_doit_etre_un_b892");
  }
  return { recurUnit: input.recurUnit, recurEvery: every };
}

export async function createTask(user: OrgScopeUser, createdBy: string, input: TaskInput) {
  const org = await getOwnOrganizationOrThrow(user);
  const title = input.title.trim();
  if (!title) throw new AppError("le_titre_est_obligatoire");

  const dueAt = parseDueDate(input.dueDate);
  const recurrence = validateRecurrence({ ...input, dueAt });

  const [task] = await db
    .insert(tasks)
    .values({
      organizationId: org.id,
      title,
      notes: input.notes?.trim() || null,
      dueAt,
      priority: input.priority ?? "normal",
      // Sans indication, la tâche est pour celui qui la crée — le cas de
      // l'ajout rapide depuis une fiche.
      assigneeId: input.assigneeId === undefined ? createdBy : input.assigneeId,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      ...recurrence,
      createdBy,
    })
    .returning();
  return task;
}

async function getTaskOrThrow(user: OrgScopeUser, taskId: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new AppError("tache_introuvable", undefined, 404);
  assertOrgAccess(user, task.organizationId);
  return task;
}

export type TaskUpdateInput = Omit<TaskInput, "contactId" | "dealId">;

/** Modifie le contenu d'une tâche — jamais ses rattachements (posés à la création) ni son statut (completeTask/reopenTask). */
export async function updateTask(user: OrgScopeUser, taskId: string, input: TaskUpdateInput) {
  const task = await getTaskOrThrow(user, taskId);
  const title = input.title.trim();
  if (!title) throw new AppError("le_titre_est_obligatoire");

  const dueAt = parseDueDate(input.dueDate);
  const recurrence = validateRecurrence({ ...input, dueAt });

  const [updated] = await db
    .update(tasks)
    .set({
      title,
      notes: input.notes?.trim() || null,
      dueAt,
      priority: input.priority ?? "normal",
      assigneeId: input.assigneeId === undefined ? task.assigneeId : input.assigneeId,
      ...recurrence,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id))
    .returning();
  return updated;
}

/**
 * Achève une tâche, et matérialise l'occurrence SUIVANTE si elle est
 * récurrente — c'est ici, et nulle part ailleurs, que la récurrence
 * existe : pas de tâche de fond, pas de cron.
 */
export async function completeTask(user: OrgScopeUser, taskId: string, actorId: string) {
  const task = await getTaskOrThrow(user, taskId);
  if (task.status === "done") return task;

  const [done] = await db
    .update(tasks)
    .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, task.id))
    .returning();

  if (task.recurUnit && task.recurEvery && task.dueAt) {
    await db.insert(tasks).values({
      organizationId: task.organizationId,
      title: task.title,
      notes: task.notes,
      dueAt: nextOccurrence(task.dueAt, task.recurUnit, task.recurEvery),
      priority: task.priority,
      assigneeId: task.assigneeId,
      contactId: task.contactId,
      dealId: task.dealId,
      recurUnit: task.recurUnit,
      recurEvery: task.recurEvery,
      createdBy: actorId,
    });
  }
  return done;
}

export async function reopenTask(user: OrgScopeUser, taskId: string) {
  const task = await getTaskOrThrow(user, taskId);
  const [reopened] = await db
    .update(tasks)
    .set({ status: "open", completedAt: null, updatedAt: new Date() })
    .where(eq(tasks.id, task.id))
    .returning();
  return reopened;
}

export async function deleteTask(user: OrgScopeUser, taskId: string) {
  const task = await getTaskOrThrow(user, taskId);
  if (task.autoRule) {
    // Supprimée, la ligne qui garantit l'idempotence disparaîtrait avec
    // elle : la règle recréerait la même tâche à la prochaine visite.
    throw new AppError("cette_tache_a_ete_generee_automatiquement_l_6720");
  }
  await db.delete(tasks).where(eq(tasks.id, task.id));
}

// ---------------------------------------------------------------------------
// Génération automatique — le lien PRM → tâches
// ---------------------------------------------------------------------------

/**
 * Matérialise en tâches ce que l'écran de suivi signale, à la lecture de
 * l'écran des tâches (pas de tâche de fond) : partages sans réponse,
 * affaires acceptées sans suite, commissions confirmées non réglées depuis
 * `organizations.commission_unpaid_days`. Idempotente par construction :
 * les index uniques (règle, source) de `tasks` font qu'une tâche existe UNE
 * fois pour toujours par situation — l'achever vaut « traité », elle ne
 * renaît pas (onConflictDoNothing).
 *
 * Les seuils et les définitions sont ceux de `getFollowUpBoard` : ce que le
 * suivi montre et ce que les tâches matérialisent ne peuvent pas diverger.
 */
export async function generateAutoTasks(user: OrgScopeUser, knownBoard?: FollowUpBoard): Promise<void> {
  const org = await getOwnOrganizationOrThrow(user);
  // Les tâches générées appartiennent à l'organisation : dans SA langue, pas dans celle de la personne qui a ouvert l'écran.
  const t = await translatorFor(toAppLocale(org.defaultLocale), "tasks.queries");
  // Le tableau de bord l'a déjà calculé pour ses tuiles : on ne le recalcule pas.
  const board = knownBoard ?? (await getFollowUpBoard(user));
  const now = new Date();
  const today = todayAsStoredDate();

  // Une commission dont la date de confirmation est inconnue ne déclenche
  // pas la règle : on ne compte pas des jours depuis une date qu'on n'a pas.
  const unpaidOverdue = board.unpaidCommissions.filter(
    (c) => c.confirmedAt !== null && daysBetween(c.confirmedAt, now) >= org.commissionUnpaidDays
  );

  const dealIds = [
    ...new Set(
      [...board.pendingAlerts, ...board.acceptedStale, ...unpaidOverdue].map((x) => x.dealId)
    ),
  ];
  if (dealIds.length === 0) return;

  // Le responsable de l'affaire hérite de la tâche ; sans responsable, la
  // tâche reste non attribuée (visible de toute l'organisation).
  const dealRows = await db
    .select({ id: deals.id, ownerId: deals.ownerId, contactId: deals.contactId })
    .from(deals)
    .where(inArray(deals.id, dealIds));
  const dealById = new Map(dealRows.map((d) => [d.id, d]));

  const values: NewTask[] = [];
  const common = (dealId: string) => {
    const deal = dealById.get(dealId);
    return {
      organizationId: org.id,
      dueAt: today,
      dealId,
      contactId: deal?.contactId ?? null,
      assigneeId: deal?.ownerId ?? null,
    };
  };

  for (const alert of board.pendingAlerts) {
    values.push({
      ...common(alert.dealId),
      title: t("relancer_partage_sans_reponse_sur", { partnerName: alert.partnerName, dealTitle: alert.dealTitle }),
      notes: t("generee_automatiquement_partage_envoye_le_sans_172c", { formatDate: formatDate(alert.sentAt), formatDays: formatDays(alert.daysSinceSent), formatDays2: formatDays(board.thresholds.pendingReminderDays) }),
      autoRule: "share_pending",
      sourceShareId: alert.shareId,
    });
  }

  for (const stale of board.acceptedStale) {
    values.push({
      ...common(stale.dealId),
      title: t("faire_le_point_avec_sans_nouvelle", { partnerName: stale.partnerName, dealTitle: stale.dealTitle }),
      notes: t("generee_automatiquement_partage_accepte_sans_activite_3240", { formatDays: formatDays(stale.daysSinceActivity), formatDays2: formatDays(board.thresholds.acceptedStaleDays) }),
      autoRule: "deal_accepted_stale",
      sourceShareId: stale.shareId,
    });
  }

  for (const commission of unpaidOverdue) {
    values.push({
      ...common(commission.dealId),
      title: t("solder_la_commission_de", { partnerName: commission.partnerName, dealTitle: commission.dealTitle }),
      notes: t("generee_automatiquement_commission_confirmee_le_non_2d64", { formatCommission: formatCommission(commission), formatDate: formatDate(commission.confirmedAt!), formatDays: formatDays(org.commissionUnpaidDays) }),
      autoRule: "commission_unpaid",
      sourceCommissionId: commission.commissionId,
    });
  }

  // Une seule insertion, en ignorant les conflits ligne à ligne : les
  // situations déjà matérialisées (index uniques partiels) passent leur tour.
  await db.insert(tasks).values(values).onConflictDoNothing();
}
