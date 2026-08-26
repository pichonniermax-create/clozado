import { XMLParser } from "fast-xml-parser";
import { fetchWithTimeout, readBodyText, WatchFetchError } from "./http";
import type { MarketIndicator } from "./indicators";
import { normalizePeriod, periodOfDate, periodStart } from "./periods";

/**
 * La LECTURE DÉTERMINISTE d'un indicateur — un appel HTTP à l'API
 * officielle, une analyse du CSV, du JSON-stat, du SDMX ou des métadonnées
 * Opendatasoft, AUCUNE IA (docs/module-ciblage-contenu.md §1.1). Ce qui
 * sort : la période telle que publiée, la valeur telle que publiée. Une
 * API muette lève une erreur lisible ; l'appelant garde alors la dernière
 * observation affichée AVEC sa date — jamais un chiffre inventé.
 */
export type Observation = {
  period: string;
  periodStart: string;
  valueText: string;
  valueNum: number | null;
  unit: string | null;
};

const TIMEOUT_MS = 12_000;

function toNumber(text: string): number | null {
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function observation(periodRaw: string, valueText: string, unit: string | null): Observation {
  const period = normalizePeriod(periodRaw);
  const start = periodStart(period);
  if (!start) throw new WatchFetchError("period_unreadable", { period: periodRaw });
  return { period, periodStart: start, valueText: valueText.trim(), valueNum: toNumber(valueText), unit };
}

/** Une ligne CSV avec ses champs entre guillemets (les titres de la BCE contiennent des virgules). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** BCE Data Portal : CSV `csvdata`, colonnes TIME_PERIOD / OBS_VALUE, dernière observation. */
async function readEcb(flow: string, key: string, unit: string): Promise<Observation> {
  const url = `https://data-api.ecb.europa.eu/service/data/${flow}/${key}?lastNObservations=1&format=csvdata`;
  const response = await fetchWithTimeout(url, TIMEOUT_MS, "text/csv");
  const csv = await readBodyText(response, 200_000);
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new WatchFetchError("no_observation");
  const header = parseCsvLine(lines[0]);
  const periodIdx = header.indexOf("TIME_PERIOD");
  const valueIdx = header.indexOf("OBS_VALUE");
  if (periodIdx < 0 || valueIdx < 0) throw new WatchFetchError("unexpected_format");
  const last = parseCsvLine(lines[lines.length - 1]);
  const period = last[periodIdx]?.trim();
  const value = last[valueIdx]?.trim();
  if (!period || !value) throw new WatchFetchError("empty_observation");
  return observation(period, value, unit);
}

/** Eurostat : JSON-stat 2.0, la dernière période qui porte une valeur (une période publiée sans valeur est ignorée). */
async function readEurostat(dataset: string, params: Record<string, string>, unit: string): Promise<Observation> {
  const search = new URLSearchParams({ ...params, lastTimePeriod: "3", lang: "FR" });
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?${search.toString()}`;
  const response = await fetchWithTimeout(url, TIMEOUT_MS, "application/json");
  const json = JSON.parse(await readBodyText(response, 500_000)) as {
    value?: Record<string, number>;
    id?: string[];
    size?: number[];
    dimension?: { time?: { category?: { index?: Record<string, number> } } };
  };
  const values = json.value ?? {};
  const timeIndex = json.dimension?.time?.category?.index ?? {};
  const ids = json.id ?? [];
  const sizes = json.size ?? [];
  // Toutes les autres dimensions sont de taille 1 (une série) : l'index plat est l'index du temps.
  if (ids.some((id, i) => id !== "time" && sizes[i] !== 1)) throw new WatchFetchError("multiple_series");
  const periods = Object.entries(timeIndex).sort((a, b) => a[1] - b[1]);
  for (let i = periods.length - 1; i >= 0; i--) {
    const [period, idx] = periods[i];
    const value = values[String(idx)];
    if (value !== undefined && value !== null) return observation(period, String(value), unit);
  }
  throw new WatchFetchError("no_recent_value");
}

const sdmx = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false });

/** INSEE BDM : SDMX-ML, `Series` → `Obs` (TIME_PERIOD, OBS_VALUE) ; les trimestres « 2026-Q2 » deviennent « 2026-T2 ». */
async function readInsee(idbank: string, unit: string): Promise<Observation> {
  const url = `https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/${idbank}?lastNObservations=1`;
  const response = await fetchWithTimeout(url, TIMEOUT_MS, "application/xml");
  const xml = await readBodyText(response, 500_000);
  const doc = sdmx.parse(xml) as Record<string, unknown>;
  const root = (doc.StructureSpecificData ?? doc.GenericData) as Record<string, unknown> | undefined;
  const dataset = root?.DataSet as Record<string, unknown> | undefined;
  const seriesNode = dataset?.Series;
  const series = (Array.isArray(seriesNode) ? seriesNode[0] : seriesNode) as Record<string, unknown> | undefined;
  if (!series) throw new WatchFetchError("no_series");
  const obsNode = series.Obs;
  const obs = (Array.isArray(obsNode) ? obsNode[0] : obsNode) as Record<string, string> | undefined;
  const period = obs?.["@_TIME_PERIOD"];
  const value = obs?.["@_OBS_VALUE"];
  if (!period || !value) throw new WatchFetchError("empty_observation");
  return observation(period, value, unit);
}

/**
 * Banque de France Webstat (portail Opendatasoft) : le catalogue expose
 * chaque série comme un jeu de données SANS enregistrements publics — mais
 * ses métadonnées portent la dernière période (`series_last_time_period_date`)
 * et les deux dernières valeurs (`series_last_two_obs_values`, la DERNIÈRE
 * d'abord : vérifié sur la facilité de dépôt fin février 2023 =
 * « 2.5000,2.0000 », 2,50 % après 2,00 %). C'est la seule lecture possible
 * sans clé ; elle donne exactement ce qu'on stocke, une observation datée.
 */
async function readWebstat(dataset: string, periodicity: MarketIndicator["periodicity"]): Promise<Observation> {
  const url = `https://webstat.banque-france.fr/api/explore/v2.1/catalog/datasets/${dataset}`;
  const response = await fetchWithTimeout(url, TIMEOUT_MS, "application/json");
  const json = JSON.parse(await readBodyText(response, 500_000)) as { metas?: { custom?: Record<string, string | null> } };
  const custom = json.metas?.custom ?? {};
  const lastDate = custom.series_last_time_period_date;
  const twoValues = custom.series_last_two_obs_values;
  if (!lastDate || !twoValues) throw new WatchFetchError("metadata_without_observation");
  const date = new Date(lastDate);
  if (Number.isNaN(date.getTime())) throw new WatchFetchError("date_unreadable", { date: lastDate });
  const last = twoValues.split(",")[0]?.trim();
  if (!last) throw new WatchFetchError("empty_observation");
  const freq = custom.series_freq;
  const effective: MarketIndicator["periodicity"] =
    freq === "M" ? "monthly" : freq === "Q" ? "quarterly" : freq === "A" ? "annual" : freq === "D" || freq === "B" ? "daily" : periodicity;
  return observation(periodOfDate(date, effective), last, custom.series_short_singular_fr ?? null);
}

export async function readIndicator(indicator: MarketIndicator): Promise<Observation> {
  const spec = indicator.spec;
  switch (spec.provider) {
    case "ecb":
      return readEcb(spec.flow, spec.key, indicator.unit);
    case "eurostat":
      return readEurostat(spec.dataset, spec.params, indicator.unit);
    case "insee":
      return readInsee(spec.idbank, indicator.unit);
    case "webstat":
      return readWebstat(spec.dataset, indicator.periodicity);
  }
}
