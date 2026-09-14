import { describe, expect, it } from "vitest";
import { escapeHtml, renderDocumentShell, renderNewsletterHtml, type RenderBrand } from "./render-email";

/**
 * Le rendu des emails face à une marque hostile (audit, constat S2) : les
 * valeurs de marque viennent d'un formulaire d'admin d'organisation et le
 * HTML est posé par `innerHTML` chez toute personne qui ouvre l'éditeur.
 */
const neutral: RenderBrand = {
  name: "Cabinet Dupont",
  logoUrl: null,
  logoLockupText: null,
  primaryColor: null,
  secondaryColor: null,
  inkColor: null,
  backgroundColor: null,
  headingFontFamily: null,
  headingFontFallback: null,
  fontFamily: null,
  bodyFontFallback: null,
  borderRadius: null,
};

const render = (brand: Partial<RenderBrand>) =>
  renderNewsletterHtml({
    brand: { ...neutral, ...brand },
    subject: "Objet",
    preheader: "Aperçu",
    blocks: [
      { type: "titre", text: "Titre", level: 1, eyebrow: "Kicker" },
      { type: "texte", text: "Un paragraphe." },
      { type: "bouton", label: "Ouvrir", url: "https://exemple.fr" },
    ],
    signatory: { name: "Marie Dupont", jobTitle: "Conseillère" },
    editable: true,
  });

describe("escapeHtml", () => {
  it("neutralise les cinq caractères qui ouvrent une balise ou ferment un attribut", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;");
  });
});

describe("resolveBrand — la marque interpolée dans le HTML", () => {
  it("une police qui ferme l'attribut style reste du texte : aucune balise n'apparaît", () => {
    const html = render({ fontFamily: `Arial;"><img src=x onerror="alert(1)">`, headingFontFamily: `Georgia'><script>alert(2)</script>` });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("Arial;&quot;&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;, Arial, Helvetica, sans-serif");
    expect(html).toContain("Georgia&#39;&gt;&lt;script&gt;");
  });
  it("les replis de police venus de la base sont échappés eux aussi", () => {
    const html = render({ bodyFontFallback: `sans-serif"><b>`, headingFontFallback: `serif"><i>` });
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
  });
  it("une couleur qui n'est pas un hexadécimal tombe sur le repli neutre, une couleur hexadécimale est normalisée", () => {
    const hostile = render({ primaryColor: `red;"><img src=x onerror="alert(1)">`, inkColor: "url(javascript:alert(1))", backgroundColor: "expression(alert(1))", secondaryColor: "not-a-color" });
    expect(hostile).not.toContain("<img");
    expect(hostile).not.toContain("javascript:");
    expect(hostile).not.toContain("expression(");
    expect(hostile).toContain("color:#1a1a1a;");
    expect(hostile).toContain("background:#f4f4f2;");
    const normalized = render({ primaryColor: "2563EB", inkColor: "#ABC" });
    expect(normalized).toContain("background:#2563eb;");
    expect(normalized).toContain("color:#aabbcc;");
  });
  it("le rayon est borné à un entier raisonnable", () => {
    expect(renderDocumentShell({ ...neutral, borderRadius: 999 }, null).headerHtml).toBeTruthy();
    const html = render({ borderRadius: 999 });
    expect(html).toContain("border-radius:48px;");
    expect(render({ borderRadius: Number.NaN })).toContain("border-radius:6px;");
  });
  it("le nom, le texte du logo et le logo restent échappés, comme avant", () => {
    const html = render({ name: `Cabinet <b>Dupont</b>`, logoUrl: `https://x.fr/logo.png" onload="alert(1)` });
    expect(html).toContain("Cabinet &lt;b&gt;Dupont&lt;/b&gt;");
    expect(html).toContain("logo.png&quot; onload=&quot;alert(1)");
    expect(html).not.toContain(`" onload="`);
  });
});
