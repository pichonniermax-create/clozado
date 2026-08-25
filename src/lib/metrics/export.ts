import type { CsvCell, CsvTable } from "@/lib/csv";
import type { OrgScopeUser } from "@/lib/session";
import { MIN_OBSERVATIONS } from "./definitions";
import { delaysReport, type DelaysReport } from "./delays-report";
import { ORIGIN_UNKNOWN, ORIGIN_UNMATCHED, type MetricFilters } from "./filters";
import { funnelReport, type FunnelChain, type FunnelCount, type FunnelReport, type FunnelStep } from "./funnel";
import { lossesReport, type LossBreakdownRow, type LossesReport } from "./losses";
import { partnersReport, type MoneyCount, type PartnersReport } from "./partners";
import { periodPhrase } from "./period-phrase";
import type { ParsedMetricFilters } from "./search-params";
import type { DurationStat, RateStat } from "./types";

/**
 * L'export CSV d'une vue analytique — la projection en tableaux du MÊME
 * rapport que l'écran affiche (`delaysReport`, `funnelReport`,
 * `lossesReport`, `partnersReport`), avec les mêmes filtres : jamais un
 * calcul refait ici. Un fichier = la vue : ses tableaux à la suite, dans
 * l'ordre de l'écran, précédés d'un tableau qui dit les filtres appliqués.
 * Les règles d'affichage sont celles des écrans : un indicateur masqué
 * (sous le seuil) est une cellule vide, la colonne « Affichage » dit ce
 * qui lui manque ; un montant dont rien n'est connu est vide, jamais 0 ;
 * un compte sans objet est vide, la note dit pourquoi.
 */
export const EXPORT_VIEWS = {
  delais: { label: "Délais et durées", path: "/analytique/delais" },
  funnel: { label: "Funnel de conversion", path: "/analytique/funnel" },
  pertes: { label: "Analyse des pertes", path: "/analytique/pertes" },
  partenaires: { label: "Partenaires et commissions", path: "/analytique/partenaires" },
} as const;

export type ExportView = keyof typeof EXPORT_VIEWS;

export function parseExportView(value: string | null | undefined): ExportView | null {
  return value && value in EXPORT_VIEWS ? (value as ExportView) : null;
}

/** Les libellés dont le fichier a besoin — les mêmes listes que la barre de filtres. */
export type ExportLookups = {
  organizationName: string;
  users: { id: string; name: string | null; email: string }[];
  types: { id: string; label: string }[];
  pipelines: { id: string; label: string }[];
  origins: { id: string; label: string }[];
};

const SHOWN = "affiché";

function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/** La même phrase que sous les tableaux de durées (`statNotes`). */
function durationDisplay(stat: DurationStat): string {
  if (stat.unavailable) return `non mesurable : ${stat.unavailable}`;
  if (stat.hidden) {
    return stat.n === 0
      ? `aucune observation — il en faut ${stat.missing} pour afficher un chiffre`
      : `masqué : il manque ${plural(stat.missing, "observation")} pour afficher un chiffre`;
  }
  return SHOWN;
}

/** La même phrase que sous un taux de funnel (`rateText`). */
function rateDisplay(rate: RateStat | null, base = "au pas précédent"): string {
  if (!rate) return "sans objet";
  if (rate.hidden || rate.percent === null) return `masqué : il manque ${plural(rate.missing, "observation")} ${base}`;
  return SHOWN;
}

const days = (stat: DurationStat, value: number | null): number | null => (stat.hidden ? null : value);
const observations = (stat: DurationStat): number | null => (stat.unavailable ? null : stat.n);
const percent = (rate: RateStat | null): number | null => (rate && !rate.hidden && rate.percent !== null ? rate.percent : null);
const drop = (rate: RateStat | null): number | null => {
  const p = percent(rate);
  return p === null || p > 100 ? null : 100 - p;
};
const count = (c: FunnelCount): number | null => (c.unavailable ? null : c.n);
/** Un montant dont AUCUNE ligne n'est connue reste vide — jamais 0 pour dire « inconnu ». */
const amount = (m: MoneyCount | { n: number; amount: number; withoutAmount: number }): number | null =>
  m.n > 0 && m.withoutAmount === m.n ? null : m.amount;

// ---------------------------------------------------------------- Délais

