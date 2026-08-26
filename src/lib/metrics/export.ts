import type { CsvCell, CsvTable } from "@/lib/csv";
import type { TranslatorOf } from "@/i18n/translator";
import type { OrgScopeUser } from "@/lib/session";
import { dashboardIndicators, type DashboardIndicator } from "./dashboard";
import { MIN_OBSERVATIONS } from "./definitions";
import { delaysReport, type DelaysReport } from "./delays-report";
import { ORIGIN_UNKNOWN, ORIGIN_UNMATCHED, type MetricFilters } from "./filters";
import { funnelReport, type FunnelChain, type FunnelCount, type FunnelReport, type FunnelStep } from "./funnel";
import { lossesReport, type LossBreakdownRow, type LossesReport } from "./losses";
import type { BusinessPack } from "./packs";
import { partnersReport, type MoneyCount, type PartnersReport } from "./partners";
import { periodPhrase } from "./period-phrase";
import type { MetricSearchParams, ParsedMetricFilters } from "./search-params";
import type { DurationStat, RateStat } from "./types";
import { AppError } from "@/lib/errors";
import { createFormats, PRODUCT_FORMATS, type Formats } from "@/lib/format";

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
/** Les vues exportables ; leurs libellés sont `metrics.views.<vue>` dans les messages. */
export const EXPORT_VIEWS = {
  delais: { path: "/analytique/delais" },
  funnel: { path: "/analytique/funnel" },
  pertes: { path: "/analytique/pertes" },
  partenaires: { path: "/analytique/partenaires" },
  "tableau-de-bord": { path: "/dashboard" },
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
  /** Le pack métier de l'organisation (vue « tableau de bord ») — résolu par `resolveBusinessPack`. */
  dashboard?: { pack: BusinessPack; chosen: boolean };
};



/** La même phrase que sous les tableaux de durées (`statNotes`). */
function durationDisplay(t: TranslatorOf<"metrics">, stat: DurationStat): string {
  if (stat.unavailable) return t("export.non_mesurable", { unavailable: stat.unavailable });
  if (stat.hidden) {
    return stat.n === 0
      ? t("export.aucune_observation_il_en_faut_pour_9ee9", { missing: stat.missing })
      : t("export.masque_il_manque_observation_observations_pour_2e1c", { missing: stat.missing });
  }
  return t("export.affiche");
}

