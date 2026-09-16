import Link from "next/link";
import { use } from "react";
import { AuthBadge, AuthEvidence } from "@/components/inbound/auth-badge";
import { InboundProposalCard } from "@/components/inbound/inbound-proposal-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListRow } from "@/components/ui/list-card";
import {
  countInboundByTab,
  countRejectionsByReason,
  findContactCandidates,
  INBOUND_PAGE_SIZE,
  isInboundTab,
  listInboundEmails,
  type InboundListRow,
  type InboundTab,
} from "@/db/queries/inbound";
import { getFormats } from "@/i18n/formats";
import { inboundDomain } from "@/lib/email/config";
import { ingestAddress } from "@/lib/email/inbound/address";
import { getOwnOrganization } from "@/db/queries/organizations";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

/**
 * `/emails-recus` (docs/module-engagement.md §4.3) — ce que l'adresse
 * d'ingestion a reçu, en trois onglets : à confirmer (des PROPOSITIONS,
 * rien n'est écrit), traités (confirmés ou ignorés, avec la fiche), et
 * REFUSÉS — visibles, avec le motif en clair et le verdict
 * d'authentification : un email refusé en silence est un email perdu.
 */
const TABS: InboundTab[] = ["pending", "treated", "rejected"];

export default async function EmailsRecusPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; page?: string; erreur?: string; info?: string }>;
}) {
  const t = await getTranslations("inbound.page");
  const user = await requireUser();
  const params = await searchParams;
  const tab: InboundTab = isInboundTab(params.onglet) ? params.onglet : "pending";
  // Un entier strictement positif, sinon la première page (stabilisation, E7 : `?page=1.5` faisait une erreur SQL).
  const page = Number.isInteger(Number(params.page)) && Number(params.page) > 0 ? Number(params.page) : 1;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title={t("emails_recus")} description={t("ce_que_l_adresse_d_ingestion_a_recu")} />
        <EmptyState title={t("choisis_une_organisation")}>{t("cet_ecran_appartient_a_une_organisation")}</EmptyState>
      </>
    );
  }

  const [counts, rows, org, rejectionsByReason] = await Promise.all([
    countInboundByTab(user),
    listInboundEmails(user, tab, page),
    getOwnOrganization(user),
    // Les refus par motif, en tête de l'onglet « Refusés » (stabilisation, P5) : un email refusé se compte, jamais en silence.
    tab === "rejected" ? countRejectionsByReason(user) : Promise.resolve([]),
  ]);
  const tr = await getTranslations("inbound.rejection");
  // Les candidats ne servent qu'à l'onglet « à confirmer » : ailleurs, le sort est déjà écrit.
  const candidates =
    tab === "pending"
      ? await Promise.all(rows.map((row) => findContactCandidates(user, { email: row.counterpartEmail, name: row.counterpartName })))
      : [];

  // L'adresse d'ingestion est un secret (le jeton EST l'adresse) : un visiteur de la démo publique ne la voit jamais
  // (docs/module-demo.md §1.4 — un réglage, comme /settings).
  const readOnly = Boolean(user.readOnly);
  let address: string | null = null;
  try {
    address = org?.ingestToken && !readOnly ? ingestAddress(org.ingestToken, inboundDomain()) : null;
  } catch {
    address = null;
  }

  const total = counts[tab];
  const pageCount = Math.max(1, Math.ceil(total / INBOUND_PAGE_SIZE));
  const pageHref = (p: number) => `/emails-recus?onglet=${tab}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      {/* L'adresse n'est plus noyée dans la description (elle prenait toute la ligne et renvoyait l'action sous le titre) :
          une ligne dédiée, copiable d'un geste — c'est LE geste de l'écran. Le bouton dit un verbe. */}
      <PageHeader
        title={t("emails_recus")}
        description={address ? t("transfere_ou_mets_en_copie_cachee") : t("ce_que_l_adresse_d_ingestion_a_recu")}
        actions={
          readOnly ? undefined : (
            <Link href="/settings#ingestion" className={buttonVariants({ variant: "outline" })}>
              {t("regler_l_adresse")}
            </Link>
          )
        }
      />

      {address && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">{t("ton_adresse_d_ingestion")}</span>
          <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs break-all">{address}</code>
          <CopyButton value={address} />
        </div>
      )}

      {!address && !readOnly && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-pretty">
          {t.rich("aucune_adresse_encore", { link: (chunks) => <Link href="/settings#ingestion" className="underline underline-offset-2">{chunks}</Link> })}
        </p>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label={t("onglets")}>
        {TABS.map((key) => (
          <Link
            key={key}
            href={`/emails-recus?onglet=${key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              key === tab ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            aria-current={key === tab ? "page" : undefined}
          >
            {t(`tabs.${key}`, { count: counts[key] })}
          </Link>
        ))}
      </nav>

      <section className="flex flex-col gap-3">
        {tab === "rejected" && rejectionsByReason.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{t("refus_par_motif")}</span>
            {rejectionsByReason.map(({ reason, n }) => (
              <Badge key={reason} variant="outline" className="border-warning/50 tabular-nums">
                {tr(reason)} · {n}
              </Badge>
            ))}
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState title={t(`empty.${tab}`)}>{t(`emptyHint.${tab}`)}</EmptyState>
        ) : tab === "pending" ? (
          <div className="flex flex-col gap-4">
            {rows.map((row, index) => (
              <InboundProposalCard key={row.id} email={row} candidates={candidates[index] ?? []} />
            ))}
          </div>
        ) : (
          <ListCard>
            {rows.map((row) => (
              <TreatedRow key={row.id} row={row} rejected={tab === "rejected"} />
            ))}
          </ListCard>
        )}

        {pageCount > 1 && (
          <nav className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("precedents")}
              </Link>
            ) : (
              <span />
            )}
            <span className="tabular-nums text-muted-foreground">{t("page_sur", { page, pageCount })}</span>
            {page < pageCount ? (
              <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("suivants")}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </>
  );
}

/** Une ligne d'email traité ou refusé : le sort, sa preuve, et la fiche quand il y en a une. */
function TreatedRow({ row, rejected }: { row: InboundListRow; rejected: boolean }) {
  const t = useTranslations("inbound.page");
  const tr = useTranslations("inbound.rejection");
  const fmt = use(getFormats());
  return (
    <ListRow>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{row.subject || t("sans_objet")}</span>
          {rejected ? (
            <Badge variant="outline" className="border-warning/50">{tr(row.rejectionReason as "unknown_address")}</Badge>
          ) : row.status === "ignored" ? (
            <Badge variant="outline">{t("ignore")}</Badge>
          ) : (
            <Badge variant="secondary">{t("confirme")}</Badge>
          )}
          {/* Le verdict n'a de sens que s'il a été CALCULÉ : un email refusé
              pour son débit ou son expéditeur n'a jamais été authentifié —
              afficher « vérification impossible » laisserait croire à un
              échec de vérification. */}
          {(row.authResult !== "unavailable" || row.rejectionReason === "sender_not_authenticated") && <AuthBadge result={row.authResult} />}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("recu_de_le", { sender: row.senderEmail, when: fmt.dateTime(row.receivedAt) })}
          {row.contactId && row.contactName ? " · " : ""}
          {row.contactId && row.contactName && (
            <Link href={`/contacts/${row.contactId}`} className="underline underline-offset-2">
              {row.contactName}
            </Link>
          )}
        </p>
        {rejected && <AuthEvidence detail={row.authDetail} />}
      </div>
    </ListRow>
  );
}
