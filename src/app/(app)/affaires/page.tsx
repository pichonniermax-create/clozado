import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DealStatusBadge } from "@/components/deals/deal-status-badge";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listDealTypes } from "@/db/queries/deal-types";
import { listDeals } from "@/db/queries/deals";
import { createDealAction, createDealTypeAction } from "@/lib/deals/actions";
import { formatEuros } from "@/lib/format";
import { requireUser } from "@/lib/session";

async function addDealType(formData: FormData) {
  "use server";
  const label = String(formData.get("typeLabel") ?? "").trim();
  if (!label) return;
  await createDealTypeAction(label);
  redirect("/affaires");
}

async function addDeal(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const typeId = String(formData.get("typeId") ?? "").trim();
  if (!title || !clientName || !typeId) return;

  const rawAmount = String(formData.get("estimatedAmount") ?? "").trim();

  await createDealAction({
    title,
    clientName,
    typeId,
    estimatedAmount: rawAmount || null,
    description: String(formData.get("description") ?? "").trim() || null,
  });

  redirect("/affaires");
}

export default async function DealsPage() {
  const user = await requireUser();
  const [deals, types] = await Promise.all([listDeals(user), listDealTypes(user)]);

  return (
    <>
      <PageHeader
        title="Affaires"
        description="Les dossiers que tu suis, et que tu peux partager à un confrère."
      />

      {types.length === 0 ? (
        // Sans type d'affaire, rien n'est créable : c'est le seul écran où
        // la configuration passe devant la liste, parce qu'elle la bloque.
        <Card>
          <CardHeader>
            <CardTitle>Configure au moins un type d&apos;affaire</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Ton organisation n&apos;a pas encore de type d&apos;affaire (ex : « Crédit
              immobilier », « Assurance-vie »). Il en faut au moins un pour créer une affaire —
              tu pourras en ajouter d&apos;autres ensuite.
            </p>
            <form action={addDealType} className="flex items-end gap-2">
              <Field label="Nom du type" htmlFor="typeLabel" className="flex-1">
                <Input id="typeLabel" name="typeLabel" required />
              </Field>
              <Button type="submit">Ajouter</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        /* Repliée par défaut : on vient sur cet écran pour consulter la
           liste bien plus souvent que pour créer. */
        <DetailsCard summary="Nouvelle affaire">
          <form action={addDeal} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Libellé" htmlFor="title">
                <Input id="title" name="title" placeholder="Financement appartement Lyon" required />
              </Field>
              <Field label="Client concerné" htmlFor="clientName">
                <Input id="clientName" name="clientName" placeholder="M. et Mme Perrin" required />
              </Field>
              <Field label="Type" htmlFor="typeId">
                <Select
                  name="typeId"
                  // Voir la note dans partner-share-view.tsx : sans `items`,
                  // le déclencheur affiche l'UUID au lieu du libellé.
                  items={types.map((t) => ({ label: t.label, value: t.id }))}
                >
                  <SelectTrigger id="typeId" className="w-full">
                    <SelectValue placeholder="Choisir un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Montant estimé (€)" htmlFor="estimatedAmount">
                <Input id="estimatedAmount" name="estimatedAmount" type="number" min="0" />
              </Field>
            </div>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" className="min-h-16" />
            </Field>
            <Button type="submit" className="w-fit">
              Créer l&apos;affaire
            </Button>
          </form>
        </DetailsCard>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {deals.length} affaire{deals.length > 1 ? "s" : ""}
        </h2>

        {deals.length === 0 ? (
          <EmptyState>Aucune affaire pour l&apos;instant.</EmptyState>
        ) : (
          <ListCard>
            {deals.map(({ deal, typeLabel, statusLabel, statusColor }) => (
              <ListRowLink
                key={deal.id}
                href={`/affaires/${deal.id}`}
                title={deal.title}
                subtitle={
                  <>
                    {typeLabel} · {deal.clientName}
                    {deal.estimatedAmount && ` · ≈ ${formatEuros(deal.estimatedAmount)}`}
                  </>
                }
                trailing={<DealStatusBadge label={statusLabel} color={statusColor} />}
              />
            ))}
          </ListCard>
        )}
      </section>
    </>
  );
}
