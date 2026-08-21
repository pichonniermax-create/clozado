import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPartner } from "@/db/queries/partners";
import { listDealSharesForPartner } from "@/db/queries/deal-shares";
import { updatePartnerAction } from "@/lib/deals/actions";
import { formatDate } from "@/lib/deal-shares/format";
import { requireUser } from "@/lib/session";

const SHARE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  declined: "Refusée",
  revoked: "Révoquée",
};

export default async function PartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const partner = await getPartner(user, id).catch(() => null);
  if (!partner) notFound();

  const history = await listDealSharesForPartner(user, id);

  async function savePartner(formData: FormData) {
    "use server";
    // Pas de requireUser() ici : updatePartnerAction en fait déjà un
    // (src/lib/deals/actions.ts) — jamais deux vérifications qui pourraient diverger.
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;

    await updatePartnerAction(id, {
      name,
      company: String(formData.get("company") ?? "").trim() || null,
      profession: String(formData.get("profession") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      active: formData.get("active") === "on",
    });
    redirect(`/partenaires/${id}`);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div>
        <Link href="/partenaires" className="text-sm text-muted-foreground hover:underline">
          ← Retour aux partenaires
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{partner.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fiche</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={savePartner} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Nom</Label>
                <Input id="name" name="name" defaultValue={partner.name} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company">Société</Label>
                <Input id="company" name="company" defaultValue={partner.company ?? ""} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="profession">Métier</Label>
                <Input id="profession" name="profession" defaultValue={partner.profession ?? ""} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={partner.email ?? ""} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" name="phone" defaultValue={partner.phone ?? ""} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                defaultValue={partner.notes ?? ""}
                className="min-h-16"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={partner.active} />
              Partenaire actif
            </label>
            <Button type="submit" className="w-fit">
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Affaires partagées</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {history.map(({ share, deal }) => (
              <li
                key={share.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{deal.title}</span>
                  <span className="text-xs text-muted-foreground">
                    Envoyée le {formatDate(share.sentAt.toISOString())}
                  </span>
                </div>
                <Badge variant="secondary">
                  {SHARE_STATUS_LABELS[share.status] ?? share.status}
                </Badge>
              </li>
            ))}
            {history.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Aucune affaire partagée avec ce partenaire pour l&apos;instant.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