/** La même phrase que sous un taux de funnel (`rateText`). */
function rateDisplay(t: TranslatorOf<"metrics">, rate: RateStat | null, base?: string): string {
  if (!rate) return t("export.sans_objet");
  if (rate.hidden || rate.percent === null) return t("export.masque_il_manque_observation_observations", { missing: rate.missing, base: (base) ?? "" });
  return t("export.affiche");
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

function delaysTables(t: TranslatorOf<"metrics">, report: DelaysReport, lookups: ExportLookups): CsvTable[] {
  const tables: CsvTable[] = [
    {
      title: t("export.le_cycle"),
      columns: [t("export.indicateur"), t("export.mediane_jours"), t("export.moyenne_jours"), t("export.observations"), t("export.affichage"), t("export.en_cours"), t("export.ecartees_reconstituees"), t("export.ecartees_date_inconnue")],
      rows: report.cycle.map(({ metric, stat }) => [
        t(`definitions.${metric.id}.label`),
        days(stat, stat.medianDays),
        days(stat, stat.meanDays),
        observations(stat),
        durationDisplay(t, stat),
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
        title: t("export.temps_passe_par_etape", { label: pipeline.label }),
        columns: [t("export.etape"), t("export.mediane_jours"), t("export.moyenne_jours"), t("export.observations_passages_termines"), t("export.affichage"), t("export.affaires_dans_l_etape_aujourd_hui"), t("export.passages_reconstitues_ecartes")],
        rows: stages.map((s) => [s.label, days(s, s.medianDays), days(s, s.meanDays), observations(s), durationDisplay(t, s), s.pending, s.excludedReconstructed]),
      });
    }
    if (pairs.length > 0) {
      tables.push({
        title: t("export.d_une_etape_a_la_suivante", { label: pipeline.label }),
        columns: [t("export.etapes"), t("export.mediane_jours"), t("export.moyenne_jours"), t("export.observations"), t("export.affichage")],
        rows: pairs.map((p) => [`${p.fromLabel} → ${p.toLabel}`, days(p, p.medianDays), days(p, p.meanDays), observations(p), durationDisplay(t, p)]),
      });
    }
  }
  return tables;
}

// ---------------------------------------------------------------- Funnel

/** Les mentions d'un pas de la chaîne — les mêmes faits que sous le pas à l'écran, en texte. */
function chainNote(t: TranslatorOf<"metrics">, chain: FunnelChain, step: FunnelStep): string {
  const over = step.rate !== null && step.rate.percent !== null && step.rate.percent > 100;
  const parts: string[] = [];
  switch (step.metric.id) {
    case "funnel_visitors":
      if (!chain.collection.everEvents) parts.push(t("export.les_visites_ne_sont_pas_encore_901f"));
      break;
    case "funnel_leads":
      if (!chain.collection.everLeads) parts.push(t("export.aucun_lead_recu_entree_des_leads_c689"));
      else if (over) parts.push(t("export.plus_de_leads_que_de_simulations_688b"));
      break;
    case "funnel_contacted":
      if (chain.leadsPending > 0) parts.push(t("export.lead_sans_premier_contact_consigne_leads_5f95", { n: chain.leadsPending }));
      break;
    case "funnel_deals_from_leads":
      if (over) parts.push(t("export.plus_d_affaires_que_de_contacts_8baf"));
      if (chain.deals.byPipeline.length > 1) parts.push(t("export.par_pipeline", { join: chain.deals.byPipeline.map((p) => `${p.label} ${p.n}`).join(" · ") }));
      break;
    case "funnel_won":
      if (!step.count.unavailable) parts.push(`${t("export.perdue_perdues", { n: chain.deals.lost })} · ${t("export.en_cours_en_cours", { n: chain.deals.open })}`);
      break;
  }
  return parts.join(" · ");
}

function funnelTables(t: TranslatorOf<"metrics">, report: FunnelReport): CsvTable[] {
  const rateColumns = [t("export.taux_de_passage"), t("export.deperdition"), t("export.affichage_du_taux")];
  const rateCells = (rate: RateStat | null, unavailable?: string): CsvCell[] => [
    percent(rate),
    drop(rate),
    unavailable ? t("export.sans_objet", { value: unavailable }) : rateDisplay(t, rate),
  ];
  const tables: CsvTable[] = [
    {
      title: t("export.la_chaine_de_la_visite_a_fa8a"),
      columns: [t("export.pas"), t("export.nombre"), ...rateColumns, t("export.note")],
      rows: report.chain.steps.map((step) => [
        t(`definitions.${step.metric.id}.label`),
        count(step.count),
        ...rateCells(step.rate, step.count.unavailable),
        chainNote(t, report.chain, step),
      ]),
    },
  ];
  for (const funnel of report.pipelines) {
    const rows: CsvCell[][] = [
      [t("export.affaires_creees_la_cohorte"), funnel.created, null, null, t("export.sans_objet"), null, null, funnel.created > 0 ? t("export.dont", { value: t("export.issue_d_un_lead_issues_d_2dc2", { n: funnel.createdFromLead }) }) : ""],
      ...funnel.stages.map((s): CsvCell[] => [s.label, s.reached, ...rateCells(s.rate), s.lostHere, s.openHere, ""]),
      [t("export.gagnees"), funnel.won, ...rateCells(funnel.wonRate), null, null, t("export.taux_depuis_la_derniere_etape_intermediaire_0db5")],
      [t("export.perdues_au_total"), funnel.lost, null, null, t("export.sans_objet"), null, null, ""],
      [t("export.en_cours_au_total"), funnel.open, null, null, t("export.sans_objet"), null, null, ""],
    ];
    tables.push({
      title: t("export.par_etape_du_pipeline", { label: funnel.label }),
      columns: [t("export.etape"), t("export.affaires_allees_au_moins_jusque_la"), ...rateColumns, t("export.perdues_depuis_cette_etape"), t("export.en_cours_au_plus_loin_ici"), t("export.note")],
      rows,
    });
  }
  tables.push({
    title: t("export.par_origine_laquelle_genere_des_affaires_6ba2"),
    columns: [
      t("export.origine"),
      t("export.visiteurs"),
      t("export.simulations_demarrees"),
      t("export.simulations_terminees"),
      t("export.leads"),
      t("export.contacts_etablis"),
      t("export.affaires"),
      t("export.gagnees"),
      t("export.lead_affaire_pct"),
      t("export.affaire_gagnee"),
      t("export.affichage_des_taux"),
      t("export.note"),
    ],
    rows: report.origins.map((row) => {
      const counts = [row.visitors, row.started, row.completed, row.leads, row.contacted, row.deals, row.won];
      const reasons = [...new Set(counts.map((c) => c.unavailable).filter(Boolean))];
      return [
        row.label,
        ...counts.map(count),
        percent(row.leadToDeal),
        percent(row.dealToWon),
        t("export.lead_affaire_affaire_gagnee", { rateDisplay: rateDisplay(t, row.leadToDeal), rateDisplay2: rateDisplay(t, row.dealToWon) }),
        reasons.length ? t("export.sans_objet_4087", { join: reasons.join(" ; ") }) : "",
      ];
    }),
  });
  return tables;
}

// ---------------------------------------------------------------- Pertes

function lossesTables(t: TranslatorOf<"metrics">, fmt: Formats, report: LossesReport): CsvTable[] {
  const { total, excludedReconstructed: ex, lossRate } = report;
  const breakdown = (title: string, labelHeader: string, rows: LossBreakdownRow[]): CsvTable => ({
    title,
    columns: [labelHeader, t("export.affaires"), t("export.part_pct"), t("export.affichage_de_la_part"), t("export.montant_perdu", { currency: fmt.currency }), t("export.sans_montant")],
    rows: rows.map((r) => [
      r.label,
      r.n,
      percent(r.share),
      r.share.hidden ? t("export.masque_il_manque", { value: t("export.perte_pertes", { n: r.share.missing }) }) : t("export.affiche"),
      amount(r),
      r.withoutAmount,
    ]),
  });
  return [
    {
      title: t("export.sur_la_periode"),
      columns: [t("export.indicateur"), t("export.affaires"), t("export.montant_devise", { currency: fmt.currency }), t("export.sans_montant"), t("export.taux_pct"), t("export.affichage")],
      rows: [
        [t("export.affaires_perdues"), total.n, amount(total), total.withoutAmount, null, ""],
        [t("export.pertes_anterieures_au_journal_ecartees_date_72d8"), ex.n, amount(ex), ex.withoutAmount, null, t("export.ecartees_du_calcul_jamais_datees_par_c88c")],
        [t("export.gagnees_sur_la_meme_periode"), report.won, null, null, null, ""],
        [t("export.taux_de_perte"), null, null, null, percent(lossRate), lossRate.hidden ? t("export.masque_il_manque_affaire_close_affaires_463b", { missing: lossRate.missing }) : t("export.affiche")],
      ],
    },
    breakdown(t("export.par_motif"), t("export.motif"), report.byReason),
    breakdown(t("export.par_etape_de_depart"), t("export.etape"), report.byStage),
    breakdown(t("export.par_conseiller"), t("export.conseiller"), report.byOwner),
    breakdown(t("export.par_type_d_affaire"), t("export.type"), report.byType),
  ];
}

// ---------------------------------------------------------------- Partenaires

function partnersTables(t: TranslatorOf<"metrics">, fmt: Formats, report: PartnersReport): CsvTable[] {
  const { totals, commissions } = report;
  const moneyCells = (m: MoneyCount): CsvCell[] => [amount(m), m.n, m.withoutAmount];
  return [
    {
      title: t("export.par_partenaire"),
      columns: [
        t("export.partenaire"),
        t("export.metier"),
        t("export.societe"),
        t("export.actif"),
        t("export.partages_envoyes"),
        t("export.acceptes"),
        t("export.refuses"),
        t("export.sans_reponse"),
        t("export.dont_en_attente"),
        t("export.dont_expires"),
        t("export.dont_revoques"),
        t("export.taux_d_acceptation"),
        t("export.affichage_du_taux_d_acceptation"),
        t("export.delai_de_reponse_mediane_jours"),
        t("export.delai_de_reponse_moyenne_jours"),
        t("export.reponses_observations"),
        t("export.affichage_du_delai"),
        t("export.gagnees"),
        t("export.taux_de_transformation"),
        t("export.affichage_du_taux_de_transformation"),
        t("export.commissions_acquises", { currency: fmt.currency }),
        t("export.acquises_nombre"),
        t("export.acquises_sans_montant"),
        t("export.commissions_prevues", { currency: fmt.currency }),
        t("export.prevues_nombre"),
        t("export.prevues_sans_montant"),
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
          rateDisplay(t, p.acceptanceRate, t("export.partages_envoyes_adac")),
          days(p.responseDelay, p.responseDelay.medianDays),
          days(p.responseDelay, p.responseDelay.meanDays),
          observations(p.responseDelay),
          durationDisplay(t, p.responseDelay),
          p.won,
          percent(p.transformationRate),
          rateDisplay(t, p.transformationRate, t("export.partages_acceptes")),
          ...moneyCells(p.earned),
          ...moneyCells(p.planned),
        ]),
        [
          t("export.ensemble"),
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
          rateDisplay(t, totals.acceptanceRate, t("export.partages_envoyes_adac")),
          null,
          null,
          null,
          t("export.non_calcule_pour_l_ensemble_voir_2480"),
          totals.won,
          percent(totals.transformationRate),
          rateDisplay(t, totals.transformationRate, t("export.partages_acceptes")),
          ...moneyCells(totals.earned),
          ...moneyCells(totals.planned),
        ],
      ],
    },
    {
      title: t("export.encours_de_commissions_a_aujourd_hui_100b"),
      columns: [t("export.etat"), t("export.commissions"), t("export.montant_devise", { currency: fmt.currency }), t("export.sans_montant")],
      rows: commissions.states.map((s) => [s.label, s.n, amount(s), s.withoutAmount]),
    },
    {
      title: t("export.vieillissement_des_commissions_confirmees_non_reglees_212c"),
      columns: [t("export.anciennete"), t("export.commissions"), t("export.montant_devise", { currency: fmt.currency }), t("export.sans_montant")],
      rows: [
        ...commissions.aging.map((b): CsvCell[] => [b.label, b.n, amount(b), b.withoutAmount]),
        [t("export.au_dela_du_seuil_de_relance_98d8", { thresholdDays: commissions.overdue.thresholdDays }), commissions.overdue.n, amount(commissions.overdue), commissions.overdue.withoutAmount],
        [t("export.date_de_confirmation_inconnue_ecartees_du_3b76"), commissions.unknownConfirmedAt.n, amount(commissions.unknownConfirmedAt), commissions.unknownConfirmedAt.withoutAmount],
      ],
    },
  ];
}

