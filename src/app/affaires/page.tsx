import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Retour au tableau de bord
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Affaires</h1>
      </div>

      {types.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Configure au moins un type d&apos;affaire</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
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
        <Card>
          <CardHeader>
            <CardTitle>Nouvelle affaire</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addDeal} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="title">Libellé</Label>
                  <Input id="title" name="title" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="clientName">Client concerné</Label>
                  <Input id="clientName" name="clientName" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="typeId">Type</Label>
                  <Select name="typeId">
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
                Créer
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{deals.length} affaire{deals.length > 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {deals.map(({ deal, typeLabel, statusLabel, statusColor }) => (
              <li
                key={deal.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{deal.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {typeLabel} · {deal.clientName}
                    {deal.estimatedAmount && ` · ≈ ${formatEuros(deal.estimatedAmount)}`}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  style={statusColor ? { borderColor: statusColor, color: statusColor } : undefined}
                >
                  {statusLabel}
                </Badge>
              </li>
            ))}
            {deals.length === 0 && (
              <li className="text-sm text-muted-foreground">Aucune affaire pour l&apos;instant.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
