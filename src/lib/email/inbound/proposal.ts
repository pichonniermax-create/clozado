import type { ProposedField } from "@/lib/ai/types";

/**
 * LA PROPOSITION relue depuis la base (`inbound_emails.proposal`) — du
 * JSON écrit par nous, mais relu défensivement : une colonne `jsonb` peut
 * porter n'importe quoi (une version précédente, une main humaine), et
 * l'écran ne doit jamais casser pour ça. Ce qui n'est pas une proposition
 * valable devient `null` : la personne remplit elle-même.
 */

export type StoredProposal = {
  name: ProposedField;
  phone: ProposedField;
  company: ProposedField;
  jobTitle: ProposedField;
  /** `model` : proposé par le modèle ; `deterministic` : rien que du motif et des en-têtes. */
  source: "model" | "deterministic" | null;
  model: string | null;
};

/** En dessous, le champ est affiché « à vérifier » (docs/module-engagement.md §4.3). */
export const LOW_CONFIDENCE = 0.6;

function field(value: unknown): ProposedField {
  if (!value || typeof value !== "object") return null;
  const record = value as { value?: unknown; confidence?: unknown };
  const text = typeof record.value === "string" ? record.value.trim() : "";
  if (!text) return null;
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence) ? Math.min(1, Math.max(0, record.confidence)) : 0;
  return { value: text.slice(0, 160), confidence };
}

export function readProposal(value: unknown): StoredProposal {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    name: field(record.name),
    phone: field(record.phone),
    company: field(record.company),
    jobTitle: field(record.jobTitle),
    source: record.source === "model" || record.source === "deterministic" ? record.source : null,
    model: typeof record.model === "string" ? record.model : null,
  };
}

/** Le détail d'authentification, ramené à ce qu'un écran peut montrer : des faits courts, pas des phrases. */
export type AuthSummary = { dkim: { domain: string; selector: string; status: string; code: string | null; aligned: boolean }[]; spf: { ip: string; domain: string; result: string } | null };

export function readAuthDetail(value: unknown): AuthSummary {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const dkim = Array.isArray(record.dkim)
    ? record.dkim.slice(0, 4).map((entry) => {
        const s = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        return {
          domain: typeof s.domain === "string" ? s.domain : "",
          selector: typeof s.selector === "string" ? s.selector : "",
          status: typeof s.status === "string" ? s.status : "",
          code: typeof s.code === "string" ? s.code : null,
          aligned: s.aligned === true,
        };
      })
    : [];
  const spfRecord = (record.spf && typeof record.spf === "object" ? record.spf : null) as Record<string, unknown> | null;
  const spf = spfRecord
    ? {
        ip: typeof spfRecord.ip === "string" ? spfRecord.ip : "",
        domain: typeof spfRecord.domain === "string" ? spfRecord.domain : "",
        result: typeof spfRecord.result === "string" ? spfRecord.result : "",
      }
    : null;
  return { dkim, spf };
}
