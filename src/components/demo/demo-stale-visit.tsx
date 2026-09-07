import { useTranslations } from "next-intl";

/**
 * Le cookie de visite de la démo publique est encore dans le navigateur,
 * mais la visite ne vaut plus rien (interrupteur éteint, démo
 * réinitialisée) : la personne est revenue à sa vraie session, et pourtant
 * le proxy — qui ne voit que le cookie — refuse encore ses écritures. On
 * le dit, avec la sortie : `/demo/quitter` efface le cookie. Un `<a>`, pas
 * un `Link` : la route agit (docs/module-demo.md §1.4).
 */
export function DemoStaleVisitNotice() {
  const t = useTranslations("demo.banner");
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-2 md:px-8">
      <p role="status" className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
        {t.rich("visite_terminee", {
          link: (chunks) => (
            <a href="/demo/quitter" className="underline underline-offset-2">
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  );
}
