import { describe, expect, it } from "vitest";
import { parseTheme, SYSTEM_THEME_SCRIPT } from "./theme";

describe("le thème", () => {
  it("lit les trois valeurs et retombe sur « système » pour tout le reste", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBe("system");
    for (const bad of ["", "DARK", "sombre", undefined, null, "<script>"]) expect(parseTheme(bad)).toBe("system");
  });

  it("le script « système » ne fait qu'ajouter la classe dark, et n'échappe jamais de son bloc", () => {
    expect(SYSTEM_THEME_SCRIPT).toContain('classList.add("dark")');
    expect(SYSTEM_THEME_SCRIPT).not.toContain("</script");
    expect(SYSTEM_THEME_SCRIPT.startsWith("(function(){")).toBe(true);
  });
});
