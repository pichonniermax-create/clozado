import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Organization } from "@/db/schema";
import { saveAutoSendSettingsAction } from "@/lib/rules/actions";
import { useTranslations } from "next-intl";

/**
 * La carte « Envois automatiques » des réglages (§5.4) : l'interrupteur
 * général (faux par défaut — sans lui, `send_email` ne prépare rien et la
 * vague refuse de partir), la période du plafond (au plus un email
 * automatique par contact par période, toutes règles confondues) et les
 * heures de bureau dans le fuseau de l'organisation — depuis la consigne
 * du 2026-09-02, la fenêtre AVERTIT sur l'écran de la vague, c'est le
 * clic humain qui décide.
 */
export function AutoSendCard({
  org,
  readOnly,
}: {
  org: Pick<Organization, "autoSendEnabled" | "autoSendPeriodDays" | "officeHoursStart" | "officeHoursEnd" | "timezone">;
  readOnly: boolean;
}) {
  const t = useTranslations("rules.settingsCard");
  return (
    <Card id="envois-automatiques" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>{t("envois_automatiques")}</CardTitle>
        <CardDescription>{t("rien_ne_part_sans_clic_la_vague_se_relit")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={saveAutoSendSettingsAction} className="flex flex-col gap-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="autoSendEnabled" defaultChecked={org.autoSendEnabled} disabled={readOnly} className="mt-0.5" />
            <span>
              <span className="font-medium">{t("interrupteur_general")}</span>
              <span className="block text-xs text-muted-foreground">{t("coupe_send_email_ne_prepare_rien")}</span>
            </span>
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("plafond_periode_jours")} htmlFor="auto-send-period" hint={t("au_plus_un_email_automatique_par_contact")}>
              <Input
                id="auto-send-period"
                name="autoSendPeriodDays"
                type="number"
                min={1}
                max={365}
                defaultValue={org.autoSendPeriodDays}
                disabled={readOnly}
                className="w-24"
              />
            </Field>
            <Field label={t("heures_de_bureau_debut")} htmlFor="auto-send-start">
              <Input id="auto-send-start" name="officeHoursStart" type="number" min={0} max={23} defaultValue={org.officeHoursStart} disabled={readOnly} className="w-20" />
            </Field>
            <Field label={t("heures_de_bureau_fin")} htmlFor="auto-send-end">
              <Input id="auto-send-end" name="officeHoursEnd" type="number" min={1} max={24} defaultValue={org.officeHoursEnd} disabled={readOnly} className="w-20" />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">{t("jours_ouvres_dans_le_fuseau", { timezone: org.timezone })}</p>
          {!readOnly && (
            <Button type="submit" className="w-fit">
              {t("enregistrer")}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
