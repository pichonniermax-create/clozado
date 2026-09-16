import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard } from "@/components/ui/list-card";
import { listRuleJournal, listRules } from "@/db/queries/rules";
import type { RuleSkipReason } from "@/lib/rules/evaluate";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import { NativeSelect } from "@/components/ui/native-select";

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
    // Les archivées aussi : leurs lignes de journal restent, on doit pouvoir les filtrer (stabilisation, D4).
    listRules(user, { includeArchived: true }),
  ]);

  return (
    <>
      <PageHeader
        title={t("journal.journal_des_regles")}
        description={t("journal.fait_ou_pas_fait_et_pourquoi")}
        backTo={{ href: "/regles", label: t("editor.regles") }}
      />
      {/* Pleine largeur sous sm (la largeur naturelle d'un select est celle de sa plus longue option — un nom de règle
          long débordait de l'écran), une seule rangée à la même hauteur au-dessus. */}
      <form method="get" className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <NativeSelect name="regle" defaultValue={regle ?? ""} className="w-full sm:w-auto sm:max-w-xs" aria-label={t("journal.filtrer_par_regle")}>
          <option value="">{t("journal.toutes_les_regles")}</option>
          {rules.map(({ rule }) => (
            <option key={rule.id} value={rule.id}>
              {rule.archivedAt ? t("list.nom_archivee", { name: rule.name }) : rule.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="resultat" defaultValue={resultat ?? ""} className="w-full sm:w-auto" aria-label={t("journal.filtrer_par_resultat")}>
          <option value="">{t("journal.tous_les_resultats")}</option>
          <option value="done">{t("journal.faites")}</option>
          <option value="skipped">{t("journal.non_faites")}</option>
        </NativeSelect>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          {t("journal.filtrer")}
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState>{t("journal.rien_pour_ces_filtres")}</EmptyState>
      ) : (
        <>
          <ListCard>
            {rows.map((row) => (
              // Trois colonnes alignées d'une ligne à l'autre (date · règle et sa sous-ligne · résultat) : un journal se balaie
              // — six fragments en flex-wrap laissaient badges et « gabarit v1 » orphelins sur une seconde ligne.
              <li key={row.id} className="grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center">
                <span className="text-xs text-muted-foreground tabular-nums">{fmt.dateTime(row.occurredAt)}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{row.ruleName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    <Link href={`/contacts/${row.contactId}`} className="underline underline-offset-2 hover:text-foreground">
                      {row.contactName}
                    </Link>
                    {" · "}
                    {t(`editor.actions.${row.action as "create_task"}`)}
                    {row.templateVersion !== null ? ` · ${t("journal.gabarit_vn", { n: row.templateVersion })}` : ""}
                  </span>
                </span>
                {/* Faite = succès, non faite = à regarder : c'est la raison d'être de l'écran, elle se voit au premier balayage. */}
                {row.outcome === "done" ? (
                  <StatusBadge tone="success" className="sm:justify-self-end">
                    {t("journal.faite")}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="warning" className="sm:justify-self-end" title={row.skipReason ?? undefined}>
                    {row.skipReason ? t(`skip.${row.skipReason as RuleSkipReason}`) : t("journal.non_faite")}
                  </StatusBadge>
                )}
              </li>
            ))}
          </ListCard>
          {rows.length === 200 && <p className="text-xs text-muted-foreground">{t("journal.les_200_derniers")}</p>}
        </>
      )}
    </>
  );
}
