/**
 * Règle ESLint locale : AUCUNE chaîne visible dans le code (chantier
 * marque blanche et internationalisation, étape 4). Tout texte que
 * quelqu'un peut lire à l'écran, dans un email ou dans un export doit
 * venir d'un fichier de messages (`src/messages/<langue>/…`) par
 * `t(…)` — jamais d'un littéral dans le code.
 *
 * Ce qui est signalé :
 * - le texte JSX (`<p>Aucun contact</p>`), hors `<code>`/`<pre>` ;
 * - un littéral (ou gabarit) à lettres dans une expression JSX en position
 *   de texte (`{ok ? "Oui" : "Non"}`) ;
 * - la valeur d'un attribut JSX VISIBLE (`placeholder`, `title`, `alt`,
 *   `aria-label`, `label`, `description`, `hint`, …) — tout attribut dont le
 *   nom n'est pas dans la liste des attributs techniques ;
 * - la valeur d'une propriété d'objet dont la clé est un nom de texte
 *   (`label`, `title`, `description`, `hint`, `message`, …), ou dont la
 *   valeur ressemble à une phrase (espaces entre mots, accent, ponctuation
 *   finale) — les registres, les tableaux de libellés ;
 * - le message d'un `new Error("…")`, d'un `withError(…, "…")`, d'un
 *   `NextResponse.json({ error: "…" })`.
 *
 * Ce qui ne l'est pas : identifiants, slugs, classes CSS, adresses, codes
 * (`fr-FR`, `EUR`, hexadécimaux, MIME), et tout ce qui vit hors de
 * `src/` (scripts, migrations). Une exception légitime — un nom de
 * marque, un extrait de code à copier — se déclare en clair :
 * `// eslint-disable-next-line local/no-visible-text -- raison`.
 */

const LETTER = /\p{L}/u;
const ACCENT = /[À-ÿŒœ]/;

/** Attributs JSX dont la valeur n'est jamais lue par une personne. */
const TECHNICAL_ATTRIBUTES = new Set([
  "className", "class", "id", "key", "ref", "href", "src", "srcSet", "sizes", "type", "name", "htmlFor", "for",
  "action", "formAction", "method", "encType", "target", "rel", "role", "style", "lang", "dir", "variant", "size",
  "align", "side", "sideOffset", "orientation", "mode", "position", "wrap", "as", "asChild", "render", "nativeButton",
  "autoComplete", "autoCapitalize", "autoCorrect", "inputMode", "enterKeyHint", "accept", "pattern", "min", "max",
  "step", "maxLength", "minLength", "tabIndex", "loading", "decoding", "fetchPriority", "crossOrigin", "referrerPolicy",
  "width", "height", "viewBox", "fill", "stroke", "strokeWidth", "d", "xmlns", "points", "cx", "cy", "r", "x", "y",
  "x1", "x2", "y1", "y2", "transform", "clipPath", "mask", "preserveAspectRatio", "dateTime", "form", "list",
  "aria-hidden", "aria-current", "aria-live", "aria-atomic", "aria-busy", "aria-haspopup", "aria-expanded",
  "aria-controls", "aria-describedby", "aria-labelledby", "aria-owns", "aria-invalid", "aria-sort", "aria-selected",
  "aria-pressed", "aria-checked", "aria-disabled", "aria-modal", "aria-orientation", "aria-valuemin", "aria-valuemax",
  "aria-valuenow", "aria-relevant", "aria-required", "aria-readonly", "aria-multiselectable", "aria-level",
  "data-slot", "data-state", "data-size", "data-variant", "data-icon", "data-block", "data-brand", "data-site",
  "data-simulator", "data-testid", "suppressHydrationWarning", "defaultValue", "value", "checked", "defaultChecked",
  "disabled", "required", "readOnly", "open", "hidden", "selected", "multiple", "async", "defer", "nonce", "charSet",
  "content", "httpEquiv", "property", "media", "precedence", "scope", "colSpan", "rowSpan", "span", "cellPadding",
  "cellSpacing", "border", "bgcolor", "valign", "shape", "coords", "download", "ping", "hrefLang", "manifest",
  "itemProp", "itemScope", "itemType", "slot", "part", "is", "translate", "spellCheck", "draggable",
  "contentEditable", "backTo", "items", "options", "columns", "rows", "cols", "onChange", "onClick", "onSubmit",
  "onKeyDown", "onValueChange", "onOpenChange", "onSelect", "onBlur", "onFocus", "onInput", "onPaste", "onDrop",
  "onDragOver", "onDragStart", "onDragEnd", "onMouseDown", "onMouseEnter", "onMouseLeave", "onPointerDown",
  "onLoad", "onError", "onScroll", "onWheel", "onTouchStart", "onTouchEnd", "onAnimationEnd", "onTransitionEnd",
  "formMethod", "formEncType", "formTarget", "formNoValidate", "noValidate", "autoFocus", "capture", "results",
  "dangerouslySetInnerHTML", "unoptimized", "priority", "placeholderData", "quality", "layout", "objectFit",
  "objectPosition", "blurDataURL", "fetchpriority", "scroll", "prefetch", "replace", "shallow", "locale",
]);

