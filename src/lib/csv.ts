/**
 * LE sérialiseur CSV du produit — un seul, pour que tout export ait le même
 * dialecte : séparateur « ; » (celui qu'Excel en français ouvre en colonnes
 * sans assistant, la virgule étant le séparateur décimal), fins de ligne
 * CRLF, UTF-8 avec marque d'ordre d'octets (sans elle, Excel lit les accents
 * de travers), nombres à la virgule décimale sans séparateur de milliers ni
 * unité (l'unité est dans l'en-tête de colonne), cellule vide = valeur
 * absente (masquée, inconnue, sans objet — la colonne d'à côté dit
 * pourquoi), « oui » / « non » pour les booléens. Un document = des
 * tableaux à la suite, chacun avec son titre et sa ligne d'en-tête,
 * séparés par une ligne vide — un fichier par vue, tel que l'écran.
 */
export type CsvCell = string | number | boolean | null | undefined;

export type CsvTable = {
  title: string;
  columns: string[];
  rows: CsvCell[][];
};

const SEPARATOR = ";";
const EOL = "\r\n";
const BOM = "\uFEFF";

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  // Deux décimales au plus, virgule décimale, jamais de séparateur de milliers.
  return (Math.round(value * 100) / 100).toString().replace(".", ",");
}

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "oui" : "non";
  const needsQuotes = /[";\r\n]/.test(value) || value.startsWith(" ") || value.endsWith(" ");
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvLine(cells: CsvCell[]): string {
  return cells.map(csvCell).join(SEPARATOR);
}

export function csvDocument(tables: CsvTable[]): string {
  const lines: string[] = [];
  tables.forEach((table, i) => {
    if (i > 0) lines.push("");
    lines.push(csvLine([table.title]));
    lines.push(csvLine(table.columns));
    for (const row of table.rows) lines.push(csvLine(row));
  });
  return BOM + lines.join(EOL) + EOL;
}

/** Lecture inverse, pour les vérifications : un document produit par `csvDocument` → ses tableaux. */
export function parseCsvDocument(text: string): CsvTable[] {
  const body = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  const lines = parseLines(body);
  const tables: CsvTable[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].length === 1 && lines[i][0] === "") {
      i += 1;
      continue;
    }
    const title = lines[i][0] ?? "";
    const columns = lines[i + 1] ?? [];
    const rows: CsvCell[][] = [];
    i += 2;
    while (i < lines.length && !(lines[i].length === 1 && lines[i][0] === "")) {
      rows.push(lines[i]);
      i += 1;
    }
    tables.push({ title, columns, rows });
  }
  return tables;
}

function parseLines(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === SEPARATOR) {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // fin de ligne CRLF
    } else if (ch === "\n") {
      row.push(cell);
      lines.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    lines.push(row);
  }
  return lines;
}
