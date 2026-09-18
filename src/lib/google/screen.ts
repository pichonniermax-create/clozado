/**
 * LES DEUX ÉCRANS DU RACCORDEMENT (chantier réservation, étape 1).
 *
 * Une page autonome, sans une ligne de JavaScript, sans ressource externe,
 * qui affiche le jeton de rafraîchissement UNE SEULE FOIS pour qu'il soit
 * recopié à la main dans les variables d'environnement.
 *
 * Pourquoi si austère :
 * - **aucun script** — la politique de sécurité de la page interdit tout
 *   script, et un bouton « copier » ferait passer le secret par le
 *   presse-papiers ;
 * - **le jeton dans un `<textarea readonly>` hors de tout `<form>`** — un
 *   gestionnaire de mots de passe ne propose pas d'enregistrer ce qui n'est
 *   pas un formulaire, et rien ne peut le soumettre ailleurs ;
 * - **jamais dans l'URL** — ni paramètre, ni fragment : l'adresse d'une
 *   page se retrouve dans l'historique, dans le `Referer`, dans les
 *   journaux d'un proxy ;
 * - **`no-store` et `noindex`** — la page ne doit rester nulle part.
 *
 * L'avertissement est AU-DESSUS de la valeur : fermer l'onglet sans copier,
 * c'est perdre le jeton (il reste pourtant valide chez Google — d'où la
 * procédure de révocation, `docs/rendez-vous-google.md`).
 */

/** Les en-têtes de toute réponse de ce raccordement — rien ne se garde, rien ne s'indexe, rien ne fuit par le référent. */
export const SCREEN_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate, private, max-age=0",
  pragma: "no-cache",
  // eslint-disable-next-line local/no-visible-text -- « Cookie » est un nom d'en-tête HTTP, pas une phrase
  vary: "Cookie",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `:root{color-scheme:light}body{margin:0;background:#fafaf8;color:#1a1a19;font:16px/1.55 ui-sans-serif,system-ui,sans-serif}
main{max-width:46rem;margin:0 auto;padding:3rem 1rem}h1{font-size:1.35rem;margin:0 0 .5rem}p{margin:0 0 1rem}
.card{background:#fff;border:1px solid #e6e4df;border-radius:16px;padding:1.25rem}
.warn{border-left:3px solid #89202b;padding-left:.75rem}
textarea{width:100%;min-height:7rem;margin:0;padding:.75rem;border:1px solid #e6e4df;border-radius:12px;background:#fafaf8;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
code{font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f2f0ec;border-radius:6px;padding:.1rem .35rem}
.muted{color:#6b6963;font-size:.9rem}`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

/** L'écran porteur du jeton — une fois, et une seule. */
export function tokenScreen(input: {
  title: string;
  warning: string;
  variableIntro: string;
  variableName: string;
  scopesLabel: string;
  scopes: string;
  refreshToken: string;
}): string {
  const body = `<h1>${escapeHtml(input.title)}</h1>
<div class="card"><p class="warn">${escapeHtml(input.warning)}</p>
<textarea readonly autofocus spellcheck="false" autocomplete="off" aria-label="${escapeHtml(input.variableName)}">${escapeHtml(input.refreshToken)}</textarea>
<p>${escapeHtml(input.variableIntro)} <code>${escapeHtml(input.variableName)}</code></p>
<p class="muted">${escapeHtml(input.scopesLabel)} ${escapeHtml(input.scopes)}</p></div>`;
  return page(input.title, body);
}

/** L'écran de refus : ce qui s'est passé, et rien d'autre — jamais la réponse du fournisseur. */
export function failureScreen(input: { title: string; message: string; detail?: string }): string {
  const body = `<h1>${escapeHtml(input.title)}</h1><div class="card"><p>${escapeHtml(input.message)}</p>${
    input.detail ? `<p class="muted"><code>${escapeHtml(input.detail)}</code></p>` : ""
  }</div>`;
  return page(input.title, body);
}

export function htmlResponse(html: string, status: number): Response {
  return new Response(html, { status, headers: SCREEN_HEADERS });
}
