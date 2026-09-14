import { describe, expect, it } from "vitest";
import { BLOCK_SCHEMAS, buildEmitNewsletterTool, DRAFT_BLOCK_SCHEMAS, parseBlockPayload } from "./blocks";

/** Les liens des blocs (audit, constat S3) : http(s) ou mailto, jamais javascript: — à tous les niveaux d'exigence. */
describe("les liens des blocs", () => {
  const cta = { type: "cta" as const, title: "Prendre rendez-vous", text: "Un créneau", buttonLabel: "Réserver" };

  it("une newsletter aboutie exige un lien rempli ET sûr", () => {
    expect(BLOCK_SCHEMAS.cta.safeParse({ ...cta, url: "https://cabinet.fr/rdv" }).success).toBe(true);
    expect(BLOCK_SCHEMAS.cta.safeParse({ ...cta, url: "mailto:contact@cabinet.fr" }).success).toBe(true);
    expect(BLOCK_SCHEMAS.cta.safeParse({ ...cta, url: "javascript:alert(document.cookie)" }).success).toBe(false);
    expect(BLOCK_SCHEMAS.cta.safeParse({ ...cta, url: "" }).success).toBe(false);
    expect(BLOCK_SCHEMAS.bouton.safeParse({ type: "bouton", label: "Ouvrir", url: "data:text/html,x" }).success).toBe(false);
  });

  it("un brouillon tolère le lien vide (bloc qu'on vient d'insérer) mais jamais un lien javascript:", () => {
    expect(DRAFT_BLOCK_SCHEMAS.cta.safeParse({ type: "cta", title: "", text: "", buttonLabel: "", url: "" }).success).toBe(true);
    expect(DRAFT_BLOCK_SCHEMAS.bouton.safeParse({ type: "bouton", label: "", url: "" }).success).toBe(true);
    expect(DRAFT_BLOCK_SCHEMAS.bouton.safeParse({ type: "bouton", label: "", url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("les sources citées portent le même contrôle, à la relecture d'une ligne enregistrée", () => {
    const item = { id: "art-1", title: "Un article", publisher: "Les Échos", date: "" };
    expect(() => parseBlockPayload("sources", { title: "Sources", items: [{ ...item, url: "https://lesechos.fr/a" }] })).not.toThrow();
    expect(() => parseBlockPayload("sources", { title: "Sources", items: [{ ...item, url: "javascript:alert(1)" }] })).toThrow();
  });

  it("le schéma d'outil transmis au modèle se génère toujours (le raffinement ne le casse pas)", () => {
    const tool = buildEmitNewsletterTool();
    const schema = tool.input_schema as { properties: { blocks: { items: { anyOf?: unknown[]; oneOf?: unknown[] } } } };
    const variants = schema.properties.blocks.items.anyOf ?? schema.properties.blocks.items.oneOf ?? [];
    expect(variants).toHaveLength(8);
  });
});
