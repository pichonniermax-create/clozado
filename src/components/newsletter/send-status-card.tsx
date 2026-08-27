import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailsCard } from "@/components/ui/details-card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CampaignStats, TestMessageRow } from "@/db/queries/email-sends";
import { parseAudienceSnapshot } from "@/db/queries/newsletters";
import type { Newsletter, NewsletterSend } from "@/db/schema";
import {
  markNewsletterSentAction,
  resumeSendAction,
  sendNewsletterAction,
  sendTestAction,
  unmarkNewsletterSentAction,
  updateNewsletterTopicsAction,
} from "@/lib/newsletter/actions";
import { getFormats } from "@/i18n/formats";
import { useTranslations } from "next-intl";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * LA CARTE D'ENVOI d'une newsletter (chantier engagement, étape 2) — quatre
 * états : brouillon (tester, envoyer, ou marquer comme envoyée ailleurs),
 * envoi en cours (compteurs, pause, reprise), envoyée (les agrégats — des
 * comptes, jamais des taux inventés — et la règle d'honnêteté sur
 * l'ouverture, dite une fois), marquée à la main (l'existant). L'envoi
 * réel exige une case cochée : pas de JavaScript, pas de dialogue — une
 * confirmation que le navigateur impose lui-même.
 */
export type SenderPreview = { from: string; replyTo: string; fallback: boolean; sharedDomain: string };

export type SendCardProps = {
  newsletter: Newsletter;
  send: NewsletterSend | null;
  stats: CampaignStats | null;
  tests: TestMessageRow[];
  sender: SenderPreview | null;
  /** Les contacts de la cible aujourd'hui, et ceux qui recevront vraiment (une adresse, pas de suppression). */
  audience: { total: number; sendable: number } | null;
  footerMissing: boolean;
  sentToday: number;
  /** La phase de l'envoi en cours, calculée par la page (l'horloge ne se lit pas pendant le rendu). */
  phase: "running" | "paused" | "stalled" | "done";
  error?: string;
};

const MESSAGE_STATUSES = ["queued", "sent", "delivered", "delayed", "bounced", "complained", "failed", "draft", "canceled"] as const;
type SendCardTranslator = TranslatorOf<"newsletters.sendStatusCard">;

function statusLabel(status: string, t: SendCardTranslator): string {
  return (MESSAGE_STATUSES as readonly string[]).includes(status) ? t(`status.${status as (typeof MESSAGE_STATUSES)[number]}`) : status;
}

const PAUSE_REASONS = ["daily_quota_exceeded", "monthly_quota_exceeded", "rate_limited"] as const;
function pauseLabel(reason: string | null, t: SendCardTranslator): string {
  if (!reason) return t("pauseReasons.other");
  if ((PAUSE_REASONS as readonly string[]).includes(reason)) return t(`pauseReasons.${reason as (typeof PAUSE_REASONS)[number]}`);
  if (reason.startsWith("provider_unavailable")) return t("pauseReasons.provider_unavailable");
  return t("pauseReasons.other");
}

