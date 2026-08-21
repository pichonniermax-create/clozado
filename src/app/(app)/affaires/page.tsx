import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatEuros } from "@/lib/deal-shares/format";
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
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="typeLabel">Nom du type</Label>
                <Input id="typeLabel" name="typeLabel" required />
              </div>
              <Button type="submit">Ajouter</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        /* Repliée par défaut : on vient sur cet écran pour consulter la
           liste bien plus souvent que pour créer. Un <details> natif — pas
           de JS, pas d'état client à synchroniser. */
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium transition-colors hover:text-primary">
            <Plus className="size-4 transition-transform group-open:rotate-45" />
            Nouvelle affaire
          </summary>
          <div className="border-t border-border p-4">
            <form action={addDeal} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="title">Libellé</Label>
                  <Input id="title" name="title" placeholder="Financement appartement Lyon" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="clientName">Client concerné</Label>
                  <Input id="clientName" name="clientName" placeholder="M. et Mme Perrin" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="typeId">Type</Label>
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
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="estimatedAmount">Montant estimé (€)</Label>
                  <Input id="estimatedAmount" name="estimatedAmount" type="number" min="0" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" className="min-h-16" />
              </div>
              <Button type="submit" className="w-fit">
                Créer l&apos;affaire
              </Button>
            </form>
          </div>
        </details>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {deals.length} affaire{deals.length > 1 ? "s" : ""}
        </h2>

        {deals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Aucune affaire pour l&apos;instant.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {deals.map(({ deal, typeLabel, statusLabel, statusColor }) => (
              <li key={deal.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/affaires/${deal.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{deal.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {typeLabel} · {deal.clientName}
                      {deal.estimatedAmount && ` · ≈ ${formatEuros(deal.estimatedAmount)}`}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      style={
                        statusColor ? { borderColor: statusColor, color: statusColor } : undefined
                      }
                    >
                      {statusLabel}
                    </Badge>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
