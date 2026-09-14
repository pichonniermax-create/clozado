"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { BookUser, Briefcase, Compass, CornerDownLeft, Search, Settings, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { NAVIGATION, QUICK_CREATE } from "@/components/app-shell/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import type { SearchHit } from "@/db/queries/search";
import { searchEverythingAction } from "@/lib/search/actions";
import { TOUR_PARAM } from "@/lib/tour/steps";
import { cn } from "@/lib/utils";

type Group = "navigation" | "creer" | "contacts" | "affaires" | "partenaires" | "plus";
type Item = { id: string; group: Group; label: string; hint?: string | null; href: string; icon?: LucideIcon };

const GROUP_ORDER: Group[] = ["contacts", "affaires", "partenaires", "navigation", "creer", "plus"];
const HIT_ICON: Record<SearchHit["kind"], LucideIcon> = { contact: BookUser, deal: Briefcase, partner: Users };
const HIT_GROUP: Record<SearchHit["kind"], Group> = { contact: "contacts", deal: "affaires", partner: "partenaires" };
/** Deux lettres au moins avant d'interroger le serveur. */
const MIN_QUERY = 2;

/** « Élodie » et « elodie » se trouvent : sans accents, sans casse, sans espaces en trop. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const noop = () => () => undefined;
/** Le raccourci affiché suit la machine : ⌘ sur Mac, Ctrl ailleurs — lu au premier rendu client, jamais au serveur. */
function useIsMac(): boolean {
  return useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false
  );
}

/**
 * LA PALETTE DE COMMANDES (chantier UI/UX) — ⌘K / Ctrl+K depuis n'importe
 * quel écran : aller à un écran, créer (contact, affaire, tâche,
 * partenaire), et surtout RETROUVER une fiche par son nom — contacts,
 * affaires, partenaires — dans son organisation, en tapant deux lettres.
 * Les écrans viennent du registre de navigation (une seule source, comme la
 * barre latérale) ; les fiches viennent d'une action serveur, org-scopée,
 * débouncée à la frappe. Tout au clavier : flèches, Entrée, Échap.
 */
