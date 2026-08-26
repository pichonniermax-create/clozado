import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { getTranslations } from "next-intl/server";

export default async function PartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("partners.detail");
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
        backTo={{ href: "/partenaires", label: t("partenaires") }}
        actions={!partner.active ? <Badge variant="secondary">{t("inactif")}</Badge> : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("fiche")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={savePartner} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("nom")} htmlFor="name">
                <Input id="name" name="name" defaultValue={partner.name} required />
              </Field>
              <Field label={t("societe")} htmlFor="company">
                <Input id="company" name="company" defaultValue={partner.company ?? ""} />
              </Field>
              <Field label={t("metier")} htmlFor="profession">
                <Input id="profession" name="profession" defaultValue={partner.profession ?? ""} />
              </Field>
              <Field label={t("email")} htmlFor="email">
                <Input id="email" name="email" type="email" defaultValue={partner.email ?? ""} />
              </Field>
              <Field label={t("telephone")} htmlFor="phone">
                <Input id="phone" name="phone" defaultValue={partner.phone ?? ""} />
              </Field>
            </div>
            <Field label={t("notes")} htmlFor="notes">
              <Textarea
                id="notes"
                name="notes"
                defaultValue={partner.notes ?? ""}
                className="min-h-16"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={partner.active} />
              {t("partenaire_actif")}
            </label>
            <Button type="submit" className="w-fit">
              {t("enregistrer")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Même motif que partout ailleurs (liste en carte sous un titre de
          section) — l'historique n'a pas de raison d'être « en carte dans
          une carte » alors que la même liste vit nue sur les autres écrans. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("affaires_partagees")}</h2>
        {history.length === 0 ? (
          <EmptyState
            title={t("aucune_affaire_partagee_avec_ce_partenaire")}
            action={
              <Link href="/affaires" className={buttonVariants({ variant: "outline" })}>
                {t("voir_les_affaires")}
              </Link>
            }
          >
            {t("le_partage_se_fait_depuis_la_143b")}
          </EmptyState>
        ) : (
          <ListCard>
            {history.map(({ share, deal }) => (
              <ListRowLink
                key={share.id}
                href={`/affaires/${deal.id}`}
                title={deal.title}
                subtitle={t("envoyee_le", { formatDate: formatDate(share.sentAt) })}
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
