import { use } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListCard } from "@/components/ui/list-card";
import type { AppointmentRow } from "@/db/queries/appointments";
import { cancelAppointmentAction, createAppointmentAction } from "@/lib/appointments/actions";
import { getFormats } from "@/i18n/formats";
import { useTranslations } from "next-intl";

/**
 * La section « Rendez-vous » de la fiche contact (§5.1) : la liste (à
 * venir compris, annulés visibles mais barrés du calcul), et la saisie en
 * un clic — date et heure vides = maintenant, remplies = « le… ». Un
 * rendez-vous saisi arrête l'envoi automatique du contact (raison
 * `appointment`) ; l'annulation le laisse en base, les indicateurs
 * l'ignorent.
 */
export function AppointmentSection({
  appointments,
  backTo,
  contactId,
  erreur,
}: {
  appointments: AppointmentRow[];
  /** Chemin de la fiche — les actions y reviennent. */
  backTo: string;
  contactId: string;
  /** Message d'erreur remonté par une action (paramètre d'URL `erreurRendezVous`). */
  erreur?: string;
}) {
  const t = useTranslations("contacts.appointments");
  const fmt = use(getFormats());
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">
        {t("rendez_vous", { n: (appointments.length > 0 && ` (${appointments.length})`) || "" })}
      </h2>

      {erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>
      )}

      {appointments.length === 0 ? (
        <EmptyState>{t("aucun_rendez_vous_pour_cette_fiche")}</EmptyState>
      ) : (
        <ListCard>
          {appointments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate text-sm font-medium${a.status === "canceled" ? " text-muted-foreground line-through" : ""}`}>
                  {fmt.dateTime(a.startsAt)}
                  {a.title ? ` · ${a.title}` : ""}
                </span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {a.hostLabel && <span>{t("avec", { name: a.hostLabel })}</span>}
                  {a.status === "canceled" && a.canceledAt && <span>{t("annule_le", { when: fmt.date(a.canceledAt) })}</span>}
                </span>
              </div>
              {a.source === "calendly" && (
                <Badge variant="secondary" className="shrink-0">
                  {t("source_calendly")}
                </Badge>
              )}
              {a.status === "scheduled" && (
                <form action={cancelAppointmentAction.bind(null, { backTo, appointmentId: a.id })}>
                  <Button
                    type="submit"
                    variant="outline"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label={t("annuler_ce_rendez_vous")}
                    title={t("annuler_ce_rendez_vous")}
                  >
                    <X />
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ListCard>
      )}

      <form
        action={createAppointmentAction.bind(null, { backTo, contactId })}
        className="flex flex-wrap items-center gap-2"
      >
        <Input
          name="startsAt"
          type="datetime-local"
          aria-label={t("date_et_heure_du_rendez_vous")}
          title={t("vide_maintenant")}
          className="w-fit"
        />
        <Input
          name="title"
          placeholder={t("titre_facultatif")}
          aria-label={t("titre_du_rendez_vous")}
          className="min-w-40 flex-1"
        />
        <Button type="submit" variant="outline">
          {t("ajouter_le_rendez_vous")}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{t("date_vide_le_rendez_vous_est_date_de_maintenant")}</p>
    </section>
  );
}
