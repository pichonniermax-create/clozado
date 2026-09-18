import { cache } from "react";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { savedViews, SAVED_VIEW_SCREENS, type SavedViewScreen } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getPreferences, PREF, preferenceList } from "./preferences";
import { BUILT_IN_VIEWS, builtInViewId, builtInViewKey } from "@/lib/display/built-in-views";
import { displayScreen, screenForView } from "@/lib/display/screens";
import { parseDensity, sanitizeScreenState, VIEW_PARAM, type Density, type ScreenState } from "@/lib/display/state";
import type { SessionUser } from "@/lib/session";

/**
 * LES VUES ENREGISTRÉES (lot 1, étape 3) — un affichage nommé : ses
 * filtres, ses colonnes, son tri, sa densité, sa période. Personnelle par
 * défaut ; le partage à l'équipe est réservé à l'admin (plus strict que
 * HubSpot, conforme au brief).
 *
 * Une vue ne porte JAMAIS d'identifiants de fiches : seulement des
 * paramètres d'affichage, rejoués par les requêtes existantes sous
 * `orgScope`. Un member qui ouvre l'adresse d'une vue partagée ne voit donc
 * rien de plus que ce que son rôle autorise — la vue décrit un cadrage,
 * elle n'accorde aucun droit.
 */
export type ViewDefinition = {
  params: ScreenState;
  colonnes?: string[];
  densite?: Density;
  /** Renseigné quand la ligne ÉCLIPSE une vue fournie du code. */
  builtin?: string;
};

export type ListedView = {
  /** `fournie:<clé>` pour une vue du code, l'UUID de la ligne sinon. */
  id: string;
  screen: SavedViewScreen;
  /** Le nom saisi, ou `null` pour une vue fournie non renommée (l'écran en affiche la traduction). */
  name: string | null;
  /** La clé de la vue fournie, quand c'en est une (traduction du nom, icône). */
  builtin?: string;
  definition: ViewDefinition;
  shared: boolean;
  /** La personne peut-elle modifier cette vue ? (la sienne, ou l'admin sur une vue d'équipe). */
  editable: boolean;
  /** Vue personnelle de la personne qui regarde. */
  mine: boolean;
};

const NAME_MAX = 80;

function assertScreen(screen: string): asserts screen is SavedViewScreen {
  if (!(SAVED_VIEW_SCREENS as readonly string[]).includes(screen)) throw new AppError("vue_ecran_inconnu");
}

/** L'organisation dans laquelle la personne travaille — une vue n'existe pas hors d'une organisation. */
function orgOf(user: SessionUser): string | null {
  return user.organizationId;
}

function isAdmin(user: SessionUser): boolean {
  return user.role === "admin";
}

/** La définition telle qu'on accepte de l'écrire : bornée par la liste blanche de l'écran, rien d'autre. */
export function sanitizeDefinition(screen: SavedViewScreen, raw: unknown): ViewDefinition {
  const source = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const target = screenForView(screen) ?? displayScreen(screen);
  const params = sanitizeScreenState(target, (source.params ?? {}) as Record<string, string | undefined>);
  // Une vue ne se contient pas elle-même : `?v=` désigne une vue, il n'entre jamais dans sa définition.
  delete params[VIEW_PARAM];
  const colonnes = Array.isArray(source.colonnes)
    ? source.colonnes.filter((c): c is string => typeof c === "string" && c.length <= 60).slice(0, 40)
    : undefined;
  const densite = parseDensity(source.densite);
  const builtin = typeof source.builtin === "string" && builtInViewKey(`fournie:${source.builtin}`) ? source.builtin : undefined;
  return { params, ...(colonnes?.length ? { colonnes } : {}), ...(densite ? { densite } : {}), ...(builtin ? { builtin } : {}) };
}

function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > NAME_MAX) throw new AppError("vue_nom_invalide");
  return trimmed;
}

/**
 * Les vues d'un écran pour la personne qui regarde : les siennes, celles
 * de l'équipe, les vues sans propriétaire (fournies, éclipsées ou non), et
 * les vues fournies du code que rien n'éclipse. Jamais la vue personnelle
 * d'un collègue.
 */
