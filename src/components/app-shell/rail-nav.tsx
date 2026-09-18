"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Settings, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { NAVIGATION, type NavBadge, type NavEntry } from "@/components/app-shell/navigation";
import { setNavPinnedAction, toggleNavFavoriteAction } from "@/lib/display/actions";
import { cn } from "@/lib/utils";

/**
 * LA BARRE FINE ET SON PANNEAU (lot 4) — la navigation tenait 256 px en
 * permanence pour 19 entrées dont on n'en regarde qu'une : sur un portable
 * à 1366 px, c'était un cinquième de l'écran, et deux colonnes de moins sur
 * les tableaux. Ici, un RAIL de 56 px (une icône par GROUPE, plus les
 * écrans épinglés), et le détail d'un groupe dans un panneau qui se déplie
 * au survol, au clic ou au clavier. L'épingle le garde ouvert pour qui
 * préfère l'ancienne barre : le choix est mémorisé par personne et par
 * organisation.
 *
 * Trois règles tenues ici :
 *
 * - **Le survol n'est pas le seul chemin.** Tout s'atteint au clic et au
 *   clavier : flèches haut/bas entre les groupes (un seul arrêt de
 *   tabulation pour le rail, comme une barre d'outils ARIA), Entrée ou
 *   Espace pour déplier, flèche droite pour entrer dans le panneau, Échap
 *   pour le fermer et revenir sur le groupe. Sur un écran tactile, il n'y a
 *   pas de survol : le clic suffit, et rien n'est caché derrière un survol
 *   qu'on ne peut pas faire.
 * - **Le panneau est un dépliement, pas une fenêtre modale** : il ne piège
 *   pas le focus, ne masque pas l'écran, et se ferme dès qu'on navigue.
 * - **L'état actif reste dérivé de l'URL** (comme `NavLink`) : un groupe
 *   dont un écran est ouvert le montre, panneau fermé compris.
 */

type Badges = Record<NavBadge, number>;

/** Le total des compteurs d'un groupe : ce que le rail montre quand son panneau est fermé. */
function sectionBadge(entries: NavEntry[], badges: Badges): number {
  return entries.reduce((n, entry) => n + (entry.badge ? badges[entry.badge] : 0), 0);
}

