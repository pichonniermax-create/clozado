import Anthropic from "@anthropic-ai/sdk";
import {
  buildEmitNewsletterTool,
  NEWSLETTER_OUTPUT_SCHEMA,
  type NewsletterOutput,
} from "@/lib/newsletter/blocks";
import { AITruncatedError, type AIProvider, type DesignNewsletterInput } from "./types";

/**
 * Implémentation Anthropic de `AIProvider`. Tout le prompt système est
 * GÉNÉRÉ depuis le profil de l'organisation et de la cible (jamais un nom de
 * marque, un ton ou une règle métier écrit en dur ici) — contrairement au
 * module d'origine où ce même texte était un littéral hard-codé pour un
 * seul client (dossier de reconstruction §4.2/§7.2, le principal point à
 * généraliser).
 */
export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async designNewsletter(input: DesignNewsletterInput): Promise<NewsletterOutput> {
    return this.run(input);
  }

  async designNewsletterStreaming(
    input: DesignNewsletterInput,
    onProgress: (accumulatedJson: string) => void
  ): Promise<NewsletterOutput> {
    return this.run(input, onProgress);
  }

  /**
   * Un seul chemin d'appel pour les deux modes : la requête est toujours
   * streamée, seule la restitution de l'avancement change. Ça évite d'avoir
   * deux constructions de requête (prompt, outil, cache) à tenir alignées —
   * et le streaming est de toute façon recommandé dès que la sortie peut
   * être longue, ce qui est le cas ici.
   */
  private async run(
    input: DesignNewsletterInput,
    onProgress?: (accumulatedJson: string) => void
  ): Promise<NewsletterOutput> {
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    const tool = buildEmitNewsletterTool();
    // `buildEmitNewsletterTool()` reste volontairement agnostique du SDK
    // (blocks.ts n'importe aucun type vendeur) — le schéma JSON généré par
    // zod est structurellement un `Tool.InputSchema` (`type: "object"`,
    // `properties`, `required`) mais typé plus large côté domaine ; seul ce
    // point de frontière avec le SDK Anthropic le resserre.
    const anthropicTool = {
      ...tool,
      // Sans ça, l'API assemble et valide le JSON de l'outil avant de
      // l'émettre : les fragments arrivent alors en une rafale à la toute
      // fin. Mesuré sur cette route — objet et préheader tombaient à 1,5 s
      // et 2,4 s, puis plus rien pendant dix secondes, puis les dix blocs en
      // 120 ms. Avec `eager_input_streaming`, le JSON part à mesure qu'il
      // est produit ; il est alors syntaxiquement incomplet en cours de
      // route, ce que `parsePartialNewsletter` sait déjà lire, et la sortie
      // finale reste validée par le schéma comme avant.
      eager_input_streaming: true,
    } as unknown as Anthropic.Tool;

    const stream = this.client.messages.stream({
      model,
      max_tokens: 8192,
      system: [
        {
          type: "text",
          text: buildSystemPrompt(input),
          // Bloc stable pour une même organisation/cible : mis en cache pour
          // ne pas repayer le prompt entier à chaque génération.
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [anthropicTool],
      tool_choice: { type: "tool", name: anthropicTool.name },
      messages: [{ role: "user", content: buildUserMessage(input) }],
    });

    if (onProgress) {
      let accumulated = "";
      stream.on("streamEvent", (event) => {
        // Le JSON de l'outil arrive en fragments par `input_json_delta` :
        // c'est la seule source d'avancement réel. On le transmet brut,
        // l'appelant décide quoi en extraire.
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "input_json_delta"
        ) {
          accumulated += event.delta.partial_json;
          onProgress(accumulated);
        }
      });
    }

    const message = await stream.finalMessage();

    // Jamais renvoyer un JSON d'outil amputé silencieusement (dossier de
    // reconstruction §4.1 : "long mail displayed incomplete").
    if (message.stop_reason === "max_tokens") {
      throw new AITruncatedError();
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === tool.name
    );
    if (!toolUse) {
      throw new Error("L'IA n'a pas appelé l'outil emit_newsletter.");
    }

    // Pas de `strict: true` côté API sur ce schéma (cf. commentaire de
    // `buildEmitNewsletterTool`) : c'est CETTE validation qui est le filet
    // de sécurité, jamais une forme non vérifiée transmise telle quelle à
    // l'appelant (même règle que pour un payload chargé depuis la base).
    // Elle porte sur la sortie COMPLÈTE — ce qui a été affiché pendant le
    // flux était provisoire et n'engage rien.
    return NEWSLETTER_OUTPUT_SCHEMA.parse(toolUse.input);
  }
}