// ---------------------------------------------------------------- Tableau de bord

function dashboardTables(t: TranslatorOf<"metrics">, fmt: Formats, indicators: DashboardIndicator[], pack: BusinessPack, chosen: boolean): CsvTable[] {
  const rows: CsvCell[][] = indicators.map(({ metric, value, periodApplies }) => {
    const period = periodApplies ? "" : t("export.etat_a_aujourd_hui_la_periode_e6d5");
    switch (value.kind) {
      case "count":
        return [t(`definitions.${metric.id}.label`), value.n, "nombre", null, null, t("export.affiche"), [value.detail, period].filter(Boolean).join(" · ")];
      case "euros":
        return [t(`definitions.${metric.id}.label`), amount(value.money), "euros", null, value.money.n, t("export.affiche"), [value.countPhrase, value.money.withoutAmount > 0 ? t("export.sans_montant_n", { n: value.money.withoutAmount }) : "", value.detail, period].filter(Boolean).join(" · ")];
      case "days":
        return [t(`definitions.${metric.id}.label`), days(value.stat, value.stat.medianDays), t("export.jours_mediane"), days(value.stat, value.stat.meanDays), observations(value.stat), durationDisplay(t, value.stat), period];
      case "ratio":
        return [t(`definitions.${metric.id}.label`), percent(value.rate), "%", null, value.rate.base, rateDisplay(t, value.rate, t("export.le_denominateur")), [value.detail, period].filter(Boolean).join(" · ")];
      case "unavailable":
        return [t(`definitions.${metric.id}.label`), null, "", null, null, t("export.sans_objet_a6d2", { reason: value.reason }), period];
    }
  });
  return [
    {
      title: t("export.indicateurs_du_pack", { t: t(`packs.${pack.key}.label`), value: chosen ? "" : t("export.pack_par_defaut_aucun_pack_choisi_159d") }),
      columns: [t("export.indicateur"), t("export.valeur"), t("export.unite"), t("export.moyenne_jours"), t("export.observations"), t("export.affichage"), t("export.detail")],
      rows,
    },
  ];
}

