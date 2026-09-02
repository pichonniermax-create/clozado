import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard } from "@/components/ui/list-card";
import { listRuleJournal, listRules } from "@/db/queries/rules";
import type { RuleSkipReason } from "@/lib/rules/evaluate";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

/**
 * /regles/journal (§5.4) — toutes les actions du moteur, faites ou non
 * faites AVEC LE MOTIF : la mémoire anti-répétition rendue lisible.
 * Filtres par règle et par résultat, en GET — une adresse copiable.
 */
export default async function RuleJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ regle?: string; resultat?: string }>;
}) {
  const t = await getTranslations("rules");
  const fmt = await getFormats();
  const user = await requireUser();
  if (!user.organizationId) redirect("/dashboard");
  const { regle, resultat } = await searchParams;
  const outcome = resultat === "done" || resultat === "skipped" ? resultat : undefined;
  const [rows, rules] = await Promise.all([
    listRuleJournal(user, { ruleId: regle || undefined, outcome, limit: 200 }),
    listRules(user),
  ]);

  const SELECT_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";
  return (
    <>
      <PageHeader
        title={t("journal.journal_des_regles")}
        description={t("journal.fait_ou_pas_fait_et_pourquoi")}
        backTo={{ href: "/regles", label: t("editor.regles") }}
      />
      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="regle" defaultValue={regle ?? ""} className={SELECT_CLASS} aria-label={t("journal.filtrer_par_regle")}>
          <option value="">{t("journal.toutes_les_regles")}</option>
          {rules.map(({ rule }) => (
            <option key={rule.id} value={rule.id}>
              {rule.name}
            </option>
          ))}
        </select>
        <select name="resultat" defaultValue={resultat ?? ""} className={SELECT_CLASS} aria-label={t("journal.filtrer_par_resultat")}>
          <option value="">{t("journal.tous_les_resultats")}</option>
          <option value="done">{t("journal.faites")}</option>
          <option value="skipped">{t("journal.non_faites")}</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          {t("journal.filtrer")}
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState>{t("journal.rien_pour_ces_filtres")}</EmptyState>
      ) : (
        <ListCard>
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="tabular-nums text-xs text-muted-foreground">{fmt.dateTime(row.occurredAt)}</span>
              <span className="font-medium">{row.ruleName}</span>
              <Link href={`/contacts/${row.contactId}`} className="underline underline-offset-2 hover:text-foreground">
                {row.contactName}
              </Link>
              <span className="text-muted-foreground">{t(`editor.actions.${row.action as "create_task"}`)}</span>
              {row.outcome === "done" ? (
                <Badge variant="secondary">{t("journal.faite")}</Badge>
              ) : (
                <Badge variant="outline" title={row.skipReason ?? undefined}>
                  {row.skipReason ? t(`skip.${row.skipReason as RuleSkipReason}`) : t("journal.non_faite")}
                </Badge>
              )}
              {row.templateVersion !== null && <span className="text-xs text-muted-foreground">{t("journal.gabarit_vn", { n: row.templateVersion })}</span>}
            </li>
          ))}
        </ListCard>
      )}
    </>
  );
}
