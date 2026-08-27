import { promises as dns } from "node:dns";
import { getOwnOrganizationOrThrow } from "@/db/queries/newsletters";
import { saveEmailDomainState, type EmailDomainState } from "@/db/queries/organizations";
import { AppError } from "@/lib/errors";
import type { OrgScopeUser } from "@/lib/session";
import { createDomain, getDomain, listDomains, ResendError, verifyDomain, type DomainRecord, type ProviderDomain } from "./resend";

/**
 * LE PARCOURS GUIDÉ DU DOMAINE D'EXPÉDITION (docs/module-engagement.md §3.2) :
 * déclarer (ou ADOPTER un domaine déjà déclaré chez le fournisseur — le
 * cas du client pilote), vérifier, lire ce qui manque. Les enregistrements
 * sont TOUJOURS ceux que le fournisseur renvoie, avec leur statut, plus
 * notre ligne DMARC vérifiée par une requête DNS depuis la fonction. Une
 * erreur du fournisseur ou du réseau est écrite et affichée — jamais un
 * échec muet. Un plan qui n'admet plus de domaine est dit comme tel.
 */

const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

// eslint-disable-next-line local/no-visible-text -- la valeur d'un enregistrement DNS, à recopier telle quelle
export const DMARC_RECORD_VALUE = "v=DMARC1; p=none;";

export type DomainRecordView = DomainRecord & {
  /** Le nom complet à créer chez l'hébergeur, quand le fournisseur ne donne que la partie relative. */
  fullName: string;
  /** Vient de nous (DMARC), pas du fournisseur. */
  ours: boolean;
};

export function normalizeDomain(input: string): string {
  const value = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!HOSTNAME.test(value)) throw new AppError("ce_domaine_ne_semble_pas_valide", { domain: input.trim() });
  return value;
}

/** La zone DNS d'un domaine, approchée par ses deux derniers labels (« cabinet-dupont.fr ») — le fournisseur nomme ses enregistrements relativement à elle. */
function zoneOf(domain: string): string {
  const labels = domain.split(".");
  return labels.slice(-2).join(".");
}

function withFullNames(domain: string, records: DomainRecord[]): DomainRecordView[] {
  const zone = zoneOf(domain);
  return records.map((r) => ({
    ...r,
    ours: false,
    fullName: r.name.endsWith(zone) ? r.name : r.name === "@" ? zone : `${r.name}.${zone}`,
  }));
}

export type DmarcLookup = { status: "verified" | "not_started" | "temporary_failure"; value: string | null; error: string | null };

