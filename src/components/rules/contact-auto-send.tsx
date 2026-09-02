import { use } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListCard } from "@/components/ui/list-card";
import type { Contact } from "@/db/schema";
import type { WaveDraft } from "@/db/queries/rules";
import {
  ignoreDraftAction,
  rearmAutoSendAction,
  sendDraftAction,
  stopAutoSendAction,
  updateDraftAction,
} from "@/lib/rules/actions";
import { getFormats } from "@/i18n/formats";
import { useTranslations } from "next-intl";

/** Les paramètres d'URL du panneau — la fiche porte déjà `erreur` (tâches), `erreurJournal`, `erreurRendezVous`. */
export const RELANCE_ERROR_PARAM = "erreurRelance";
export const RELANCE_INFO_PARAM = "infoRelance";

/**
 * Le panneau « Relances automatiques » de la fiche (§5.4) : l'état
 * d'arrêt (« arrêtés le … (a répondu) »), le réarmement — journalisé dans
 * la chronologie —, et les brouillons posés par les règles : Envoyer ·
 * Modifier · Ignorer. Un brouillon `automatic` appartient aussi à la
 * vague de /regles ; l'envoyer d'ici re-vérifie les mêmes garde-fous.
 */
export function ContactAutoSendPanel({
  contact,
  drafts,
  backTo,
  erreur,
  info,
}: {
  contact: Pick<Contact, "id" | "autoSendStoppedAt" | "autoSendStopReason">;
  drafts: WaveDraft[];
  backTo: string;
  erreur?: string;
  info?: string;
}) {
  const t = useTranslations("rules.contactPanel");
  const fmt = use(getFormats());
  const stopReason = contact.autoSendStopReason as "replied" | "appointment" | "manual" | null;
  const context = { contactId: contact.id, backTo, errorParam: RELANCE_ERROR_PARAM, infoParam: RELANCE_INFO_PARAM };
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("relances_automatiques")}</h2>
      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}
      {info && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{info}</p>}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {contact.autoSendStoppedAt && stopReason ? (
          <>
            <span>
              {t("arretes_le_motif", { when: fmt.date(contact.autoSendStoppedAt), reason: t(`motifs.${stopReason}`) })}
            </span>
            <form action={rearmAutoSendAction.bind(null, context)}>
              <Button type="submit" variant="outline" size="sm">
                {t("rearmer")}
              </Button>
            </form>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">{t("actifs_une_reponse_ou_un_rendez_vous_les_arrete")}</span>
            <form action={stopAutoSendAction.bind(null, context)}>
              <Button type="submit" variant="outline" size="sm">
                {t("arreter")}
              </Button>
            </form>
          </>
        )}
      </div>

      {drafts.length > 0 && (
        <ListCard>
          {drafts.map((draft) => {
            const draftContext = { messageId: draft.id, backTo, errorParam: RELANCE_ERROR_PARAM, infoParam: RELANCE_INFO_PARAM };
            return (
              <li key={draft.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{draft.subject}</span>
                  <Badge variant="secondary">{t("brouillon_de_regle", { rule: draft.ruleName ?? "—" })}</Badge>
                  <span className="text-xs text-muted-foreground">{fmt.date(draft.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.body}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={sendDraftAction.bind(null, draftContext)}>
                    <Button type="submit" size="sm">
                      {t("envoyer")}
                    </Button>
                  </form>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("modifier")}</summary>
                    <form action={updateDraftAction.bind(null, draftContext)} className="mt-2 flex flex-col gap-2">
                      <input
                        name="subject"
                        defaultValue={draft.subject}
                        aria-label={t("objet")}
                        className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                      />
                      <textarea
                        name="body"
                        defaultValue={draft.body ?? ""}
                        rows={5}
                        aria-label={t("corps")}
                        className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                      />
                      <Button type="submit" variant="outline" size="sm" className="w-fit">
                        {t("enregistrer")}
                      </Button>
                    </form>
                  </details>
                  <form action={ignoreDraftAction.bind(null, draftContext)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {t("ignorer")}
                    </Button>
                  </form>
                  {draft.ruleId && (
                    <Link href={`/regles/${draft.ruleId}`} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                      {t("voir_la_regle")}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ListCard>
      )}
    </section>
  );
}
