import { getAIProvider } from "@/lib/ai";
import type { ProposedField } from "@/lib/ai/types";

/**
 * LA SIGNATURE PROPOSÉE (docs/module-engagement.md §4.3) — le déterministe
 * d'abord (le téléphone trouvé par motif, le nom lu dans l'en-tête), le
 * modèle ENSUITE, et seulement pour ce qui relève du jugement (société,
 * fonction, un nom écrit dans la signature). Rien de tout ça n'est écrit
 * sur une fiche : c'est une PROPOSITION, qu'une personne confirme ou
 * corrige. Sans clé d'IA — ou si le fournisseur tombe —, le déterministe
 * suffit et l'ingestion continue : jamais un email perdu parce qu'un
 * modèle n'a pas répondu.
 */

export type SignatureProposal = {
  name: ProposedField;
  phone: ProposedField;
  company: ProposedField;
  jobTitle: ProposedField;
  /** `model` : le modèle a proposé ; `deterministic` : il n'a pas pu (pas de clé, panne) — dit à l'écran. */
  source: "model" | "deterministic";
  model: string | null;
};

/** Le téléphone ANNONCÉ (« Tél. … », ou un indicatif international) : une certitude de forme. */
const PHONE_LABELLED_CONFIDENCE = 0.9;
/** Une suite de chiffres de forme téléphonique, sans rien qui l'annonce : une référence de dossier lui ressemble — « à vérifier ». */
const PHONE_BARE_CONFIDENCE = 0.55;
/** Le nom lu dans l'en-tête (`From` du bloc transféré) : fiable, mais c'est un nom d'affichage — il peut être un pseudonyme. */
const HEADER_NAME_CONFIDENCE = 0.7;

export async function proposeSignature(input: {
  /** Les dernières lignes non citées du message d'origine (`parseInbound`). */
  lines: string[];
  /** Le téléphone déterministe (`findPhoneDetail`), null s'il n'y en a pas. */
  phone: string | null;
  /** Il était annoncé par sa ligne (« Tél. … ») ou portait un indicatif. */
  phoneLabelled?: boolean;
  /** Le nom de l'expéditeur d'origine, tel que l'en-tête l'écrit. */
  senderName: string | null;
  senderEmail: string | null;
  lang: "fr" | "en";
}): Promise<SignatureProposal> {
  const deterministic: SignatureProposal = {
    name: input.senderName?.trim() ? { value: input.senderName.trim().slice(0, 160), confidence: HEADER_NAME_CONFIDENCE } : null,
    phone: input.phone ? { value: input.phone, confidence: input.phoneLabelled ? PHONE_LABELLED_CONFIDENCE : PHONE_BARE_CONFIDENCE } : null,
    company: null,
    jobTitle: null,
    source: "deterministic",
    model: null,
  };
  if (input.lines.length === 0) return deterministic;

  try {
    const extraction = await getAIProvider().extractSignature({
      lang: input.lang,
      lines: input.lines,
      senderName: input.senderName,
      senderEmail: input.senderEmail,
    });
    return {
      // Le modèle propose ; là où il ne propose rien, le déterministe reste.
      name: extraction.name ?? deterministic.name,
      phone: extraction.phone ?? deterministic.phone,
      company: extraction.company,
      jobTitle: extraction.jobTitle,
      source: "model",
      model: extraction.model,
    };
  } catch {
    // Pas de clé, quota, panne, réponse illisible : l'ingestion ne s'arrête
    // pas pour autant — la proposition est simplement plus pauvre.
    return deterministic;
  }
}
