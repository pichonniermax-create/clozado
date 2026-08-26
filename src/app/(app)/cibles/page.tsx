import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  countMembersByTarget,
  describeTarget,
  listMailTargets,
  loadCriteriaOptions,
  missingPackTargets,
} from "@/db/queries/mail-targets";
import { getOwnOrganization } from "@/db/queries/organizations";
import { resolveBusinessPack } from "@/lib/metrics/packs";
import { requireUser } from "@/lib/session";
import { createPackTargetsAction } from "@/lib/targets/actions";
import { missingIdentityFacets } from "@/lib/targets/criteria";

const DESCRIPTION =
  "À qui tu écris : des segments vivants de ta base de contacts, recalculés à chaque consultation, chacun avec son identité éditoriale.";

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; info?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title="Cibles" description={DESCRIPTION} />
        <EmptyState>
          Tu es en vue globale : choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir
          ses cibles.
        </EmptyState>
      </>
    );
  }

  const [targets, org] = await Promise.all([
    listMailTargets(user, { includeArchived: true }),
    getOwnOrganization(user),
  ]);
  const active = targets.filter((t) => !t.archivedAt);
  const archived = targets.filter((t) => t.archivedAt);
  const [counts, options] = await Promise.all([countMembersByTarget(active), loadCriteriaOptions(user.organizationId)]);
  const { pack, chosen } = resolveBusinessPack(org?.businessPack);
  const proposals = missingPackTargets(pack, targets);
  const packLabel = `Créer les ${proposals.length} cibles du métier « ${pack.label} »`;

  return (
    <>
      <PageHeader
        title="Cibles"
        description={DESCRIPTION}
        actions={
          <Link href="/cibles/new" className={buttonVariants()}>
            <Plus />
            Nouvelle cible
          </Link>
        }
      />

      {params.erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{params.erreur}</p>
      )}
      {params.info && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{params.info}</p>}

      {active.length === 0 ? (
        <EmptyState
          title="Aucune cible pour l'instant"
          action={
            <>
              {proposals.length > 0 && (
                <form action={createPackTargetsAction}>
                  <Button type="submit">{packLabel}</Button>
                </form>
              )}
              <Link href="/cibles/new" className={buttonVariants({ variant: "outline" })}>
                Créer une cible à la main
              </Link>
            </>
          }
        >
          Une cible, c&apos;est un segment de tes contacts (étiquettes, ville, affaires en cours…) et l&apos;identité de
          la personne à qui on écrit. Ton métier en propose {proposals.length} pour commencer — chacune se modifie ensuite.
          {!chosen && (
            <>
              {" "}
              Aucun pack métier n&apos;est choisi : ce sont les cibles « Tout métier ».{" "}
              <Link href="/settings#pack-metier" className="underline underline-offset-2">
                Choisir mon métier
              </Link>
              .
            </>
          )}
        </EmptyState>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tabular-nums">
            {active.length} cible{active.length > 1 ? "s" : ""} active{active.length > 1 ? "s" : ""}
          </h2>
          <ListCard>
            {active.map((t) => {
              const n = counts.get(t.id) ?? 0;
              const missing = missingIdentityFacets(t);
              return (
                <ListRowLink
                  key={t.id}
                  href={`/cibles/${t.id}`}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {t.label}
                      {t.kind === "static" && <Badge variant="secondary">Sélection manuelle</Badge>}
                      {missing.length > 0 && <Badge variant="outline">Identité à compléter</Badge>}
                    </span>
                  }
                  subtitle={describeTarget(t, options).join(" · ")}
                  trailing={
                    <span className="text-sm font-medium tabular-nums">
                      {n} contact{n > 1 ? "s" : ""}
                    </span>
                  }
                />
              );
            })}
          </ListCard>
        </section>
      )}

      {active.length > 0 && proposals.length > 0 && (
        <DetailsCard variant="archive" summary={`Cibles proposées par ton métier — ${pack.label} (${proposals.length})`}>
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1.5 text-sm">
              {proposals.map((p) => (
                <li key={p.slug}>
                  <span className="font-medium">{p.label}</span>
                  <span className="text-muted-foreground"> — {p.description}</span>
                </li>
              ))}
            </ul>
            {!chosen && (
              <p className="text-xs text-muted-foreground">
                Aucun pack métier n&apos;est choisi : ce sont les cibles « Tout métier ».{" "}
                <Link href="/settings#pack-metier" className="underline underline-offset-2">
                  Choisir mon métier
                </Link>{" "}
                donne des cibles plus justes.
              </p>
            )}
            <form action={createPackTargetsAction}>
              <Button type="submit" variant="outline">
                {packLabel}
              </Button>
            </form>
          </div>
        </DetailsCard>
      )}

      {archived.length > 0 && (
        <DetailsCard variant="archive" summary={`Cibles désactivées (${archived.length})`} flush>
          <ul className="divide-y divide-border">
            {archived.map((t) => (
              <ListRowLink
                key={t.id}
                href={`/cibles/${t.id}`}
                title={t.label}
                subtitle={describeTarget(t, options).join(" · ")}
              />
            ))}
          </ul>
        </DetailsCard>
      )}
    </>
  );
}
