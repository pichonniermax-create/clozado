import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import type { Organization } from "@/db/schema";
import { renewIngestAddressAction, saveInboundBodiesAction } from "@/lib/email/actions";
import { ingestAddress } from "@/lib/email/inbound/address";
import { useTranslations } from "next-intl";

/**
 * L'ADRESSE D'INGESTION (docs/module-engagement.md §4.1) — une adresse
 * secrète par organisation : y transférer un email, ou la mettre en copie
 * cachée, dépose une PROPOSITION dans « Emails reçus ». Deux gestes et un
 * réglage : créer l'adresse, la régénérer (l'ancienne cesse aussitôt
 * d'être acceptée — c'est dit avant), et décider si le corps des emails
 * est conservé ou effacé dès la réception.
 */
export function IngestAddressCard({
  org,
  readOnly,
  inboundDomain,
}: {
  org: Pick<Organization, "ingestToken" | "storeInboundBodies">;
  readOnly: boolean;
  /** Le domaine de réception (`in.clozado.fr`) ; null quand la variable d'environnement manque. */
  inboundDomain: string | null;
}) {
  const t = useTranslations("settings.ingestCard");
  const address = org.ingestToken && inboundDomain ? ingestAddress(org.ingestToken, inboundDomain) : null;

  return (
    <Card id="ingestion" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>{t("adresse_d_ingestion")}</CardTitle>
        <CardDescription>{t("transfere_un_email_ou_mets_la_en_copie")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!inboundDomain ? (
          <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-pretty">{t("reception_non_configuree")}</p>
        ) : !address ? (
          <>
            <p className="text-sm text-pretty">{t("aucune_adresse_pour_l_instant")}</p>
            {!readOnly && (
              <form action={renewIngestAddressAction}>
                <Button type="submit" className="w-fit">{t("creer_l_adresse")}</Button>
              </form>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-border bg-muted/40 px-2 py-1 font-mono text-sm break-all">{address}</code>
              <CopyButton value={address} label={t("copier_l_adresse")} />
            </div>
            <p className="text-sm text-pretty text-muted-foreground">{t("seuls_les_membres_authentifies")}</p>
            <p className="text-sm">
              <Link href="/emails-recus" className="underline underline-offset-2">{t("voir_les_emails_recus")}</Link>
            </p>

            {!readOnly && (
              <form action={saveInboundBodiesAction} className="flex flex-col gap-3 border-t border-border pt-4">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="storeBodies" defaultChecked={org.storeInboundBodies} className="mt-0.5 size-4 rounded border-input" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{t("conserver_le_corps")}</span>
                    <span className="text-xs text-muted-foreground text-pretty">{t("sinon_le_corps_n_est_pas_ecrit")}</span>
                  </span>
                </label>
                <Button type="submit" variant="outline" size="sm" className="w-fit">{t("enregistrer_le_reglage")}</Button>
              </form>
            )}

            {!readOnly && (
              <form action={renewIngestAddressAction} className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground text-pretty">{t("regenerer_coupe_l_ancienne")}</p>
                <Button type="submit" variant="ghost" size="sm" className="w-fit">{t("regenerer_l_adresse")}</Button>
              </form>
            )}
          </>
        )}
        {readOnly && <p className="text-xs text-muted-foreground">{t("lecture_seule")}</p>}
        {!address && inboundDomain && readOnly && (
          <Link href="/emails-recus" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("voir_les_emails_recus")}</Link>
        )}
      </CardContent>
    </Card>
  );
}