export const listViews = cache(async function listViews(user: SessionUser, screen: SavedViewScreen): Promise<ListedView[]> {
  const organizationId = orgOf(user);
  if (!organizationId) return [];
  const rows = await db
    .select()
    .from(savedViews)
    .where(
      and(
        eq(savedViews.organizationId, organizationId),
        eq(savedViews.screen, screen),
        or(isNull(savedViews.ownerUserId), eq(savedViews.ownerUserId, user.id), eq(savedViews.shared, true))
      )
    )
    .orderBy(asc(savedViews.position), asc(savedViews.createdAt));

  const stored: ListedView[] = rows.map((row) => {
    const definition = sanitizeDefinition(screen, row.definition);
    const mine = row.ownerUserId === user.id;
    return {
      id: row.id,
      screen,
      name: row.name,
      builtin: definition.builtin,
      definition,
      shared: row.shared,
      editable: mine || (isAdmin(user) && (row.shared || row.ownerUserId === null)),
      mine,
    };
  });

  const eclipsed = new Set(stored.map((v) => v.builtin).filter(Boolean) as string[]);
  const provided: ListedView[] = BUILT_IN_VIEWS.filter((v) => v.screen === screen && !eclipsed.has(v.key)).map((v) => ({
    id: builtInViewId(v.key),
    screen,
    name: null,
    builtin: v.key,
    definition: { params: v.params, builtin: v.key },
    shared: true,
    editable: isAdmin(user),
    mine: false,
  }));

  // Les vues fournies d'abord (le cadrage d'usine), puis celles de l'équipe, puis les personnelles.
  const natural = [...provided, ...stored.filter((v) => !v.mine), ...stored.filter((v) => v.mine)];

  /**
   * L'ORDRE CHOISI (reste du lot 1) — par PERSONNE, dans `user_preferences`,
   * jamais en base sur la vue : `saved_views.position` aurait imposé l'ordre
   * d'un admin à toute l'équipe et laissé les vues fournies (qui vivent dans
   * le code) hors du classement. Ici, une liste d'identifiants ; ce qui n'y
   * figure pas garde sa place naturelle, derrière ce qui y figure. Un tri
   * STABLE : sans préférence, l'ordre ne bouge pas d'un pouce.
   */
  const order = preferenceList(await getPreferences(user), PREF.viewOrder(screen)) ?? [];
  if (order.length === 0) return natural;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...natural].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
});

/** Une vue par son identifiant, pour l'appliquer — fournie (code) ou enregistrée (base). */
export async function getView(user: SessionUser, screen: SavedViewScreen, id: string): Promise<ListedView | null> {
  const views = await listViews(user, screen);
  return views.find((v) => v.id === id) ?? null;
}

export async function createView(
  user: SessionUser,
  screen: string,
  name: string,
  definition: unknown
): Promise<string> {
  assertScreen(screen);
  const organizationId = orgOf(user);
  if (!organizationId || user.readOnly) throw new AppError("vue_organisation_requise");
  const [row] = await db
    .insert(savedViews)
    .values({
      organizationId,
      ownerUserId: user.id,
      screen,
      name: cleanName(name),
      definition: sanitizeDefinition(screen, definition),
      shared: false,
    })
    .returning({ id: savedViews.id });
  return row.id;
}

/** La ligne visée, vérifiée : même organisation, et la personne a le droit d'y toucher. */
async function editableRow(user: SessionUser, id: string) {
  const organizationId = orgOf(user);
  if (!organizationId || user.readOnly) throw new AppError("vue_organisation_requise");
  const row = await db.query.savedViews.findFirst({ where: eq(savedViews.id, id) });
  if (!row || row.organizationId !== organizationId) throw new AppError("vue_introuvable", undefined, 404);
  const mine = row.ownerUserId === user.id;
  if (!mine && !(isAdmin(user) && (row.shared || row.ownerUserId === null))) throw new AppError("vue_non_modifiable", undefined, 403);
  return row;
}

