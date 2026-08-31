import { use } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { InboundEmail } from "@/db/schema";
import { getFormats } from "@/i18n/formats";
import { confirmInboundAction, ignoreInboundAction } from "@/lib/email/actions";
import { LOW_CONFIDENCE, readProposal } from "@/lib/email/inbound/proposal";
import { useTranslations } from "next-intl";
import { AuthBadge } from "./auth-badge";

/**
 * UN EMAIL REÇU À CONFIRMER (docs/module-engagement.md §4.3) — ce que le
 * produit a COMPRIS (transfert ou copie, la contrepartie, la date
 * d'origine, la signature) présenté comme une proposition modifiable, et
 * rien n'est écrit avant « Confirmer ». Un champ dont le modèle doute est
 * marqué « à vérifier ». Le corps, quand il est conservé, s'affiche comme
 * du TEXTE (React l'échappe) : il n'est jamais rendu en HTML.
 */
const SELECT_CLASS = "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm";

export function InboundProposalCard({
  email,
  candidates,
}: {
  email: InboundEmail;
  /** Les fiches qui pourraient être la contrepartie : même adresse (signal fort) ou même nom (signal faible). */
  candidates: { id: string; name: string; email: string | null }[];
}) {
  // Le rattachement n'est proposé PAR DÉFAUT que sur un signal fort — la
  // même adresse. Un simple homonyme laisse « créer une fiche » : deux
  // personnes du même nom ne sont pas la même personne.
  const sameAddress = email.counterpartEmail
    ? (candidates.find((c) => c.email?.toLowerCase() === email.counterpartEmail?.toLowerCase())?.id ?? "")
    : "";
  const t = useTranslations("inbound.card");
  const fmt = use(getFormats());
  const proposal = readProposal(email.proposal);
  const doubtful = (confidence: number | undefined) => confidence !== undefined && confidence < LOW_CONFIDENCE;
  const hint = (value: { confidence: number } | null) => (doubtful(value?.confidence) ? t("a_verifier") : undefined);
  const name = proposal.name?.value ?? email.counterpartName ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {email.subject || t("sans_objet")}
          {email.mode === "copy" ? (
            <Badge variant="secondary">{t("copie")}</Badge>
          ) : email.mode === "forward" ? (
            <Badge variant="secondary">{t("transfert")}</Badge>
          ) : (
            <Badge variant="outline">{t("a_qualifier")}</Badge>
          )}
          <AuthBadge result={email.authResult} />
        </CardTitle>
        <CardDescription>
          {t("recu_de_le", { sender: email.senderEmail, when: fmt.dateTime(email.receivedAt) })}
          {email.originalDate ? ` · ${t("email_d_origine_du", { when: fmt.dateTime(email.originalDate) })}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {email.bodyText && (
          <details className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">{t("voir_le_message")}</summary>
            {/* Texte, jamais du HTML : React échappe, rien n'est interprété. */}
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm">{email.bodyText}</pre>
          </details>
        )}

        <form action={confirmInboundAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={email.id} />

          {/* Ni transfert ni copie reconnus : le sens ne se devine pas, il se demande. */}
          {email.mode === null && (
            <Field label={t("le_sens")} htmlFor={`direction-${email.id}`} hint={t("le_sens_decide_de_l_arret_automatique")}>
              <select id={`direction-${email.id}`} name="direction" defaultValue="" required className={SELECT_CLASS}>
                <option value="" disabled>
                  {t("a_choisir")}
                </option>
                <option value="inbound">{t("sens_entrant")}</option>
                <option value="outbound">{t("sens_sortant")}</option>
              </select>
            </Field>
          )}

          {candidates.length > 0 && (
            <Field label={t("la_fiche")} htmlFor={`contact-${email.id}`} hint={t("rattacher_ne_modifie_pas_la_fiche")}>
              <select id={`contact-${email.id}`} name="contactId" defaultValue={sameAddress} className={SELECT_CLASS}>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.email ? `${candidate.name} · ${candidate.email}` : candidate.name}
                  </option>
                ))}
                <option value="">{t("creer_une_nouvelle_fiche")}</option>
              </select>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("nom")} htmlFor={`name-${email.id}`} hint={hint(proposal.name)}>
              <Input id={`name-${email.id}`} name="name" defaultValue={name} maxLength={160} />
            </Field>
            <Field label={t("email")} htmlFor={`email-${email.id}`}>
              <Input id={`email-${email.id}`} name="email" type="email" defaultValue={email.counterpartEmail ?? ""} />
            </Field>
            <Field label={t("telephone")} htmlFor={`phone-${email.id}`} hint={hint(proposal.phone)}>
              <Input id={`phone-${email.id}`} name="phone" defaultValue={proposal.phone?.value ?? ""} maxLength={40} />
            </Field>
            <Field label={t("societe")} htmlFor={`company-${email.id}`} hint={hint(proposal.company)}>
              <Input id={`company-${email.id}`} name="company" defaultValue={proposal.company?.value ?? ""} maxLength={160} />
            </Field>
            <Field label={t("fonction")} htmlFor={`job-${email.id}`} hint={hint(proposal.jobTitle)}>
              <Input id={`job-${email.id}`} name="jobTitle" defaultValue={proposal.jobTitle?.value ?? ""} maxLength={160} />
            </Field>
          </div>

          <p className="text-xs text-muted-foreground text-pretty">
            {proposal.source === "model" ? t("proposition_du_modele") : t("proposition_deterministe")}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">{t("confirmer")}</Button>
          </div>
        </form>

        <form action={ignoreInboundAction}>
          <input type="hidden" name="id" value={email.id} />
          <Button type="submit" variant="ghost" size="sm">{t("ignorer")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
