import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { ShareStatusBadge } from "@/components/deal-shares/share-status-badge";
import { Textarea } from "@/components/ui/textarea";
import { getPartner } from "@/db/queries/partners";
import { listDealSharesForPartner } from "@/db/queries/deal-shares";
import { updatePartnerAction } from "@/lib/deals/actions";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";

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
    <>
      <PageHeader
        title={partner.name}
        description={[partner.profession, partner.company].filter(Boolean).join(" · ") || undefined}
        backTo={{ href: "/partenaires", label: "Partenaires" }}
        actions={!partner.active ? <Badge variant="secondary">Inactif</Badge> : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>Fiche</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={savePartner} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nom" htmlFor="name">
                <Input id="name" name="name" defaultValue={partner.name} required />
              </Field>
              <Field label="Société" htmlFor="company">
                <Input id="company" name="company" defaultValue={partner.company ?? ""} />
              </Field>
              <Field label="Métier" htmlFor="profession">
                <Input id="profession" name="profession" defaultValue={partner.profession ?? ""} />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" defaultValue={partner.email ?? ""} />
              </Field>
              <Field label="Téléphone" htmlFor="phone">
                <Input id="phone" name="phone" defaultValue={partner.phone ?? ""} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="notes">
              <Textarea
                id="notes"
                name="notes"
                defaultValue={partner.notes ?? ""}
                className="min-h-16"
              />
            </Field>
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

      {/* Même motif que partout ailleurs (liste en carte sous un titre de
          section) — l'historique n'a pas de raison d'être « en carte dans
          une carte » alors que la même liste vit nue sur les autres écrans. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Affaires partagées</h2>
        {history.length === 0 ? (
          <EmptyState>Aucune affaire partagée avec ce partenaire pour l&apos;instant.</EmptyState>
        ) : (
          <ListCard>
            {history.map(({ share, deal }) => (
              <ListRowLink
                key={share.id}
                href={`/affaires/${deal.id}`}
                title={deal.title}
                subtitle={`Envoyée le ${formatDate(share.sentAt)}`}
                trailing={<ShareStatusBadge status={share.status} />}
                chevron={false}
              />
            ))}
          </ListCard>
        )}
      </section>
    </>
  );
}
