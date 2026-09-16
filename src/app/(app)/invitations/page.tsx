import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Ban, MailPlus, Send } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard, ListRow } from "@/components/ui/list-card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { setActiveOrganizationAction } from "@/lib/admin/actions";
import {
  DEFAULT_INVITATION_VALIDITY_DAYS,
  INVITATION_VALIDITY_DAYS,
  invitationsAvailable,
  listWorkspaceInvitations,
  type InvitationListItem,
  type InvitationStatus,
} from "@/db/queries/workspace-invitations";
import { getFormats } from "@/i18n/formats";
import { LOCALES, localeDisplayName } from "@/i18n/locales";
import { createInvitationAction, revokeInvitationAction, sendInvitationEmailAction } from "@/lib/invitations/actions";
import { invitationUrl } from "@/lib/invitations/token";
import { requestOrigin } from "@/lib/request-origin";
import { requireSessionUser } from "@/lib/session";
import { NativeSelect } from "@/components/ui/native-select";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invitations.page");
  return { title: t("titre") };
}


/** La grammaire commune des statuts : ce qui attend un geste en ambre, ce qui a abouti en vert, les fins normales en neutre. */
const STATUS_TONE: Record<InvitationStatus, StatusTone> = {
  en_attente: "warning",
  utilisee: "success",
  expiree: "neutral",
  revoquee: "neutral",
};

/** « Ouvrir l'espace » d'une invitation utilisée : la substitution du super admin, puis le tableau de bord. */
async function openWorkspace(formData: FormData) {
  "use server";
  await setActiveOrganizationAction(String(formData.get("organizationId") ?? "") || null);
  redirect("/dashboard");
}

/**
 * /invitations — l'espace gestionnaire des liens de création d'espace
 * (docs/module-invitations.md §1.3). Réservé au super admin RÉEL (le rôle
 * de session, pas la substitution) : un admin d'organisation n'y a rien à
 * faire et n'y arrive pas. Trois zones : le lien qui vient d'être généré
 * (mis en avant, à copier ou à envoyer), le formulaire replié, la liste
 * avec l'état de chaque invitation et les gestes qu'il autorise.
 */
