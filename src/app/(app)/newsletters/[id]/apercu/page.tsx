import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { PreflightList } from "@/components/newsletter/preflight-list";
import { SEND_ERROR_PARAM } from "@/components/newsletter/labels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { listAudienceSample } from "@/db/queries/email-sends";
import { unsubscribeUrls, withUnsubscribeUrl } from "@/lib/email/headers";
import { sendPreflight } from "@/lib/email/send-preflight";
import { nullIfNotFound } from "@/lib/errors";
import { readFlash } from "@/lib/flash";
import { darkPreview, PREVIEW_SCREENS, previewWidth, toPreviewScreen } from "@/lib/newsletter/preview";
import { sendTestAction } from "@/lib/newsletter/actions";
import { requestOrigin } from "@/lib/request-origin";
import { requireSessionUser, requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * L'ÉCRAN D'APERÇU ET DE CONTRÔLE (chantier envoi, partie 3) — le dernier
 * écran avant d'écrire à des centaines de personnes.
 *
 * Ce qui s'y voit est ce qui part : le HTML vient du rendu d'envoi
 * (`buildSendDraft`), et sa seule retouche est la substitution du lien de
 * désinscription, faite par la fonction même qui remet les messages. Le
 * cadre est un `<iframe sandbox>` sans script ni même origine : l'email
 * d'une organisation ne peut rien contre l'application qui l'affiche.
 *
 * Trois choses à côté : la liste du contrôle déterministe (bloquant /
 * avertissement / au vert), « vu par » un vrai destinataire — avec son sort
 * quand il ne recevra pas —, et l'email de test, qui ne part qu'à soi ou à
 * un membre.
 */
export default async function NewsletterPreviewPage(props: PageProps<"/newsletters/[id]/apercu">) {
  const t = await getTranslations("newsletters.preview");
  const user = await requireUser();
  const session = await requireSessionUser();
  const { id } = await props.params;
  const query = await props.searchParams;
  const screen = toPreviewScreen(typeof query.ecran === "string" ? query.ecran : undefined);
  const error = readFlash(query[SEND_ERROR_PARAM]);

  const origin = await requestOrigin();
  const report = await nullIfNotFound(sendPreflight(user, session.id, id, origin));
  if (!report) notFound();

  const sample = await listAudienceSample(report.target);
  const chosen = sample.find((c) => c.id === query.contact) ?? sample[0] ?? null;

  // Le lien de désinscription est propre à CHAQUE message : celui de l'aperçu est un exemple, et l'écran le dit.
  const exampleUnsubscribe = unsubscribeUrls(origin, "apercu").page;
  const html = withUnsubscribeUrl(report.draft.content.html, exampleUnsubscribe);
  const frameHtml = screen === "sombre" ? darkPreview(html) : html;
  const href = (next: { ecran?: string; contact?: string }) => {
    const sp = new URLSearchParams();
    const ecran = next.ecran ?? screen;
    if (ecran !== "ordinateur") sp.set("ecran", ecran);
    const contact = next.contact ?? chosen?.id;
    if (contact) sp.set("contact", contact);
    const qs = sp.toString();
    return `/newsletters/${id}/apercu${qs ? `?${qs}` : ""}`;
  };

  const blocking = report.blocking.length;
  const warnings = report.rows.filter((r) => r.state === "warning").length;

  return (
    <>
      <PageHeader
        title={t("titre")}
        description={t("sous_titre", { titre: report.draft.newsletter.title })}
        backTo={{ href: `/newsletters/${id}`, label: t("retour") }}
        actions={
          <Link href={`/newsletters/${id}#envoi`} className={buttonVariants({ variant: blocking > 0 ? "outline" : "default" })}>
            {t("aller_a_l_envoi")}
          </Link>
        }
      />

      {error && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{error}</p>}

      {/*
        UNE SEULE COLONNE, et c'est mesuré : à 1 440 px, une colonne d'aperçu
        à côté d'un panneau de 22 rem tombait à 558 px — plus étroite que
        l'email lui-même (600 px), qui s'affichait donc coupé dans l'écran
        censé le montrer. L'email d'abord, pleine largeur ; les contrôles
        dessous.
      */}
      <div className="flex flex-col gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          {/* La barre des vues : rien n'est transformé sauf « sombre », et c'est écrit sous le cadre. */}
          <div className="flex flex-wrap items-center gap-2">
            {PREVIEW_SCREENS.map((s) => (
              <Link
                key={s}
                href={href({ ecran: s })}
                aria-current={s === screen ? "page" : undefined}
                className={cn(buttonVariants({ variant: s === screen ? "secondary" : "ghost", size: "sm" }), "shrink-0")}
              >
                {t(`ecrans.${s}`)}
              </Link>
            ))}
          </div>

          {/* L'en-tête tel qu'une messagerie l'affiche : de qui, à qui, quel objet, quel pré-en-tête. */}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm">
            <dt className="text-muted-foreground">{t("entete.de")}</dt>
            <dd className="min-w-0 truncate" title={report.draft.from ?? undefined}>{report.draft.from ?? t("entete.aucun_expediteur")}</dd>
            <dt className="text-muted-foreground">{t("entete.reponse")}</dt>
            <dd className="min-w-0 truncate" title={report.draft.replyTo ?? undefined}>{report.draft.replyTo ?? t("entete.aucune_reponse")}</dd>
            <dt className="text-muted-foreground">{t("entete.a")}</dt>
            <dd className="min-w-0 truncate" title={chosen ? `${chosen.name}${chosen.email ? ` — ${chosen.email}` : ""}` : undefined}>{chosen ? `${chosen.name}${chosen.email ? ` — ${chosen.email}` : ""}` : t("entete.personne")}</dd>
            <dt className="text-muted-foreground">{t("entete.objet")}</dt>
            <dd className="min-w-0 font-medium text-pretty">{report.draft.subject || t("entete.objet_vide")}</dd>
            <dt className="text-muted-foreground">{t("entete.preheader")}</dt>
            <dd className="min-w-0 text-muted-foreground text-pretty">{report.draft.preheader || t("entete.preheader_vide")}</dd>
          </dl>

          {screen === "texte" ? (
            <pre className="max-h-[58vh] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs whitespace-pre-wrap">{report.draft.content.text}</pre>
          ) : (
            <div className="flex justify-center rounded-lg border border-border bg-muted/30 p-3">
              {/* `sandbox` vide : aucun script, aucune origine commune, aucun formulaire — le HTML d'une organisation reste inerte. */}
              <iframe
                title={t("cadre")}
                srcDoc={frameHtml}
                sandbox=""
                className="h-[58vh] min-h-96 w-full rounded bg-white"
                style={{ maxWidth: `${previewWidth(screen)}px` }}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground text-pretty">
            {t("note_identique")} {screen === "sombre" && t("note_sombre")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{blocking > 0 ? t("controle.bloque", { count: blocking }) : warnings > 0 ? t("controle.a_regarder", { count: warnings }) : t("controle.pret")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PreflightList rows={report.rows} audience={report.audience} />
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {sample.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("vu_par.titre")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {/* Un formulaire GET : le choix tient dans l'adresse, l'écran se recharge sans JavaScript. */}
                <form method="get" className="flex flex-wrap items-end gap-2">
                  {screen !== "ordinateur" && <input type="hidden" name="ecran" value={screen} />}
                  <Field label={t("vu_par.contact")} htmlFor="contact" className="min-w-48 flex-1">
                    <NativeSelect id="contact" name="contact" defaultValue={chosen?.id}>
                      {sample.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.reason ? t("vu_par.exclu", { nom: c.name }) : c.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Button type="submit" variant="outline">{t("vu_par.voir")}</Button>
                </form>
                {chosen?.reason && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{t(`vu_par.raisons.${chosen.reason}`)}</p>}
                <p className="text-xs text-muted-foreground text-pretty">{t("vu_par.note")}</p>
              </CardContent>
            </Card>
          )}

          {!session.readOnly && (
            <Card>
              <CardHeader>
                <CardTitle>{t("test.titre")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={sendTestAction.bind(null, id)} className="flex flex-col gap-2">
                  <input type="hidden" name="retour" value="apercu" />
                  <Field label={t("test.adresse")} htmlFor="to" hint={t("test.regle")}>
                    <Input id="to" name="to" type="email" defaultValue={session.email ?? ""} required />
                  </Field>
                  <Button type="submit" variant="outline" className="w-fit">{t("test.envoyer")}</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
