import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Gauge, MailWarning, PauseCircle, PlayCircle, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { ColumnChooserTable } from "@/components/ui/column-chooser-table";
import {
  BOUNCE_RATE_LIMIT,
  COMPLAINT_RATE_LIMIT,
  HEALTH_MIN_VOLUME,
  HEALTH_WINDOW_DAYS,
  platformSuppressionCounts,
  sendingHealth,
  warmupCap,
} from "@/db/queries/sending-health";
import { setSendingPauseAction } from "@/lib/admin/actions";
import { getFormats } from "@/i18n/formats";
import { requireSessionUser } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sendingHealth");
  return { title: t("titre") };
}

/**
 * /sante-envoi — L'ÉTAT D'ENVOI DE TOUT LE SERVICE, pour le super admin
 * (chantier envoi, garde-fous). Réservé au super admin RÉEL : c'est lui qui
 * répond de la réputation de l'IP et du domaine partagés, pas un client.
 *
 * Ce que l'écran montre, et pourquoi : le volume et les taux de la fenêtre
 * glissante (sept jours), organisation par organisation, avec les DEUX
 * seuils qui déclenchent la pause automatique ; les organisations en pause
 * et depuis quand ; la liste repoussoir de la plateforme (des empreintes,
 * jamais une adresse) ; le quota du jour et l'échauffement en cours.
 *
 * Un taux sous le volume significatif s'affiche « — » : une plainte sur
 * trois messages n'est pas un taux de 33 %, c'est un incident isolé.
 *
 * La reprise est MANUELLE et le restera : une pause automatique dit qu'il y
 * a une liste à nettoyer. Relancer sans rien nettoyer recommencerait.
 */
export default async function SendingHealthPage() {
  const user = await requireSessionUser();
  if (user.role !== "super_admin") redirect("/dashboard");

  const t = await getTranslations("sendingHealth");
  const fmt = await getFormats();
  const [rows, platform] = await Promise.all([sendingHealth(), platformSuppressionCounts()]);

  const totals = rows.reduce(
    (acc, r) => ({
      sent: acc.sent + r.sent,
      bounced: acc.bounced + r.bounced,
      complained: acc.complained + r.complained,
      paused: acc.paused + (r.paused ? 1 : 0),
    }),
    { sent: 0, bounced: 0, complained: 0, paused: 0 }
  );
  const rate = (value: number | null, significant: boolean) =>
    value === null || !significant ? "—" : (fmt.percent(Math.round(value * 10000) / 100) ?? "—");

  async function pause(formData: FormData) {
    "use server";
    await setSendingPauseAction(String(formData.get("organizationId") ?? ""), String(formData.get("motif") ?? "") || null);
  }

  return (
    <>
      <PageHeader title={t("titre")} description={t("description", { jours: HEALTH_WINDOW_DAYS })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("envoyes")} value={totals.sent} icon={<Gauge />} />
        <StatTile label={t("rebonds")} value={totals.bounced} icon={<MailWarning />} tone="warning" />
        <StatTile label={t("plaintes")} value={totals.complained} icon={<ShieldAlert />} tone="critical" />
        <StatTile label={t("en_pause")} value={totals.paused} icon={<PauseCircle />} tone="critical" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("liste_repoussoir")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">{t("liste_repoussoir_explication")}</p>
          <p className="tabular-nums">
            {t("empreintes", { rebonds: platform.bounced, plaintes: platform.complained })}
            {platform.last && ` · ${t("derniere", { formatDate: fmt.date(platform.last) })}`}
          </p>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title={t("aucune_organisation")}>{t("aucune_organisation_texte")}</EmptyState>
      ) : (
        <ColumnChooserTable
          storageKey="sante-envoi"
          caption={t("par_organisation", { jours: HEALTH_WINDOW_DAYS })}
          columns={[
            { key: "organisation", label: t("organisation"), align: "left" },
            { key: "envoyes", label: t("envoyes") },
            { key: "remis", label: t("remis") },
            { key: "rebonds", label: t("rebonds") },
            { key: "plaintes", label: t("plaintes") },
            { key: "taux_rebond", label: t("taux_rebond") },
            { key: "taux_plainte", label: t("taux_plainte") },
            { key: "quota", label: t("quota") },
            { key: "suppressions", label: t("suppressions") },
            { key: "etat", label: t("etat"), align: "left" },
          ]}
          rows={rows.map((r) => {
            const cap = warmupCap(r.warmupStartedAt);
            return {
              key: r.organizationId,
              cells: {
                organisation: <span className="font-medium">{r.name}</span>,
                envoyes: r.sent,
                remis: r.delivered,
                rebonds: r.bounced,
                plaintes: r.complained,
                // Le taux est comparé au seuil : au-dessus, il se voit.
                taux_rebond:
                  r.bounceRate !== null && r.significant && r.bounceRate >= BOUNCE_RATE_LIMIT ? (
                    <span className="font-semibold text-destructive">{rate(r.bounceRate, r.significant)}</span>
                  ) : (
                    rate(r.bounceRate, r.significant)
                  ),
                taux_plainte:
                  r.complaintRate !== null && r.significant && r.complaintRate >= COMPLAINT_RATE_LIMIT ? (
                    <span className="font-semibold text-destructive">{rate(r.complaintRate, r.significant)}</span>
                  ) : (
                    rate(r.complaintRate, r.significant)
                  ),
                quota: cap === null ? r.quota : `${Math.min(cap, r.quota)} (${t("echauffement")})`,
                suppressions: r.suppressions,
                etat: r.paused ? (
                  <span className="flex flex-col gap-1">
                    <StatusBadge tone="danger">{t("en_pause")}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{r.pauseReason}</span>
                    <form action={pause}>
                      <input type="hidden" name="organizationId" value={r.organizationId} />
                      <input type="hidden" name="motif" value="" />
                      <Button type="submit" variant="ghost" size="sm">
                        <PlayCircle />
                        {t("reprendre")}
                      </Button>
                    </form>
                  </span>
                ) : (
                  <span className="flex flex-col gap-1">
                    <StatusBadge tone="success">{t("actif")}</StatusBadge>
                    <ConfirmSubmit
                      action={pause}
                      fields={{ organizationId: r.organizationId, motif: "pause_manuelle" }}
                      title={t("suspendre_confirmation_titre", { nom: r.name })}
                      description={t("suspendre_confirmation_texte")}
                      confirmLabel={t("suspendre")}
                      cancelLabel={t("annuler")}
                    >
                      <PauseCircle />
                      {t("suspendre")}
                    </ConfirmSubmit>
                  </span>
                ),
              },
            };
          })}
        />
      )}

      <p className="text-xs text-muted-foreground text-pretty">
        {t("seuils", {
          plainte: (COMPLAINT_RATE_LIMIT * 100).toFixed(1),
          rebond: (BOUNCE_RATE_LIMIT * 100).toFixed(0),
          volume: HEALTH_MIN_VOLUME,
          jours: HEALTH_WINDOW_DAYS,
        })}
      </p>
    </>
  );
}
