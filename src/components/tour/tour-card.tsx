"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Compass, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { canAnchor, placeCard, type Placement } from "@/lib/tour/placement";
import { serializeTourState, TOUR_COOKIE, TOUR_COOKIE_MAX_AGE, TOUR_PARAM, TOUR_STEPS, type TourState } from "@/lib/tour/steps";
import { cn } from "@/lib/utils";

function writeCookie(state: TourState) {
  try {
    document.cookie = `${TOUR_COOKIE}=${encodeURIComponent(serializeTourState(state))}; path=/; max-age=${TOUR_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    /* un navigateur qui refuse les cookies : la visite vit le temps de la page */
  }
}

/**
 * La carte se pose AVANT d'être visible : tant que l'élément à éclairer
 * n'est pas mesuré, elle reste invisible (elle occupe déjà sa place, donc
 * sa hauteur est connue). Avant, elle apparaissait en bas à droite puis
 * sautait sous l'élément dès que l'écran finissait d'arriver — un
 * mouvement que personne n'a demandé, sur un écran qu'on découvre.
 *
 * Passé ce délai, l'élément n'arrivera plus (écran sans repère, contenu en
 * erreur) : la carte se montre en bas, et n'essaie plus de s'ancrer — elle
 * ne bougera pas non plus.
 */
const SETTLE_MS = 2500;
/** La hauteur de repli, le temps que la carte existe pour être mesurée. */
const CARD_HEIGHT_FALLBACK = 232;

/** `useLayoutEffect` pose la carte dans la passe de mise en page, avant la peinture ; le serveur, lui, ne peint rien. */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  const [spot, setSpot] = useState<Placement | null>(null);
  /** Tant que c'est faux, la carte existe (donc se mesure) mais ne se voit pas. */
  const [placed, setPlaced] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  // Sur un téléphone, la carte fixe masquait le tiers bas de l'écran sans pouvoir se réduire (audit UI du 2026-09-14) :
  // repliée, il ne reste qu'une ligne au-dessus de la barre d'onglets. Un changement d'étape la redéplie.
  const [collapsed, setCollapsed] = useState(false);
  // L'écran vers lequel « Suivant » / « Précédent » emmène, tant qu'on n'y est pas : la carte reste invisible pendant le
  // trajet. Sans ça, elle se décrochait de son repère pour filer dans le coin de l'ANCIEN écran, avant de disparaître et
  // de se reposer sur le nouveau — deux mouvements pour un seul clic (mesuré : 268,522 → 1032,666 → 268,487).
  const [goingTo, setGoingTo] = useState<string | null>(null);
  const scrolledFor = useRef<string | null>(null);

  // L'état de départ (première visite) s'écrit une fois, pour survivre à la navigation.
  useEffect(() => {
    if (!initialState) writeCookie({ step: 0, status: "en_cours" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au montage seulement
  }, []);

  // « Visite guidée » (menu de compte, palette, premiers pas, bandeau de la démo) mène à `/dashboard?visite=1`. La carte
  // vit dans le layout, qui SURVIT à la navigation : `?visite=1` n'était lu qu'au montage — une visite fermée ne
  // repartait donc jamais d'un clic, seul un rechargement complet la relançait (chantier C, correctif 1). Ici, chaque
  // apparition du paramètre remet la visite au premier pas (état dérivé, posé pendant le rendu), puis l'effet écrit le
  // cookie et nettoie l'adresse (sans rechargement) pour qu'un rechargement ou un lien copié ne la relance pas.
  const [lastForced, setLastForced] = useState(forced);
  if (forced !== lastForced) {
    setLastForced(forced);
    if (forced) {
      setState({ step: 0, status: "en_cours" });
      setCollapsed(false);
    }
  }
  useEffect(() => {
    if (!forced) return;
    writeCookie({ step: 0, status: "en_cours" });
    const next = new URLSearchParams(params.toString());
    next.delete(TOUR_PARAM);
    const query = next.toString();
    window.history.replaceState(window.history.state, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [forced, params, pathname]);

  if (goingTo && pathname === goingTo) setGoingTo(null);
  // Un trajet qui n'arrive jamais (redirection, écran refusé) ne doit pas effacer la carte pour toujours.
  useEffect(() => {
    if (!goingTo) return;
    const timer = window.setTimeout(() => setGoingTo(null), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [goingTo]);

  const step = TOUR_STEPS[state.step];
  const running = state.status === "en_cours";
  const onScreen = pathname === step.href;
  const target = running && onScreen ? step.target : undefined;

  // L'ancrage. Une clé par écran ET par repère : elle change, la carte redevient invisible et se repose de zéro —
  // jamais une carte posée pour l'écran précédent qui glisse vers le nouveau.
  const anchorKey = `${pathname}:${target ?? ""}`;
  const [lastKey, setLastKey] = useState(anchorKey);
  if (anchorKey !== lastKey) {
    setLastKey(anchorKey);
    setSpot(null);
    setPlaced(false);
  }

  // Mesuré dans la passe de mise en page (avant la peinture), puis à chaque défilement, redimensionnement et CHANGEMENT
  // DU DOM — l'écran arrive en flux (squelette d'abord, contenu ensuite) : l'élément à éclairer n'existe souvent pas
  // encore quand la carte se monte. Une seule frame en attente à la fois.
  useBeforePaint(() => {
    let frame = 0;
    let anchored = false;
    let abandoned = false;
    const place = () => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      if (!target || collapsed || !canAnchor(viewport)) {
        setSpot(null);
        setPlaced(true);
        return;
      }
      const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      const rect = element?.getBoundingClientRect();
      if (!element || !rect || rect.width === 0 || rect.height === 0) return; // l'écran n'est pas arrivé : on attend, invisible
      if (abandoned) return; // le repère est arrivé trop tard : la carte est déjà posée en bas, elle y reste
      if (scrolledFor.current !== anchorKey) {
        scrolledFor.current = anchorKey;
        // Sans transition : le défilement a lieu pendant que la carte est invisible, il ne se voit donc pas — et la
        // géométrie est définitive quand on la lit juste après. `smooth` la faisait se poser sur une place périmée.
        element.scrollIntoView({ block: "center", behavior: "auto" });
      }
      const posee = element.getBoundingClientRect();
      anchored = true;
      setSpot(placeCard({ top: posee.top, left: posee.left, width: posee.width, height: posee.height }, viewport, cardRef.current?.offsetHeight ?? CARD_HEIGHT_FALLBACK));
      setPlaced(true);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    // Le délai ne concerne QUE la première pose : une carte déjà ancrée continue de suivre son élément au défilement.
    const timer = window.setTimeout(() => {
      if (anchored) return;
      abandoned = true;
      setPlaced(true);
    }, SETTLE_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [anchorKey, target, collapsed]);

  function update(next: TourState, navigateTo?: string) {
    setState(next);
    setCollapsed(false);
    writeCookie(next);
    if (next.status === "termine") toast.add({ type: "success", description: t("carte.terminee"), timeout: 6000 });
    if (navigateTo && navigateTo !== pathname) {
      setGoingTo(navigateTo);
      router.push(navigateTo);
    }
  }

  if (!running) return null;
  /** Se voir, c'est être posée ET être arrivée : pendant un trajet, la carte existe sans se montrer. */
  const shown = placed && !goingTo;
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
          <span className="text-pretty">{t(`steps.${step.key}.titre`)}</span>
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
      {spot && shown && (
        <div
          aria-hidden
          data-tour-halo
          className="pointer-events-none fixed z-30 rounded-xl ring-2 ring-primary/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.32)] transition-[top,left,width,height] duration-200"
          style={{ top: spot.halo.top, left: spot.halo.left, width: spot.halo.width, height: spot.halo.height }}
        />
      )}
      <aside
        ref={cardRef}
        role="complementary"
        aria-label={t("carte.visite_guidee")}
        data-tour-card={shown ? (spot ? spot.side : "coin") : "attente"}
        className={cn(
          "fixed z-40 border-border bg-card p-4 text-card-foreground shadow-lg",
          spot ? "w-96 rounded-xl border" : "inset-x-0 bottom-14 border-t md:inset-x-auto md:right-6 md:bottom-6 md:w-96 md:rounded-xl md:border",
          // Posée avant d'être visible : tant qu'elle attend son repère, elle occupe sa place (donc se mesure) sans se voir.
          !shown && "invisible"
        )}
        style={spot ? { top: spot.card.top, left: spot.card.left } : undefined}
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