// ---------------------------------------------------------------- Le document

/** Le premier tableau du fichier : la vue, l'organisation et les filtres appliqués — un export sans son contexte ne vaut rien. */
export function exportPreamble(t: TranslatorOf<"metrics">, view: ExportView, parsed: ParsedMetricFilters, lookups: ExportLookups, fmt: Formats, exportedAt = new Date()): CsvTable {
  const { filters, params } = parsed;
  const user = lookups.users.find((u) => u.id === filters.ownerId);
  const originLabel =
    filters.originId === ORIGIN_UNKNOWN
      ? t("export.sans_origine_aucun_lead")
      : filters.originId === ORIGIN_UNMATCHED
        ? t("export.origine_a_rapprocher")
        : (lookups.origins.find((o) => o.id === filters.originId)?.label ?? t("export.toutes"));
  const rows: CsvCell[][] = [
    [t("export.vue"), t(`views.${view}`)],
    [t("export.organisation"), lookups.organizationName],
    [t("export.periode"), periodPhrase(parsed, t, fmt)],
  ];
  if (params.du) rows.push([t("export.du"), params.du]);
  if (params.au) rows.push([t("export.au_inclus"), params.au]);
  rows.push(
    [t("export.conseiller"), user ? user.name || user.email : t("export.tous")],
    [t("export.type_d_affaire"), lookups.types.find((t) => t.id === filters.typeId)?.label ?? t("export.tous")],
    [t("export.pipeline"), lookups.pipelines.find((p) => p.id === filters.pipelineId)?.label ?? t("export.tous")],
    [t("export.origine"), originLabel],
    [t("export.exporte_le"), exportedAt.toISOString()],
    [t("export.seuil_d_affichage"), t("export.observations_en_dessous_la_cellule_est_e2b1", { minObservations: MIN_OBSERVATIONS })],
    [t("export.format"), t("export.separateur_virgule_decimale_montants_en_euros_0255")]
  );
  return { title: t("export.parametres_de_l_export"), columns: [t("export.parametre"), t("export.valeur")], rows };
}

