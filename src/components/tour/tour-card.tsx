"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { serializeTourState, TOUR_COOKIE, TOUR_COOKIE_MAX_AGE, TOUR_PARAM, TOUR_STEPS, type TourState } from "@/lib/tour/steps";

function writeCookie(state: TourState) {
  try {
    document.cookie = `${TOUR_COOKIE}=${encodeURIComponent(serializeTourState(state))}; path=/; max-age=${TOUR_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    /* un navigateur qui refuse les cookies : la visite vit le temps de la page */
  }
}

/**
 * La carte de la visite guidée (docs/module-demo.md §1.8) : une étape, deux
 * phrases, l'écran à voir, Précédent / Suivant / Fermer. Fixée en bas à
 * droite (pleine largeur en bas sur mobile), jamais devant un bouton
 * d'action de l'écran. Elle démarre seule la première fois (aucun cookie)
 * ou quand `?visite=1` le demande ; « Fermer » la masque ; la reprise se
 * fait depuis le menu de compte ou le bandeau de la démo.
 */
export function TourCard({ initialState }: { initialState: TourState | null }) {
  const t = useTranslations("tour");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const forced = params.get(TOUR_PARAM) === "1";
  const [state, setState] = useState<TourState>(() => (forced || !initialState ? { step: 0, status: "en_cours" } : initialState));

  // L'état de départ (première visite, ou visite forcée) s'écrit une fois, pour survivre à la navigation.
  useEffect(() => {
    if (forced || !initialState) writeCookie({ step: 0, status: "en_cours" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au montage seulement
  }, []);

  function update(next: TourState, navigateTo?: string) {
    setState(next);
    writeCookie(next);
    if (navigateTo && navigateTo !== pathname) router.push(navigateTo);
  }

  if (state.status !== "en_cours") return null;
  const step = TOUR_STEPS[state.step];
  const total = TOUR_STEPS.length;
  const last = state.step === total - 1;
  const onScreen = pathname === step.href;

  return (
    <aside
      role="complementary"
      aria-label={t("carte.visite_guidee")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-4 text-card-foreground shadow-lg md:inset-x-auto md:right-6 md:bottom-6 md:w-96 md:rounded-xl md:border"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <Compass className="size-4" />
          {t("carte.etape_sur", { n: state.step + 1, total })}
        </p>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={t("carte.fermer")} onClick={() => update({ ...state, status: "masque" })}>
          <X />
        </Button>
      </div>
      <h2 className="mt-1 text-base font-semibold">{t(`steps.${step.key}.titre`)}</h2>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">{t(`steps.${step.key}.texte`)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!onScreen && (
          <Link href={step.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("carte.voir_cet_ecran")}
          </Link>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={state.step === 0}
            onClick={() => update({ step: state.step - 1, status: "en_cours" }, TOUR_STEPS[state.step - 1]?.href)}
          >
            <ChevronLeft />
            {t("carte.precedent")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => (last ? update({ step: state.step, status: "termine" }) : update({ step: state.step + 1, status: "en_cours" }, TOUR_STEPS[state.step + 1].href))}
          >
            {last ? t("carte.terminer") : t("carte.suivant")}
            {!last && <ChevronRight />}
          </Button>
        </span>
      </div>
    </aside>
  );
}
