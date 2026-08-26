/**
 * Un composant client (« use client ») ne peut lire que les espaces de
 * messages que la coquille envoie au navigateur (`CLIENT_NAMESPACES` dans
 * `src/i18n/messages.ts`) : un espace absent ne casse ni la compilation ni
 * le rendu serveur — il casse dans le navigateur, en MISSING_MESSAGE. La
 * liste est lue dans le fichier lui-même : une seule source de vérité.
 */
import { readFileSync } from "node:fs";

const SOURCE = new URL("../src/i18n/messages.ts", import.meta.url);

function clientNamespaces() {
  const text = readFileSync(SOURCE, "utf8");
  const match = /CLIENT_NAMESPACES = \[([^\]]*)\]/.exec(text);
  if (!match) throw new Error(`CLIENT_NAMESPACES introuvable dans ${SOURCE.pathname}`);
  return new Set([...match[1].matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]));
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "un composant client ne lit que les espaces de messages envoyés au navigateur" },
    schema: [],
    messages: {
      missing:
        "L’espace de messages « {{ns}} » n’est pas envoyé au navigateur : l’ajouter à CLIENT_NAMESPACES (src/i18n/messages.ts) ou déplacer ces messages dans un espace client (shell, ui…).",
    },
  },
  create(context) {
    const first = context.sourceCode.ast.body[0];
    const isClient = first?.type === "ExpressionStatement" && first.directive === "use client";
    if (!isClient) return {};
    const allowed = clientNamespaces();
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "useTranslations") return;
        const arg = node.arguments[0];
        if (!arg || arg.type !== "Literal" || typeof arg.value !== "string") return;
        const ns = arg.value.split(".")[0];
        if (!allowed.has(ns)) context.report({ node: arg, messageId: "missing", data: { ns } });
      },
    };
  },
};

export default rule;
