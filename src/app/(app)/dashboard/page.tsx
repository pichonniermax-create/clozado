import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BellRing,
  Briefcase,
  PauseCircle,
  Plus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { StatTile } from "@/components/stat-tile";
import { buttonVariants } from "@/components/ui/button";
import { getFollowUpBoard } from "@/db/queries/deal-follow-up";
import { listDeals } from "@/db/queries/deals";
import { getOwnOrganization, getVisibleOrganizations } from "@/db/queries/organizations";
import { listPartners } from "@/db/queries/partners";
import { formatEuros } from "@/lib/deal-shares/format";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();

  // Le super_admin n'a pas d'organisation : aucun chiffre métier ne le
  // concerne, il voit la liste des organisations et rien d'autre.
  if (!user.organizationId) {
    const organizations = await getVisibleOrganizations(user);
    return (
      <>
        <PageHeader
          title="Organisations"
          description="Vue super admin — tu n'as pas d'organisation propre."
        />
        <ul className="flex flex-col gap-2">
          {organizations.map((org) => (
            <li
              key={org.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <span className="text-sm font-medium">{org.name}</span>
              <span className="text-xs text-muted-foreground">{org.slug}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const [org, board, deals, partners] = await Promise.all([
    getOwnOrganization(user),
    getFollowUpBoard(user),
    listDeals(user),
    listPartners(user),
  ]);

  const unpaidTotal = board.unpaidCommissions.reduce(
    (sum, c) => sum + (Number(c.computedAmount) || 0),
    0
  );
  const activePartners = partners.filter((p) => p.active).length;

  // Les trois piles d'action, remises bout à bout et tronquées : le tableau
  // de bord annonce ce qui attend, l'écran de suivi est celui où l'on
  // travaille. Pas de bouton d'action ici — un seul endroit pour agir.
  const priority = [
    ...board.pendingAlerts.map((row) => ({
      key: `p-${row.shareId}`,
      dealId: row.dealId,
      title: row.dealTitle,
      partner: row.partnerName,
      detail:
        row.daysUntilExpiry !== null && row.daysUntilExpiry <= board.thresholds.expiringSoonDays
          ? row.daysUntilExpiry <= 0
            ? "lien expiré"
            : `expire dans ${row.daysUntilExpiry} j`
          : `sans réponse depuis ${row.daysSinceSent} j`,
      critical: row.critical,
    })),
    ...board.acceptedStale.map((row) => ({
      key: `s-${row.shareId}`,
      dealId: row.dealId,
      title: row.dealTitle,
      partner: row.partnerName,
      detail: `acceptée, rien depuis ${row.daysSinceActivity} j`,
      critical: false,
    })),
  ].slice(0, 5);

  return (
    <>
      <PageHeader
        title={org?.name ?? "Tableau de bord"}
        description={`${deals.length} affaire${deals.length > 1 ? "s" : ""} · ${activePartners} partenaire${activePartners > 1 ? "s" : ""} actif${activePartners > 1 ? "s" : ""}`}
        actions={
          <>
            <Link href="/partenaires" className={buttonVariants({ variant: "outline" })}>
              <Users />
              Partenaires
            </Link>
            <Link href="/affaires" className={buttonVariants()}>
              <Plus />
              Nouvelle affaire
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="À relancer"
          value={board.pendingAlerts.length}
          hint="Partages sans réponse"
          icon={<BellRing />}
          tone="critical"
          href="/suivi"
        />
        <StatTile
          label="Sans suite"
          value={board.acceptedStale.length}
          hint="Acceptées, puis silence"
          icon={<PauseCircle />}
          tone="warning"
          href="/suivi"
        />
        <StatTile
          label="À encaisser"
          value={unpaidTotal > 0 ? (formatEuros(String(unpaidTotal)) ?? "—") : "—"}
          hint={`${board.unpaidCommissions.length} commission${board.unpaidCommissions.length > 1 ? "s" : ""} confirmée${board.unpaidCommissions.length > 1 ? "s" : ""}`}
          icon={<Banknote />}
          tone="success"
          href="/suivi"
        />
        <StatTile
          label="En cours"
          value={board.inProgress.length}
          hint="Partages actifs, rien à faire"
          icon={<Briefcase />}
          href="/affaires"
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">À traiter en priorité</h2>
          <Link
            href="/suivi"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Tout le suivi
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {priority.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Rien qui attende une relance. Tout est à jour.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {priority.map((row) => (
              <li key={row.key} className="border-b border-border last:border-b-0">
                <Link
                  href={`/affaires/${row.dealId}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{row.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{row.partner}</span>
                  </div>
                  <span
                    className={
                      row.critical
                        ? "shrink-0 text-xs font-medium text-destructive"
                        : "shrink-0 text-xs text-muted-foreground"
                    }
                  >
                    {row.detail}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
