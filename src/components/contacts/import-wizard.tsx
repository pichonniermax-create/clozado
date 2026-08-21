"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  importContactsAction,
  type ImportField,
  type ImportReport,
  type ImportRowInput,
} from "@/lib/contacts/actions";

/**
 * Import CSV en trois temps, tout sur un écran : le fichier est lu et
 * analysé DANS le navigateur (correspondance des colonnes + aperçu avant
 * toute écriture), puis les lignes déjà mises en forme partent à l'action
 * serveur qui valide ligne par ligne et rend le rapport. Import partiel
 * assumé : les lignes valides entrent, les autres sont listées avec leur
 * raison.
 */

const TARGETS: { value: ImportField | ""; label: string }[] = [
  { value: "", label: "— Ignorer cette colonne —" },
  { value: "name", label: "Nom complet" },
  { value: "firstName", label: "Prénom" },
  { value: "lastName", label: "Nom" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Téléphone" },
  { value: "companyName", label: "Société" },
  { value: "jobTitle", label: "Fonction" },
  { value: "city", label: "Ville" },
  { value: "postalCode", label: "Code postal" },
  { value: "country", label: "Pays" },
  { value: "notes", label: "Notes" },
];

/** Détection du séparateur sur la première ligne : ; , ou tabulation. */
function detectSeparator(firstLine: string): string {
  const counts: [string, number][] = [";", ",", "\t"].map((s) => [s, firstLine.split(s).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

type ParsedCsv = { headers: string[]; rows: { line: number; cells: string[] }[] };

/** Analyse CSV complète (guillemets, "" échappé, retours à la ligne dans les champs), avec le numéro de ligne réel de chaque enregistrement. */
function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, "");
  const sep = detectSeparator(clean.split(/\r?\n/, 1)[0] ?? "");
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const pushCell = () => {
    cells.push(cell);
    cell = "";
  };
  const pushRecord = () => {
    pushCell();
    if (cells.some((c) => c.trim() !== "")) records.push({ line: recordLine, cells });
    cells = [];
    recordLine = line;
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      pushCell();
    } else if (ch === "\n") {
      line++;
      pushRecord();
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell !== "" || cells.length > 0) pushRecord();

  const [head, ...rest] = records;
  return { headers: head?.cells ?? [], rows: rest };
}

/** Devine la cible d'une colonne à partir de son en-tête (accents et casse ignorés). */
function guessTarget(header: string, allHeaders: string[]): ImportField | "" {
  const n = header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const hasPrenom = allHeaders.some((h) => /pr[ée]nom|first/i.test(h));
  if (/^(nom complet|name|full ?name)$/.test(n)) return "name";
  if (/^(nom|last ?name)$/.test(n)) return hasPrenom ? "lastName" : "name";
  if (/prenom|first ?name/.test(n)) return "firstName";
  if (/e-?mail|courriel/.test(n)) return "email";
  if (/tel|phone|mobile|portable/.test(n)) return "phone";
  if (/societe|company|entreprise|cabinet/.test(n)) return "companyName";
  if (/fonction|poste|titre|job/.test(n)) return "jobTitle";
  if (/ville|city/.test(n)) return "city";
  if (/code ?postal|^cp$|zip/.test(n)) return "postalCode";
  if (/pays|country/.test(n)) return "country";
  if (/note|commentaire/.test(n)) return "notes";
  return "";
}

async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  // Un CSV exporté en latin-1 lu comme UTF-8 se repère à ses caractères de
  // remplacement — on retombe alors sur iso-8859-1 plutôt que d'importer
  // des noms défigurés.
  return utf8.includes("�") ? new TextDecoder("iso-8859-1").decode(buffer) : utf8;
}

export function ImportWizard() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<(ImportField | "")[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [sending, setSending] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReport(null);
    setReadError(null);
    try {
      const text = await readFileText(file);
      const p = parseCsv(text);
      if (p.headers.length === 0 || p.rows.length === 0) {
        setReadError("Ce fichier ne contient pas de lignes exploitables (en-tête + au moins une ligne).");
        setParsed(null);
        setFileName(null);
        return;
      }
      setFileName(file.name);
      setParsed(p);
      setMapping(p.headers.map((h) => guessTarget(h, p.headers)));
    } catch {
      setReadError("Impossible de lire ce fichier.");
    }
  }

  const hasName = mapping.includes("name") || mapping.includes("lastName");

  function buildRows(): ImportRowInput[] {
    if (!parsed) return [];
    return parsed.rows.map((r) => {
      const values: ImportRowInput["values"] = {};
      mapping.forEach((target, i) => {
        if (!target) return;
        const cell = (r.cells[i] ?? "").trim();
        if (cell) values[target] = cell;
      });
      if (!values.name) {
        const composed = [values.firstName, values.lastName].filter(Boolean).join(" ");
        if (composed) values.name = composed;
      }
      return { line: r.line, values };
    });
  }

  async function submit() {
    setSending(true);
    try {
      setReport(await importContactsAction(buildRows()));
    } catch {
      setReport({ inserted: 0, skipped: [], error: "L'import a échoué en route. Réessaie." });
    } finally {
      setSending(false);
    }
  }

  const preview = parsed?.rows.slice(0, 5) ?? [];

  if (report) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">
            {report.inserted} fiche{report.inserted > 1 ? "s" : ""} créée{report.inserted > 1 ? "s" : ""}
            {report.skipped.length > 0 &&
              ` · ${report.skipped.length} ligne${report.skipped.length > 1 ? "s" : ""} écartée${report.skipped.length > 1 ? "s" : ""}`}
          </p>
          {report.error && <p className="mt-2 text-sm text-destructive">{report.error}</p>}
        </div>

        {report.skipped.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Ligne</th>
                  <th className="px-4 py-2 font-medium">Raison</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.skipped.map((s) => (
                  <tr key={`${s.line}-${s.reason}`}>
                    <td className="px-4 py-2 tabular-nums">{s.line}</td>
                    <td className="px-4 py-2">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-2">
          <Link href="/contacts" className={buttonVariants()}>
            Voir les contacts
          </Link>
          <Button
            variant="outline"
            onClick={() => {
              setReport(null);
              setParsed(null);
              setFileName(null);
            }}
          >
            Importer un autre fichier
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="csv" className="text-sm font-medium">
          Fichier CSV
        </label>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="w-fit text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <p className="text-xs text-muted-foreground">
          Première ligne = en-têtes. Séparateur point-virgule, virgule ou tabulation — détecté tout seul.
          Toutes les fiches importées sont des personnes.
        </p>
        {readError && <p className="text-sm text-destructive">{readError}</p>}
      </div>

      {parsed && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              Correspondance des colonnes — {fileName} · {parsed.rows.length} ligne
              {parsed.rows.length > 1 ? "s" : ""}
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Colonne du fichier</th>
                    <th className="px-4 py-2 font-medium">Devient</th>
                    <th className="px-4 py-2 font-medium">Exemple (1re ligne)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.headers.map((h, i) => (
                    <tr key={`${h}-${i}`}>
                      <td className="px-4 py-2 font-medium">{h || <span className="text-muted-foreground">(sans titre)</span>}</td>
                      <td className="px-4 py-2">
                        <select
                          value={mapping[i] ?? ""}
                          onChange={(e) =>
                            setMapping((m) => m.map((x, j) => (j === i ? (e.target.value as ImportField | "") : x)))
                          }
                          className="rounded-lg border border-input bg-transparent px-2 py-1 text-sm"
                        >
                          {TARGETS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="max-w-48 truncate px-4 py-2 text-muted-foreground">
                        {parsed.rows[0]?.cells[i] ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!hasName && (
              <p className="text-sm text-warning">
                Associe au moins une colonne à « Nom complet » ou « Nom » pour pouvoir importer.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Aperçu — rien n&apos;est encore importé</h2>
            {preview.length === 0 ? (
              <EmptyState>Aucune ligne à montrer.</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      {TARGETS.filter((t) => t.value && mapping.includes(t.value)).map((t) => (
                        <th key={t.value} className="px-4 py-2 font-medium">
                          {t.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {buildRows()
                      .slice(0, 5)
                      .map((r) => (
                        <tr key={r.line}>
                          {TARGETS.filter((t) => t.value && mapping.includes(t.value)).map((t) => (
                            <td key={t.value} className="max-w-48 truncate px-4 py-2">
                              {r.values[t.value as ImportField] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            <div>
              <Button onClick={submit} disabled={!hasName || sending}>
                {sending
                  ? "Import en cours…"
                  : `Importer ${parsed.rows.length} ligne${parsed.rows.length > 1 ? "s" : ""}`}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