export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; info?: string; nouvelle?: string; nouveau?: string }>;
}) {
  const user = await requireSessionUser();
  if (user.role !== "super_admin") redirect("/dashboard");
  const [t, fmt, params] = await Promise.all([getTranslations("invitations.page"), getFormats(), searchParams]);
  // La migration 0018 pas encore appliquée sur cette base (dev et prod la partagent, elle n'y passe qu'avec accord) : l'écran le dit, il ne tombe pas.
  if (!(await invitationsAvailable())) {
    return (
      <>
        <PageHeader title={t("titre")} description={t("description")} />
        <EmptyState icon={<MailPlus />} title={t("migration_manquante_titre")}>
          {t("migration_manquante")}
        </EmptyState>
      </>
    );
  }
  const [invitations, origin] = await Promise.all([listWorkspaceInvitations(user), requestOrigin()]);
  const highlighted = params.nouvelle ? (invitations.find((row) => row.id === params.nouvelle && row.token) ?? null) : null;
  const pending = invitations.filter((row) => row.status === "en_attente").length;
  // Ce qui attend un geste d'abord (audit UI du 2026-09-14) : la seule invitation actionnable se retrouvait en 4e position, entre des révoquées et des utilisées.
  const ordered = [...invitations.filter((row) => row.status === "en_attente"), ...invitations.filter((row) => row.status !== "en_attente")];

  return (
    <>
      <PageHeader title={t("titre")} description={t("description")} />

      {highlighted && highlighted.token && (
        <Card className="border-primary/40 bg-primary-soft/40">
          <CardHeader>
            <CardTitle>{t("lien_pret")}</CardTitle>
            <CardDescription>{t("lien_pret_explication", { name: highlighted.organizationName, date: fmt.date(highlighted.expiresAt) })}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <code className="min-w-0 flex-1 text-xs break-all">{invitationUrl(origin, highlighted.token)}</code>
              <CopyButton value={invitationUrl(origin, highlighted.token)} label={t("copier_le_lien")} />
            </div>
            {highlighted.email && (
              <form action={sendInvitationEmailAction}>
                <input type="hidden" name="id" value={highlighted.id} />
                <Button type="submit" size="sm">
                  <Send />
                  {t("envoyer_par_email_a", { email: highlighted.email })}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <DetailsCard summary={t("nouvelle_invitation")} defaultOpen={invitations.length === 0 || params.nouveau === "1"}>
        <form action={createInvitationAction} className="flex flex-col gap-5">
          <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("nom_de_l_entreprise")} htmlFor="organizationName" hint={t("nom_hint")} className="sm:col-span-2">
              <Input id="organizationName" name="organizationName" required minLength={2} maxLength={120} placeholder={t("nom_placeholder")} autoComplete="organization" />
            </Field>
            <Field label={t("adresse_reservee")} htmlFor="email" hint={t("adresse_hint")} className="sm:col-span-2">
              <Input id="email" name="email" type="email" placeholder={t("adresse_placeholder")} autoComplete="off" />
            </Field>
            <Field label={t("langue_de_l_espace")} htmlFor="locale">
              <NativeSelect id="locale" name="locale" defaultValue="fr" className="w-full">
                {LOCALES.map((locale) => (
                  <option key={locale} value={locale}>
                    {localeDisplayName(locale)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("validite")} htmlFor="validityDays">
              <NativeSelect id="validityDays" name="validityDays" defaultValue={String(DEFAULT_INVITATION_VALIDITY_DAYS)} className="w-full">
                {INVITATION_VALIDITY_DAYS.map((days) => (
                  <option key={days} value={days}>
                    {t("jours", { days })}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("note_interne")} htmlFor="note" hint={t("note_hint")} className="sm:col-span-2">
              <Textarea id="note" name="note" rows={2} maxLength={2000} />
            </Field>
          </div>
          <Button type="submit" className="w-fit">
            <MailPlus />
            {t("generer_le_lien")}
          </Button>
        </form>
      </DetailsCard>

      {invitations.length === 0 ? (
        <EmptyState icon={<MailPlus />} title={t("aucune_invitation")}>
          {t("aucune_invitation_explication")}
        </EmptyState>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("en_attente_count", { count: pending })}</p>
          <ListCard>
            {ordered.map((row) => (
              <InvitationRow key={row.id} row={row} origin={origin} />
            ))}
          </ListCard>
        </section>
      )}
    </>
  );
}

async function InvitationRow({ row, origin }: { row: InvitationListItem; origin: string }) {
  const [t, fmt] = await Promise.all([getTranslations("invitations.page"), getFormats()]);
  const pending = row.status === "en_attente";
  const meta: string[] = [t("creee_le_par", { date: fmt.date(row.createdAt), who: row.createdByEmail ?? "—" })];
  if (pending) meta.push(t("expire_le", { date: fmt.date(row.expiresAt) }));
  if (pending && row.sentAt) meta.push(t("email_envoye_le", { date: fmt.dateTime(row.sentAt) }));
  return (
    <ListRow className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {row.organizationName}
          <StatusBadge tone={STATUS_TONE[row.status]}>{t(`statut.${row.status}`)}</StatusBadge>
          {row.status === "utilisee" && row.organization && <Badge variant="outline">{row.organization.name}</Badge>}
        </span>
        <span className="text-xs text-muted-foreground break-all">{row.email ?? t("lien_ouvert")}</span>
        <span className="text-xs text-muted-foreground">{meta.join(" · ")}</span>
        {row.status === "utilisee" && row.usedAt && (
          <span className="text-xs text-muted-foreground">
            {t("espace_cree_le", { date: fmt.date(row.usedAt), email: row.usedByEmail ?? "—" })}
          </span>
        )}
        {row.status === "revoquee" && row.revokedAt && <span className="text-xs text-muted-foreground">{t("revoquee_le", { date: fmt.date(row.revokedAt) })}</span>}
        {row.status === "expiree" && <span className="text-xs text-muted-foreground">{t("expiree_le", { date: fmt.date(row.expiresAt) })}</span>}
        {row.note && <span className="text-xs text-muted-foreground italic">{row.note}</span>}
      </div>
      {pending && (
        // Des gestes de taille normale (28 px à la souris, 40 px au doigt), et « Révoquer » — irréversible — derrière une confirmation.
        <div className="flex flex-wrap items-center gap-1.5">
          {row.token && <CopyButton value={invitationUrl(origin, row.token)} label={t("copier_le_lien")} size="sm" />}
          {row.email && (
            <form action={sendInvitationEmailAction}>
              <input type="hidden" name="id" value={row.id} />
              <Button type="submit" variant="ghost" size="sm">
                <Send />
                {row.sentAt ? t("renvoyer_l_email") : t("envoyer_par_email")}
              </Button>
            </form>
          )}
          <ConfirmSubmit
            action={revokeInvitationAction}
            fields={{ id: row.id }}
            title={t("revoquer_titre")}
            description={t("revoquer_texte", { name: row.organizationName })}
            confirmLabel={t("revoquer")}
            cancelLabel={t("annuler")}
            className="text-destructive hover:text-destructive"
          >
            <Ban />
            {t("revoquer")}
          </ConfirmSubmit>
        </div>
      )}
      {row.status === "utilisee" && row.organization && (
        <form action={openWorkspace}>
          <input type="hidden" name="organizationId" value={row.organization.id} />
          <Button type="submit" variant="outline" size="sm">
            {t("ouvrir_l_espace")}
          </Button>
        </form>
      )}
    </ListRow>
  );
}
