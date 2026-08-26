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
  const snapshot = parseAudienceSnapshot(newsletter.audienceSnapshot);
  const topics = newsletter.topics.join(", ");

  if (newsletter.sentAt) {
    return (
      <Card id="envoi">
        <CardHeader>
          <CardTitle>Envoyée le {formatDate(newsletter.sentAt)}</CardTitle>
          <CardDescription>
            {snapshot ? (
              <>
                À <span className="font-medium tabular-nums">{snapshot.count}</span> contact{snapshot.count > 1 ? "s" : ""} —{" "}
                <Link href={`/cibles/${snapshot.targetId}`} className="underline underline-offset-2">
                  {snapshot.label}
                </Link>
                {snapshot.summary.length > 0 && ` (${snapshot.summary.join(" · ")})`}, tels qu&apos;ils étaient ce jour-là. Cet
                historique ne bouge plus, même si la cible change.
              </>
            ) : (
              "L'audience a été figée à cette date."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{error}</p>}
          <form action={updateNewsletterTopicsAction.bind(null, newsletter.id)} className="flex flex-wrap items-end gap-2">
            <Field label="Sujets traités" htmlFor="topics" hint="Séparés par des virgules — c'est ce que le composer rappellera la prochaine fois qu'on écrit à ces contacts." className="min-w-72 flex-1">
              <Input id="topics" name="topics" defaultValue={topics} placeholder="taux, assurance emprunteur" />
            </Field>
            <Button type="submit" variant="outline">
              Enregistrer les sujets
            </Button>
          </form>
          <form action={unmarkNewsletterSentAction.bind(null, newsletter.id)} className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Marquée par erreur ? Annuler efface la liste des destinataires et la photographie de la cible.
            </p>
            <Button type="submit" variant="ghost" size="sm">
              Annuler le marquage
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="envoi">
      <CardHeader>
        <CardTitle>Brouillon — pas encore envoyée</CardTitle>
        <CardDescription>
          L&apos;envoi se fait depuis ton outil d&apos;emailing. Une fois parti, marque-le ici : la liste des destinataires
          est figée telle qu&apos;elle est aujourd&apos;hui, c&apos;est ce que l&apos;historique des fiches et
          l&apos;anti-répétition liront.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{error}</p>}
        <form action={markNewsletterSentAction.bind(null, newsletter.id)} className="flex flex-wrap items-end gap-3">
          <Field label="Date d'envoi" htmlFor="sentAt">
            <Input id="sentAt" name="sentAt" type="date" defaultValue={todayInputValue()} required className="w-44" />
          </Field>
          <Field label="Sujets traités" htmlFor="topics" hint="Séparés par des virgules." className="min-w-72 flex-1">
            <Input id="topics" name="topics" defaultValue={topics || (newsletter.subject ?? "")} placeholder="taux, assurance emprunteur" />
          </Field>
          <Button type="submit">Marquer comme envoyée</Button>
        </form>
      </CardContent>
    </Card>
  );
}