/** Attributs JSX dont la valeur est TOUJOURS lue par une personne : la moindre lettre y est un texte à traduire. */
const VISIBLE_ATTRIBUTES = new Set([
  "placeholder", "title", "alt", "label", "hint", "description", "emptyText", "backLabel", "summary", "subtitle", "caption",
  "heading", "legend", "tooltip", "helper", "submitLabel", "cta", "text", "message", "aria-label", "aria-description",
  "aria-valuetext", "aria-placeholder", "aria-roledescription", "labelHeader", "emptyLabel", "confirmLabel", "cancelLabel",
]);

/** Clés de propriétés d'objet qui portent du texte lu par une personne. */
const TEXT_KEYS = new Set([
  "label", "title", "description", "hint", "placeholder", "message", "text", "subtitle", "audience", "definition",
  "emptyText", "backLabel", "body", "summary", "caption", "eyebrow", "heading", "legend", "tooltip", "helper",
  "error", "warning", "info", "success", "empty", "excludes", "reads", "unit", "explanation", "question", "answer",
  "cta", "action", "name", "shortLabel", "longLabel", "pluralLabel", "singular", "plural", "sentence", "phrase",
  "alt", "ariaLabel", "aria-label", "labelPlural", "intro", "outro", "footer", "header", "greeting", "signature",
  "subject", "preheader", "detail", "reason", "help", "note", "notes",
]);
/** Clés dont la valeur est un identifiant, jamais un texte, même si elle ressemble à une phrase. */
const IDENTIFIER_KEYS = new Set([
  "id", "key", "slug", "href", "url", "src", "path", "route", "kind", "type", "code", "status", "state", "role",
  "variant", "size", "icon", "color", "hex", "className", "class", "mime", "format", "locale", "lang", "currency",
  "timezone", "timeZone", "unitCode", "source", "sourceId", "sourceUrl", "field", "column", "table", "op", "operator",
  "method", "param", "params", "query", "sort", "order", "direction", "anchor", "value", "values", "pattern",
  "regex", "email", "domain", "host", "origin", "token", "secret", "hash", "salt", "prefix", "suffix", "separator",
  "delimiter", "charset", "encoding", "model", "provider", "version", "tag", "tags", "target", "rel", "selector",
  "dataType", "userAgent", "cron", "schedule", "hue", "family", "fallback", "onDelete", "onUpdate",
]);

