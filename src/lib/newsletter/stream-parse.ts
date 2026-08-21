/**
 * Lecture d'un JSON d'outil ENCORE INCOMPLET, tel qu'il arrive par
 * `input_json_delta` pendant la génération.
 *
 * Pourquoi pas `JSON.parse` : le texte reçu est tronqué à un endroit
 * arbitraire (`…{"type":"tex`), donc invalide, jusqu'à la toute fin. Pour
 * afficher les blocs au fur et à mesure il faut extraire ceux qui sont
 * COMPLETS sans attendre le reste.
 *
 * Pourquoi pas une expression régulière : les objets sont imbriqués (les
 * fiches contiennent un tableau d'objets) et les textes peuvent contenir des
 * accolades, des crochets ou des guillemets échappés. Seul un balayage qui
 * suit l'état « dans une chaîne / échappé » donne le bon résultat.
 *
 * Ce module ne fait AUCUNE confiance au contenu : il rend des valeurs
 * `unknown`, que l'appelant valide contre le schéma de blocs. La sortie
 * complète reste, elle, validée et passée à la revue déterministe — les
 * blocs affichés pendant le flux sont provisoires.
 */

export type StreamedNewsletter = {
  subject: string | null;
  preheader: string | null;
  /** Uniquement les éléments de `blocks` entièrement reçus. */
  blocks: unknown[];
};

/**
 * Lit une chaîne JSON à partir du guillemet ouvrant `start`.
 * Renvoie `null` si elle n'est pas encore terminée.
 */
function readString(raw: string, start: number): { value: string; end: number } | null {
  if (raw[start] !== '"') return null;
  let escaped = false;
  for (let i = start + 1; i < raw.length; i++) {
    const c = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') {
      try {
        return { value: JSON.parse(raw.slice(start, i + 1)) as string, end: i };
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Valeur d'une clé de haut niveau, si elle est complètement reçue. */
function readTopLevelString(raw: string, key: string): string | null {
  const marker = `"${key}"`;
  const at = raw.indexOf(marker);
  if (at === -1) return null;
  let i = at + marker.length;
  while (i < raw.length && (raw[i] === " " || raw[i] === ":")) i++;
  const read = readString(raw, i);
  return read ? read.value : null;
}

/**
 * Les éléments complets du tableau `blocks`. Balaye en suivant la
 * profondeur d'accolades, en ignorant tout ce qui se trouve dans une chaîne.
 */
function readCompleteBlocks(raw: string): unknown[] {
  const marker = '"blocks"';
  const at = raw.indexOf(marker);
  if (at === -1) return [];
  const open = raw.indexOf("[", at + marker.length);
  if (open === -1) return [];

  const out: unknown[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = open + 1; i < raw.length; i++) {
    const c = raw[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      if (depth === 0) objectStart = i;
      depth++;
      continue;
    }
    if (c === "}") {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        try {
          out.push(JSON.parse(raw.slice(objectStart, i + 1)));
        } catch {
          // Objet syntaxiquement clos mais illisible : on l'ignore plutôt
          // que d'interrompre le flux. La sortie complète sera validée.
        }
        objectStart = -1;
      }
      continue;
    }
    // Fin du tableau au niveau racine.
    if (c === "]" && depth === 0) break;
  }

  return out;
}

export function parsePartialNewsletter(raw: string): StreamedNewsletter {
  return {
    subject: readTopLevelString(raw, "subject"),
    preheader: readTopLevelString(raw, "preheader"),
    blocks: readCompleteBlocks(raw),
  };
}
