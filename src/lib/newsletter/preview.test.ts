import { describe, expect, it } from "vitest";
import { UNSUBSCRIBE_PLACEHOLDER, withUnsubscribeUrl } from "@/lib/email/headers";
import { darkPreview, previewWidth, toPreviewScreen } from "./preview";

describe("l'aperçu avant envoi", () => {
  it("ne retient que les quatre écrans connus", () => {
    expect(toPreviewScreen("mobile")).toBe("mobile");
    expect(toPreviewScreen("sombre")).toBe("sombre");
    expect(toPreviewScreen("texte")).toBe("texte");
    expect(toPreviewScreen("javascript:alert(1)")).toBe("ordinateur");
    expect(toPreviewScreen(undefined)).toBe("ordinateur");
  });

  it("donne au téléphone la largeur de référence du produit", () => {
    expect(previewWidth("mobile")).toBe(390);
    expect(previewWidth("ordinateur")).toBe(720);
    expect(previewWidth("sombre")).toBe(720);
  });

  it("superpose l'inversion sans réécrire l'email", () => {
    const html = "<!doctype html><html><head><title>T</title></head><body><p>Bonjour</p></body></html>";
    const dark = darkPreview(html);
    expect(dark).toContain("<p>Bonjour</p>");
    expect(dark).toContain("invert(1) hue-rotate(180deg)");
    // Le corps de l'email est intact : seul un <style> s'est ajouté avant </head>.
    expect(dark.replace(/<style data-apercu="sombre">[\s\S]*?<\/style>\n/, "")).toBe(html);
  });

  it("pose la règle même sans <head> (un rendu partiel)", () => {
    expect(darkPreview("<body>x</body>")).toContain("data-apercu=\"sombre\"");
  });

  it("substitue le marqueur de désinscription comme le fait la remise", () => {
    const html = `<a href="${UNSUBSCRIBE_PLACEHOLDER}">Se désinscrire</a>`;
    expect(withUnsubscribeUrl(html, "https://app.clozado.fr/desinscription/exemple")).toBe('<a href="https://app.clozado.fr/desinscription/exemple">Se désinscrire</a>');
    // Ce qui reste du HTML n'est pas touché : l'aperçu montre l'email, pas une variante.
    expect(withUnsubscribeUrl("<p>rien à remplacer</p>", "x")).toBe("<p>rien à remplacer</p>");
  });
});
