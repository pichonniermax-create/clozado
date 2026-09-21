/**
 * L'APERÇU AVANT ENVOI (chantier envoi, partie 3) — la géométrie et la
 * simulation, à part du reste pour se tester sans base ni navigateur.
 *
 * Ce que l'aperçu montre est le HTML qui PART : il vient de
 * `buildSendDraft` (le rendu de l'envoi) et sa seule retouche est la
 * substitution du marqueur de désinscription, faite par la fonction qui
 * remet les messages (`withUnsubscribeUrl`). Les vues « ordinateur » et
 * « mobile » ne changent RIEN au document : seule la largeur du cadre
 * change, comme dans une messagerie.
 *
 * La vue « sombre » est la seule qui transforme quelque chose, et elle le
 * dit à l'écran : l'email n'a pas de version sombre à lui, donc ce qui est
 * simulé est l'INVERSION que les clients appliquent d'eux-mêmes
 * (Outlook.com, Apple Mail en mode sombre). Gmail, lui, n'inverse que
 * partiellement et selon des règles qu'il ne publie pas : aucun aperçu ne
 * peut le reproduire — d'où l'avertissement, plutôt qu'une promesse.
 */

export const PREVIEW_SCREENS = ["ordinateur", "mobile", "sombre", "texte"] as const;
export type PreviewScreen = (typeof PREVIEW_SCREENS)[number];

export function toPreviewScreen(raw: string | undefined): PreviewScreen {
  return (PREVIEW_SCREENS as readonly string[]).includes(raw ?? "") ? (raw as PreviewScreen) : "ordinateur";
}

/**
 * La largeur du cadre, en pixels : une fenêtre de messagerie de bureau
 * (l'email fait 600 px, le cadre laisse respirer) et un téléphone étroit
 * (390 px — l'iPhone le plus courant, la largeur de référence du produit).
 */
export function previewWidth(screen: PreviewScreen): number {
  return screen === "mobile" ? 390 : 720;
}

/**
 * L'inversion des couleurs, telle que l'appliquent les clients sans
 * version sombre : tout est inversé, la teinte est rétablie d'un
 * demi-tour (sinon le bleu vire à l'orange), et les images sont
 * ré-inversées pour ne pas apparaître en négatif. La règle est ajoutée au
 * BOUT du document, dans un `<style>` à part : l'email n'est pas réécrit,
 * on lui superpose ce que fait la messagerie.
 */
export function darkPreview(html: string): string {
  const style = `<style data-apercu="sombre">
  html { filter: invert(1) hue-rotate(180deg); background: #ffffff; }
  img, [data-apercu-garde-couleur] { filter: invert(1) hue-rotate(180deg); }
</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${style}\n</head>`) : `${style}\n${html}`;
}
