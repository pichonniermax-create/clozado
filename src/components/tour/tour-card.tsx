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
 * LE TEMPS, ET CE QU'IL FAUT EN FAIRE.
 *
 * La carte se pose AVANT d'être visible : tant que l'élément à éclairer n'est
 * pas mesuré, la PREMIÈRE apparition attend (elle occupe déjà sa place, donc
 * sa hauteur est connue). Ensuite, elle ne disparaît plus jamais : pendant
 * qu'un écran arrive, elle GARDE la place qu'elle occupe et éteint son halo,
 * puis elle se pose sur le nouveau repère d'un seul mouvement.
 *
 * Le repli en bas à droite est le dernier recours, quand l'écran n'a pas de
 * repère (écran en erreur, liste vide, fenêtre trop étroite). Il ne se
 * déclenche qu'après un SILENCE : le compte repart à chaque changement de
 * l'écran et se prolonge tant qu'un squelette de chargement est à l'écran.
 * Compté depuis le clic, il renonçait au bout de 2,5 s sur tout écran plus
 * lent que ça — c'est-à-dire souvent — et la carte finissait le reste de la
 * visite dans le coin, sans rien éclairer, par-dessus le tableau.
 */
const SETTLE_MS = 2500;
/** Le plafond : un écran qui ne se tait jamais (compteur, flux, animation qui insère) ne retient pas la carte pour autant. */
const SETTLE_MAX_MS = 15000;
/** La hauteur de repli, le temps que la carte existe pour être mesurée. */
const CARD_HEIGHT_FALLBACK = 232;
/** Le squelette d'un écran qui arrive (`PageSkeleton`) porte `aria-busy` — c'est notre « ça charge encore ». */
const CHARGEMENT = "[aria-busy]";

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
  /** Le repère de l'écran COURANT est mesuré (ou cet écran n'en a pas) : le halo peut s'allumer. */
  const [placed, setPlaced] = useState(false);
  /** La carte s'est déjà posée une fois : à partir de là elle ne disparaît plus, elle garde sa place. */
  const [everPlaced, setEverPlaced] = useState(false);
  const everPlacedRef = useRef(false);
  const cardRef = useRef<HTMLElement | null>(null);
  // Sur un téléphone, la carte fixe masquait le tiers bas de l'écran sans pouvoir se réduire (audit UI du 2026-09-14) :
  // repliée, il ne reste qu'une ligne au-dessus de la barre d'onglets. Un changement d'étape la redéplie.
  const [collapsed, setCollapsed] = useState(false);
  // L'écran D'OÙ « Suivant » / « Précédent » part, tant qu'on ne l'a pas quitté : pendant ce trajet, la carte ne
  // propose pas « Voir cet écran » — on y va déjà. Le trajet est fini dès que le chemin change, qu'on soit arrivé
  // à destination ou ailleurs (redirection, écran refusé).
  const [goingFrom, setGoingFrom] = useState<string | null>(null);
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
    // `null`, et surtout PAS `window.history.state` : Next remplace `replaceState` pour tenir `usePathname` /
    // `useSearchParams` à jour, et ce remplaçant SORT PAR LE HAUT quand l'état porte sa propre marque
    // (`__NA`, node_modules/next/dist/client/components/app-router.js). L'adresse se nettoyait donc dans la barre
    // sans que le routeur le sache : `visite=1` restait vrai à jamais, et « Visite guidée » cliqué depuis le
    // tableau de bord ne relançait plus rien (mesuré le 2026-09-22). Avec `null`, Next recopie son propre état.
    window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [forced, params, pathname]);

  if (goingFrom !== null && pathname !== goingFrom) setGoingFrom(null);
  // Un trajet qui ne part jamais (lien mort, navigation avalée) ne doit pas retenir « Voir cet écran » pour toujours.
  useEffect(() => {
    if (goingFrom === null) return;
    const timer = window.setTimeout(() => setGoingFrom(null), SETTLE_MAX_MS);
    return () => clearTimeout(timer);
  }, [goingFrom]);

  const step = TOUR_STEPS[state.step];
  const running = state.status === "en_cours";
  const onScreen = pathname === step.href;
  const target = running && onScreen ? step.target : undefined;

  // L'ancrage. Une clé par écran ET par repère : elle change, le halo s'éteint et la carte cherche son nouveau repère.
  // `spot` n'est PAS effacé ici — c'est lui qui tient la carte en place pendant que l'écran suivant arrive.
  const anchorKey = `${pathname}:${target ?? ""}`;
  const [lastKey, setLastKey] = useState(anchorKey);
  if (anchorKey !== lastKey) {
    setLastKey(anchorKey);
    setPlaced(false);
  }

  // Mesuré dans la passe de mise en page (avant la peinture), puis à chaque défilement, redimensionnement et CHANGEMENT
  // DU DOM — l'écran arrive en flux (squelette d'abord, contenu ensuite) : l'élément à éclairer n'existe souvent pas
  // encore quand la carte se monte. Une seule frame en attente à la fois.
  useBeforePaint(() => {
    let frame = 0;
    let repli = 0;
    let plafond = 0;
    /** « attente » tant que le repère n'est pas mesuré ; ensuite la carte est ancrée, ou repliée en bas. */
    let issue: "attente" | "ancree" | "repli" = "attente";

    const poser = (place: Placement | null) => {
      setSpot(place);
      setPlaced(true);
      everPlacedRef.current = true;
      setEverPlaced(true);
    };
    const replier = () => {
      issue = "repli";
      window.clearTimeout(repli);
      poser(null);
    };

    const mesurer = () => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      if (collapsed || !canAnchor(viewport)) {
        replier();
        return;
      }
      if (!target) {
        // On n'est pas sur l'écran de l'étape (en route, ou parti ailleurs) : la carte reste où elle est.
        // Sauf si elle ne s'est jamais montrée — il lui faut bien une première place.
        if (!everPlacedRef.current) replier();
        return;
      }
      const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      const rect = element?.getBoundingClientRect();
      if (!element || !rect || rect.width === 0 || rect.height === 0) return; // l'écran n'est pas arrivé : on attend
      if (scrolledFor.current !== anchorKey) {
        scrolledFor.current = anchorKey;
        // Sans transition : la géométrie est définitive quand on la lit juste après. `smooth` posait la carte sur
        // une place périmée.
        element.scrollIntoView({ block: "center", behavior: "auto" });
      }
      const posee = element.getBoundingClientRect();
      issue = "ancree";
      window.clearTimeout(repli);
      window.clearTimeout(plafond);
      poser(placeCard({ top: posee.top, left: posee.left, width: posee.width, height: posee.height }, viewport, cardRef.current?.offsetHeight ?? CARD_HEIGHT_FALLBACK));
    };

    /** Le compte du SILENCE : il repart à chaque changement de l'écran, et se prolonge tant qu'un squelette est là. */
    const compter = () => {
      if (issue !== "attente") return;
      window.clearTimeout(repli);
      repli = window.setTimeout(() => {
        if (issue !== "attente") return;
        if (document.querySelector(CHARGEMENT)) {
          compter();
          return;
        }
        replier();
      }, SETTLE_MS);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(mesurer);
      compter();
    };

    mesurer();
    if (target) {
      compter();
      plafond = window.setTimeout(() => {
        if (issue === "attente") replier();
      }, SETTLE_MAX_MS);
    }
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(repli);
      window.clearTimeout(plafond);
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
      setGoingFrom(pathname);
      router.push(navigateTo);
    }
  }

  if (!running) return null;
  /** Se voir : la première fois, une fois posée ; ensuite, toujours — elle garde sa place le temps qu'un écran arrive. */
  const shown = placed || everPlaced;
  /** Le halo n'éclaire QUE le repère de l'écran courant : pendant qu'un écran arrive, il s'éteint. */
  const eclaire = placed && spot !== null;
  const enRoute = goingFrom !== null;
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
      {eclaire && (
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
        data-tour-card={placed ? (spot ? spot.side : "coin") : "attente"}
        className={cn(
          "fixed z-40 border-border bg-card p-4 text-card-foreground shadow-lg",
          // Ancrée : elle glisse jusqu'à son nouveau repère, du même mouvement que le halo — jamais un saut.
          spot
            ? "w-96 rounded-xl border transition-[top,left] duration-200 motion-reduce:transition-none"
            : "inset-x-0 bottom-14 border-t md:inset-x-auto md:right-6 md:bottom-6 md:w-96 md:rounded-xl md:border",
          // La PREMIÈRE apparition se fait posée : tant qu'elle attend son repère, elle occupe sa place sans se voir.
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
          {!onScreen && !enRoute && (
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
