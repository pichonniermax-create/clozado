import Anthropic from "@anthropic-ai/sdk";
import {
  buildEmitNewsletterTool,
  NEWSLETTER_OUTPUT_SCHEMA,
  type NewsletterOutput,
} from "@/lib/newsletter/blocks";
import { canonicalUrl, hostOf } from "@/lib/watch/url";
import {
  AITruncatedError,
  type AIProvider,
  type ArticleSummary,
  type ClassifyTitlesInput,
  type ClassifyTitlesResult,
  type DesignNewsletterInput,
  type SearchArticlesInput,
  type SearchArticlesResult,
  type SearchedArticle,
  type SummarizeArticleInput,
} from "./types";
import {
  ARTICLES_OUTPUT_SCHEMA,
  buildEmitArticlesTool,
  buildEmitClassificationTool,
  buildEmitSummaryTool,
  CLASSIFICATION_OUTPUT_SCHEMA,
  SUMMARY_OUTPUT_SCHEMA,
} from "./watch-tools";

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
   * Le résumé ORIGINAL d'un article (veille). Deux chemins, un seul
   * contrat : quand la veille a pu lire la page (`input.text`), le texte est
   * transmis au modèle et l'outil `emit_summary` est FORCÉ ; sinon le
   * fournisseur lit la page lui-même (`web_fetch`, variante de base, dont
   * le résultat contient le document lu — nécessaire au contrôle des douze
   * mots). Dans les deux cas le texte d'origine est rendu à l'appelant
   * avec le résumé, pour ce contrôle, et n'est jamais stocké.
   */
  async summarizeArticle(input: SummarizeArticleInput): Promise<ArticleSummary> {
    const model = watchModel();
    const tool = buildEmitSummaryTool() as unknown as Anthropic.Tool;
    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: buildSummarySystemPrompt(input.topics), cache_control: { type: "ephemeral" } },
    ];

    if (input.text !== undefined) {
      const message = await this.client.messages.create({
        model,
        max_tokens: 1024,
        output_config: { effort: "medium" },
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: buildSummaryUserMessage(input, input.text) }],
      });
      return finishSummary(message, tool.name, input.text, model);
    }

    const host = hostOf(input.url);
    const fetchTool: Anthropic.WebFetchTool20250910 = {
      type: "web_fetch_20250910",
      name: "web_fetch",
      max_uses: 1,
      max_content_tokens: 12_000,
      ...(host ? { allowed_domains: [host] } : {}),
    };
    const message = await this.client.messages.create({
      model,
      max_tokens: 1024,
      output_config: { effort: "medium" },
      system,
      tools: [fetchTool, tool],
      messages: [
        {
          role: "user",
          content: `Lis la page ${input.url} avec l'outil web_fetch (éditeur annoncé : ${input.publisher} ; titre annoncé : « ${input.title} »), puis appelle emit_summary. Si la page n'a pas pu être lue, appelle emit_summary avec readable=false et un résumé vide. N'écris aucun texte en dehors des outils.`,
        },
      ],
    });
    const fetched = message.content.find(
      (block): block is Anthropic.WebFetchToolResultBlock => block.type === "web_fetch_tool_result"
    );
    if (!fetched) throw new Error("la page n'a pas été lue par le fournisseur");
    if (fetched.content.type === "web_fetch_tool_result_error") {
      throw new Error(`page inaccessible (${readableFetchError(fetched.content.error_code)})`);
    }
    const source = fetched.content.content.source;
    const original = source.type === "text" ? source.data : "";
    if (!original.trim()) throw new Error("contenu non lisible (document non textuel)");
    return finishSummary(message, tool.name, original, model);
  }

  /**
   * Une recherche web BORNÉE (un sujet, une langue, un pays, des domaines,
   * une seule requête) : le modèle trie et décrit les résultats par
   * `emit_articles`, mais seules les URL que le moteur a réellement
   * renvoyées (`web_search_tool_result`) sont rendues — jamais une adresse
   * écrite de mémoire par le modèle.
   */
  async searchArticles(input: SearchArticlesInput): Promise<SearchArticlesResult> {
    const model = watchModel();
    const tool = buildEmitArticlesTool() as unknown as Anthropic.Tool;
    // La variante de base de l'outil, à dessein : celle à filtrage dynamique
    // (`web_search_20260209`) fait transiter les résultats par une exécution
    // de code côté serveur — 40 s et des résultats retravaillés, là où
    // celle-ci répond en 6 à 8 s avec la liste brute du moteur, qui est
    // exactement ce que la liste blanche ci-dessous doit lire.
    const searchTool: Anthropic.WebSearchTool20250305 = {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 1,
      user_location: { type: "approximate", country: input.country, timezone: "Europe/Paris" },
      ...(input.allowedDomains?.length ? { allowed_domains: input.allowedDomains } : {}),
    };
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildSearchUserMessage(input) }];
    let message = await this.client.messages.create({
      model,
      max_tokens: 2048,
      output_config: { effort: "low" },
      tools: [searchTool, tool],
      messages,
    });
    // Un tour serveur peut être mis en pause (`pause_turn`) : on le reprend une fois.
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      message = await this.client.messages.create({
        model,
        max_tokens: 2048,
        output_config: { effort: "low" },
        tools: [searchTool, tool],
        messages,
      });
    }
    if (message.stop_reason === "max_tokens") throw new AITruncatedError();

    const found = new Map<string, { url: string; title: string; pageAge: string | null }>();
    for (const block of message.content) {
      if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
      for (const result of block.content) {
        const canonical = canonicalUrl(result.url);
        if (canonical && !found.has(canonical)) found.set(canonical, { url: result.url, title: result.title, pageAge: result.page_age });
      }
    }
    const searches = message.usage.server_tool_use?.web_search_requests ?? 0;

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === tool.name
    );
    const articles: SearchedArticle[] = [];
    const seen = new Set<string>();
    if (toolUse) {
      const emitted = ARTICLES_OUTPUT_SCHEMA.parse(toolUse.input).articles;
      for (const article of emitted) {
        const canonical = canonicalUrl(article.url);
        if (!canonical || seen.has(canonical)) continue;
        const hit = found.get(canonical);
        if (!hit) continue;
        seen.add(canonical);
        articles.push({
          url: hit.url,
          title: article.title.trim() || hit.title,
          publishedAt: article.publishedAt,
          pageAge: hit.pageAge,
          lang: article.lang?.toLowerCase() ?? null,
          country: article.country?.toUpperCase() ?? null,
        });
      }
    } else {
      // Le modèle n'a pas rendu l'outil : les résultats bruts du moteur, sans description.
      for (const hit of found.values()) {
        articles.push({ url: hit.url, title: hit.title, publishedAt: null, pageAge: hit.pageAge, lang: input.lang, country: null });
      }
    }
    return { articles: articles.slice(0, input.maxResults), searches, model };
  }

  /**
   * La classification des TITRES d'un concurrent (veille concurrentielle,
   * étape 5) : un lot de titres publics, l'outil `emit_classification`
   * FORCÉ, une entrée par identifiant. Le modèle n'a ni le texte ni un
   * résumé — il n'y a rien à reproduire — et le sujet qu'il rend est
   * tenu à un vocabulaire partagé (les sujets suivis, puis ceux déjà
   * donnés) pour que l'écart de contenu groupe ce qui va ensemble. Seules
   * les entrées dont l'identifiant a été donné sont rendues.
   */
  async classifyTitles(input: ClassifyTitlesInput): Promise<ClassifyTitlesResult> {
    const model = watchModel();
    const tool = buildEmitClassificationTool() as unknown as Anthropic.Tool;
    const message = await this.client.messages.create({
      model,
      max_tokens: 4096,
      output_config: { effort: "low" },
      system: [{ type: "text", text: buildClassificationSystemPrompt(input), cache_control: { type: "ephemeral" } }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: buildClassificationUserMessage(input) }],
    });
    if (message.stop_reason === "max_tokens") throw new AITruncatedError();
    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === tool.name
    );
    if (!toolUse) throw new Error("le modèle n'a pas rendu de classification");
    const output = CLASSIFICATION_OUTPUT_SCHEMA.parse(toolUse.input);
    const ids = new Set(input.items.map((item) => item.id));
    const seen = new Set<string>();
    const items: ClassifyTitlesResult["items"] = [];
    for (const entry of output.items) {
      if (!ids.has(entry.id) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      const subject = entry.subject?.trim().replace(/\s+/g, " ").slice(0, 80) || null;
      items.push({ id: entry.id, subject, angle: entry.angle });
    }
    return { items, model };
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

/**
 * Le prompt système — STABLE pour une organisation et une cible (mis en
 * cache) : le profil de l'organisation, l'identité de la cible en six
 * facettes (celles qui sont remplies — jamais une formulation de cible en
 * dur ici), ce qui lui a déjà été envoyé, les chiffres autorisés, les
 * règles. Exporté pour être lu tel quel par les preuves.
 */
export function buildSystemPrompt(input: DesignNewsletterInput): string {
  const { organization, verifiedFigures, recentTopics } = input;

  // Chaque chiffre transmis porte sa source et sa date (chantier « ciblage
  // et contenu ») : ce qui n'en a pas n'arrive pas jusqu'ici.
  const figuresList = verifiedFigures.length
    ? verifiedFigures.map((f) => `${f.label} : ${f.value} (${f.sourceName}, ${f.asOf})`).join(" · ")
    : "(aucun chiffre vérifié enregistré pour cette organisation)";

  const toneBlock = organization.toneOfVoice
    ? `TON DE MARQUE :\n${organization.toneOfVoice}`
    : "TON DE MARQUE : professionnel, direct, jamais condescendant.";

  const guidelinesBlock = organization.editorialGuidelines
    ? `\n\nRÈGLES ET CONTEXTE MÉTIER (${organization.name}) :\n${organization.editorialGuidelines}`
    : "";

  const taglineNote = organization.tagline ? ` Tagline : « ${organization.tagline} ».` : "";

  const recentBlock = recentTopics.length
    ? `\n\nDÉJÀ ENVOYÉ À CETTE CIBLE RÉCEMMENT — sujets traités, à ne pas répéter sans angle nouveau : ${recentTopics.map((t) => `« ${t} »`).join(", ")}.`
    : "";

  return `Tu es le rédacteur marketing de ${organization.name}.${taglineNote}

${toneBlock}${guidelinesBlock}

${buildIdentityBlock(input.target)}${recentBlock}

CHIFFRES (RÈGLE ABSOLUE) : n'invente JAMAIS un chiffre, un prix, un taux, un délai ni un montant. Par ordre de priorité :
1) CHIFFRES VÉRIFIÉS DE L'ORGANISATION, utilisables tels quels, chacun avec sa source et sa date entre parenthèses — cite-les « valeur (source, date) » : ${figuresList}.
2) UN CHIFFRE LU DANS LA MATIÈRE (nos résumés d'articles, voir plus bas) n'est PAS vérifié par l'organisation : si tu le cites, écris-le « valeur (éditeur, date) » dans la phrase qui s'appuie sur l'article, jamais dans un bloc chiffre_cle — il sera signalé « à vérifier ». Préfère les chiffres vérifiés.
3) TOUT AUTRE chiffre (prix, délai, taux, apport…) → un PLACEHOLDER entre crochets : [apport %], [délai], [prix m²]. Un chiffre sans source vérifiée ou fournie = crochet, sans exception. Une date n'est pas un chiffre.

MATIÈRE ET SOURCES (RÈGLE ABSOLUE — DROIT D'AUTEUR) : le message utilisateur peut fournir une MATIÈRE : des articles, chacun avec un identifiant, son titre, son éditeur, sa date, son lien et NOTRE résumé (écrit avec nos mots). Tu n'as jamais le texte d'un article — seulement ces résumés. Tu écris avec tes mots : ne recopie ni un titre ni un résumé, même en partie (un contrôle refuse toute suite de huit mots reprise). Tout article dont tu utilises une information — ou dont tu évoques le sujet, même en passant — est cité dans UN bloc sources — ses champs (id, title, url, publisher, date) recopiés EXACTEMENT depuis la matière, jamais un article absent de la matière, jamais un lien écrit de mémoire. Sans matière, ou si tu n'en utilises rien : aucun bloc sources. Aucun lien dans le texte courant : les liens vivent dans le bloc sources et l'appel à l'action.

BLOCS DISPONIBLES (utilise l'outil emit_newsletter) :
- titre (text, level 1-3, eyebrow) — titre court et concret ; level 1 pour le titre principal, avec un eyebrow (kicker éditorial de 2 à 4 mots annonçant l'angle, jamais le nom de la cible ni un mot générique type « Newsletter ») ; eyebrow vide ("") pour les level 2/3.
- texte (text) — UN paragraphe = UNE idée, 2-3 phrases MAX. Plusieurs paragraphes possibles dans le MÊME bloc, séparés par une ligne vide — jamais deux blocs texte à la suite.
- chiffre_cle (value, label, caption) — une donnée mise en avant : UNIQUEMENT un chiffre vérifié (liste ci-dessus) OU un [placeholder], jamais une métrique inventée ni un chiffre de la matière. Toujours en rangée de 2 à 4 blocs chiffre_cle CONSÉCUTIFS (jamais isolé, jamais deux rangées). SYMÉTRIE : une caption sur TOUTES les colonnes de la rangée, ou sur AUCUNE.
- fiches (cards : 2 à 4 { title, text }) — dès qu'une liste de points s'y prête (critères, étapes, comparatif) plutôt que des paragraphes empilés.
- sources (title, items : { id, title, url, publisher, date }) — les articles de la MATIÈRE dont tu as utilisé une information, recopiés exactement ; title = un intitulé court dans la langue demandée (« Sources », « Pour aller plus loin ») ; un seul bloc sources, placé juste avant l'appel à l'action.
- cta (title, text, buttonLabel, url) — l'UNIQUE encart d'appel à l'action.
- bouton (label, url) — bouton seul (compte comme le CTA unique).
- separateur — séparateur visuel, aucun champ.

RÈGLES DE COPIE — PERCUTANT, MOBILE-FIRST :
- 1 idée = 1 bloc. INTERDIT : deux blocs du MÊME type qui se suivent (seule exception : la rangée de chiffre_cle).
- ENTAME par le chiffre / la donnée concrète, jamais par une intro générique. INTERDIT : « Dans un contexte… », « Nous tenions à vous informer… ».
- UN SEUL CTA dans toute la newsletter (un seul bloc cta OU un seul bouton, jamais les deux, jamais plusieurs).
- Termine par l'unique CTA.
- LA VOIX DE LA CIBLE : le ton et la voix indiqués pour elle (tutoiement ou vouvoiement, registre) s'appliquent à CHAQUE phrase, objet et préheader compris.
- SIGNATURE : n'ajoute JAMAIS de bloc dédié à la signature — elle est ajoutée automatiquement au rendu si l'organisation en a défini une pour cette cible.
- Tout le texte dans la langue demandée.

SUJETS TRAITÉS (topics) : un à quatre sujets courts (deux à quatre mots, dans la langue demandée) — ce dont cet email traite ; ils servent à ne pas se répéter d'un envoi à l'autre.

OBJET EMAIL : ≤ 42 caractères, mène par le bénéfice ou le chiffre, zéro clickbait. Préheader (preview) ≤ 85 caractères et DISTINCT de l'objet.`;
}

/**
 * L'identité de la cible, composée depuis ses six facettes — seulement
 * celles qui sont remplies ; une cible sans identité est dite telle, pas
 * inventée.
 */
function buildIdentityBlock(target: DesignNewsletterInput["target"]): string {
  const audience = target.audienceLabel ? ` (audience ${target.audienceLabel})` : "";
  const head = `LA PERSONNE À QUI TU ÉCRIS — cible « ${target.label} »${audience} :`;
  const facets = [
    target.persona ? `- Qui lit : ${target.persona}` : "",
    target.concerns ? `- Ce qui la préoccupe : ${target.concerns}` : "",
    target.knowledgeLevel ? `- Ce qu'elle sait déjà (son niveau) : ${target.knowledgeLevel}` : "",
    target.interests ? `- Ce qui l'intéresse : ${target.interests}` : "",
    target.editorialVoice ? `- Le ton et la voix pour elle (prime sur le ton de marque) : ${target.editorialVoice}` : "",
    target.avoid ? `- CE QU'ON NE LUI DIT PAS (jamais, sous aucune forme) : ${target.avoid}` : "",
  ].filter(Boolean);
  if (facets.length === 0) {
    return `${head}\nson identité n'est pas encore renseignée — écris pour le lecteur que ce libellé désigne, sans rien supposer de plus.`;
  }
  return `${head}\n${facets.join("\n")}\nChaque bloc s'adresse à elle : ses préoccupations d'abord, à son niveau (ni jargon, ni évidences), dans le ton indiqué — et rien de ce qu'on ne lui dit pas.`;
}

/**
 * Le message utilisateur — ce qui change d'un email à l'autre : la langue,
 * la signature, la longueur, la MATIÈRE (les articles rattachés, avec
 * leur identifiant — la liste blanche du bloc sources) et le brief.
 * Exporté pour être lu tel quel par les preuves.
 */
export function buildUserMessage(input: DesignNewsletterInput): string {
  const { signatory, lang, brief, targetLength, sources } = input;

  const signatureNote = signatory
    ? `Signature : n'écris AUCUN bloc signature — la signature officielle de ${signatory.name} est ajoutée automatiquement au rendu.`
    : "";

  const lengthLine = targetLength
    ? `Longueur cible : ${targetLength.label} — vise ~${targetLength.ideal} caractères de corps (espaces compris), fourchette ${targetLength.min}-${targetLength.max}. Ajuste le nombre de sections et la longueur des paragraphes en conséquence.`
    : "";

  const matiere = sources.length
    ? [
        `MATIÈRE — ${sources.length} article${sources.length > 1 ? "s" : ""} rattaché${sources.length > 1 ? "s" : ""} (nos résumés, jamais leur texte) :`,
        ...sources.map(
          (s) =>
            `[${s.id}] « ${s.title} » — ${s.publisher}${s.date ? `, ${s.date}` : ""} — ${s.url}\n   ${s.summary ? `Notre résumé : ${s.summary}` : "(pas encore de résumé : seul le titre est connu — ne le paraphrase pas, cite l'article ou laisse-le)"}`
        ),
      ].join("\n")
    : "";

  return [
    `Langue : ${lang === "fr" ? "français" : "anglais"}.`,
    signatureNote,
    lengthLine,
    matiere,
    `Brief : ${brief}`,
    "",
    `Propose une newsletter percutante et profonde, scannable au téléphone : entame par le chiffre / la donnée, 1 idée par bloc portée jusqu'à son implication pour le lecteur, UN SEUL CTA. Tout chiffre est soit vérifié par l'organisation, soit cité « valeur (éditeur, date) » depuis la matière, soit un [placeholder].${sources.length ? " Cite dans un bloc sources chaque article de la matière dont tu utilises une information, champs recopiés exactement ; ne reprends aucune formulation de la matière." : ""} Déclare les sujets traités (topics).`,
  ]
    .filter(Boolean)
    .join("\n");
}


// ---------------------------------------------------------------------------
// La veille : résumé original et recherche bornée
// ---------------------------------------------------------------------------

/** Le modèle des résumés et des recherches — Sonnet 5 (décision de l'étape 1), surchargeable comme celui du composer. */
function watchModel(): string {
  return process.env.ANTHROPIC_WATCH_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
}

function readableFetchError(code: Anthropic.WebFetchToolResultErrorCode): string {
  switch (code) {
    case "url_not_accessible":
      return "page inaccessible";
    case "url_not_allowed":
      return "domaine non autorisé";
    case "unsupported_content_type":
      return "format non pris en charge";
    case "too_many_requests":
      return "trop de requêtes";
    case "max_uses_exceeded":
      return "limite d'appels atteinte";
    case "url_too_long":
      return "adresse trop longue";
    default:
      return code;
  }
}

function buildSummarySystemPrompt(topics: string[]): string {
  const topicList = topics.length ? topics.map((t) => `« ${t} »`).join(", ") : "(aucun sujet déclaré : des thèmes libres)";
  return `Tu es le documentaliste d'un cabinet de conseil (crédit, patrimoine, assurance). On te donne le texte d'une page lue à l'instant. Ta réponse passe UNIQUEMENT par l'outil emit_summary.

RÈGLE ABSOLUE — DROIT D'AUTEUR : le résumé est écrit avec TES mots. Aucune phrase, aucune expression, aucune suite de plus de six mots ne doit être reprise du texte : reformule entièrement, change la structure des phrases, ne recopie ni le titre ni le chapeau. Un contrôle automatique refuse tout résumé qui reprend douze mots consécutifs de l'original.

LE RÉSUMÉ : deux ou trois phrases (60 à 90 mots), en français quelle que soit la langue du texte. Il dit ce que l'article apporte — le fait, la mesure, la décision, le chiffre clé, et ce que ça change pour un particulier ou un professionnel — sans le commenter ni le juger. Un chiffre n'y figure que s'il est dans le texte, tel quel, avec ce à quoi il se rapporte.

LES THÈMES : parmi les sujets de l'organisation, ceux dont l'article traite PRINCIPALEMENT (reprends le libellé EXACT) — jamais un sujet seulement effleuré ; sinon un ou deux thèmes libres de deux à quatre mots. L'ANGLE : en quelques mots, comment l'article traite son sujet (pédagogique, alerte, analyse chiffrée, annonce officielle, prise de position…).

LA LANGUE : le code ISO 639-1 du texte (« fr », « en »). LA DATE : AAAA-MM-JJ seulement si la date de publication est écrite dans le texte ; sinon null — jamais une date déduite ou plausible.

readable = false (et résumé vide) si le texte n'est pas un article lisible : page d'accueil, menu, liste de liens, message d'erreur, page vide ou réservée aux abonnés.

SUJETS DE L'ORGANISATION : ${topicList}.`;
}

function buildSummaryUserMessage(input: SummarizeArticleInput, text: string): string {
  return `Éditeur : ${input.publisher}. Titre annoncé : « ${input.title} ». Adresse : ${input.url}.

<texte>
${text}
</texte>`;
}

function buildSearchUserMessage(input: SearchArticlesInput): string {
  const language = input.lang === "en" ? "anglais" : "français";
  const domains = input.allowedDomains?.length ? ` Recherche uniquement sur : ${input.allowedDomains.join(", ")}.` : "";
  return `Fais UNE recherche web (outil web_search) sur : « ${input.query} », en ${language}, pour trouver des articles, actualités ou analyses publiés récemment (moins de soixante jours).${domains} Puis appelle emit_articles avec les résultats pertinents (${input.maxResults} au plus) : l'URL EXACTE du résultat telle qu'elle apparaît, son titre, sa date de publication (AAAA-MM-JJ) seulement si elle est explicite sinon null, sa langue (code ISO 639-1), le pays de l'éditeur (code ISO 3166-1 alpha-2) si tu le sais sinon null. Écarte les simulateurs, comparateurs, pages d'offres commerciales, pages d'accueil et pages de catégorie. Si rien n'est pertinent, appelle emit_articles avec une liste vide. N'écris aucun texte en dehors des outils.`;
}

function finishSummary(message: Anthropic.Message, toolName: string, originalText: string, model: string): ArticleSummary {
  if (message.stop_reason === "max_tokens") throw new AITruncatedError();
  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === toolName
  );
  if (!toolUse) throw new Error("le modèle n'a pas rendu de résumé");
  const output = SUMMARY_OUTPUT_SCHEMA.parse(toolUse.input);
  return {
    readable: output.readable,
    summary: output.summary.trim(),
    themes: output.themes.map((t) => t.trim()).filter(Boolean),
    angle: output.angle?.trim() || null,
    lang: output.lang?.trim().toLowerCase().slice(0, 2) || null,
    publishedAt: output.publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(output.publishedAt) ? output.publishedAt : null,
    originalText,
    model,
  };
}

