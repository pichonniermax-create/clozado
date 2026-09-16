import Link from "next/link";
import { nullIfNotFound } from "@/lib/errors";
import { notFound, redirect } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRowLink } from "@/components/ui/list-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/components/app-shell/page-header";
import { ShareStatusBadge } from "@/components/deal-shares/share-status-badge";
import { Textarea } from "@/components/ui/textarea";
import { getPartner } from "@/db/queries/partners";
import { listDealSharesForPartner } from "@/db/queries/deal-shares";
import { updatePartnerAction } from "@/lib/deals/actions";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

export default async function PartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("partners.detail");
  const fmt = await getFormats();
  const user = await requireUser();
  const { id } = await params;

  const partner = await nullIfNotFound(getPartner(user, id));
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
        // La première chose qu'on fait sur une fiche partenaire : l'appeler ou lui écrire (audit UI du 2026-09-14).
        actions={
          <>
            {!partner.active && <Badge variant="secondary">{t("inactif")}</Badge>}
            {partner.email && (
              <a href={`mailto:${partner.email}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Mail />
                {t("ecrire")}
              </a>
            )}
            {partner.phone && (
              <a href={`tel:${partner.phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Phone />
                {t("appeler")}
              </a>
            )}
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("fiche")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={savePartner} className="flex flex-col gap-4">
            {/* Une colonne à 390 px (deux colonnes forcées tronquaient l'email), deux dès sm ; l'email — long — sur
                toute la ligne et les notes en dessous : plus de cellule vide dans la grille. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("nom")} htmlFor="name">
                <Input id="name" name="name" defaultValue={partner.name} required />
              </Field>
              <Field label={t("societe")} htmlFor="company">
                <Input id="company" name="company" defaultValue={partner.company ?? ""} />
              </Field>
              <Field label={t("metier")} htmlFor="profession">
                <Input id="profession" name="profession" defaultValue={partner.profession ?? ""} />
              </Field>
              <Field label={t("telephone")} htmlFor="phone">
                <Input id="phone" name="phone" type="tel" defaultValue={partner.phone ?? ""} />
              </Field>
              <Field label={t("email")} htmlFor="email" className="sm:col-span-2">
                <Input id="email" name="email" type="email" defaultValue={partner.email ?? ""} />
              </Field>
              <Field label={t("notes")} htmlFor="notes" className="sm:col-span-2">
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={partner.notes ?? ""}
                  className="min-h-16"
                />
              </Field>
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={partner.active} />
              {t("partenaire_actif")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" className="w-fit">
                {t("enregistrer")}
              </Button>
              <Button type="reset" variant="ghost">
                {t("annuler")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Même motif que partout ailleurs (liste en carte sous un titre de
          section) — l'historique n'a pas de raison d'être « en carte dans
          une carte » alors que la même liste vit nue sur les autres écrans. */}
      <section className="flex flex-col gap-3">
        <SectionHeading title={t("affaires_partagees")} count={history.length} />
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
                subtitle={t("envoyee_le", { formatDate: fmt.date(share.sentAt) })}
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