function delaysTables(report: DelaysReport, lookups: ExportLookups): CsvTable[] {
  const tables: CsvTable[] = [
    {
      title: "Le cycle",
      columns: ["Indicateur", "Médiane (jours)", "Moyenne (jours)", "Observations", "Affichage", "En cours", "Écartées (reconstituées)", "Écartées (date inconnue)"],
      rows: report.cycle.map(({ metric, stat }) => [
        metric.label,
        days(stat, stat.medianDays),
        days(stat, stat.meanDays),
        observations(stat),
        durationDisplay(stat),
        stat.pending,
        stat.excludedReconstructed,
        stat.excludedUnknown,
      ]),
    },
  ];
  const pipelineIds = [...new Set([...report.stages.map((s) => s.pipelineId), ...report.pairs.map((p) => p.pipelineId)])];
  const ordered = lookups.pipelines.filter((p) => pipelineIds.includes(p.id));
  for (const pipeline of ordered) {
    const stages = report.stages.filter((s) => s.pipelineId === pipeline.id);
    const pairs = report.pairs.filter((p) => p.pipelineId === pipeline.id);
    if (stages.length > 0) {
      tables.push({
        title: `Temps passé par étape — ${pipeline.label}`,
        columns: ["Étape", "Médiane (jours)", "Moyenne (jours)", "Observations (passages terminés)", "Affichage", "Affaires dans l'étape aujourd'hui", "Passages reconstitués écartés"],
        rows: stages.map((s) => [s.label, days(s, s.medianDays), days(s, s.meanDays), observations(s), durationDisplay(s), s.pending, s.excludedReconstructed]),
      });
    }
    if (pairs.length > 0) {
      tables.push({
        title: `D'une étape à la suivante — ${pipeline.label}`,
        columns: ["Étapes", "Médiane (jours)", "Moyenne (jours)", "Observations", "Affichage"],
        rows: pairs.map((p) => [`${p.fromLabel} → ${p.toLabel}`, days(p, p.medianDays), days(p, p.meanDays), observations(p), durationDisplay(p)]),
      });
    }
  }
  return tables;
}

// ---------------------------------------------------------------- Funnel

/** Les mentions d'un pas de la chaîne — les mêmes faits que sous le pas à l'écran, en texte. */
function chainNote(chain: FunnelChain, step: FunnelStep): string {
  const over = step.rate !== null && step.rate.percent !== null && step.rate.percent > 100;
  const parts: string[] = [];
  switch (step.metric.id) {
    case "funnel_visitors":
      if (!chain.collection.everEvents) parts.push("les visites ne sont pas encore mesurées (extrait à poser)");
      break;
    case "funnel_leads":
      if (!chain.collection.everLeads) parts.push("aucun lead reçu (entrée des leads à brancher)");
      else if (over) parts.push("plus de leads que de simulations terminées mesurées : des leads arrivent sans passer par l'extrait");
      break;
    case "funnel_contacted":
      if (chain.leadsPending > 0) parts.push(plural(chain.leadsPending, "lead sans premier contact consigné", "leads sans premier contact consigné"));
      break;
    case "funnel_deals_from_leads":
      if (over) parts.push("plus d'affaires que de contacts établis : des interactions ne sont pas consignées");
      if (chain.deals.byPipeline.length > 1) parts.push(`par pipeline : ${chain.deals.byPipeline.map((p) => `${p.label} ${p.n}`).join(" · ")}`);
      break;
    case "funnel_won":
      if (!step.count.unavailable) parts.push(`${plural(chain.deals.lost, "perdue")} · ${plural(chain.deals.open, "en cours", "en cours")}`);
      break;
  }
  return parts.join(" · ");
}

function funnelTables(report: FunnelReport): CsvTable[] {
  const rateColumns = ["Taux de passage (%)", "Déperdition (%)", "Affichage du taux"];
  const rateCells = (rate: RateStat | null, unavailable?: string): CsvCell[] => [
    percent(rate),
    drop(rate),
    unavailable ? `sans objet : ${unavailable}` : rateDisplay(rate),
  ];
  const tables: CsvTable[] = [
    {
      title: "La chaîne — de la visite à la signature",
      columns: ["Pas", "Nombre", ...rateColumns, "Note"],
      rows: report.chain.steps.map((step) => [
        step.metric.label,
        count(step.count),
        ...rateCells(step.rate, step.count.unavailable),
        chainNote(report.chain, step),
      ]),
    },
  ];
  for (const funnel of report.pipelines) {
    const rows: CsvCell[][] = [
      ["Affaires créées (la cohorte)", funnel.created, null, null, "sans objet", null, null, funnel.created > 0 ? `dont ${plural(funnel.createdFromLead, "issue d'un lead", "issues d'un lead")}` : ""],
      ...funnel.stages.map((s): CsvCell[] => [s.label, s.reached, ...rateCells(s.rate), s.lostHere, s.openHere, ""]),
      ["Gagnées", funnel.won, ...rateCells(funnel.wonRate), null, null, "taux depuis la dernière étape intermédiaire atteinte"],
      ["Perdues (au total)", funnel.lost, null, null, "sans objet", null, null, ""],
      ["En cours (au total)", funnel.open, null, null, "sans objet", null, null, ""],
    ];
    tables.push({
      title: `Par étape du pipeline — ${funnel.label}`,
      columns: ["Étape", "Affaires (allées au moins jusque-là)", ...rateColumns, "Perdues depuis cette étape", "En cours au plus loin ici", "Note"],
      rows,
    });
  }
  tables.push({
    title: "Par origine — laquelle génère des affaires qui se signent",
    columns: [
      "Origine",
      "Visiteurs",
      "Simulations démarrées",
      "Simulations terminées",
      "Leads",
      "Contacts établis",
      "Affaires",
      "Gagnées",
      "Lead → affaire (%)",
      "Affaire → gagnée (%)",
      "Affichage des taux",
      "Note",
    ],
    rows: report.origins.map((row) => {
      const counts = [row.visitors, row.started, row.completed, row.leads, row.contacted, row.deals, row.won];
      const reasons = [...new Set(counts.map((c) => c.unavailable).filter(Boolean))];
      return [
        row.label,
        ...counts.map(count),
        percent(row.leadToDeal),
        percent(row.dealToWon),
        `lead → affaire : ${rateDisplay(row.leadToDeal)} ; affaire → gagnée : ${rateDisplay(row.dealToWon)}`,
        reasons.length ? `sans objet : ${reasons.join(" ; ")}` : "",
      ];
    }),
  });
  return tables;
}

