import { AnthropicProvider } from "./anthropic";
import { AINotConfiguredError, type AIProvider } from "./types";

export type { AIProvider, DesignNewsletterInput } from "./types";
export { AINotConfiguredError, AITruncatedError } from "./types";

let cached: AIProvider | null = null;

/**
 * Point d'extension : un seul fournisseur aujourd'hui (Anthropic). Si un
 * second fournisseur de texte apparaît, c'est ici qu'un routage par
 * variable d'env prendrait place — jamais un SDK vendeur importé ailleurs
 * dans l'app (dossier de reconstruction §3).
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AINotConfiguredError();
  }
  cached = new AnthropicProvider(apiKey);
  return cached;
}
