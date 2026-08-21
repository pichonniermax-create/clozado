import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listPartners } from "@/db/queries/partners";
import { createPartnerAction } from "@/lib/deals/actions";
import { requireUser } from "@/lib/session";

async function addPartner(formData: FormData) {
  "use server";
  await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await createPartnerAction({
    name,
    company: String(formData.get("company") ?? "").trim() || null,
    profession: String(formData.get("profession") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  redirect("/partenaires");
}

export default async function PartnersPage() {
  const user = await requireUser();
  const partners = await listPartners(user);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Retour au tableau de bord
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Partenaires</h1>
        <p className="text-sm text-muted-foreground">
          Les confrères vers qui tu partages des affaires — pas des comptes du produit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ajouter un partenaire</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={addPartner} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Nom</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company">Société</Label>
                <Input id="company" name="company" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="profession">Métier</Label>
                <Input id="profession" name="profession" placeholder="CGP, courtier crédit…" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" name="phone" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" className="min-h-16" />
            </div>
            <Button type="submit" className="w-fit">
              Ajouter
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{partners.length} partenaire{partners.length > 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {partners.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/partenaires/${p.id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[p.profession, p.company].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  {!p.active && <Badge variant="secondary">Inactif</Badge>}
                </Link>
              </li>
            ))}
            {partners.length === 0 && (
              <li className="text-sm text-muted-foreground">Aucun partenaire pour l&apos;instant.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
