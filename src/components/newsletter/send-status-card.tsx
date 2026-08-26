import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseAudienceSnapshot } from "@/db/queries/newsletters";
import type { Newsletter } from "@/db/schema";
import {
  markNewsletterSentAction,
  unmarkNewsletterSentAction,
  updateNewsletterTopicsAction,
} from "@/lib/newsletter/actions";
import { formatDate } from "@/lib/format";
import { PRODUCT_TIMEZONE } from "@/lib/timezone";
import { useTranslations } from "next-intl";

/** « 2026-08-26 » dans le fuseau du produit — la valeur par défaut du champ date. */
function todayInputValue(): string {
  const parts = new Intl.DateTimeFormat("fr-CA", { timeZone: PRODUCT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
}

/**
 * « Marquer comme envoyée » — l'outil n'envoie rien (l'envoi effectif est
 * hors périmètre) : c'est un geste manuel, daté, modifiable après coup. Il
 * FIGE l'audience : les membres de la cible à cet instant deviennent les
 * destinataires, les critères tels qu'ils sont deviennent la photographie.
 * Ensuite, modifier ou désactiver la cible ne change rien à cet historique.
 * Les sujets traités sont ce que l'anti-répétition montrera au prochain
 * choix de cette cible.
 */
export function SendStatusCard({ newsletter, error }: { newsletter: Newsletter; error?: string }) {
  const t = useTranslations("newsletters.sendStatusCard");
  const snapshot = parseAudienceSnapshot(newsletter.audienceSnapshot);
  const topics = newsletter.topics.join(", ");

  if (newsletter.sentAt) {
    return (
      <Card id="envoi">
        <CardHeader>
          <CardTitle>{t("envoyee_le", { formatDate: formatDate(newsletter.sentAt) })}</CardTitle>
          <CardDescription>
            {snapshot ? (
              <>
                {t.rich("a_contact_contacts_tels_qu_ils_9bcd", { count: snapshot.count, label: snapshot.label, n: (snapshot.summary.length > 0 && ` (${snapshot.summary.join(" · ")})`) || "", span: (chunks) => <span className="font-medium tabular-nums">{chunks}</span>, link: (chunks) => <Link href={`/cibles/${snapshot.targetId}`} className="underline underline-offset-2">{chunks}</Link> })}
              </>
            ) : (
              t("l_audience_a_ete_figee_a_aadf")
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{error}</p>}
          <form action={updateNewsletterTopicsAction.bind(null, newsletter.id)} className="flex flex-wrap items-end gap-2">
            <Field label={t("sujets_traites")} htmlFor="topics" hint={t("separes_par_des_virgules_c_est_ee64")} className="min-w-72 flex-1">
              <Input id="topics" name="topics" defaultValue={topics} placeholder={t("taux_assurance_emprunteur")} />
            </Field>
            <Button type="submit" variant="outline">
              {t("enregistrer_les_sujets")}
            </Button>
          </form>
          <form action={unmarkNewsletterSentAction.bind(null, newsletter.id)} className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {t("marquee_par_erreur_annuler_efface_la_fcbf")}
            </p>
            <Button type="submit" variant="ghost" size="sm">
              {t("annuler_le_marquage")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="envoi">
      <CardHeader>
        <CardTitle>{t("brouillon_pas_encore_envoyee")}</CardTitle>
        <CardDescription>
          {t("l_envoi_se_fait_depuis_ton_f872")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{error}</p>}
        <form action={markNewsletterSentAction.bind(null, newsletter.id)} className="flex flex-wrap items-end gap-3">
          <Field label={t("date_d_envoi")} htmlFor="sentAt">
            <Input id="sentAt" name="sentAt" type="date" defaultValue={todayInputValue()} required className="w-44" />
          </Field>
          <Field label={t("sujets_traites")} htmlFor="topics" hint={t("separes_par_des_virgules")} className="min-w-72 flex-1">
            <Input id="topics" name="topics" defaultValue={topics || (newsletter.subject ?? "")} placeholder={t("taux_assurance_emprunteur")} />
          </Field>
          <Button type="submit">{t("marquer_comme_envoyee")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