/** Une liste de classes CSS (« flex items-center gap-2 ») : des jetons sans accent ni ponctuation de phrase. */
function looksLikeClassList(value) {
  const tokens = value.trim().split(/\s+/);
  if (tokens.length < 2) return false;
  return tokens.every((token) => /^[!\w:\-/[\]().%&>+~*,'"=#]+$/.test(token) && !ACCENT.test(token)) && tokens.some((token) => /[-:/[]/.test(token));
}

/** Une chaîne qui ressemble à une phrase ou à un libellé, pas à un identifiant ou un code. */
function looksLikeProse(value) {
  if (!LETTER.test(value)) return false;
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].length <= 1) return false;
  if (looksLikeClassList(trimmed)) return false;
  // une clé de message (« packs. », « fetchErrors.http »), une entité HTML, l'ouverture d'une balise
  if (/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]*)+$/.test(trimmed) || /^&\w+;$/.test(trimmed) || /<[a-z]+[\s/>]/.test(trimmed)) return false;
  // un fragment de HTML ou de CSS (le gabarit des emails) : du code, pas un texte
  if (/<\/?[a-z][^>]*>|\bstyle=|^[a-z-]+:\s*[^;]+;|;\s*[a-z-]+:/.test(trimmed)) return false;
  if (/^(https?:|mailto:|tel:|data:|\/|#|\.|@|\$|%|\d)/.test(trimmed)) return false;
  if (/^[A-Z0-9_\-./:]+$/.test(trimmed)) return false; // POST, EUR, X-Content-Type-Options, ISO-8601…
  if (/^[a-z0-9_\-./:]+$/.test(trimmed) && !ACCENT.test(trimmed)) return false; // slug, mime, clé
  if (/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(trimmed)) return false; // fr, fr-FR, en-CA
  if (/^#?[0-9a-f]{3,8}$/i.test(trimmed)) return false;
  if (/^[\w-]+\/[\w.+-]+$/.test(trimmed)) return false; // image/png, Europe/Paris
  if (ACCENT.test(trimmed)) return true;
  if (/[.!?…:;]$/.test(trimmed)) return true;
  if (/\p{L}[\s'’]\p{L}/u.test(trimmed)) return true; // deux mots
  if (/^\p{Lu}\p{Ll}{3,}$/u.test(trimmed)) return true; // Contacts, Annuler, Nouveau
  return false;
}

function isInsideCodeElement(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "JSXElement") {
      const name = current.openingElement.name;
      if (name.type === "JSXIdentifier" && (name.name === "code" || name.name === "pre" || name.name === "kbd")) return true;
    }
    current = current.parent;
  }
  return false;
}

/** Les littéraux atteignables depuis une expression sans passer par un appel : branches d'une condition, d'un `??`, d'un tableau, d'un gabarit. */
function collectLiterals(node, out) {
  if (!node) return out;
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") out.push({ node, text: node.value });
      break;
    case "TemplateLiteral":
      for (const quasi of node.quasis) {
        if (LETTER.test(quasi.value.cooked ?? "")) {
          out.push({ node: quasi, text: quasi.value.cooked ?? "" });
        }
      }
      break;
    case "ConditionalExpression":
      collectLiterals(node.consequent, out);
      collectLiterals(node.alternate, out);
      break;
    case "LogicalExpression":
      collectLiterals(node.left, out);
      collectLiterals(node.right, out);
      break;
    case "ArrayExpression":
      for (const el of node.elements) collectLiterals(el, out);
      break;
    case "JSXExpressionContainer":
      collectLiterals(node.expression, out);
      break;
    case "TSAsExpression":
    case "TSNonNullExpression":
    case "TSSatisfiesExpression":
    case "ParenthesizedExpression":
      collectLiterals(node.expression, out);
      break;
    case "SequenceExpression":
      collectLiterals(node.expressions[node.expressions.length - 1], out);
      break;
    default:
      break;
  }
  return out;
}

function propertyName(prop) {
  if (!prop.key) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal") return String(prop.key.value);
  return null;
}

function calleeName(node) {
  const callee = node.callee;
  if (!callee) return null;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name;
  return null;
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Aucune chaîne visible dans le code : tout texte lu par une personne vient des fichiers de messages." },
    schema: [],
    messages: {
      jsxText: "Texte visible dans le JSX : « {{text}} » — à sortir dans les messages (t(…)).",
      attribute: "Attribut visible « {{name}} » avec un texte en dur : « {{text}} ».",
      expression: "Texte visible dans une expression JSX : « {{text}} ».",
      property: "Propriété « {{name}} » avec un texte en dur : « {{text}} ».",
      error: "Message d'erreur en dur dans {{callee}}(…) : « {{text}} » — lever une AppError à clé.",
    },
  },
  create(context) {
    const preview = (text) => text.replace(/\s+/g, " ").trim().slice(0, 60);
    const reported = new WeakSet();
    const report = (node, messageId, data) => {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId, data });
    };

    return {
      JSXText(node) {
        if (!LETTER.test(node.value)) return;
        if (isInsideCodeElement(node)) return;
        report(node, "jsxText", { text: preview(node.value) });
      },
      JSXExpressionContainer(node) {
        // En position de texte seulement : les attributs sont traités à part.
        if (node.parent?.type === "JSXAttribute") return;
        if (isInsideCodeElement(node)) return;
        for (const { node: literal, text } of collectLiterals(node.expression, [])) {
          if (LETTER.test(text)) report(literal, "expression", { text: preview(text) });
        }
      },
      JSXAttribute(node) {
        const name = node.name.type === "JSXNamespacedName" ? `${node.name.namespace.name}:${node.name.name.name}` : node.name.name;
        if (TECHNICAL_ATTRIBUTES.has(name) || name.startsWith("on") || name.startsWith("data-")) return;
        if (!node.value) return;
        const visible = VISIBLE_ATTRIBUTES.has(name);
        for (const { node: literal, text } of collectLiterals(node.value, [])) {
          if (visible ? LETTER.test(text) : looksLikeProse(text)) report(literal, "attribute", { name, text: preview(text) });
        }
      },
      Property(node) {
        if (node.computed || node.parent?.type !== "ObjectExpression") return;
        const name = propertyName(node);
        if (!name) return;
        if (IDENTIFIER_KEYS.has(name) || /^[A-Z][a-z]+(-[A-Z][a-z]+)*$/.test(name)) return; // un en-tête HTTP (Vary, Content-Type)
        const literals = collectLiterals(node.value, []);
        for (const { node: literal, text } of literals) {
          if (TEXT_KEYS.has(name) ? LETTER.test(text) && looksLikeProse(text) : looksLikeProse(text)) {
            report(literal, "property", { name, text: preview(text) });
          }
        }
      },
      NewExpression(node) {
        if (node.callee.type !== "Identifier" || !/Error$/.test(node.callee.name)) return;
        for (const { node: literal, text } of collectLiterals(node.arguments[0], [])) {
          if (looksLikeProse(text)) report(literal, "error", { callee: node.callee.name, text: preview(text) });
        }
      },
      CallExpression(node) {
        // Tout argument qui ressemble à une phrase : messages de validation
        // (zod), `withError(…)`, comparaisons sur un texte d'erreur
        // (`startsWith("Accès refusé")`)… Les journaux serveur et le SQL ne
        // sont pas des textes d'interface.
        const name = calleeName(node);
        const object = node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" ? node.callee.object.name : null;
        if (object === "console" || name === "sql" || name === "raw" || name === "cn" || name === "cva" || name === "clsx" || name === "twMerge" || name === "onDelete" || name === "onUpdate" || name === "default") return;
        for (const arg of node.arguments) {
          for (const { node: literal, text } of collectLiterals(arg, [])) {
            if (looksLikeProse(text)) report(literal, "error", { callee: name ?? "…", text: preview(text) });
          }
        }
      },
      TaggedTemplateExpression(node) {
        if (node.tag.type === "Identifier" && (node.tag.name === "sql" || node.tag.name === "raw")) return;
        for (const quasi of node.quasi.quasis) {
          if (looksLikeProse(quasi.value.cooked ?? "")) report(quasi, "expression", { text: preview(quasi.value.cooked ?? "") });
        }
      },
      ReturnStatement(node) {
        // Une fonction qui RETOURNE une phrase (« il y a 3 min », « (étiquette supprimée) ») — hors JSX.
        for (const { node: literal, text } of collectLiterals(node.argument, [])) {
          if (literal.type === "Literal" && looksLikeProse(text)) report(literal, "expression", { text: preview(text) });
        }
      },
      VariableDeclarator(node) {
        // Une constante qui est une phrase (`const GENERIC_ERROR = "Une erreur est survenue."`).
        for (const { node: literal, text } of collectLiterals(node.init, [])) {
          if (looksLikeProse(text)) report(literal, "expression", { text: preview(text) });
        }
      },
    };
  },
};

const plugin = { rules: { "no-visible-text": rule } };

export default plugin;
