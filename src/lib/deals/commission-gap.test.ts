import { describe, expect, it } from "vitest";
import { commissionOnOldAmount } from "./commission-gap";

describe("la commission convenue sur un ancien montant", () => {
  it("se signale quand le montant de l'affaire a changé depuis", () => {
    expect(commissionOnOldAmount({ basis: "percentage", baseAmount: "300000.00" }, "350000")).toBe(true);
  });

  it("se tait quand les deux montants sont les mêmes, écrits autrement", () => {
    expect(commissionOnOldAmount({ basis: "percentage", baseAmount: "300000.00" }, "300000")).toBe(false);
  });

  it("se tait pour une commission fixe : elle ne dépend pas du montant", () => {
    expect(commissionOnOldAmount({ basis: "fixed", baseAmount: "300000" }, "350000")).toBe(false);
  });

  it("se tait quand l'un des deux montants manque : rien à comparer", () => {
    expect(commissionOnOldAmount({ basis: "percentage", baseAmount: null }, "350000")).toBe(false);
    expect(commissionOnOldAmount({ basis: "percentage", baseAmount: "300000" }, null)).toBe(false);
  });

  it("ignore un écart de moins d'un centime", () => {
    expect(commissionOnOldAmount({ basis: "percentage", baseAmount: "300000.001" }, "300000")).toBe(false);
  });
});