/** Les tableaux de la vue — le rapport de l'écran, projeté. */
export async function exportTables(
  t: TranslatorOf<"metrics">,
  view: ExportView,
  user: OrgScopeUser,
  filters: MetricFilters,
  lookups: ExportLookups,
  /** Les paramètres nettoyés de l'URL — les liens du tableau de bord les portent. */
  params: MetricSearchParams = {},
  fmt: Formats = createFormats(PRODUCT_FORMATS)
): Promise<CsvTable[]> {
  switch (view) {
    case "delais":
      return delaysTables(t, await delaysReport(user, filters, t), lookups);
    case "funnel":
      return funnelTables(t, await funnelReport(user, filters, t));
    case "pertes":
      return lossesTables(t, fmt, await lossesReport(user, filters, t));
    case "partenaires":
      return partnersTables(t, fmt, await partnersReport(user, filters, t));
    case "tableau-de-bord": {
      if (!lookups.dashboard) throw new AppError("l_export_du_tableau_de_bord_a_351c");
      const { pack, chosen } = lookups.dashboard;
      return dashboardTables(t, fmt, await dashboardIndicators(user, pack.indicators, filters, params, t, fmt), pack, chosen);
    }
  }
}

/** « clozado-pertes-90j-2026-08-25.csv » — la vue, la période et le jour, lisibles dans un dossier de téléchargements. */
export function exportFilename(view: ExportView, parsed: ParsedMetricFilters, now = new Date()): string {
  return `clozado-${view}-${parsed.period}-${now.toISOString().slice(0, 10)}.csv`;
}