export function SendStatusCard(props: SendCardProps) {
  const { newsletter, send, stats, tests, sender, audience, footerMissing, sentToday, phase, error } = props;
  const t = useTranslations("newsletters.sendStatusCard");
  const fmt = use(getFormats());
  const snapshot = parseAudienceSnapshot(newsletter.audienceSnapshot);
  const topics = newsletter.topics.join(", ");
  const errorBox = error && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{error}</p>;

  const testsList = tests.length > 0 && (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">{t("tests_envoyes")}</p>
      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {tests.map((m) => (
          <li key={m.id}>
            {t("test_ligne", { when: fmt.dateTime(m.sentAt ?? m.createdAt), to: m.toEmail, status: statusLabel(m.status, t) })}
            {m.failureReason && <span className="text-destructive"> — {m.failureReason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );

  // -------------------------------------------------------------------
  // Envoyée par le produit : en cours, ou terminée avec ses agrégats
  // -------------------------------------------------------------------
  if (newsletter.sentAt && newsletter.sendMode === "sent") {
    const running = Boolean(send) && phase !== "done";
    const paused = phase === "paused";
    const stalled = phase === "stalled";
    return (
      <Card id="envoi" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>{running ? t("envoi_en_cours") : t("envoyee_le", { formatDate: fmt.dateTime(newsletter.sentAt) })}</CardTitle>
          <CardDescription>
            {snapshot ? (
              t.rich("a_contact_contacts_tels_qu_ils_9bcd", { count: snapshot.count, label: snapshot.label, n: (snapshot.summary.length > 0 && ` (${snapshot.summary.join(" · ")})`) || "", span: (chunks) => <span className="font-medium tabular-nums">{chunks}</span>, link: (chunks) => <Link href={`/cibles/${snapshot.targetId}`} className="underline underline-offset-2">{chunks}</Link> })
            ) : (
              t("l_audience_a_ete_figee_a_aadf")
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorBox}
          {send && (
            <p className="text-sm tabular-nums">
              {t("compteurs", { sent: send.sent, queued: send.queued, failed: send.failed })}
              {send.error && <span className="text-destructive"> — {send.error}</span>}
            </p>
          )}
          {paused && send && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
              <span>{t("en_pause_jusqu_a", { when: fmt.dateTime(send.pausedUntil!), reason: pauseLabel(send.pauseReason, t) })}</span>
              <form action={resumeSendAction.bind(null, newsletter.id)}>
                <Button type="submit" variant="outline" size="sm">{t("reprendre")}</Button>
              </form>
            </div>
          )}
          {stalled && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <span>{t("l_envoi_s_est_interrompu")}</span>
              <form action={resumeSendAction.bind(null, newsletter.id)}>
                <Button type="submit" variant="outline" size="sm">{t("reprendre")}</Button>
              </form>
            </div>
          )}
          {running && !paused && !stalled && (
            <p className="text-xs text-muted-foreground">
              {t.rich("les_emails_partent_par_lots", { link: (chunks) => <Link href={`/newsletters/${newsletter.id}#envoi`} className="underline underline-offset-2">{chunks}</Link> })}
            </p>
          )}
          {stats && (
            <div className="flex flex-col gap-2">
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label={t("agregats.envoyes")} value={stats.sent} />
                <Stat label={t("agregats.remis")} value={stats.delivered} />
                <Stat label={t("agregats.ouverts_approx")} value={stats.opened} />
                <Stat label={t("agregats.cliques")} value={stats.clicked} />
                <Stat label={t("agregats.rejetes")} value={stats.bounced} />
                <Stat label={t("agregats.desinscrits")} value={stats.unsubscribed} />
                <Stat label={t("agregats.echecs")} value={stats.failed} />
                <Stat label={t("agregats.non_envoyes")} value={stats.withoutEmail + stats.suppressed} hint={t("agregats.non_envoyes_detail", { withoutEmail: stats.withoutEmail, suppressed: stats.suppressed })} />
              </dl>
              <p className="text-xs text-muted-foreground text-pretty">{t("honnetete")}</p>
              {stats.links.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">{t("liens_cliques")}</p>
                  <ul className="flex flex-col gap-0.5 text-xs">
                    {stats.links.map((l) => (
                      <li key={l.url} className="flex items-baseline justify-between gap-3">
                        <a href={l.url} target="_blank" rel="noreferrer" className="truncate underline underline-offset-2">{l.url}</a>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{t("clics", { count: l.clicks })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {testsList}
          <form action={updateNewsletterTopicsAction.bind(null, newsletter.id)} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <Field label={t("sujets_traites")} htmlFor="topics" hint={t("separes_par_des_virgules_c_est_ee64")} className="min-w-72 flex-1">
              <Input id="topics" name="topics" defaultValue={topics} placeholder={t("taux_assurance_emprunteur")} />
            </Field>
            <Button type="submit" variant="outline">{t("enregistrer_les_sujets")}</Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // -------------------------------------------------------------------
  // Marquée à la main (envoyée depuis un autre outil) : l'existant
  // -------------------------------------------------------------------
  if (newsletter.sentAt) {
    return (
      <Card id="envoi" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>{t("marquee_envoyee_le", { formatDate: fmt.date(newsletter.sentAt) })}</CardTitle>
          <CardDescription>
            {snapshot ? (
              t.rich("a_contact_contacts_tels_qu_ils_9bcd", { count: snapshot.count, label: snapshot.label, n: (snapshot.summary.length > 0 && ` (${snapshot.summary.join(" · ")})`) || "", span: (chunks) => <span className="font-medium tabular-nums">{chunks}</span>, link: (chunks) => <Link href={`/cibles/${snapshot.targetId}`} className="underline underline-offset-2">{chunks}</Link> })
            ) : (
              t("l_audience_a_ete_figee_a_aadf")
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorBox}
          <form action={updateNewsletterTopicsAction.bind(null, newsletter.id)} className="flex flex-wrap items-end gap-2">
            <Field label={t("sujets_traites")} htmlFor="topics" hint={t("separes_par_des_virgules_c_est_ee64")} className="min-w-72 flex-1">
              <Input id="topics" name="topics" defaultValue={topics} placeholder={t("taux_assurance_emprunteur")} />
            </Field>
            <Button type="submit" variant="outline">{t("enregistrer_les_sujets")}</Button>
          </form>
          <form action={unmarkNewsletterSentAction.bind(null, newsletter.id)} className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">{t("marquee_par_erreur_annuler_efface_la_fcbf")}</p>
            <Button type="submit" variant="ghost" size="sm">{t("annuler_le_marquage")}</Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // -------------------------------------------------------------------
  // Brouillon : tester, envoyer — ou marquer comme envoyée ailleurs
  // -------------------------------------------------------------------
  const canSend = Boolean(sender) && !footerMissing && (audience?.sendable ?? 0) > 0;
  return (
    <Card id="envoi" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>{t("brouillon_pas_encore_envoyee")}</CardTitle>
        <CardDescription>{t("teste_d_abord_puis_envoie")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {errorBox}
        {sender && (
          <div className="flex flex-col gap-1 text-sm">
            <p>{t("partira_de", { from: sender.from, replyTo: sender.replyTo })}</p>
            {sender.fallback && (
              <p className="text-xs text-muted-foreground">
                {t.rich("repli_note", { domain: sender.sharedDomain, link: (chunks) => <Link href="/settings#domaine" className="underline underline-offset-2">{chunks}</Link> })}
              </p>
            )}
          </div>
        )}
        {footerMissing && (
          <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
            {t.rich("pied_de_page_incomplet", { link: (chunks) => <Link href="/settings#pied-de-page" className="underline underline-offset-2">{chunks}</Link> })}
          </p>
        )}
        <div className="flex flex-wrap items-start gap-3">
          <form action={sendTestAction.bind(null, newsletter.id)} className="flex flex-col gap-1">
            <Button type="submit" variant="outline" disabled={!sender}>{t("m_envoyer_un_test")}</Button>
            <span className="max-w-72 text-xs text-muted-foreground">{t("test_explication")}</span>
          </form>
        </div>
        <form action={sendNewsletterAction.bind(null, newsletter.id)} className="flex flex-col gap-3 border-t border-border pt-4">
          {audience && (
            <p className="text-sm">
              <span className="font-medium">{t("envoyer_a", { count: audience.sendable })}</span>
              <span className="text-muted-foreground"> — {t("destinataires_detail", { sendable: audience.sendable, total: audience.total })}</span>
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" required disabled={!canSend} className="accent-primary" />
            {t("je_confirme")}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSend}>{t("envoyer_maintenant")}</Button>
            <span className="text-xs text-muted-foreground">{t("quota_note", { count: sentToday })}</span>
          </div>
        </form>
        {testsList}
        <DetailsCard summary={t("ou_marquer_ailleurs")} variant="archive">
          <form action={markNewsletterSentAction.bind(null, newsletter.id)} className="flex flex-wrap items-end gap-3">
            <Field label={t("date_d_envoi")} htmlFor="sentAt">
              <Input id="sentAt" name="sentAt" type="date" defaultValue={fmt.todayInput()} required className="w-44" />
            </Field>
            <Field label={t("sujets_traites")} htmlFor="topics-declared" hint={t("separes_par_des_virgules")} className="min-w-72 flex-1">
              <Input id="topics-declared" name="topics" defaultValue={topics || (newsletter.subject ?? "")} placeholder={t("taux_assurance_emprunteur")} />
            </Field>
            <Button type="submit" variant="outline">{t("marquer_comme_envoyee")}</Button>
            <p className="w-full text-xs text-muted-foreground">{t("l_envoi_se_fait_depuis_ton_f872")}</p>
          </form>
        </DetailsCard>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

