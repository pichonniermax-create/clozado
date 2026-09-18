import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { AppHeader } from "@/components/app-shell/app-header";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { FlashToaster } from "@/components/app-shell/flash-toaster";
import { RememberDisplay } from "@/components/app-shell/remember-display";
import { ShellOffset } from "@/components/app-shell/shell-offset";
import { Sidebar } from "@/components/app-shell/sidebar";
import { SuperAdminBar } from "@/components/app-shell/super-admin-bar";
import { PRODUCT_MARK, type WorkspaceMarkProps } from "@/components/app-shell/workspace-mark";
import { BrandStyle } from "@/components/brand/brand-style";
import { DemoBanner } from "@/components/demo/demo-banner";
import { TourCard } from "@/components/tour/tour-card";
import { getFollowUpBoard } from "@/db/queries/deal-follow-up";
import { getVisibleOrganizations } from "@/db/queries/organizations";
import { countTasksDueNow } from "@/db/queries/tasks";
import { getWorkspace } from "@/lib/brand/workspace";
import { navigationHrefs } from "@/lib/display/resolve";
import { getPreferences, PREF, preferenceList } from "@/db/queries/preferences";
import { requireSessionUser, requireUser } from "@/lib/session";
import { getUserLocaleChoice } from "@/db/queries/users";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { parseTourState, TOUR_COOKIE } from "@/lib/tour/steps";
import { DemoStaleVisitNotice } from "@/components/demo/demo-stale-visit";
import { DEMO_COOKIE } from "@/lib/demo/public";

/**
 * Coquille commune à tous les écrans internes. Le groupe de routes `(app)`
 * ne change aucune URL (`/dashboard` reste `/dashboard`) : il sert
 * uniquement à ce que ces écrans-là partagent une navigation et un en-tête,
 * et à ce que les écrans publics — `/partage/[token]`, `/login` — n'en
 * héritent surtout pas.
 *
 * Deux identités cohabitent ici : l'utilisateur de SESSION (qui est
 * vraiment connecté — le menu de compte et le bandeau super admin en
 * dépendent) et l'utilisateur EFFECTIF (dans quelle organisation il
 * travaille — tout le reste en dépend). Pour un utilisateur normal, ce sont
 * les mêmes.
 *
 * La marque (chantier marque blanche, étape 3) : l'espace de travail porte
 * celle de l'organisation — ses jetons dérivés posés sur le document
 * (`BrandStyle`), son logo dans la navigation, son nom et son icône dans
 * l'onglet. Sans organisation (vue globale super admin), tout reste
 * Clozado : l'espace gestionnaire n'est pas un espace client. La connexion,
 * hors de ce groupe de routes, n'en hérite pas.
 */