function buildClassificationSystemPrompt(input: ClassifyTitlesInput): string {
  const language = input.lang === "en" ? "anglais" : "français";
  const topics = input.topics.length ? input.topics.map((t) => `« ${t} »`).join(", ") : "(aucun)";
  const known = input.knownSubjects.length ? input.knownSubjects.map((t) => `« ${t} »`).join(", ") : "(aucun pour l'instant)";
  return `Tu es le documentaliste d'un cabinet de conseil (crédit, patrimoine, assurance). On te donne les TITRES d'articles publiés par des concurrents du cabinet — rien d'autre : ni le texte, ni un résumé. Ta réponse passe UNIQUEMENT par l'outil emit_classification, avec UNE entrée par identifiant, dans l'ordre donné.

Pour chaque titre, le SUJET principal et l'ANGLE.

LE SUJET, dans cet ordre :
1) si l'article traite principalement d'un SUJET SUIVI par le cabinet, reprends son libellé EXACTEMENT (à la lettre) ;
2) sinon, si un SUJET DÉJÀ RENCONTRÉ convient, reprends-le EXACTEMENT — un même sujet doit toujours s'écrire de la même façon, c'est ce qui permet de compter ;
3) sinon, un sujet nouveau : deux à quatre mots, en ${language}, au singulier, sans article ni verbe, générique — le thème dont l'article traite (« rachat de crédit », « assurance emprunteur », « investissement locatif »), jamais le titre reformulé, jamais un détail (une ville, une banque, un pourcentage, une date).
subject = null si le titre n'annonce pas un article : page d'accueil, rubrique, page « qui sommes-nous », mention légale, offre d'emploi, formulaire.

L'ANGLE, une seule valeur : guide (pédagogie, mode d'emploi, conseils pratiques), news (actualité, annonce, nouveauté réglementaire), figures (analyse chiffrée, baromètre, taux, statistiques), alert (mise en garde, arnaque, risque, erreur à éviter), comparison (comparatif, classement, meilleur choix), opinion (prise de position, tribune, avis), promotion (offre commerciale, autopromotion, événement du cabinet), testimonial (témoignage, cas client, retour d'expérience), other (rien de tout ça, ou pas un article).

SUJETS SUIVIS PAR LE CABINET : ${topics}.
SUJETS DÉJÀ RENCONTRÉS : ${known}.`;
}

function buildClassificationUserMessage(input: ClassifyTitlesInput): string {
  const lines = input.items.map((item) => `${item.id} — « ${item.title} » (${item.publisher})`);
  return `Titres à classer (${input.items.length}) :\n${lines.join("\n")}\n\nAppelle emit_classification avec une entrée par identifiant. N'écris aucun texte en dehors de l'outil.`;
}
