import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, readOnboardingProgress, type OnboardingFacts } from "./steps";

const nothing: OnboardingFacts = { brandSet: false, contacts: 0, partners: 0, deals: 0, targets: 0, newsletters: 0, rules: 0, emailDomainVerified: false };
const everything: OnboardingFacts = { brandSet: true, contacts: 3, partners: 1, deals: 2, targets: 1, newsletters: 1, rules: 1, emailDomainVerified: true };

describe("les premiers pas", () => {
  it("un espace neuf n'a rien fait ; un espace complet a tout fait, et la carte disparaît", () => {
    const fresh = readOnboardingProgress(nothing);
    expect(fresh.done).toBe(0);
    expect(fresh.total).toBe(ONBOARDING_STEPS.length);
    expect(fresh.complete).toBe(false);
    const full = readOnboardingProgress(everything);
    expect(full.done).toBe(full.total);
    expect(full.complete).toBe(true);
  });

  it("chaque geste est coché par sa donnée, et par elle seule", () => {
    const partial = readOnboardingProgress({ ...nothing, contacts: 1, deals: 1 });
    expect(partial.steps.filter((s) => s.done).map((s) => s.key)).toEqual(["contacts", "affaires"]);
    expect(partial.done).toBe(2);
  });

  it("chaque geste mène quelque part", () => {
    for (const step of ONBOARDING_STEPS) expect(step.href.startsWith("/"), step.key).toBe(true);
  });
});
