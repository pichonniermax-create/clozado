import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { SectionHeading } from "@/components/ui/section-heading";
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
import { getTranslations } from "next-intl/server";

export default async function TargetsPage() {
  const tr = await getTranslations("targets.list");
  const tt = await getTranslations("targets");
  const tm = await getTranslations("metrics");
  const ttpl = await getTranslations("templates");
  const user = await requireUser();

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title={tr("cibles")} description={tr("description")} />
        <EmptyState>
          {tr("tu_es_en_vue_globale_choisis_599b")}
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
  const packLabel = tr("creer_les_cibles_du_metier", { count: proposals.length, label: tm(`packs.${pack.key}.label`) });

  return (
    <>
      <PageHeader
        tour="cibles"
        title={tr("cibles")}
        description={tr("description")}
        actions={
          <Link href="/cibles/new" className={buttonVariants()}>
            <Plus />
            {tr("nouvelle_cible")}
          </Link>
        }
      />


      {active.length === 0 ? (
        <EmptyState
          title={tr("aucune_cible_pour_l_instant")}
          action={
            <>
              {proposals.length > 0 && (
                <form action={createPackTargetsAction}>
                  {/* Un libellé long (« Créer les 5 cibles du pack “Tout métier” ») : le bouton se replie au lieu de déborder à 390 px (chantier C, correctif 5). */}
                  <Button type="submit" className="h-auto min-h-9 whitespace-normal text-center">
                    {packLabel}
                  </Button>
                </form>
              )}
              <Link href="/cibles/new" className={buttonVariants({ variant: "outline" })}>
                {tr("creer_une_cible_a_la_main")}
              </Link>
            </>
          }
        >
          {tr("une_cible_c_est_un_segment_d9ec", { count: proposals.length })}
          {!chosen && (
            <>
              {" "}
              {tr.rich("aucun_pack_metier_n_est_choisi_f16a", { link: (chunks) => <Link href="/settings#pack-metier" className="underline underline-offset-2">{chunks}</Link> })}
            </>
          )}
        </EmptyState>
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeading title={tr("cibles_actives")} count={active.length} />
          <ListCard>
            {active.map((t) => {
              const n = counts.get(t.id) ?? 0;
              const missing = missingIdentityFacets(t);
              // Le nombre seul sous sm (le mot reste lu par le lecteur d'écran) : « 27 contacts » tronquait les critères, la seule chose qui distingue deux cibles.
              return (
                <ListRowLink
                  key={t.id}
                  href={`/cibles/${t.id}`}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {t.label}
                      {t.kind === "static" && <Badge variant="secondary">{tr("selection_manuelle")}</Badge>}
                      {missing.length > 0 && <Badge variant="outline">{tr("identite_a_completer")}</Badge>}
                    </span>
                  }
                  subtitle={describeTarget(t, options, tt).join(" · ")}
                  trailing={
                    <span className="text-sm font-medium tabular-nums">
                      {n}
                      <span className="ml-1 font-normal text-muted-foreground max-sm:sr-only">{tr("contacts_mot", { n })}</span>
                    </span>
                  }
                />
              );
            })}
          </ListCard>
        </section>
      )}

      {/* Une proposition de CRÉATION, pas une archive : le ton « + », pas le chevron gris. */}
      {active.length > 0 && proposals.length > 0 && (
        <DetailsCard variant="create" summary={tr("cibles_proposees_par_ton_metier", { label: tm(`packs.${pack.key}.label`), count: proposals.length })}>
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1.5 text-sm">
              {proposals.map((p) => (
                <li key={p.slug}>
                  <span className="font-medium">{ttpl(`targets.${p.slug}.label`)}</span>
                  <span className="text-muted-foreground"> — {ttpl(`targets.${p.slug}.description`)}</span>
                </li>
              ))}
            </ul>
            {!chosen && (
              <p className="text-xs text-muted-foreground">
                {tr.rich("aucun_pack_metier_n_est_choisi_f147", { link: (chunks) => <Link href="/settings#pack-metier" className="underline underline-offset-2">{chunks}</Link> })}
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
        <DetailsCard variant="archive" summary={tr("cibles_desactivees", { count: archived.length })} flush>
          <ul className="divide-y divide-border">
            {archived.map((t) => (
              <ListRowLink
                key={t.id}
                href={`/cibles/${t.id}`}
                title={t.label}
                subtitle={describeTarget(t, options, tt).join(" · ")}
              />
            ))}
          </ul>
        </DetailsCard>
      )}
    </>
  );
}
