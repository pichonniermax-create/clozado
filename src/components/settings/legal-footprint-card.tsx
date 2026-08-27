import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Organization } from "@/db/schema";
import { saveLegalFootprintAction } from "@/lib/email/actions";
import { footerProfileOf } from "@/lib/email/footer-profiles";
import { useTranslations } from "next-intl";

/**
 * LES FAITS DU PIED DE PAGE (docs/module-engagement.md §2.4, §3.4) : le
 * pays (qui choisit le profil de règles), l'adresse postale, les mentions
 * légales, la politique de confidentialité. Sans adresse postale, rien ne
 * part (le profil européen l'exige) — la carte le dit.
 */
const COUNTRIES = ["FR", "BE", "LU", "CH", "MC", "GB", "CA", "US", "DE", "ES", "IT", "NL", "PT", "IE"] as const;
const SELECT_CLASS = "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm";

export function LegalFootprintCard({ org, readOnly }: { org: Pick<Organization, "country" | "postalAddress" | "legalMention" | "privacyPolicyUrl">; readOnly: boolean }) {
  const t = useTranslations("settings.legalCard");
  const profile = footerProfileOf(org);
  const countryName = (code: string) => new Intl.DisplayNames(["fr", "en"], { type: "region" }).of(code) ?? code;
  return (
    <Card id="pied-de-page" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>{t("pied_de_page_des_emails")}</CardTitle>
        <CardDescription>{t("chaque_email_porte_qui_l_envoie")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={saveLegalFootprintAction} className="flex flex-col gap-5">
          {!org.postalAddress?.trim() && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{t("sans_adresse_postale_aucun_envoi")}</p>}
          <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("pays")} htmlFor="country" hint={t("le_pays_choisit_les_regles", { profile: t(`profiles.${profile.key as "eu" | "ch" | "gb" | "ca" | "us"}`) })}>
              <select id="country" name="country" defaultValue={org.country ?? ""} disabled={readOnly} className={SELECT_CLASS}>
                <option value="">{t("non_renseigne_profil_europeen")}</option>
                {COUNTRIES.map((code) => (
                  <option key={code} value={code}>{countryName(code)}</option>
                ))}
              </select>
            </Field>
            <Field label={t("politique_de_confidentialite")} htmlFor="privacyPolicyUrl" hint={t("liee_au_pied_de_page")}>
              <Input id="privacyPolicyUrl" name="privacyPolicyUrl" type="url" placeholder={t("placeholder_politique")} defaultValue={org.privacyPolicyUrl ?? ""} disabled={readOnly} />
            </Field>
            <Field label={t("adresse_postale")} htmlFor="postalAddress" hint={t("obligatoire_au_pied")}>
              <Textarea id="postalAddress" name="postalAddress" defaultValue={org.postalAddress ?? ""} disabled={readOnly} className="min-h-20" placeholder={t("placeholder_adresse")} />
            </Field>
            <Field label={t("mentions_legales")} htmlFor="legalMention" hint={t("siren_orias_rcs")}>
              <Textarea id="legalMention" name="legalMention" defaultValue={org.legalMention ?? ""} disabled={readOnly} className="min-h-20" placeholder={t("placeholder_mentions")} />
            </Field>
          </div>
          {!readOnly && <Button type="submit" className="w-fit">{t("enregistrer_le_pied_de_page")}</Button>}
        </form>
      </CardContent>
    </Card>
  );
}
