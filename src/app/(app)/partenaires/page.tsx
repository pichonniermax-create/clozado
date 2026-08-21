import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app-shell/page-header";
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
  const active = partners.filter((p) => p.active);
  const inactive = partners.filter((p) => !p.active);

  return (
    <>
      <PageHeader
        title="Partenaires"
        description="Les confrères vers qui tu partages des affaires — ce ne sont pas des comptes du produit, ils n'ont rien à installer."
      />

      <details className="group rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium transition-colors hover:text-primary">
          <Plus className="size-4 transition-transform group-open:rotate-45" />
          Ajouter un partenaire
        </summary>
        <div className="border-t border-border p-4">
          <form action={addPartner} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Nom</Label>
                <Input id="name" name="name" placeholder="Camille Rousseau" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company">Société</Label>
                <Input id="company" name="company" placeholder="Rousseau Patrimoine" />
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
              Ajouter le partenaire
            </Button>
          </form>
        </div>
      </details>

      <PartnerList
        title={`${active.length} partenaire${active.length > 1 ? "s" : ""} actif${active.length > 1 ? "s" : ""}`}
        partners={active}
        empty="Aucun partenaire actif pour l'instant."
      />

      {/* Les partenaires se désactivent, ne se suppriment pas — cohérent
          avec un journal qui n'efface jamais son historique. Ils restent
          donc visibles, mais rangés à part. */}
      {inactive.length > 0 && (
        <PartnerList
          title={`${inactive.length} inactif${inactive.length > 1 ? "s" : ""}`}
          partners={inactive}
          empty=""
        />
      )}
    </>
  );
}

function PartnerList({
  title,
  partners,
  empty,
}: {
  title: string;
  partners: Awaited<ReturnType<typeof listPartners>>;
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {partners.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {partners.map((p) => (
            <li key={p.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/partenaires/${p.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[p.profession, p.company].filter(Boolean).join(" · ") || "—"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!p.active && <Badge variant="secondary">Inactif</Badge>}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