/**
 * Enregistre une vue FOURNIE modifiée : la ligne sans propriétaire qui
 * l'éclipse. Réservé à l'admin — c'est le cadrage de toute l'équipe.
 */
async function eclipseBuiltIn(user: SessionUser, key: string, name: string, definition: ViewDefinition): Promise<string> {
  const organizationId = orgOf(user);
  if (!organizationId || user.readOnly) throw new AppError("vue_organisation_requise");
  if (!isAdmin(user)) throw new AppError("vue_fournie_reservee_admin", undefined, 403);
  const builtIn = BUILT_IN_VIEWS.find((v) => v.key === key);
  if (!builtIn) throw new AppError("vue_introuvable", undefined, 404);
  const [row] = await db
    .insert(savedViews)
    .values({
      organizationId,
      ownerUserId: null,
      screen: builtIn.screen,
      name: cleanName(name),
      definition: { ...definition, builtin: key },
      shared: true,
    })
    .returning({ id: savedViews.id });
  return row.id;
}

/** Renomme — et matérialise une vue fournie si c'en est une. */
export async function renameView(user: SessionUser, id: string, name: string, fallbackName: string): Promise<void> {
  const key = builtInViewKey(id);
  if (key) {
    const builtIn = BUILT_IN_VIEWS.find((v) => v.key === key)!;
    await eclipseBuiltIn(user, key, name || fallbackName, { params: builtIn.params });
    return;
  }
  const row = await editableRow(user, id);
  await db.update(savedViews).set({ name: cleanName(name), updatedAt: new Date() }).where(eq(savedViews.id, row.id));
}

/** Remplace la définition d'une vue par l'affichage courant (« Mettre à jour la vue »). */
export async function updateViewDefinition(user: SessionUser, id: string, definition: unknown, fallbackName: string): Promise<void> {
  const key = builtInViewKey(id);
  if (key) {
    const builtIn = BUILT_IN_VIEWS.find((v) => v.key === key)!;
    await eclipseBuiltIn(user, key, fallbackName, sanitizeDefinition(builtIn.screen, definition));
    return;
  }
  const row = await editableRow(user, id);
  assertScreen(row.screen);
  await db
    .update(savedViews)
    .set({ definition: sanitizeDefinition(row.screen, definition), updatedAt: new Date() })
    .where(eq(savedViews.id, row.id));
}

/** Duplique une vue (fournie comprise) en vue PERSONNELLE — le geste qui permet d'adapter sans toucher à l'équipe. */
export async function duplicateView(user: SessionUser, screen: SavedViewScreen, id: string, name: string): Promise<string> {
  const source = await getView(user, screen, id);
  if (!source) throw new AppError("vue_introuvable", undefined, 404);
  // La copie est une vue à part entière : elle n'éclipse plus la vue fournie dont elle est née.
  const definition: ViewDefinition = { ...source.definition };
  delete definition.builtin;
  return createView(user, screen, name, definition);
}

export async function setViewShared(user: SessionUser, id: string, shared: boolean): Promise<void> {
  if (!isAdmin(user)) throw new AppError("vue_partage_reserve_admin", undefined, 403);
  const row = await editableRow(user, id);
  if (row.ownerUserId === null && !shared) throw new AppError("vue_fournie_toujours_partagee");
  await db.update(savedViews).set({ shared, updatedAt: new Date() }).where(eq(savedViews.id, row.id));
}

export async function deleteView(user: SessionUser, id: string): Promise<void> {
  const row = await editableRow(user, id);
  await db.delete(savedViews).where(eq(savedViews.id, row.id));
}

/** Combien de vues cette personne a déjà enregistrées ici (garde-fou : une liste de vues n'est pas un entrepôt). */
export async function countOwnViews(user: SessionUser): Promise<number> {
  const organizationId = orgOf(user);
  if (!organizationId) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(savedViews)
    .where(and(eq(savedViews.organizationId, organizationId), eq(savedViews.ownerUserId, user.id)));
  return row?.n ?? 0;
}
