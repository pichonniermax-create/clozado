import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { AppHeader } from "@/components/app-shell/app-header";
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
import { requireSessionUser, requireUser } from "@/lib/session";
import { getUserLocaleChoice } from "@/db/queries/users";
import { parseTourState, TOUR_COOKIE } from "@/lib/tour/steps";

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

  const [workspace, allOrganizations, localeChoice, cookieStore] = await Promise.all([
    getWorkspace(),
    isSuperAdmin ? getVisibleOrganizations(sessionUser) : Promise.resolve([]),
    getUserLocaleChoice(sessionUser.id),
    cookies(),
  ]);
  // La visite guidée (docs/module-demo.md §1.8) : son état vit dans un cookie par navigateur, lu ici pour rendre le bon pas sans clignotement.
  const tourState = parseTourState(cookieStore.get(TOUR_COOKIE)?.value);
  const org = workspace?.organization ?? null;
  const mark: WorkspaceMarkProps = workspace ? { logo: workspace.brand.logo.light, name: workspace.brand.name } : PRODUCT_MARK;

  // Les compteurs de la barre latérale. Sur /suivi, le tableau est donc
  // calculé deux fois pour une même requête (ici et dans la page) : c'est
  // assumé — trois requêtes indexées sur de petites tables, contre le fait
  // de voir « ce qu'il reste à traiter » depuis n'importe quel écran. À
  // revoir si ces tables grossissent vraiment.
  const [board, tasksDue] =
    hasOrganization && org
      ? await Promise.all([getFollowUpBoard(user), countTasksDueNow(user)])
      : [null, 0];
  const followUp = board
    ? board.pendingAlerts.length + board.acceptedStale.length + board.unpaidCommissions.length
    : 0;

  return (
    <>
      {workspace && <BrandStyle light={workspace.brand.light} dark={workspace.brand.dark} />}
      <div className="flex min-h-screen">
        <Sidebar mark={mark} hasOrganization={hasOrganization} readOnly={readOnly} badges={{ followUp, tasksDue }} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            mark={mark}
            organizationName={org?.name ?? null}
            hasOrganization={hasOrganization}
            readOnly={readOnly}
            badges={{ followUp, tasksDue }}
            user={{ name: sessionUser.name ?? null, email: sessionUser.email ?? null, localeChoice }}
          />
          {readOnly && <DemoBanner personaName={sessionUser.name} />}
          {isSuperAdmin && (
            <SuperAdminBar
              organizations={allOrganizations.map((o) => ({ id: o.id, name: o.name, slug: o.slug }))}
              activeOrgId={user.organizationId}
            />
          )}
          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>
      {hasOrganization && (
        <Suspense fallback={null}>
          <TourCard initialState={tourState} />
        </Suspense>
      )}
    </>
  );
}
