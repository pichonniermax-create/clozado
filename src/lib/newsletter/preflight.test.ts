import { describe, expect, it } from "vitest";
import type { AnyBlock } from "./blocks";
import { blockingRows, countByState, linksOf, preflightRows, variablesLeft, type PreflightFacts } from "./preflight";

/**
 * Le contrôle avant envoi (chantier envoi, partie 3). Il décide d'un refus :
 * il est testé comme tel — chaque ligne, dans ses trois états, et le fait
 * qu'aucun envoi bloqué ne passe.
 */

const MARKER = "%%CLOZADO_UNSUBSCRIBE%%";

const blocks: AnyBlock[] = [
  { type: "titre", text: "Les taux de janvier", level: 1, eyebrow: "Marché" },
  { type: "texte", text: "Le point du mois, en trois minutes." },
  { type: "bouton", label: "Prendre rendez-vous", url: "https://cabinet.example-real.fr/rdv" },
];

/** Un envoi que rien n'empêche : chaque test part de là et casse UNE chose. */
function sane(overrides: Partial<PreflightFacts> = {}): PreflightFacts {
  return {
    subject: "Taux de janvier",
    preheader: "Ce qui change pour un emprunt sur vingt ans",
    blocks,
    finished: true,
    html: `<html><body>…<a href="${MARKER}">Se désinscrire</a></body></html>`,
    unsubscribeMarker: MARKER,
    postalMissing: false,
    replyTo: "claire@cabinet.fr",
    fallbackDomain: null,
    from: "Cabinet <claire@cabinet.fr>",
    paused: false,
    audience: { total: 120, sendable: 120, withoutEmail: 0, suppressed: 0, consentMissing: 0, objected: 0, platformSuppressed: 0 },
    remainingToday: 200,
    lastTestAt: new Date("2026-09-21T10:00:00Z"),
    updatedAt: new Date("2026-09-21T09:00:00Z"),
    ...overrides,
  };
}

function rowFor(code: string, facts: PreflightFacts) {
  return preflightRows(facts).find((r) => r.code === code)!;
}

