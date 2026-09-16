import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Organization } from "@/db/schema";
import { saveAutoSendSettingsAction } from "@/lib/rules/actions";
import { useTranslations } from "next-intl";

/**
 * La carte « Envois automatiques » des réglages (§5.4) : l'interrupteur
 * général (faux par défaut — sans lui, `send_email` ne prépare rien et la
 * vague refuse de partir), le plafond par contact (au plus un email
 * automatique par contact par période, toutes règles confondues) et la
 * fenêtre d'envoi dans le fuseau de l'organisation — depuis la consigne
 * du 2026-09-02, la fenêtre AVERTIT sur l'écran de la vague, c'est le
 * clic humain qui décide.
 *
 * Les trois réglages tiennent sur UNE ligne dès `md` (chantier C,
 * correctif 2) : interrupteur, plafond, fenêtre — chacun avec son aide
 * dessous, en français simple ; avant, l'interrupteur vivait seul au-dessus
 * d'une grille à trois champs, et les aides parlaient en jargon.
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
    <Card id="envois-automatiques" className="scroll-mt-32">
      <CardHeader>
        <CardTitle>{t("envois_automatiques")}</CardTitle>
        <CardDescription>{t("rien_ne_part_sans_clic_la_vague_se_relit")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={saveAutoSendSettingsAction} className="flex flex-col gap-5">
          {/* Une grille alignée en haut : les libellés sur une ligne, les contrôles sur la suivante, les aides dessous. */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-start">
            <div className="flex flex-col gap-2">
              {/* Le même `Label` que les champs voisins : les trois intitulés partagent la même ligne de base. */}
              <Label htmlFor="auto-send-enabled">{t("interrupteur_general")}</Label>
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input id="auto-send-enabled" type="checkbox" name="autoSendEnabled" defaultChecked={org.autoSendEnabled} disabled={readOnly} />
                <span>{t("autoriser")}</span>
              </label>
              <p className="text-xs text-muted-foreground text-pretty">{t("decoche_rien_n_est_prepare")}</p>
            </div>
            <Field label={t("plafond_par_contact")} htmlFor="auto-send-period" hint={t("au_plus_un_email_automatique_par_contact")}>
              <div className="flex items-center gap-2">
                <Input
                  id="auto-send-period"
                  name="autoSendPeriodDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={org.autoSendPeriodDays}
                  disabled={readOnly}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">{t("jours")}</span>
              </div>
            </Field>
            <div className="flex flex-col gap-2">
              <Label htmlFor="auto-send-start">{t("fenetre_d_envoi")}</Label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="auto-send-start" className="text-muted-foreground">
                  {t("de")}
                </label>
                <Input id="auto-send-start" name="officeHoursStart" type="number" min={0} max={23} defaultValue={org.officeHoursStart} disabled={readOnly} className="w-16" aria-describedby="auto-send-window-hint" />
                <label htmlFor="auto-send-end" className="text-muted-foreground">
                  {t("a")}
                </label>
                <Input id="auto-send-end" name="officeHoursEnd" type="number" min={1} max={24} defaultValue={org.officeHoursEnd} disabled={readOnly} className="w-16" aria-describedby="auto-send-window-hint" />
                <span className="text-muted-foreground">{t("heures")}</span>
              </div>
              <p id="auto-send-window-hint" className="text-xs text-muted-foreground text-pretty">
                {t("jours_ouvres_dans_le_fuseau", { timezone: org.timezone })}
              </p>
            </div>
          </div>
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
