import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

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

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ nouveau?: string }>;
}) {
  const t = await getTranslations("partners.list");
  const user = await requireUser();
  const params = await searchParams;
  const partners = await listPartners(user);
  const active = partners.filter((p) => p.active);
  const inactive = partners.filter((p) => !p.active);

  return (
    <>
      <PageHeader
        title={t("partenaires")}
        description={t("les_confreres_vers_qui_tu_partages_8084")}
      />

      <DetailsCard summary={t("ajouter_un_partenaire")} defaultOpen={params.nouveau === "1"}>
        <form action={addPartner} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("nom")} htmlFor="name">
              <Input id="name" name="name" placeholder={t("camille_rousseau")} required />
            </Field>
            <Field label={t("societe")} htmlFor="company">
              <Input id="company" name="company" placeholder={t("rousseau_patrimoine")} />
            </Field>
            <Field label={t("metier")} htmlFor="profession">
              <Input id="profession" name="profession" placeholder={t("cgp_courtier_credit")} />
            </Field>
            <Field label={t("email")} htmlFor="email">
              <Input id="email" name="email" type="email" />
            </Field>
            <Field label={t("telephone")} htmlFor="phone">
              <Input id="phone" name="phone" />
            </Field>
          </div>
          <Field label={t("notes")} htmlFor="notes">
            <Textarea id="notes" name="notes" className="min-h-16" />
          </Field>
          <Button type="submit" className="w-fit">
            {t("ajouter_le_partenaire")}
          </Button>
        </form>
      </DetailsCard>

      <PartnerList
        title={t("partenaire_partenaires_actif_actifs", { count: active.length })}
        partners={active}
        emptyState={
          <EmptyState
            title={t("aucun_partenaire_pour_l_instant")}
            action={
              <Link href="/partenaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>
                {t("ajouter_un_partenaire")}
              </Link>
            }
          >
            {t("les_confreres_vers_qui_tu_partages_12b6")}
          </EmptyState>
        }
      />

      {/* Les partenaires se désactivent, ne se suppriment pas — cohérent
          avec un journal qui n'efface jamais son historique. Ils restent
          donc visibles, mais rangés à part. */}
      {inactive.length > 0 && (
        <PartnerList
          title={t("inactif_inactifs", { count: inactive.length })}
          partners={inactive}
          emptyState={null}
        />
      )}
    </>
  );
}

function PartnerList({
  title,
  partners,
  emptyState,
}: {
  title: string;
  partners: Awaited<ReturnType<typeof listPartners>>;
  /** Ce qu'on montre quand la liste est vide — un état structuré qui dit quoi faire. */
  emptyState: ReactNode;
}) {
  const t = useTranslations("partners.list");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {partners.length === 0 ? (
        emptyState
      ) : (
        <ListCard>
          {partners.map((p) => (
            <ListRowLink
              key={p.id}
              href={`/partenaires/${p.id}`}
              title={p.name}
              subtitle={[p.profession, p.company].filter(Boolean).join(" · ") || "—"}
              trailing={!p.active ? <Badge variant="secondary">{t("inactif")}</Badge> : undefined}
            />
          ))}
        </ListCard>
      )}
    </section>
  );
}
