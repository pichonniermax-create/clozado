import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getUserProfile } from "@/db/queries/users";
import { getOwnOrganization } from "@/db/queries/organizations";
import { saveProfileAction } from "@/lib/email/actions";
import { requireSessionUser, requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

/**
 * /profil — ce qu'une personne règle pour ELLE (chantier engagement) : son
 * adresse de réponse (les réponses à ses envois arrivent dans SA boîte,
 * sinon celle de l'organisation), son lien de prise de rendez-vous
 * (insérable dans les emails et les gabarits, Partie 3). Jamais celui
 * d'une autre : l'id vient de la session.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ erreur?: string; info?: string }> }) {
  const t = await getTranslations("profile");
  const session = await requireSessionUser();
  const user = await requireUser();
  const [profile, org] = await Promise.all([getUserProfile(session.id), getOwnOrganization(user)]);
  const { erreur, info } = await searchParams;
  return (
    <>
      <PageHeader title={t("mon_profil")} description={t("ce_que_tu_regles_pour_toi")} />
      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}
      {info && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{info}</p>}
      <Card>
        <CardHeader>
          <CardTitle>{profile.name ?? profile.email}</CardTitle>
          <CardDescription>{profile.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProfileAction} className="flex flex-col gap-5">
            <div className="grid max-w-xl grid-cols-1 gap-4">
              <Field label={t("adresse_de_reponse")} htmlFor="replyToEmail" hint={org?.senderEmail ? t("sinon_celle_de_l_organisation", { email: org.senderEmail }) : t("sinon_ton_adresse_de_connexion")}>
                <Input id="replyToEmail" name="replyToEmail" type="email" defaultValue={profile.replyToEmail ?? ""} placeholder={profile.email} />
              </Field>
              <Field label={t("lien_de_prise_de_rendez_vous")} htmlFor="bookingUrl" hint={t("calendly_ou_autre")}>
                <Input id="bookingUrl" name="bookingUrl" type="url" defaultValue={profile.bookingUrl ?? ""} placeholder={t("placeholder_lien")} />
              </Field>
            </div>
            <Button type="submit" className="w-fit">{t("enregistrer")}</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
