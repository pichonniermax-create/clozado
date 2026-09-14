import { z } from "zod";

/**
 * LES RÈGLES DE RELANCE (chantier engagement, Partie 3, §5.2) — le pendant
 * de `src/lib/targets/criteria.ts` : des clés PLATES, une phrase par
 * critère, jamais un arbre ET/OU. Une règle = un déclencheur + un seuil en
 * jours + des conditions + UNE action. La compilation SQL vit dans
 * `src/db/queries/rules.ts` (comme `segmentCondition` pour les cibles) ;
 * ici, seulement la forme validée et ses gardes — utilisables des deux
 * côtés (écran et serveur) sans rien importer de la base.
 */

export const RULE_TRIGGERS = [
  "no_appointment",
  "no_interaction",
  "email_not_opened",
  "email_not_clicked",
  "share_unanswered",
] as const;
export type RuleTriggerKind = (typeof RULE_TRIGGERS)[number];

export const RULE_ACTIONS = ["create_task", "notify_owner", "prepare_draft", "send_email"] as const;
export type RuleActionKind = (typeof RULE_ACTIONS)[number];

export function isRuleTrigger(value: string): value is RuleTriggerKind {
  return (RULE_TRIGGERS as readonly string[]).includes(value);
}

export function isRuleAction(value: string): value is RuleActionKind {
  return (RULE_ACTIONS as readonly string[]).includes(value);
}

/** Les actions qui écrivent un email — elles exigent un gabarit (objet + corps). */
export function needsTemplate(action: string): boolean {
  return action === "prepare_draft" || action === "send_email";
}

const uuidList = z.array(z.uuid()).max(50);

/**
 * Les conditions d'une règle (§5.2) : étiquettes (au moins une), cibles
 * (membre d'au moins une), « type de partenaire » (un partenaire PRM de
 * même email et de cette profession — texte libre du client), conseillers.
 * Toutes optionnelles ; elles se combinent par ET.
 */
export const RULE_CONDITIONS_SCHEMA = z
  .object({
    tagsAny: uuidList.optional(),
    targetIds: uuidList.optional(),
    partnerProfessions: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    ownerIds: uuidList.optional(),
  })
  .strict();

export type RuleConditions = z.infer<typeof RULE_CONDITIONS_SCHEMA>;

/** Retire les listes vides — `{}` = « tous les contacts vivants ». */
export function normalizeRuleConditions(input: RuleConditions): RuleConditions {
  const out: RuleConditions = {};
  if (input.tagsAny?.length) out.tagsAny = input.tagsAny;
  if (input.targetIds?.length) out.targetIds = input.targetIds;
  if (input.partnerProfessions?.length) out.partnerProfessions = input.partnerProfessions;
  if (input.ownerIds?.length) out.ownerIds = input.ownerIds;
  return out;
}

/**
 * Lecture TOLÉRANTE, pour l'AFFICHAGE (liste des règles, formulaire) : un
 * JSON illisible vaut « aucune condition » — jamais un écran cassé. JAMAIS
 * pour l'évaluation : là, `{}` voudrait dire « tous les contacts vivants »,
 * et une colonne corrompue élargirait une règle d'envoi à toute la base.
 */
export function parseRuleConditions(value: unknown): RuleConditions {
  const parsed = RULE_CONDITIONS_SCHEMA.safeParse(value ?? {});
  return parsed.success ? normalizeRuleConditions(parsed.data) : {};
}

/** Des conditions illisibles rencontrées à l'évaluation : la règle est sautée, le passage le consigne (`rule_runs.error`). */
export class InvalidRuleConditionsError extends Error {
  constructor() {
    super("invalid_rule_conditions");
    this.name = "InvalidRuleConditionsError";
  }
}

/**
 * Lecture STRICTE, pour l'ÉVALUATION (audit, constat Q6) : une valeur qui
 * n'est pas un objet aux clés connues — JSON invalide, chaîne, tableau,
 * clé inconnue, valeur hors forme — LÈVE. `{}` reste « tous les contacts
 * vivants » : c'est ce que la personne a enregistré.
 */
export function readRuleConditionsStrict(value: unknown): RuleConditions {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      throw new InvalidRuleConditionsError();
    }
  }
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) throw new InvalidRuleConditionsError();
  const parsed = RULE_CONDITIONS_SCHEMA.safeParse(candidate);
  if (!parsed.success) throw new InvalidRuleConditionsError();
  return normalizeRuleConditions(parsed.data);
}