export function CommandPalette({
  hasOrganization,
  readOnly = false,
  isSuperAdmin = false,
}: {
  hasOrganization: boolean;
  readOnly?: boolean;
  isSuperAdmin?: boolean;
}) {
  const t = useTranslations("ui.commandPalette");
  const tn = useTranslations("nav");
  const ta = useTranslations("shell.accountMenu");
  const router = useRouter();
  const listId = useId();
  const mac = useIsMac();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Les fiches trouvées, avec la question qui les a produites : une réponse ne s'affiche que pour la question courante. */
  const [found, setFound] = useState<{ query: string; hits: SearchHit[] }>({ query: "", hits: [] });
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Les fiches : 180 ms après la dernière frappe, et jamais une réponse périmée par-dessus une plus récente.
  const needle = query.trim();
  useEffect(() => {
    if (!open || !hasOrganization || needle.length < MIN_QUERY) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const hits = await searchEverythingAction(needle).catch(() => []);
        if (id === requestId.current) setFound({ query: needle, hits });
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [needle, open, hasOrganization]);

  const staticItems = useMemo<Item[]>(() => {
    const items: Item[] = [];
    for (const section of NAVIGATION) {
      for (const entry of section.entries) {
        if ((entry.requiresOrganization && !hasOrganization) || (entry.superAdminOnly && !isSuperAdmin)) continue;
        items.push({ id: `nav:${entry.href}`, group: "navigation", label: tn(`entries.${entry.key}`), hint: tn(`sections.${section.key}`), href: entry.href, icon: entry.icon });
      }
    }
    if (hasOrganization && !readOnly) {
      for (const create of QUICK_CREATE) {
        items.push({ id: `create:${create.href}`, group: "creer", label: tn(`quickCreate.${create.key}`), href: create.href, icon: create.icon });
      }
      items.push({ id: "plus:settings", group: "plus", label: ta("marque_reglages"), href: "/settings", icon: Settings });
    }
    if (hasOrganization) items.push({ id: "plus:tour", group: "plus", label: ta("visite_guidee"), href: `/dashboard?${TOUR_PARAM}=1`, icon: Compass });
    return items;
  }, [hasOrganization, readOnly, isSuperAdmin, tn, ta]);

  const items = useMemo<Item[]>(() => {
    const folded = fold(query);
    const filtered = folded ? staticItems.filter((item) => fold(item.label).includes(folded) || (item.hint ? fold(item.hint).includes(folded) : false)) : staticItems;
    const hits = found.query === needle && needle.length >= MIN_QUERY ? found.hits : [];
    const fromHits: Item[] = hits.map((hit) => ({ id: `${hit.kind}:${hit.id}`, group: HIT_GROUP[hit.kind], label: hit.title, hint: hit.subtitle, href: hit.href, icon: HIT_ICON[hit.kind] }));
    const all = [...fromHits, ...filtered];
    if (hasOrganization && needle.length >= MIN_QUERY) {
      all.push({ id: "plus:contacts-search", group: "plus", label: t("voir_tous_les_contacts_pour", { query: needle }), href: `/contacts?q=${encodeURIComponent(needle)}`, icon: Search });
    }
    return GROUP_ORDER.flatMap((group) => all.filter((item) => item.group === group));
  }, [query, needle, staticItems, found, hasOrganization, t]);

  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  const select = useCallback(
    (item: Item) => {
      setOpen(false);
      setQuery("");
      router.push(item.href);
    },
    [router]
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(items.length - 1, activeIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (event.key === "Enter") {
      const item = items[activeIndex];
      if (item) {
        event.preventDefault();
        select(item);
      }
    }
  }

  // L'élément actif reste visible quand on descend au clavier.
  useEffect(() => {
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

  // Le champ prend le focus à CHAQUE ouverture (ceinture par-dessus `initialFocus`) : rouvrir la palette juste après
  // l'avoir fermée laissait parfois le focus sur le bouton, et la frappe partait dans le vide.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-56 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:inline-flex lg:w-64"
        aria-label={t("ouvrir")}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{t("rechercher")}</span>
        <Kbd className="text-[0.65rem]">{mac ? t("raccourci_mac") : t("raccourci_pc")}</Kbd>
      </button>
      <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label={t("ouvrir")} onClick={() => setOpen(true)}>
        <Search />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        {/* `finalFocus={false}` : à la fermeture, Base UI rendrait le focus au bouton APRÈS son animation de sortie — une
            réouverture rapide (⌘K deux fois) voyait le focus repartir du champ vers le bouton, et la frappe se perdait. */}
        <DialogContent showCloseButton={false} className="top-[12vh] gap-0 overflow-hidden p-0 sm:max-w-lg" initialFocus={inputRef} finalFocus={false}>
          <DialogTitle className="sr-only">{t("titre")}</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={items[activeIndex] ? `${listId}-${activeIndex}` : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={hasOrganization ? t("placeholder") : t("placeholder_sans_organisation")}
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
            <Kbd className="hidden sm:inline-flex">{t("echap")}</Kbd>
          </div>
          <ul id={listId} role="listbox" aria-label={t("titre")} className="max-h-[min(60vh,24rem)] overflow-y-auto p-1.5">
            {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t("aucun_resultat")}</li>}
            {items.map((item, index) => {
              const heading = index === 0 || items[index - 1].group !== item.group ? t(`groupes.${item.group}`) : null;
              const Icon = item.icon;
              const isActive = index === activeIndex;
              return (
                <li key={item.id} role="presentation">
                  {heading && <p className="px-2 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">{heading}</p>}
                  <div
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => select(item)}
                    className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm", isActive ? "bg-accent text-accent-foreground" : "text-foreground")}
                  >
                    {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground sm:inline">{item.hint}</span>}
                    {isActive && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
