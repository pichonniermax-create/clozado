"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Compass, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { serializeTourState, TOUR_COOKIE, TOUR_COOKIE_MAX_AGE, TOUR_PARAM, TOUR_STEPS, type TourState } from "@/lib/tour/steps";
import { cn } from "@/lib/utils";

function writeCookie(state: TourState) {
  try {
    document.cookie = `${TOUR_COOKIE}=${encodeURIComponent(serializeTourState(state))}; path=/; max-age=${TOUR_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    /* un navigateur qui refuse les cookies : la visite vit le temps de la page */
  }
}

/** La géométrie de l'élément éclairé et la place de la carte, recalculées au défilement et au redimensionnement. */
type Anchor = { top: number; left: number; width: number; height: number; cardTop: number; cardLeft: number };

const CARD_WIDTH = 384;
const GAP = 14;
const PADDING = 8;
/** En dessous de `md`, la carte reste en bas de l'écran : pas d'éclairage sur un téléphone. */
const ANCHOR_MIN_WIDTH = 768;

function measure(target: string): Anchor | null {
  if (window.innerWidth < ANCHOR_MIN_WIDTH) return null;
  const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const cardHeight = 232;
  const below = rect.bottom + GAP + cardHeight <= window.innerHeight;
  const cardTop = below ? rect.bottom + GAP : Math.max(PADDING, rect.top - GAP - cardHeight);
  const cardLeft = Math.min(Math.max(PADDING, rect.left), window.innerWidth - CARD_WIDTH - PADDING);
  return { top: rect.top - PADDING, left: rect.left - PADDING, width: rect.width + PADDING * 2, height: rect.height + PADDING * 2, cardTop, cardLeft };
}

/**
 * La carte de la visite guidée (docs/module-demo.md §1.8, reprise par le
 * chantier UI/UX) : une étape, deux phrases, l'élément de l'écran ÉCLAIRÉ
 * (un halo autour de lui, le reste assombri sans être bloqué — la page
 * reste cliquable), le geste à faire, Précédent / Suivant / Fermer et la
 * progression. Sans élément à éclairer, ou sur petit écran, elle reste
 * fixée en bas à droite (pleine largeur en bas sur mobile, au-dessus de la
 * barre d'onglets). Elle démarre seule la première fois (aucun cookie) ou
 * quand `?visite=1` le demande ; « Fermer » la masque ; la reprise se fait
 * depuis le menu de compte, la palette ou le bandeau de la démo.
 */
export function TourCard({ initialState }: { initialState: TourState | null }) {
  const t = useTranslations("tour");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const forced = params.get(TOUR_PARAM) === "1";
  const [state, setState] = useState<TourState>(() => (forced || !initialState ? { step: 0, status: "en_cours" } : initialState));
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // Sur un téléphone, la carte fixe masquait le tiers bas de l'écran sans pouvoir se réduire (audit UI du 2026-09-14) :
  // repliée, il ne reste qu'une ligne au-dessus de la barre d'onglets. Un changement d'étape la redéplie.
  const [collapsed, setCollapsed] = useState(false);
  const scrolledFor = useRef<string | null>(null);

  // L'état de départ (première visite, ou visite forcée) s'écrit une fois, pour survivre à la navigation.
  useEffect(() => {
    if (forced || !initialState) writeCookie({ step: 0, status: "en_cours" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au montage seulement
  }, []);

  const step = TOUR_STEPS[state.step];
  const running = state.status === "en_cours";
  const onScreen = pathname === step.href;
  const target = running && onScreen ? step.target : undefined;

  // L'ancrage : mesuré dans une frame d'animation (jamais pendant le rendu), puis à chaque défilement, redimensionnement
  // et CHANGEMENT DU DOM — l'écran arrive en flux (squelette d'abord, contenu ensuite) : l'élément à éclairer n'existe
  // souvent pas encore quand la carte se monte. Une seule frame en attente à la fois.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target) {
          setAnchor(null);
          return;
        }
        const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
        const key = `${pathname}:${target}`;
        if (element && scrolledFor.current !== key) {
          scrolledFor.current = key;
          element.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setAnchor(measure(target));
      });
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [target, pathname]);

  function update(next: TourState, navigateTo?: string) {
    setState(next);
    setCollapsed(false);
    writeCookie(next);
    if (next.status === "termine") toast.add({ type: "success", description: t("carte.terminee"), timeout: 6000 });
    if (navigateTo && navigateTo !== pathname) router.push(navigateTo);
  }

  if (!running) return null;
  const total = TOUR_STEPS.length;
  const last = state.step === total - 1;

  if (collapsed) {
    return (
      <aside
        role="complementary"
        aria-label={t("carte.visite_guidee")}
        className="fixed inset-x-0 bottom-14 z-40 flex items-center justify-between gap-2 border-t border-border bg-card px-4 py-1.5 text-card-foreground shadow-lg md:inset-x-auto md:right-6 md:bottom-6 md:w-96 md:rounded-xl md:border"
      >
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <Compass className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{t(`steps.${step.key}.titre`)}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{t("carte.etape_sur", { n: state.step + 1, total })}</span>
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setCollapsed(false)}>
          {t("carte.agrandir")}
          <ChevronUp />
        </Button>
      </aside>
    );
  }

  return (
    <>
      {anchor && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-30 rounded-xl ring-2 ring-primary/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.32)] transition-[top,left,width,height] duration-200"
          style={{ top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height }}
        />
      )}
      <aside
        role="complementary"
        aria-label={t("carte.visite_guidee")}
        className={cn(
          "fixed z-40 border-border bg-card p-4 text-card-foreground shadow-lg",
          anchor ? "w-96 rounded-xl border" : "inset-x-0 bottom-14 border-t md:inset-x-auto md:right-6 md:bottom-6 md:w-96 md:rounded-xl md:border"
        )}
        style={anchor ? { top: anchor.cardTop, left: anchor.cardLeft } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Compass className="size-4" />
            {t("carte.etape_sur", { n: state.step + 1, total })}
          </p>
          <span className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-xs" aria-label={t("carte.reduire")} onClick={() => setCollapsed(true)}>
              <ChevronDown />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" aria-label={t("carte.fermer")} onClick={() => update({ ...state, status: "masque" })}>
              <X />
            </Button>
          </span>
        </div>
        <ol className="mt-2 flex items-center gap-1" aria-hidden>
          {TOUR_STEPS.map((s, index) => (
            <li key={s.key} className={cn("h-1 flex-1 rounded-full transition-colors", index <= state.step ? "bg-primary" : "bg-muted")} />
          ))}
        </ol>
        <h2 className="mt-3 text-base font-semibold">{t(`steps.${step.key}.titre`)}</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{t(`steps.${step.key}.texte`)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!onScreen && (
            <Link href={step.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("carte.voir_cet_ecran")}
            </Link>
          )}
          {onScreen && step.action && (
            <Link href={step.action} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t(`steps.${step.key}.action`)}
              <ArrowRight />
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
    </>
  );
}
