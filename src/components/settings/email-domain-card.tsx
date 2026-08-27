import { use } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { DetailsCard } from "@/components/ui/details-card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Organization } from "@/db/schema";
import { checkEmailDomainAction, declareEmailDomainAction, forgetEmailDomainAction } from "@/lib/email/actions";
import { missingRecords, parseDomainRecords, type DomainRecordView } from "@/lib/email/domain";
import { getFormats } from "@/i18n/formats";
import { useTranslations } from "next-intl";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * LE PARCOURS GUIDÉ DU DOMAINE D'ENVOI (docs/module-engagement.md §3.2) —
 * trois états : aucun domaine (le repli marche déjà, et le dit), en attente
 * (la table des enregistrements avec ce qui manque, copiable ligne par
 * ligne, des instructions par hébergeur), vérifié (la date, l'expéditeur
 * effectif). Un plan qui n'admet plus de domaine est annoncé comme tel.
 */
const HOSTERS = ["ovh", "gandi", "ionos", "cloudflare", "o2switch", "squarespace", "other"] as const;
const RECORD_STATUSES = ["verified", "pending", "not_started", "failed", "temporary_failure"] as const;
type DomainTranslator = TranslatorOf<"settings.domainCard">;

function recordStatusLabel(status: string, t: DomainTranslator): string {
  return (RECORD_STATUSES as readonly string[]).includes(status) ? t(`recordStatus.${status as (typeof RECORD_STATUSES)[number]}`) : status;
}

export function EmailDomainCard({
  org,
  readOnly,
  sharedDomain,
  effectiveFrom,
}: {
  org: Pick<Organization, "emailDomain" | "emailDomainProviderId" | "emailDomainStatus" | "emailDomainRecords" | "emailDomainCheckedAt" | "emailDomainCheckError" | "emailDomainVerifiedAt" | "senderEmail">;
  readOnly: boolean;
  sharedDomain: string;
  /** L'expéditeur effectif aujourd'hui (« Cabinet Dupont <dupont@mail.clozado.fr> »). */
  effectiveFrom: string;
}) {
  const t = useTranslations("settings.domainCard");
  const fmt = use(getFormats());
  const records = parseDomainRecords(org.emailDomainRecords);
  const missing = missingRecords(records);
  const verified = Boolean(org.emailDomainVerifiedAt);
  const unavailable = org.emailDomainStatus === "unavailable_on_plan";
  const senderOnDomain = Boolean(org.senderEmail && org.emailDomain && org.senderEmail.toLowerCase().endsWith(`@${org.emailDomain}`));

  return (
    <Card id="domaine" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("domaine_d_envoi")}
          {verified ? <Badge>{t("verifie")}</Badge> : org.emailDomain && !unavailable ? <Badge variant="secondary">{t("en_attente")}</Badge> : <Badge variant="outline">{t("repli")}</Badge>}
        </CardTitle>
        <CardDescription>{t("expediteur_effectif", { from: effectiveFrom })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!org.emailDomain && (
          <>
            <p className="text-sm text-pretty">{t("sans_domaine", { domain: sharedDomain })}</p>
            {!readOnly && (
              <form action={declareEmailDomainAction} className="flex flex-wrap items-end gap-3">
                <Field label={t("ton_domaine")} htmlFor="domain" hint={t("celui_de_ton_adresse")} className="max-w-xs flex-1">
                  <Input id="domain" name="domain" placeholder={t("placeholder_domaine")} required />
                </Field>
                <Button type="submit">{t("declarer")}</Button>
              </form>
            )}
          </>
        )}

        {org.emailDomain && unavailable && (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-pretty">{t("indisponible_sur_ce_plan", { domain: org.emailDomain, shared: sharedDomain })}</p>
            {org.emailDomainCheckError && <p className="text-xs text-muted-foreground">{t("le_fournisseur_a_dit", { message: org.emailDomainCheckError })}</p>}
            {!readOnly && (
              <form action={forgetEmailDomainAction}>
                <Button type="submit" variant="ghost" size="sm">{t("retirer_ce_domaine")}</Button>
              </form>
            )}
          </div>
        )}

        {org.emailDomain && !unavailable && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-medium">{org.emailDomain}</span>
                {org.emailDomainCheckedAt && <span className="text-muted-foreground"> · {t("verifie_le", { when: fmt.dateTime(org.emailDomainCheckedAt) })}</span>}
              </p>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <form action={checkEmailDomainAction}>
                    <Button type="submit" variant="outline" size="sm">{t("verifier_maintenant")}</Button>
                  </form>
                  <form action={forgetEmailDomainAction}>
                    <Button type="submit" variant="ghost" size="sm">{t("retirer_ce_domaine")}</Button>
                  </form>
                </div>
              )}
            </div>

            {verified ? (
              <p className="text-sm text-pretty">
                {senderOnDomain ? t("verifie_expediteur_propre", { when: fmt.date(org.emailDomainVerifiedAt!) }) : t.rich("verifie_mais_adresse_ailleurs", { domain: org.emailDomain, link: (chunks) => <Link href="/settings#marque" className="underline underline-offset-2">{chunks}</Link> })}
              </p>
            ) : (
              <p className="text-sm text-pretty">
                {missing.length === 0 && records.length > 0
                  ? t("tout_est_pose_verification_en_cours")
                  : t("il_manque", { count: missing.length, names: missing.map((r) => `${r.type} ${r.fullName}`).join(", ") })}
              </p>
            )}
            {org.emailDomainCheckError && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs">{t("le_fournisseur_a_dit", { message: org.emailDomainCheckError })}</p>}

            {records.length > 0 && <RecordsTable records={records} t={t} />}

            <DetailsCard summary={t("instructions_par_hebergeur")} variant="archive">
              <dl className="flex flex-col gap-3 text-sm">
                {HOSTERS.map((h) => (
                  <div key={h} className="flex flex-col gap-0.5">
                    <dt className="font-medium">{t(`hosters.${h}.name`)}</dt>
                    <dd className="text-muted-foreground text-pretty">{t(`hosters.${h}.steps`)}</dd>
                  </div>
                ))}
              </dl>
            </DetailsCard>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecordsTable({ records, t }: { records: DomainRecordView[]; t: DomainTranslator }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("colonnes.type")}</th>
            <th className="px-3 py-2 font-medium">{t("colonnes.nom")}</th>
            <th className="px-3 py-2 font-medium">{t("colonnes.valeur")}</th>
            <th className="px-3 py-2 font-medium">{t("colonnes.etat")}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.type}-${r.fullName}-${r.value}`} className="border-t border-border align-top">
              <td className="px-3 py-2 font-mono">{r.type}{r.priority !== undefined && r.priority !== null ? ` (${r.priority})` : ""}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="font-mono break-all">{r.fullName}</span>
                  <CopyButton value={r.fullName} />
                </div>
                {r.name !== r.fullName && <div className="text-muted-foreground">{t("relatif", { name: r.name })}</div>}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-start gap-1">
                  <span className="max-w-md font-mono break-all">{r.value}</span>
                  <CopyButton value={r.value} />
                </div>
              </td>
              <td className="px-3 py-2">
                <Badge variant={r.status === "verified" ? "default" : "outline"}>{recordStatusLabel(r.status, t)}</Badge>
                {r.ours && <div className="text-muted-foreground">{t("verifie_par_nous")}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