/** DMARC lu par nous : le fournisseur ne le renvoie pas, mais le cahier l'exige avec SPF et DKIM. */
export async function lookupDmarc(domain: string): Promise<DmarcLookup> {
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`);
    const values = records.map((chunks) => chunks.join(""));
    const dmarc = values.find((v) => /^v=DMARC1/i.test(v.trim())) ?? null;
    return dmarc ? { status: "verified", value: dmarc, error: null } : { status: "not_started", value: null, error: null };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "ENOTFOUND" || code === "ENODATA") return { status: "not_started", value: null, error: null };
    return { status: "temporary_failure", value: null, error: `${code || "DNS"}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function dmarcRow(domain: string, lookup: DmarcLookup): DomainRecordView {
  return {
    record: "DMARC",
    name: `_dmarc.${domain}`.replace(`.${zoneOf(domain)}`, ""),
    fullName: `_dmarc.${domain}`,
    type: "TXT",
    // eslint-disable-next-line local/no-visible-text -- le vocabulaire du fournisseur (« Auto » = TTL par défaut), pas un texte à traduire
    ttl: "Auto",
    value: DMARC_RECORD_VALUE,
    status: lookup.status,
    ours: true,
  };
}

/** Tout est-il en place : le fournisseur dit « vérifié » ET DMARC répond. */
function isFullyVerified(provider: ProviderDomain, dmarc: DmarcLookup): boolean {
  return provider.status === "verified" && dmarc.status === "verified";
}

function planLimitReached(error: ResendError): boolean {
  return (error.status === 403 || error.status === 422 || error.status === 400) && /domain/i.test(error.message) && /(limit|plan|upgrade|maximum|allowed|quota)/i.test(error.message);
}

async function stateFrom(domain: string, provider: ProviderDomain, previousVerifiedAt: Date | null, checkError: string | null): Promise<EmailDomainState> {
  const dmarc = await lookupDmarc(domain);
  const verified = isFullyVerified(provider, dmarc);
  return {
    emailDomain: domain,
    emailDomainProviderId: provider.id,
    emailDomainStatus: provider.status,
    emailDomainRecords: [...withFullNames(domain, provider.records), dmarcRow(domain, dmarc)],
    emailDomainCheckedAt: new Date(),
    emailDomainCheckError: checkError ?? dmarc.error,
    emailDomainVerifiedAt: verified ? (previousVerifiedAt ?? new Date()) : null,
  };
}

/** Déclare le domaine (ou adopte celui qui existe déjà chez le fournisseur sous ce nom) et rend l'état — enregistrements compris. */
export async function declareEmailDomain(user: OrgScopeUser, input: string): Promise<EmailDomainState> {
  const org = await getOwnOrganizationOrThrow(user);
  const domain = normalizeDomain(input);
  if (org.emailDomainProviderId) throw new AppError("un_domaine_est_deja_declare_retire_le_d_abord", { domain: org.emailDomain ?? "" });
  let provider: ProviderDomain;
  try {
    const existing = (await listDomains()).find((d) => d.name.toLowerCase() === domain);
    provider = existing ? await getDomain(existing.id) : await createDomain(domain);
  } catch (error) {
    if (error instanceof ResendError && planLimitReached(error)) {
      await saveEmailDomainState(user, {
        emailDomain: domain,
        emailDomainProviderId: null,
        emailDomainStatus: "unavailable_on_plan",
        emailDomainRecords: null,
        emailDomainCheckedAt: new Date(),
        emailDomainCheckError: error.message,
        emailDomainVerifiedAt: null,
      });
      throw new AppError("domaine_indisponible_sur_ce_plan");
    }
    throw new AppError("le_fournisseur_d_envoi_a_repondu", { message: error instanceof Error ? error.message : String(error) });
  }
  const state = await stateFrom(domain, provider, null, null);
  await saveEmailDomainState(user, state);
  return state;
}

/** « Vérifier maintenant » : demande la vérification, relit le statut par enregistrement, lit DMARC, écrit tout. */
export async function checkEmailDomain(user: OrgScopeUser): Promise<EmailDomainState> {
  const org = await getOwnOrganizationOrThrow(user);
  if (!org.emailDomain || !org.emailDomainProviderId) throw new AppError("aucun_domaine_d_envoi_declare");
  let provider: ProviderDomain;
  let checkError: string | null = null;
  try {
    // La demande de vérification est asynchrone chez le fournisseur : on la lance, puis on lit l'état courant.
    await verifyDomain(org.emailDomainProviderId).catch((error) => {
      checkError = error instanceof Error ? error.message : String(error);
    });
    provider = await getDomain(org.emailDomainProviderId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveEmailDomainState(user, {
      emailDomain: org.emailDomain,
      emailDomainProviderId: org.emailDomainProviderId,
      emailDomainStatus: org.emailDomainStatus,
      emailDomainRecords: org.emailDomainRecords,
      emailDomainCheckedAt: new Date(),
      emailDomainCheckError: message,
      emailDomainVerifiedAt: org.emailDomainVerifiedAt,
    });
    throw new AppError("le_fournisseur_d_envoi_a_repondu", { message });
  }
  const state = await stateFrom(org.emailDomain, provider, org.emailDomainVerifiedAt, checkError);
  await saveEmailDomainState(user, state);
  return state;
}

/** Retire le domaine des réglages (le repli reprend aussitôt) ; chez le fournisseur, le domaine reste — le retirer là-bas est un geste d'administration, pas de produit. */
export async function forgetEmailDomain(user: OrgScopeUser): Promise<void> {
  await saveEmailDomainState(user, {
    emailDomain: null,
    emailDomainProviderId: null,
    emailDomainStatus: null,
    emailDomainRecords: null,
    emailDomainCheckedAt: null,
    emailDomainCheckError: null,
    emailDomainVerifiedAt: null,
  });
}

/** Les enregistrements stockés, relus avec leur forme (jsonb → vues) ; vide quand rien n'est déclaré. */
export function parseDomainRecords(value: unknown): DomainRecordView[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is DomainRecordView => Boolean(r) && typeof r === "object" && typeof (r as DomainRecordView).name === "string");
}

/** Ce qui manque, en codes — l'écran les met en phrases : les enregistrements qui ne sont pas « verified ». */
export function missingRecords(records: DomainRecordView[]): DomainRecordView[] {
  return records.filter((r) => r.status !== "verified");
}