function buildSystemPrompt(input: DesignNewsletterInput): string {
  const { organization, verifiedFigures } = input;

  const figuresList = verifiedFigures.length
    ? verifiedFigures.map((f) => `${f.label} : ${f.value}`).join(" · ")
    : "(aucun chiffre vérifié enregistré pour cette organisation)";

  const toneBlock = organization.toneOfVoice
    ? `TON DE MARQUE :\n${organization.toneOfVoice}`
    : "TON DE MARQUE : professionnel, direct, jamais condescendant.";

  const guidelinesBlock = organization.editorialGuidelines
    ? `\n\nRÈGLES ET CONTEXTE MÉTIER (${organization.name}) :\n${organization.editorialGuidelines}`
    : "";

  const taglineNote = organization.tagline ? ` Tagline : « ${organization.tagline} ».` : "";

  return `Tu es le rédacteur marketing de ${organization.name}.${taglineNote}

${toneBlock}${guidelinesBlock}

CHIFFRES (RÈGLE ABSOLUE) : n'invente JAMAIS un chiffre, un prix, un taux, un délai ni un montant. Par ordre de priorité :
1) CHIFFRES VÉRIFIÉS DE L'ORGANISATION, utilisables tels quels : ${figuresList}.
2) DONNÉES RÉELLES SOURCÉES éventuellement fournies dans le message utilisateur : utilise-les en priorité dans les blocs chiffre_cle, TOUJOURS citées au format « valeur (source, date) ». Jamais sans leur date.
3) TOUT AUTRE chiffre (prix, délai, taux, apport…) → un PLACEHOLDER entre crochets : [apport %], [délai], [prix m²]. Un chiffre sans source vérifiée ou fournie = crochet, sans exception.

IDENTITÉ ÉDITORIALE PAR CIBLE : le message utilisateur fournit l'identité de la cible (qui est le lecteur, la voix à prendre). Elle PRIME sur le ton générique ci-dessus.

BLOCS DISPONIBLES (utilise l'outil emit_newsletter) :
- titre (text, level 1-3, eyebrow) — titre court et concret ; level 1 pour le titre principal, avec un eyebrow (kicker éditorial de 2 à 4 mots annonçant l'angle, jamais le nom de la cible ni un mot générique type « Newsletter ») ; eyebrow vide ("") pour les level 2/3.
- texte (text) — UN paragraphe = UNE idée, 2-3 phrases MAX. Plusieurs paragraphes possibles dans le MÊME bloc, séparés par une ligne vide — jamais deux blocs texte à la suite.
- chiffre_cle (value, label, caption) — une donnée mise en avant : UNIQUEMENT un chiffre vérifié (liste ci-dessus) OU un [placeholder], jamais une métrique inventée. Toujours en rangée de 2 à 4 blocs chiffre_cle CONSÉCUTIFS (jamais isolé, jamais deux rangées). SYMÉTRIE : une caption sur TOUTES les colonnes de la rangée, ou sur AUCUNE.
- fiches (cards : 2 à 4 { title, text }) — dès qu'une liste de points s'y prête (critères, étapes, comparatif) plutôt que des paragraphes empilés.
- cta (title, text, buttonLabel, url) — l'UNIQUE encart d'appel à l'action.
- bouton (label, url) — bouton seul (compte comme le CTA unique).
- separateur — séparateur visuel, aucun champ.

RÈGLES DE COPIE — PERCUTANT, MOBILE-FIRST :
- 1 idée = 1 bloc. INTERDIT : deux blocs du MÊME type qui se suivent (seule exception : la rangée de chiffre_cle).
- ENTAME par le chiffre / la donnée concrète, jamais par une intro générique. INTERDIT : « Dans un contexte… », « Nous tenions à vous informer… ».
- UN SEUL CTA dans toute la newsletter (un seul bloc cta OU un seul bouton, jamais les deux, jamais plusieurs).
- Termine par l'unique CTA.
- SIGNATURE : n'ajoute JAMAIS de bloc dédié à la signature — elle est ajoutée automatiquement au rendu si l'organisation en a défini une pour cette cible.
- Tout le texte dans la langue demandée.

OBJET EMAIL : ≤ 42 caractères, mène par le bénéfice ou le chiffre, zéro clickbait. Préheader (preview) ≤ 85 caractères et DISTINCT de l'objet.`;
}

function buildUserMessage(input: DesignNewsletterInput): string {
  const { target, signatory, lang, brief, targetLength } = input;

  const personaLine = target.persona ? ` — persona : ${target.persona}` : "";
  const audienceLine = target.audienceLabel ? ` Audience ${target.audienceLabel}.` : "";

  const signatureNote = signatory
    ? `Signature : n'écris AUCUN bloc signature — la signature officielle de ${signatory.name} est ajoutée automatiquement au rendu.`
    : "";

  const lengthLine = targetLength
    ? `Longueur cible : ${targetLength.label} — vise ~${targetLength.ideal} caractères de corps (espaces compris), fourchette ${targetLength.min}-${targetLength.max}. Ajuste le nombre de sections et la longueur des paragraphes en conséquence.`
    : "";

  return [
    `Cible : ${target.label}${personaLine}.${audienceLine}`,
    `Identité éditoriale de la cible (elle prime sur le ton générique) : ${target.editorialVoice}`,
    `Langue : ${lang === "fr" ? "français" : "anglais"}.`,
    signatureNote,
    lengthLine,
    `Brief : ${brief}`,
    "",
    "Propose une newsletter percutante et profonde, scannable au téléphone : entame par le chiffre / la donnée, 1 idée par bloc portée jusqu'à son implication pour le lecteur, UN SEUL CTA. Tout chiffre est soit vérifié par l'organisation, soit cité « valeur (source, date) » depuis les données fournies, soit un [placeholder].",
  ]
    .filter(Boolean)
    .join("\n");
}