export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getWorkspace();
  if (!workspace) return {};
  const { brand } = workspace;
  return {
    title: { default: brand.name, template: `%s — ${brand.name}` },
    ...(brand.logo.icon ? { icons: { icon: [{ url: brand.logo.icon, type: "image/png", sizes: "128x128" }] } } : {}),
  };
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const sessionUser = await requireSessionUser();
  const user = await requireUser();
  const isSuperAdmin = sessionUser.role === "super_admin";
  const hasOrganization = Boolean(user.organizationId);
  // Un visiteur de la démo publique : bandeau dédié, pas de réglages, pas de menu « Nouveau » (docs/module-demo.md §1.4).
  const readOnly = sessionUser.readOnly;

  // Les compteurs de la barre latérale partent EN MÊME TEMPS que la marque, les organisations et la langue (performance,
  // 2026-09-17) : ils ne dépendent que de l'utilisateur effectif. Ils ne sont LUS que si l'organisation existe (comme
  // avant) ; sinon la promesse est abandonnée — le `catch` vide évite qu'un rejet jamais lu remonte au processus.
  const badges = hasOrganization ? Promise.all([getFollowUpBoard(user), countTasksDueNow(user)]) : null;
  badges?.catch(() => undefined);
  const [workspace, allOrganizations, localeChoice, cookieStore, hrefs, preferences] = await Promise.all([
    getWorkspace(),
    isSuperAdmin ? getVisibleOrganizations(sessionUser) : Promise.resolve([]),
    getUserLocaleChoice(sessionUser.id),
    cookies(),
    // Les liens de la navigation mènent à l'écran TEL QU'ON L'A LAISSÉ (lot 1) : une lecture, en même temps que le reste.
    hasOrganization ? navigationHrefs(user) : Promise.resolve({}),
    // L'épingle et les favoris de la barre (lot 4) — la même lecture que le reste de l'affichage, mémoïsée par requête.
    getPreferences(user),
  ]);
  const navPinned = preferences.get(PREF.navPinned) === true;
  const navFavorites = preferenceList(preferences, PREF.navFavorites) ?? [];
  // La visite guidée (docs/module-demo.md §1.8) : son état vit dans un cookie par navigateur, lu ici pour rendre le bon pas sans clignotement.
  const tourState = parseTourState(cookieStore.get(TOUR_COOKIE)?.value);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  // Le cookie de visite est là mais ne vaut plus rien (interrupteur éteint, démo réinitialisée) : le proxy refuse
  // encore les écritures tant qu'il existe — on le dit, avec la sortie, plutôt que de laisser un vrai utilisateur bloqué.
  const staleVisit = !readOnly && cookieStore.has(DEMO_COOKIE);
  const org = workspace?.organization ?? null;
  const mark: WorkspaceMarkProps = workspace ? { logo: workspace.brand.logo.light, name: workspace.brand.name } : PRODUCT_MARK;

  // Les compteurs de la barre latérale. Sur /suivi et le tableau de bord, la page demande le même tableau : il n'est
  // calculé qu'une fois par requête (`getFollowUpBoard` est mémoïsé) — voir « ce qu'il reste à traiter » depuis
  // n'importe quel écran ne coûte plus une seconde lecture.
  const [board, tasksDue] = badges && org ? await badges : [null, 0];
  const followUp = board
    ? board.pendingAlerts.length + board.acceptedStale.length + board.unpaidCommissions.length
    : 0;

  /**
   * La valeur de DÉPART du décalage du haut, pour que le premier rendu soit déjà juste : l'en-tête, plus le
   * bandeau du super admin s'il est là. `ShellOffset` prend ensuite le relais avec la hauteur mesurée. Posée
   * dans une feuille de style et non en ligne : un style en ligne gagnerait contre la mesure.
   */
  // eslint-disable-next-line local/no-visible-text -- une déclaration CSS, pas du texte lu par quelqu'un
  const shellTopCss = `:root{--shell-top:${isSuperAdmin ? "5.75rem" : "3.5rem"}}`;

  return (
    <>
      {workspace && <BrandStyle light={workspace.brand.light} dark={workspace.brand.dark} />}
      {/* La barre latérale commence SOUS le bloc collant du haut (en-tête + bandeaux) : une seule variable,
          mesurée sur la vraie hauteur. La valeur posée ici en ligne est celle du rendu serveur — 3,5 rem
          d'en-tête, plus le bandeau du super admin s'il est là : aucun saut avant que la mesure prenne le relais. */}
      <style>{shellTopCss}</style>
      <div className="flex min-h-screen">
        <Sidebar mark={mark} hasOrganization={hasOrganization} readOnly={readOnly} isSuperAdmin={isSuperAdmin} badges={{ followUp, tasksDue }} hrefs={hrefs} pinned={navPinned} favorites={navFavorites} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Le bloc COLLANT du haut, mesuré d'un bloc : en-tête, bandeaux de démo, bandeau super admin. */}
          <div id="shell-top" className="md:sticky md:top-0 md:z-40">
          <AppHeader
            mark={mark}
            // Le nom de l'organisation, UNE fois (lot 4) : ici pour tout le monde — sauf pour un super admin,
            // dont le bandeau porte déjà le nom dans son sélecteur.
            organizationName={isSuperAdmin ? null : (org?.name ?? null)}
            hasOrganization={hasOrganization}
            readOnly={readOnly}
            isSuperAdmin={isSuperAdmin}
            badges={{ followUp, tasksDue }}
            hrefs={hrefs}
            user={{ name: sessionUser.name ?? null, email: sessionUser.email ?? null, localeChoice, theme }}
          />
          {readOnly && <DemoBanner personaName={sessionUser.name} />}
          {staleVisit && <DemoStaleVisitNotice />}
          {isSuperAdmin && (
            <SuperAdminBar
              organizations={allOrganizations.map((o) => ({ id: o.id, name: o.name, slug: o.slug }))}
              activeOrgId={user.organizationId}
            />
          )}
          </div>
          <ShellOffset targetId="shell-top" />
          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-6 pb-24 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>
      {/* Les petits écrans : la barre d'onglets en bas (chantier UI/UX) ; `pb-24` sur le contenu lui laisse la place. */}
      <BottomNav mark={mark} hasOrganization={hasOrganization} readOnly={readOnly} isSuperAdmin={isSuperAdmin} badges={{ followUp, tasksDue }} hrefs={hrefs} />
      {/* Les retours d'action (`?erreur=`, `?info=`) en notification, l'adresse nettoyée — lit les paramètres d'URL, d'où Suspense. */}
      <Suspense fallback={null}>
        <FlashToaster />
      </Suspense>
      {/* L'état d'affichage de l'écran, mémorisé après la navigation (lot 1) — lit l'adresse, d'où Suspense. */}
      {hasOrganization && !readOnly && (
        <Suspense fallback={null}>
          <RememberDisplay />
        </Suspense>
      )}
      {hasOrganization && (
        <Suspense fallback={null}>
          <TourCard initialState={tourState} />
        </Suspense>
      )}
    </>
  );
}