// ---------------------------------------------------------------- Pertes

function lossesTables(report: LossesReport): CsvTable[] {
  const { total, excludedReconstructed: ex, lossRate } = report;
  const breakdown = (title: string, labelHeader: string, rows: LossBreakdownRow[]): CsvTable => ({
    title,
    columns: [labelHeader, "Affaires", "Part (%)", "Affichage de la part", "Montant perdu (€)", "Sans montant"],
    rows: rows.map((r) => [
      r.label,
      r.n,
      percent(r.share),
      r.share.hidden ? `masqué : il manque ${plural(r.share.missing, "perte")} pour afficher une part` : SHOWN,
      amount(r),
      r.withoutAmount,
    ]),
  });
  return [
    {
      title: "Sur la période",
      columns: ["Indicateur", "Affaires", "Montant (€)", "Sans montant", "Taux (%)", "Affichage"],
      rows: [
        ["Affaires perdues", total.n, amount(total), total.withoutAmount, null, ""],
        ["Pertes antérieures au journal, écartées (date de la perte inconnue)", ex.n, amount(ex), ex.withoutAmount, null, "écartées du calcul, jamais datées par une valeur plausible"],
        ["Gagnées sur la même période", report.won, null, null, null, ""],
        ["Taux de perte", null, null, null, percent(lossRate), lossRate.hidden ? `masqué : il manque ${plural(lossRate.missing, "affaire close", "affaires closes")}` : SHOWN],
      ],
    },
    breakdown("Par motif", "Motif", report.byReason),
    breakdown("Par étape de départ", "Étape", report.byStage),
    breakdown("Par conseiller", "Conseiller", report.byOwner),
    breakdown("Par type d'affaire", "Type", report.byType),
  ];
}

// ---------------------------------------------------------------- Partenaires

