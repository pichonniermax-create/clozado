import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
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

      <DetailsCard summary="Ajouter un partenaire">
        <form action={addPartner} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom" htmlFor="name">
              <Input id="name" name="name" placeholder="Camille Rousseau" required />
            </Field>
            <Field label="Société" htmlFor="company">
              <Input id="company" name="company" placeholder="Rousseau Patrimoine" />
            </Field>
            <Field label="Métier" htmlFor="profession">
              <Input id="profession" name="profession" placeholder="CGP, courtier crédit…" />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" />
            </Field>
            <Field label="Téléphone" htmlFor="phone">
              <Input id="phone" name="phone" />
            </Field>
          </div>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" className="min-h-16" />
          </Field>
          <Button type="submit" className="w-fit">
            Ajouter le partenaire
          </Button>
        </form>
      </DetailsCard>

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
        <EmptyState>{empty}</EmptyState>
      ) : (
        <ListCard>
          {partners.map((p) => (
            <ListRowLink
              key={p.id}
              href={`/partenaires/${p.id}`}
              title={p.name}
              subtitle={[p.profession, p.company].filter(Boolean).join(" · ") || "—"}
              trailing={!p.active ? <Badge variant="secondary">Inactif</Badge> : undefined}
            />
          ))}
        </ListCard>
      )}
    </section>
  );
}
