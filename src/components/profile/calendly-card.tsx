import { use } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CalendarConnection } from "@/db/schema";
import { connectCalendlyAction, disconnectCalendlyAction } from "@/lib/calendly/actions";
import { getFormats } from "@/i18n/formats";
import { useTranslations } from "next-intl";

/**
 * La carte « Connexion Calendly » du profil (§5.1) : la personne colle un
 * jeton d'accès personnel, utilisé une fois puis oublié — les rendez-vous
 * pris arrivent ensuite tout seuls sur les fiches. La déconnexion est
 * locale (le jeton n'étant pas conservé, l'abonnement webhook côté
 * Calendly se retire à la main — dit à l'écran).
 */
export function CalendlyCard({ connection }: { connection: CalendarConnection | null }) {
  const t = useTranslations("profile.calendly");
  const fmt = use(getFormats());
  const active = connection !== null && connection.disconnectedAt === null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("connexion_calendly")}
          {active && <Badge variant="secondary">{t("connectee")}</Badge>}
        </CardTitle>
        <CardDescription>{t("les_rendez_vous_pris_arrivent_tout_seuls_sur_les_fiches")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {active ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t("connectee_le", { when: fmt.date(connection.connectedAt) })}
              {connection.lastEventAt ? ` · ${t("dernier_evenement_le", { when: fmt.dateTime(connection.lastEventAt) })}` : ` · ${t("aucun_evenement_recu_pour_l_instant")}`}
            </p>
            <form action={disconnectCalendlyAction}>
              <Button type="submit" variant="outline">
                {t("deconnecter")}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">{t("la_deconnexion_est_locale_retire_aussi_le_webhook")}</p>
          </>
        ) : (
          <form action={connectCalendlyAction} className="flex flex-col gap-4">
            <Field label={t("jeton_d_acces_personnel")} htmlFor="calendly-token" hint={t("cree_le_dans_calendly_integrations_api")}>
              <Input
                id="calendly-token"
                name="token"
                type="password"
                autoComplete="off"
                required
                placeholder={t("placeholder_jeton")}
                className="max-w-xl"
              />
            </Field>
            <Button type="submit" className="w-fit">
              {t("connecter")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("le_jeton_sert_une_fois_webhooks_plans_payants")}</p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