function partnersTables(report: PartnersReport): CsvTable[] {
  const { totals, commissions } = report;
  const moneyCells = (m: MoneyCount): CsvCell[] => [amount(m), m.n, m.withoutAmount];
  return [
    {
      title: "Par partenaire",
      columns: [
        "Partenaire",
        "Métier",
        "Société",
        "Actif",
        "Partages envoyés",
        "Acceptés",
        "Refusés",
        "Sans réponse",
        "dont en attente",
        "dont expirés",
        "dont révoqués",
        "Taux d'acceptation (%)",
        "Affichage du taux d'acceptation",
        "Délai de réponse — médiane (jours)",
        "Délai de réponse — moyenne (jours)",
        "Réponses (observations)",
        "Affichage du délai",
        "Gagnées",
        "Taux de transformation (%)",
        "Affichage du taux de transformation",
        "Commissions acquises (€)",
        "Acquises — nombre",
        "Acquises — sans montant",
        "Commissions prévues (€)",
        "Prévues — nombre",
        "Prévues — sans montant",
      ],
      rows: [
        ...report.partners.map((p): CsvCell[] => [
          p.name,
          p.profession,
          p.company,
          p.active,
          p.sent,
          p.accepted,
          p.declined,
          p.pending + p.expired + p.revoked,
          p.pending,
          p.expired,
          p.revoked,
          percent(p.acceptanceRate),
          rateDisplay(p.acceptanceRate, "(partages envoyés)"),
          days(p.responseDelay, p.responseDelay.medianDays),
          days(p.responseDelay, p.responseDelay.meanDays),
          observations(p.responseDelay),
          durationDisplay(p.responseDelay),
          p.won,
          percent(p.transformationRate),
          rateDisplay(p.transformationRate, "(partages acceptés)"),
          ...moneyCells(p.earned),
          ...moneyCells(p.planned),
        ]),
        [
          "Ensemble",
          null,
          null,
          null,
          totals.sent,
          totals.accepted,
          totals.declined,
          totals.noResponse,
          null,
          null,
          null,
          percent(totals.acceptanceRate),
          rateDisplay(totals.acceptanceRate, "(partages envoyés)"),
          null,
          null,
          null,
          "non calculé pour l'ensemble — voir Délais",
          totals.won,
          percent(totals.transformationRate),
          rateDisplay(totals.transformationRate, "(partages acceptés)"),
          ...moneyCells(totals.earned),
          ...moneyCells(totals.planned),
        ],
      ],
    },
    {
      title: "Encours de commissions, à aujourd'hui (la période ne s'y applique pas)",
      columns: ["État", "Commissions", "Montant (€)", "Sans montant"],
      rows: commissions.states.map((s) => [s.label, s.n, amount(s), s.withoutAmount]),
    },
    {
      title: "Vieillissement des commissions confirmées non réglées, à aujourd'hui",
      columns: ["Ancienneté", "Commissions", "Montant (€)", "Sans montant"],
      rows: [
        ...commissions.aging.map((b): CsvCell[] => [b.label, b.n, amount(b), b.withoutAmount]),
        [`Au-delà du seuil de relance de l'organisation (${commissions.overdue.thresholdDays} jours)`, commissions.overdue.n, amount(commissions.overdue), commissions.overdue.withoutAmount],
        ["Date de confirmation inconnue (écartées du vieillissement)", commissions.unknownConfirmedAt.n, amount(commissions.unknownConfirmedAt), commissions.unknownConfirmedAt.withoutAmount],
      ],
    },
  ];
}

// ---------------------------------------------------------------- Le document

/** Le premier tableau du fichier : la vue, l'organisation et les filtres appliqués — un export sans son contexte ne vaut rien. */
export function exportPreamble(view: ExportView, parsed: ParsedMetricFilters, lookups: ExportLookups, exportedAt = new Date()): CsvTable {
  const { filters, params } = parsed;
  const user = lookups.users.find((u) => u.id === filters.ownerId);
  const originLabel =
    filters.originId === ORIGIN_UNKNOWN
      ? "Sans origine (aucun lead)"
      : filters.originId === ORIGIN_UNMATCHED
        ? "Origine à rapprocher"
        : (lookups.origins.find((o) => o.id === filters.originId)?.label ?? "Toutes");
  const rows: CsvCell[][] = [
    ["Vue", EXPORT_VIEWS[view].label],
    ["Organisation", lookups.organizationName],
    ["Période", periodPhrase(parsed)],
  ];
  if (params.du) rows.push(["Du", params.du]);
  if (params.au) rows.push(["Au (inclus)", params.au]);
  rows.push(
    ["Conseiller", user ? user.name || user.email : "Tous"],
    ["Type d'affaire", lookups.types.find((t) => t.id === filters.typeId)?.label ?? "Tous"],
    ["Pipeline", lookups.pipelines.find((p) => p.id === filters.pipelineId)?.label ?? "Tous"],
    ["Origine", originLabel],
    ["Exporté le", exportedAt.toISOString()],
    ["Seuil d'affichage", `${MIN_OBSERVATIONS} observations — en dessous, la cellule est vide et la colonne « Affichage » dit ce qui manque`],
    ["Format", "séparateur « ; », virgule décimale, montants en euros et durées en jours sans unité dans les cellules"]
  );
  return { title: "Export Clozado", columns: ["Paramètre", "Valeur"], rows };
}

/** Les tableaux de la vue — le rapport de l'écran, projeté. */
export async function exportTables(view: ExportView, user: OrgScopeUser, filters: MetricFilters, lookups: ExportLookups): Promise<CsvTable[]> {
  switch (view) {
    case "delais":
      return delaysTables(await delaysReport(user, filters), lookups);
    case "funnel":
      return funnelTables(await funnelReport(user, filters));
    case "pertes":
      return lossesTables(await lossesReport(user, filters));
    case "partenaires":
      return partnersTables(await partnersReport(user, filters));
  }
}

/** « clozado-pertes-90j-2026-08-25.csv » — la vue, la période et le jour, lisibles dans un dossier de téléchargements. */
export function exportFilename(view: ExportView, parsed: ParsedMetricFilters, now = new Date()): string {
  return `clozado-${view}-${parsed.period}-${now.toISOString().slice(0, 10)}.csv`;
}