describe("le contrôle avant envoi", () => {
  it("rend toujours les onze lignes, dans le même ordre", () => {
    const codes = preflightRows(sane()).map((r) => r.code);
    expect(codes).toEqual(["objet", "preheader", "contenu", "variables", "liens", "desinscription", "pied_de_page", "expediteur", "destinataires", "rythme", "test"]);
  });

  it("ne bloque rien quand tout est en ordre", () => {
    const rows = preflightRows(sane());
    expect(blockingRows(rows)).toEqual([]);
    expect(countByState(rows)).toEqual({ ok: 11, warning: 0, blocking: 0 });
  });

  it("bloque un objet vide et avertit d'un objet trop long", () => {
    expect(rowFor("objet", sane({ subject: "   " }))).toMatchObject({ state: "blocking", detail: "objet_vide" });
    expect(rowFor("objet", sane({ subject: "x".repeat(60) }))).toMatchObject({ state: "warning", detail: "objet_trop_long", params: { count: 60 } });
  });

  it("avertit d'un pré-en-tête absent ou trop long, sans jamais bloquer", () => {
    expect(rowFor("preheader", sane({ preheader: "" }))).toMatchObject({ state: "warning", detail: "preheader_vide" });
    expect(rowFor("preheader", sane({ preheader: "x".repeat(120) }))).toMatchObject({ state: "warning", detail: "preheader_trop_long" });
  });

  it("bloque un document inachevé", () => {
    expect(rowFor("contenu", sane({ finished: false }))).toMatchObject({ state: "blocking", detail: "contenu_inacheve" });
  });

  it("bloque une variable de gabarit laissée dans le texte — rien ne la remplacera", () => {
    const withVariable = sane({ blocks: [...blocks, { type: "texte", text: "Bonjour {prenom}, voici {lien_rdv}." }] });
    expect(variablesLeft(withVariable)).toEqual(["{prenom}", "{lien_rdv}"]);
    expect(rowFor("variables", withVariable)).toMatchObject({ state: "blocking", detail: "variables_non_remplacees", params: { count: 2 } });
  });

  it("voit une variable dans l'objet comme dans un bloc", () => {
    expect(rowFor("variables", sane({ subject: "Bonjour {prenom}" }))).toMatchObject({ state: "blocking" });
    expect(rowFor("variables", sane({ preheader: "Pour {societe}" }))).toMatchObject({ state: "blocking" });
  });

  it("ne prend pas une accolade de texte courant pour une variable", () => {
    expect(variablesLeft(sane({ blocks: [{ type: "texte", text: "Le taux { } et le style {}" }] }))).toEqual([]);
  });

  it("bloque un lien d'exemple oublié, avertit d'un lien non sécurisé", () => {
    const placeholder = sane({ blocks: [{ type: "bouton", label: "Voir", url: "https://example.com/rdv" }] });
    expect(rowFor("liens", placeholder)).toMatchObject({ state: "blocking", detail: "liens_exemple" });
    const insecure = sane({ blocks: [{ type: "bouton", label: "Voir", url: "http://cabinet.fr/rdv" }] });
    expect(rowFor("liens", insecure)).toMatchObject({ state: "warning", detail: "liens_non_securises" });
    expect(rowFor("liens", sane({ blocks: [{ type: "texte", text: "Sans lien." }] }))).toMatchObject({ state: "warning", detail: "liens_aucun" });
  });

  it("compte les liens des sources citées comme les autres", () => {
    const sources: AnyBlock[] = [{ type: "sources", title: "Sources", items: [{ id: "a", title: "T", url: "https://banque-france.fr/a", publisher: "BdF", date: "" }] }];
    expect(linksOf(sources)).toEqual(["https://banque-france.fr/a"]);
  });

  it("bloque un rendu sans marqueur de désinscription", () => {
    expect(rowFor("desinscription", sane({ html: "<html><body>rien</body></html>" }))).toMatchObject({ state: "blocking", detail: "desinscription_absente" });
  });

  it("bloque une adresse postale manquante et une adresse de réponse absente", () => {
    expect(rowFor("pied_de_page", sane({ postalMissing: true }))).toMatchObject({ state: "blocking" });
    expect(rowFor("expediteur", sane({ replyTo: null }))).toMatchObject({ state: "blocking", detail: "expediteur_sans_reponse" });
  });

  it("avertit quand l'envoi part du domaine mutualisé", () => {
    expect(rowFor("expediteur", sane({ fallbackDomain: "mail.clozado.fr" }))).toMatchObject({ state: "warning", detail: "expediteur_domaine_partage", params: { domain: "mail.clozado.fr" } });
  });

  it("bloque une audience vide et dit combien sont exclus", () => {
    const empty = sane({ audience: { total: 12, sendable: 0, withoutEmail: 4, suppressed: 0, consentMissing: 8, objected: 0, platformSuppressed: 0 } });
    expect(rowFor("destinataires", empty)).toMatchObject({ state: "blocking", detail: "destinataires_aucun" });
    const partial = sane({ audience: { total: 120, sendable: 100, withoutEmail: 5, suppressed: 3, consentMissing: 10, objected: 1, platformSuppressed: 1 } });
    expect(rowFor("destinataires", partial)).toMatchObject({ state: "warning", detail: "destinataires_exclus", params: { sendable: 100, excluded: 20, total: 120 } });
  });

  it("bloque une organisation suspendue, avertit d'une vague étalée par le quota", () => {
    expect(rowFor("rythme", sane({ paused: true }))).toMatchObject({ state: "blocking", detail: "rythme_en_pause" });
    expect(rowFor("rythme", sane({ remainingToday: 50 }))).toMatchObject({ state: "warning", detail: "rythme_etale", params: { remaining: 50, recipients: 120 } });
  });

  it("avertit quand le dernier test est antérieur à la dernière modification", () => {
    expect(rowFor("test", sane({ lastTestAt: null }))).toMatchObject({ state: "warning", detail: "test_aucun" });
    expect(rowFor("test", sane({ lastTestAt: new Date("2026-09-21T08:00:00Z") }))).toMatchObject({ state: "warning", detail: "test_perime" });
    expect(rowFor("test", sane())).toMatchObject({ state: "ok", detail: "test_ok" });
  });

  it("cumule les blocages sans en perdre aucun", () => {
    const rows = preflightRows(sane({ subject: "", finished: false, postalMissing: true, paused: true }));
    expect(blockingRows(rows).map((r) => r.code)).toEqual(["objet", "contenu", "pied_de_page", "rythme"]);
  });
});
