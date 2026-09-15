import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";

describe("buttonVariants", () => {
  it("un bouton « outline » posé par buttonVariants() seul garde sa bordure (audit UI du 2026-09-14)", () => {
    const classes = buttonVariants({ variant: "outline" });
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-transparent");
  });
  it("les autres variantes portent la bordure transparente qui réserve la place", () => {
    for (const variant of ["default", "secondary", "ghost", "destructive", "link"] as const) {
      expect(buttonVariants({ variant }), variant).toContain("border-transparent");
    }
  });
});