export function RailNav({
  mark,
  hasOrganization,
  readOnly = false,
  isSuperAdmin = false,
  badges,
  hrefs,
  pinned: initialPinned,
  favorites: initialFavorites,
}: {
  /** La marque, rendue par le serveur (logo de l'organisation ou marque du produit). */
  mark: React.ReactNode;
  hasOrganization: boolean;
  readOnly?: boolean;
  isSuperAdmin?: boolean;
  badges: Badges;
  /** L'écran tel qu'on l'a laissé, par chemin (lot 1). */
  hrefs?: Record<string, string>;
  /** La barre reste dépliée (préférence de la personne). */
  pinned: boolean;
  /** Les chemins épinglés, dans l'ordre choisi. */
  favorites: string[];
}) {
  const t = useTranslations("shell.rail");
  const tn = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const panelId = useId();
  const [, startTransition] = useTransition();

  const sections = NAVIGATION.map((section) => ({
    ...section,
    entries: section.entries.filter((e) => (hasOrganization || !e.requiresOrganization) && (isSuperAdmin || !e.superAdminOnly)),
  })).filter((section) => section.entries.length > 0);

  const isActive = useCallback((href: string) => pathname === href || pathname.startsWith(`${href}/`), [pathname]);
  const activeSection = sections.find((section) => section.entries.some((entry) => isActive(entry.href)));

  /**
   * L'épingle et les favoris répondent AVANT l'aller-retour serveur : un
   * réglage de confort ne doit pas faire attendre. État LOCAL, et non
   * `useOptimistic` : la barre vit dans la coquille, elle n'est pas
   * re-rendue par le serveur après l'écriture (l'action ne revalide rien —
   * revalider toute la mise en page pour une épingle coûterait bien plus
   * cher que le geste). L'optimisme retomberait donc à la fin de la
   * transition, et l'épingle se rétracterait sous la souris. Le serveur
   * confirme au prochain chargement complet.
   */
  const [pinned, setPinned] = useState(initialPinned);
  const [favorites, setFavorites] = useState(initialFavorites);

  /**
   * Le groupe déplié, et l'écran sur lequel il l'a été : une NAVIGATION le
   * referme, sans effet ni synchronisation — on est arrivé, le panneau n'a
   * plus rien à dire. Épinglée, la barre montre le groupe de l'écran
   * courant tant qu'on n'en choisit pas un autre.
   */
  const [opened, setOpened] = useState<{ key: string; at: string } | null>(null);
  const openKey = opened && opened.at === pathname ? opened.key : null;
  const setOpenKey = useCallback((key: string | null) => setOpened(key === null ? null : { key, at: pathname }), [pathname]);
  const shown = openKey ?? (pinned ? (activeSection?.key ?? sections[0]?.key ?? null) : null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Le minuteur du survol ne survit pas au démontage.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const later = (fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  /** Le survol ouvre APRÈS un délai : traverser le rail pour aller ailleurs ne doit pas faire clignoter trois panneaux. */
  const hoverOpen = (key: string) => later(() => setOpenKey(key), 140);
  const hoverClose = () => later(() => setOpenKey(null), 220);

  const focusRail = (index: number) => {
    const buttons = railRef.current?.querySelectorAll<HTMLButtonElement>("[data-rail-group]");
    if (!buttons || buttons.length === 0) return;
    buttons[(index + buttons.length) % buttons.length].focus();
  };

  const onRailKeyDown = (event: React.KeyboardEvent, index: number, key: string) => {
    if (event.key === "ArrowDown") { event.preventDefault(); focusRail(index + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); focusRail(index - 1); }
    else if (event.key === "ArrowRight") {
      event.preventDefault();
      setOpenKey(key);
      // Le panneau n'est rendu qu'ensuite : on entre dedans au tour suivant.
      requestAnimationFrame(() => panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus());
    } else if (event.key === "Escape") setOpenKey(null);
  };

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setOpenKey(null);
    const index = sections.findIndex((s) => s.key === shown);
    focusRail(Math.max(0, index));
  };

  const togglePinned = () => {
    const next = !pinned;
    setPinned(next);
    startTransition(async () => {
      await setNavPinnedAction(next);
    });
  };

  const toggleFavorite = (href: string) => {
    setFavorites((current) => (current.includes(href) ? current.filter((h) => h !== href) : [...current, href].slice(-5)));
    startTransition(async () => {
      await toggleNavFavoriteAction(href);
    });
  };

  const entryByHref = new Map(sections.flatMap((s) => s.entries).map((e) => [e.href, e]));
  const pinnedEntries = favorites.map((href) => entryByHref.get(href)).filter((e): e is NavEntry => Boolean(e));
  const shownSection = sections.find((s) => s.key === shown) ?? null;

  return (
    // Collante et à la hauteur de l'écran, comme l'ancienne barre. Le panneau vit DANS ce conteneur : épinglé il
    // pousse le contenu (c'est une colonne), au survol il se superpose (il ne doit pas décaler l'écran sous la souris).
    <div
      data-nav-shell
      /**
       * Elle commence SOUS le bloc collant du haut (en-tête + bandeaux) et
       * prend la hauteur qui reste : `--shell-top` est mesurée sur la vraie
       * hauteur de ce bloc (`ShellOffset`). Avant, elle démarrait à zéro et
       * sa première entrée passait sous l'en-tête.
       */
      style={{ top: "var(--shell-top, 3.5rem)", height: "calc(100dvh - var(--shell-top, 3.5rem))" }}
      className="sticky z-30 hidden shrink-0 md:flex"
      onMouseLeave={() => { if (!pinned) hoverClose(); }}
    >
      <div
        ref={railRef}
        className="flex w-14 shrink-0 flex-col items-center overflow-y-auto overscroll-contain border-r border-sidebar-border bg-sidebar py-3"
      >
        {/* La tête du rail et celle du panneau ont la MÊME hauteur (h-8) et la même marge : le premier
            groupe du rail tombe donc exactement en face de la première entrée du panneau. */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">{mark}</div>

        {pinnedEntries.length > 0 && (
          <ul className="mt-2 flex w-full shrink-0 flex-col items-center gap-1 border-b border-sidebar-border pb-2">
            {pinnedEntries.map((entry) => (
              <li key={entry.href}>
                <RailLink
                  href={hrefs?.[entry.href] ?? entry.href}
                  label={tn(`entries.${entry.key}`)}
                  icon={<entry.icon />}
                  active={isActive(entry.href)}
                  badge={entry.badge ? badges[entry.badge] : 0}
                  onHover={() => router.prefetch(hrefs?.[entry.href] ?? entry.href)}
                />
              </li>
            ))}
          </ul>
        )}

        <nav aria-label={t("navigation_principale")} className="mt-2 flex shrink-0 flex-col items-center gap-1">
          {sections.map((section, index) => {
            const Icon = section.icon;
            const open = shown === section.key;
            const count = sectionBadge(section.entries, badges);
            const active = section.entries.some((entry) => isActive(entry.href));
            return (
              <button
                key={section.key}
                type="button"
                data-rail-group={section.key}
                // Un seul arrêt de tabulation pour le rail : les flèches font le reste (motif « barre d'outils »).
                tabIndex={index === 0 ? 0 : -1}
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                aria-current={active ? "true" : undefined}
                onMouseEnter={() => hoverOpen(section.key)}
                // Le FOCUS n'ouvre pas : sinon Entrée refermerait ce que le focus vient d'ouvrir, et Échap
                // rouvrirait le panneau en rendant le focus au groupe. Entrée, Espace et flèche droite ouvrent.
                onClick={() => setOpenKey(open ? null : section.key)}
                onKeyDown={(e) => onRailKeyDown(e, index, section.key)}
                title={tn(`sections.${section.key}`)}
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-lg transition-colors",
                  active || open ? "bg-sidebar-accent text-primary-ink" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <Icon aria-hidden className="size-5" />
                <span className="sr-only">{tn(`sections.${section.key}`)}</span>
                {count > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] leading-4 font-semibold text-primary-foreground tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex shrink-0 flex-col items-center gap-1 pt-2">
          {hasOrganization && !readOnly && (
            <RailLink href="/settings" label={t("reglages")} icon={<Settings />} active={isActive("/settings")} badge={0} />
          )}
          <button
            type="button"
            onClick={togglePinned}
            aria-pressed={pinned}
            title={pinned ? t("replier_la_barre") : t("garder_la_barre_depliee")}
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
          >
            {pinned ? <PanelLeftClose aria-hidden className="size-4" /> : <PanelLeftOpen aria-hidden className="size-4" />}
            <span className="sr-only">{pinned ? t("replier_la_barre") : t("garder_la_barre_depliee")}</span>
          </button>
        </div>
      </div>

      {shownSection && (
        <div
          ref={panelRef}
          id={panelId}
          onKeyDown={onPanelKeyDown}
          onMouseEnter={() => { if (timer.current) clearTimeout(timer.current); }}
          className={cn(
            "flex w-52 flex-col overflow-y-auto overscroll-contain border-r border-sidebar-border bg-sidebar px-2 py-3",
            // Épinglé, le panneau est une COLONNE (il pousse le contenu) ; au survol, il se superpose — mais
            // toujours DANS la barre : même haut, même hauteur, donc rien ne passe sous l'en-tête.
            pinned ? "relative" : "absolute inset-y-0 left-14 shadow-lg"
          )}
        >
          <p className="flex h-8 shrink-0 items-center px-2 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
            {tn(`sections.${shownSection.key}`)}
          </p>
          <div className="mt-2 flex flex-col gap-1">
          {shownSection.entries.map((entry) => {
            const href = hrefs?.[entry.href] ?? entry.href;
            const active = isActive(entry.href);
            const count = entry.badge ? badges[entry.badge] : 0;
            const starred = favorites.includes(entry.href);
            return (
              <div key={entry.href} className="group/entry flex min-h-10 items-stretch gap-1">
                <Link
                  href={href}
                  prefetch={false}
                  onMouseEnter={() => router.prefetch(href)}
                  onFocus={() => router.prefetch(href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors",
                    active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}
                >
                  <span className={cn("shrink-0 [&_svg]:size-4", active ? "text-primary-ink" : "")}>
                    <entry.icon />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{tn(`entries.${entry.key}`)}</span>
                  {count > 0 && (
                    <span className={cn(
                      "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.6875rem] leading-none font-semibold tabular-nums",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  )}
                </Link>
                {/* L'épingle d'un écran. Visible au survol et au focus — et TOUJOURS visible quand elle est posée
                    (sinon on ne saurait pas comment la retirer sans la chercher à l'aveugle). */}
                <button
                  type="button"
                  onClick={() => toggleFavorite(entry.href)}
                  aria-pressed={starred}
                  title={starred ? t("retirer_des_favoris") : t("epingler_en_haut")}
                  className={cn(
                    "flex w-8 shrink-0 items-center justify-center self-center rounded-lg py-1 transition-colors hover:bg-sidebar-accent/50",
                    starred ? "text-primary-ink" : "text-muted-foreground opacity-0 group-hover/entry:opacity-100 focus-visible:opacity-100"
                  )}
                >
                  <Star aria-hidden className={cn("size-3.5", starred && "fill-current")} />
                  <span className="sr-only">{starred ? t("retirer_des_favoris") : t("epingler_en_haut")}</span>
                </button>
              </div>
            );
          })}
          </div>
          {!pinned && (
            <button
              type="button"
              onClick={togglePinned}
              className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
            >
              <ChevronRight aria-hidden className="size-3.5" />
              {t("garder_la_barre_depliee")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Un écran atteint directement depuis le rail : favori, ou réglages. */
function RailLink({
  href,
  label,
  icon,
  active,
  badge,
  onHover,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge: number;
  onHover?: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={onHover}
      onFocus={onHover}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(
        "relative flex size-10 items-center justify-center rounded-lg transition-colors [&_svg]:size-5",
        active ? "bg-sidebar-accent text-primary-ink" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
      {badge > 0 && (
        <span className="absolute top-1 right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] leading-4 font-semibold text-primary-foreground tabular-nums">
          {badge}
        </span>
      )}
    </Link>
  );
}
