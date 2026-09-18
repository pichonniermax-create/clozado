/**
 * LE MOUVEMENT DE L'ACCUEIL — sans librairie : `IntersectionObserver`,
 * une classe posée, et le CSS fait le reste (`app/globals.css`).
 *
 * Deux principes tenus ici :
 *
 * 1. UNE SEULE FOIS. Chaque cible est retirée de l'observateur dès qu'elle
 *    est entrée : remonter la page ne rejoue rien, et une liste déjà
 *    comptée ne recompte pas.
 * 2. RIEN N'EST CACHÉ SANS SCRIPT. `[data-mouvement]` est posé sur `<html>`
 *    par un script synchrone ; c'est lui qui conditionne tout le CSS qui
 *    masque. Si ce module ne s'exécute jamais, la page reste lisible.
 */

const CASCADE = 60; // ms entre deux voisins
const DUREE_COMPTEUR = 600; // ms

function reduit(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Un nombre en cours de comptage, écrit comme le modèle qu'il rejoindra :
 * si « 4 476 » sépare ses milliers par une espace, « 1 234 » aussi. Sans
 * cela, le compteur changerait de forme en arrivant à destination.
 */
function formate(valeur: number, modele: string): string {
  const separateur = modele.match(/\d(\D)\d{3}(?!\d)/)?.[1];
  const chiffres = String(valeur);
  return separateur ? chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, separateur) : chiffres;
}

/** Compte de 0 à la valeur cible, en ralentissant (cubique). */
function compte(element: HTMLElement): void {
  const cible = Number(element.dataset.compteur);
  const modele = element.textContent ?? "";
  if (!Number.isFinite(cible)) return;
  const depart = performance.now();
  const pas = (maintenant: number) => {
    const avancement = Math.min(1, (maintenant - depart) / DUREE_COMPTEUR);
    if (avancement < 1) {
      element.textContent = formate(Math.round(cible * (1 - Math.pow(1 - avancement, 3))), modele);
      requestAnimationFrame(pas);
    } else {
      // On repose le modèle exact : le texte final est celui du serveur.
      element.textContent = modele;
    }
  };
  element.textContent = formate(0, modele);
  requestAnimationFrame(pas);
}

/**
 * Anime une zone d'écran : ses lignes se posent en cascade, ses nombres se
 * comptent, ses barres se remplissent. Idempotente.
 */
export function animeZone(zone: HTMLElement): void {
  if (zone.dataset.anime === "oui") return;
  zone.dataset.anime = "oui";

  const lignes = zone.querySelectorAll<HTMLElement>("[data-ligne]");
  const compteurs = zone.querySelectorAll<HTMLElement>("[data-compteur]");

  if (reduit()) {
    lignes.forEach((ligne) => ligne.classList.add("est-visible"));
    zone.classList.add("est-anime");
    return;
  }

  lignes.forEach((ligne, rang) => {
    ligne.style.setProperty("--delai", `${rang * CASCADE}ms`);
    ligne.classList.add("est-visible");
  });
  // Les barres partent avec la première ligne ; le CSS porte leur délai.
  zone.classList.add("est-anime");
  compteurs.forEach((element) => compte(element));
}

/**
 * Pose les observateurs de la page : l'entrée des blocs, l'animation des
 * écrans autonomes (ceux qui ne sont pas dans les onglets, lesquels
 * s'animent quand leur vue devient active), et l'état de l'en-tête.
 *
 * Rend la fonction qui démonte tout.
 */
export function installer(): () => void {
  const racine = document.documentElement;
  const doux = reduit();
  // Le module a répondu : le filet posé en tête de page n'a plus lieu d'agir.
  racine.dataset.anime = "1";

  // --- 1. L'entrée des blocs ---
  const blocs = Array.from(document.querySelectorAll<HTMLElement>("[data-entree]"));
  let observateurBlocs: IntersectionObserver | undefined;
  if (doux) {
    blocs.forEach((bloc) => bloc.classList.add("est-visible"));
  } else {
    observateurBlocs = new IntersectionObserver(
      (entrees, observateur) => {
        entrees.forEach((entree) => {
          if (!entree.isIntersecting) return;
          const bloc = entree.target as HTMLElement;
          observateur.unobserve(bloc); // une seule fois, jamais au retour
          bloc.style.setProperty("--delai", `${Number(bloc.dataset.rang ?? 0) * CASCADE}ms`);
          bloc.classList.add("est-visible");
        });
      },
      // Un bloc entre quand son premier dixième dépasse le bas de l'écran.
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" }
    );
    blocs.forEach((bloc) => observateurBlocs?.observe(bloc));
  }

  // --- 2. Les écrans autonomes ---
  const zones = Array.from(document.querySelectorAll<HTMLElement>("[data-ecran]")).filter(
    (zone) => !zone.closest("[data-onglets]")
  );
  const observateurZones = new IntersectionObserver(
    (entrees, observateur) => {
      entrees.forEach((entree) => {
        if (!entree.isIntersecting) return;
        observateur.unobserve(entree.target);
        animeZone(entree.target as HTMLElement);
      });
    },
    { threshold: 0.2 }
  );
  zones.forEach((zone) => observateurZones.observe(zone));

  // --- 3. L'en-tête ---
  let demande = 0;
  const auDefilement = () => {
    if (demande) return;
    demande = requestAnimationFrame(() => {
      demande = 0;
      if (window.scrollY > 80) racine.dataset.defile = "oui";
      else delete racine.dataset.defile;
    });
  };
  auDefilement();
  window.addEventListener("scroll", auDefilement, { passive: true });

  return () => {
    observateurBlocs?.disconnect();
    observateurZones.disconnect();
    window.removeEventListener("scroll", auDefilement);
    if (demande) cancelAnimationFrame(demande);
  };
}
