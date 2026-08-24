import Link from "next/link";
import { Route } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRow, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  listDealsWithoutOriginButLeads,
  listOrigins,
  listUnmatchedOrigins,
} from "@/db/queries/acquisition";
import { attachOriginAction, createOriginAction } from "@/lib/acquisition/actions";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";

/**
 * Le rapprochement des origines : la liste configurée par l'organisation,
 * le débordement libre à rattacher (rétroactivement), et les affaires sans
 * origine dont le contact a pourtant un lead — le cas « créée à la main,
 * lead identifié après coup », qui ne se rattache qu'à la main.
 */
export default async function OriginsPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const user = await requireUser();
  const { erreur } = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title="Origines" description="D'où viennent les leads — et lesquels signent." />
        <EmptyState title="Tu es en vue globale">
          Choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir ses origines.
        </EmptyState>
      </>
    );
  }

  const [origins, unmatched, orphanDeals] = await Promise.all([
    listOrigins(user),
    listUnmatchedOrigins(user),
    listDealsWithoutOriginButLeads(user),
  ]);

  return (
    <>
      <PageHeader
        title="Origines"
        description="Une origine = un simulateur, une page, une campagne. Les leads et les visites qui arrivent avec un texte inconnu attendent ici d'être rattachés — le rattachement s'applique à tout l'historique."
      />

      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">À rapprocher{unmatched.length > 0 && ` (${unmatched.length})`}</h2>
        {unmatched.length === 0 ? (
          <EmptyState icon={<Route />} title="Rien à rapprocher">
            Tout ce qui est arrivé porte une origine connue — ou rien n&apos;est encore arrivé. Les textes
            inconnus envoyés par tes sites et simulateurs apparaîtront ici.
          </EmptyState>
        ) : (
          <ListCard>
            {unmatched.map((u) => (
              <li key={u.raw} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">« {u.raw} »</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {u.leads} lead{u.leads > 1 ? "s" : ""} · {u.events} visite{u.events > 1 ? "s" : ""}/simulation
                    {u.events > 1 ? "s" : ""} · dernier le {formatDateTime(u.lastSeenAt)}
                  </span>
                </div>
                <form action={attachOriginAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="raw" value={u.raw} />
                  {origins.length > 0 && (
                    <Field label="Origine existante" htmlFor={`origin-${u.raw}`}>
                      <select id={`origin-${u.raw}`} name="originId" defaultValue="" className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                        <option value="">— choisir —</option>
                        {origins.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label={origins.length > 0 ? "…ou nouvelle origine" : "Nouvelle origine"} htmlFor={`new-${u.raw}`}>
                    <Input id={`new-${u.raw}`} name="newLabel" placeholder={u.raw} className="w-56" />
                  </Field>
                  <Button type="submit" variant="outline">Rattacher</Button>
                </form>
              </li>
            ))}
          </ListCard>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Origines configurées{origins.length > 0 && ` (${origins.length})`}</h2>
        {origins.length === 0 ? (
          <EmptyState title="Aucune origine configurée">
            Crée les origines que tu veux suivre — les textes reçus qui portent exactement ce libellé s&apos;y rattachent
            tout seuls, les autres passent par « À rapprocher ».
          </EmptyState>
        ) : (
          <ListCard>
            {origins.map((o) => (
              <ListRow key={o.id}>
                <span className="text-sm font-medium">{o.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">créée le {formatDate(o.createdAt)}</span>
              </ListRow>
            ))}
          </ListCard>
        )}
        <form action={createOriginAction} className="flex flex-wrap items-end gap-2">
          <Field label="Nouvelle origine" htmlFor="new-origin" className="w-72">
            <Input id="new-origin" name="label" required placeholder="Simulateur crédit" />
          </Field>
          <Button type="submit" variant="outline">Ajouter</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          Affaires sans origine chez des contacts qui ont un lead{orphanDeals.length > 0 && ` (${orphanDeals.length})`}
        </h2>
        <p className="-mt-1 text-xs text-muted-foreground">
          Une affaire créée avant l&apos;arrivée du lead ne se rattache jamais toute seule : c&apos;est un geste sur la fiche de l&apos;affaire, journalisé.
        </p>
        {orphanDeals.length === 0 ? (
          <EmptyState>Aucune — chaque affaire d&apos;un contact venu par un lead porte son origine.</EmptyState>
        ) : (
          <ListCard>
            {orphanDeals.map((d) => (
              <ListRowLink
                key={d.dealId}
                href={`/affaires/${d.dealId}`}
                title={d.title}
                subtitle={`${d.contactName} · ${d.leadCount} lead${d.leadCount > 1 ? "s" : ""} · créée le ${formatDate(d.createdAt)}`}
                trailing={<span className={buttonVariants({ variant: "ghost", size: "sm" })}>Rattacher</span>}
                chevron={false}
              />
            ))}
          </ListCard>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Les clés et les domaines de collecte se règlent dans{" "}
        <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">Marque &amp; réglages</Link>.
      </p>
    </>
  );
}
