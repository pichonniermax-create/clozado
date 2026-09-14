/**
 * LES PREMIERS PAS (chantier UI/UX) — la liste de mise en route qu'un
 * espace neuf voit sur son tableau de bord, comme chez HubSpot ou Monday :
 * huit gestes, chacun COCHÉ PAR LES DONNÉES elles-mêmes (un contact existe,
 * un partenaire existe…), jamais par un clic sur « fait » — rien à
 * stocker, rien qui puisse mentir. Elle se masque d'un geste (cookie par
 * navigateur) et disparaît d'elle-même quand tout est fait.
 *
 * Les faits viennent d'une seule requête (`getOnboardingFacts`,
 * src/db/queries/onboarding.ts) ; ici, la lecture pure : quel geste est
 * fait, où il mène.
 */
export type OnboardingFacts = {
  brandSet: boolean;
  contacts: number;
  partners: number;
  deals: number;
  targets: number;
  newsletters: number;
  rules: number;
  emailDomainVerified: boolean;
};

export type OnboardingStepKey = "marque" | "contacts" | "partenaires" | "affaires" | "cibles" | "newsletters" | "regles" | "domaine";

export type OnboardingStep = { key: OnboardingStepKey; href: string; done: (facts: OnboardingFacts) => boolean };

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { key: "marque", href: "/settings#marque", done: (f) => f.brandSet },
  { key: "contacts", href: "/contacts/import", done: (f) => f.contacts > 0 },
  { key: "partenaires", href: "/partenaires?nouveau=1", done: (f) => f.partners > 0 },
  { key: "affaires", href: "/affaires?nouveau=1", done: (f) => f.deals > 0 },
  { key: "cibles", href: "/cibles/new", done: (f) => f.targets > 0 },
  { key: "newsletters", href: "/newsletters/new", done: (f) => f.newsletters > 0 },
  { key: "regles", href: "/regles/new", done: (f) => f.rules > 0 },
  { key: "domaine", href: "/settings#domaine", done: (f) => f.emailDomainVerified },
];

export const ONBOARDING_COOKIE = "clozado-premiers-pas";
export const ONBOARDING_COOKIE_MAX_AGE = 365 * 24 * 3600;

export type OnboardingProgress = { steps: { key: OnboardingStepKey; href: string; done: boolean }[]; done: number; total: number; complete: boolean };

export function readOnboardingProgress(facts: OnboardingFacts): OnboardingProgress {
  const steps = ONBOARDING_STEPS.map((step) => ({ key: step.key, href: step.href, done: step.done(facts) }));
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
