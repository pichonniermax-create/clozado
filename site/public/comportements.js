/*
 * LE COMPORTEMENT DU SITE — en entier, dans un seul fichier, sans librairie
 * et sans framework.
 *
 * Ce fichier a remplacé React dans le navigateur le 2026-09-21. Le site
 * embarquait 214 Kio de socle (React, le routeur, la charge d'hydratation)
 * pour QUATRE comportements ; aucune des quatorze pages ne tenait le plafond
 * de 160 Kio qu'on s'était donné. React reste l'outil qui CONSTRUIT les
 * pages — le JSX, les composants, les écrans redessinés n'ont pas bougé —,
 * il ne part simplement plus chez le visiteur : `next build` rend du HTML,
 * `scripts/depouiller.mjs` retire ce qui ne servait qu'à l'hydrater, et ce
 * fichier-ci reprend les comportements à son compte.
 *
 * CINQ COMPORTEMENTS, et pas un de plus :
 *   1. le déroulant de la barre de navigation ;
 *   2. les onglets du premier écran de l'accueil ;
 *   3. l'entrée des blocs au défilement, les compteurs, les barres ;
 *   4. l'état resserré de l'en-tête ;
 *   5. le sommaire d'un article, qui suit la lecture.
 *
 * DEUX RÈGLES TENUES ICI :
 *   — RIEN N'EST CACHÉ SANS SCRIPT. Tout le CSS qui masque est conditionné
 *     par `[data-mouvement]`, posé par un script synchrone en tête de page,
 *     et ce drapeau se retire seul au bout de 2,5 s si ce fichier n'a pas
 *     répondu (`data-anime`). Une page dont le script échoue reste entière.
 *   — UNE SEULE FOIS. Une cible entrée est retirée de son observateur :
 *     remonter la page ne rejoue rien, une liste comptée ne recompte pas.
 *
 * Il est chargé en `defer` : le document est analysé quand il s'exécute,
 * et il ne bloque pas le premier rendu. Le marquage de la page courante,
 * lui, n'est PAS ici — il est écrit en clair dans l'en-tête, juste après la
 * barre, parce qu'il doit être posé avant la première peinture.
 */
(function () {
  "use strict";

  var racine = document.documentElement;
  var doux = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var CASCADE = 60; // ms entre deux voisins
  var DUREE_COMPTEUR = 600; // ms
  var DELAI_ENTREE = 120; // ms avant d'ouvrir un déroulant
  var DELAI_SORTIE = 280; // ms avant de le refermer
  var CYCLE = 6000; // ms entre deux vues des onglets

  function liste(racineDeRecherche, selecteur) {
    return Array.prototype.slice.call(racineDeRecherche.querySelectorAll(selecteur));
  }

  /* ------------------------------------------------------------------ *
   * 1. LES ÉCRANS QUI S'ANIMENT
   * ------------------------------------------------------------------ */

  /*
   * Un nombre en cours de comptage, écrit comme le modèle qu'il rejoindra :
   * si « 4 476 » sépare ses milliers par une espace, « 1 234 » aussi. Sans
   * cela, le compteur changerait de forme en arrivant à destination.
   */
  function formate(valeur, modele) {
    var trouve = modele.match(/\d(\D)\d{3}(?!\d)/);
    var chiffres = String(valeur);
    return trouve ? chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, trouve[1]) : chiffres;
  }

  /** Compte de 0 à la valeur cible, en ralentissant (cubique). */
  function compte(element) {
    var cible = Number(element.getAttribute("data-compteur"));
    var modele = element.textContent || "";
    if (!isFinite(cible)) return;
    var depart = performance.now();
    var pas = function (maintenant) {
      var avancement = Math.min(1, (maintenant - depart) / DUREE_COMPTEUR);
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
   * comptent, ses barres se remplissent. Idempotente — les onglets et
   * l'observateur l'appellent tous les deux.
   */
  function animeZone(zone) {
    if (zone.getAttribute("data-anime") === "oui") return;
    zone.setAttribute("data-anime", "oui");

    var lignes = liste(zone, "[data-ligne]");
    if (doux) {
      lignes.forEach(function (ligne) {
        ligne.classList.add("est-visible");
      });
      zone.classList.add("est-anime");
      return;
    }

    lignes.forEach(function (ligne, rang) {
      ligne.style.setProperty("--delai", rang * CASCADE + "ms");
      ligne.classList.add("est-visible");
    });
    // Les barres partent avec la première ligne ; le CSS porte leur délai.
    zone.classList.add("est-anime");
    liste(zone, "[data-compteur]").forEach(compte);
  }

  /* ------------------------------------------------------------------ *
   * 2. L'ENTRÉE DES BLOCS, LES ÉCRANS AUTONOMES, L'EN-TÊTE
   * ------------------------------------------------------------------ */

  function installerMouvement() {
    // Le module a répondu : le filet posé en tête de page n'a plus lieu d'agir.
    racine.setAttribute("data-anime", "1");

    var blocs = liste(document, "[data-entree]");
    if (doux) {
      blocs.forEach(function (bloc) {
        bloc.classList.add("est-visible");
      });
    } else if (blocs.length > 0) {
      var observateurBlocs = new IntersectionObserver(
        function (entrees, observateur) {
          entrees.forEach(function (entree) {
            if (!entree.isIntersecting) return;
            var bloc = entree.target;
            observateur.unobserve(bloc); // une seule fois, jamais au retour
            bloc.style.setProperty("--delai", Number(bloc.getAttribute("data-rang") || 0) * CASCADE + "ms");
            bloc.classList.add("est-visible");
          });
        },
        // Un bloc entre quand son premier dixième dépasse le bas de l'écran.
        { threshold: 0.1, rootMargin: "0px 0px -8% 0px" }
      );
      blocs.forEach(function (bloc) {
        observateurBlocs.observe(bloc);
      });
    }

    // Les écrans hors onglets : ceux des onglets s'animent quand leur vue
    // devient active, sans quoi les trois compteraient en même temps.
    var zones = liste(document, "[data-ecran]").filter(function (zone) {
      return !zone.closest("[data-onglets]");
    });
    if (zones.length > 0) {
      var observateurZones = new IntersectionObserver(
        function (entrees, observateur) {
          entrees.forEach(function (entree) {
            if (!entree.isIntersecting) return;
            observateur.unobserve(entree.target);
            animeZone(entree.target);
          });
        },
        { threshold: 0.2 }
      );
      zones.forEach(function (zone) {
        observateurZones.observe(zone);
      });
    }

    // L'en-tête : au-delà de 80 px, elle se resserre et pose son filet.
    var demande = 0;
    var auDefilement = function () {
      if (demande) return;
      demande = requestAnimationFrame(function () {
        demande = 0;
        if (window.scrollY > 80) racine.setAttribute("data-defile", "oui");
        else racine.removeAttribute("data-defile");
      });
    };
    auDefilement();
    window.addEventListener("scroll", auDefilement, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * 3. LE DÉROULANT DE LA BARRE
   * ------------------------------------------------------------------ */

  /*
   * IL SE FERME DE SIX FAÇONS : clic ailleurs, Échap (qui rend le focus au
   * lien parent), défilement, sortie du curseur après un délai, seconde
   * pression au toucher — et la navigation, qui ne coûte plus rien depuis
   * que chaque page se charge entière : le panneau naît fermé.
   *
   * LES DEUX DÉLAIS NE SONT PAS SYMÉTRIQUES : 120 ms pour ouvrir — assez
   * pour qu'un curseur qui traverse la barre n'ouvre pas tout sur son
   * passage —, 280 ms pour fermer, parce qu'il y a un vide de 8 px entre le
   * lien et le panneau et qu'un menu qui se referme pendant qu'on le
   * traverse est un menu qu'on n'atteint pas.
   *
   * TANT QUE `data-js` N'EST PAS POSÉ, le repli CSS (survol, `:focus-within`)
   * garde le panneau atteignable. Le menu n'est jamais mort.
   */
  function installerDeroulant(groupe) {
    var lien = groupe.querySelector("[data-deroulant-lien]");
    var panneau = groupe.querySelector("[data-deroulant-panneau]");
    if (!lien || !panneau) return;
    var minuteur = 0;

    groupe.setAttribute("data-js", "1");

    function ouvert() {
      return groupe.getAttribute("data-ouvert") === "oui";
    }
    function poser(valeur) {
      window.clearTimeout(minuteur);
      groupe.setAttribute("data-ouvert", valeur ? "oui" : "non");
      lien.setAttribute("aria-expanded", valeur ? "true" : "false");
    }
    function planifier(valeur, delai) {
      window.clearTimeout(minuteur);
      minuteur = window.setTimeout(function () {
        poser(valeur);
      }, delai);
    }
    function fermer() {
      if (ouvert()) poser(false);
      else window.clearTimeout(minuteur);
    }

    groupe.addEventListener("pointerenter", function (evenement) {
      if (evenement.pointerType !== "mouse") return;
      planifier(true, DELAI_ENTREE);
    });
    groupe.addEventListener("pointerleave", function (evenement) {
      if (evenement.pointerType !== "mouse") return;
      planifier(false, DELAI_SORTIE);
    });

    document.addEventListener("pointerdown", function (evenement) {
      if (ouvert() && !groupe.contains(evenement.target)) fermer();
    });
    document.addEventListener("keydown", function (evenement) {
      if (evenement.key !== "Escape" || !ouvert()) return;
      fermer();
      lien.focus();
    });
    window.addEventListener(
      "scroll",
      function () {
        if (ouvert()) fermer();
      },
      { passive: true }
    );

    /** Au toucher, il n'y a pas de survol : le premier appui ouvre, le second suit le lien. */
    lien.addEventListener("click", function (evenement) {
      if (!window.matchMedia("(hover: none)").matches) return;
      if (ouvert()) return;
      evenement.preventDefault();
      poser(true);
    });

    /** Les flèches parcourent le panneau ; Échap en sort par le lien parent. */
    groupe.addEventListener("keydown", function (evenement) {
      var touche = evenement.key;
      if (touche !== "ArrowDown" && touche !== "ArrowUp" && touche !== "Home" && touche !== "End") return;
      evenement.preventDefault();
      poser(true);
      // Le panneau vient peut-être d'apparaître : on attend la peinture.
      requestAnimationFrame(function () {
        var items = liste(panneau, "a");
        if (items.length === 0) return;
        var actuel = items.indexOf(document.activeElement);
        var cible;
        if (touche === "Home") cible = 0;
        else if (touche === "End") cible = items.length - 1;
        else if (touche === "ArrowDown") cible = actuel < 0 ? 0 : Math.min(actuel + 1, items.length - 1);
        else cible = actuel <= 0 ? -1 : actuel - 1;
        if (cible < 0) lien.focus();
        else items[cible].focus();
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. LES ONGLETS DU PREMIER ÉCRAN
   * ------------------------------------------------------------------ */

  /*
   * Le cycle existe pour dire qu'il y a TROIS écrans à voir : sans lui, deux
   * restent invisibles à qui ne clique pas. Il s'arrête DÉFINITIVEMENT dès
   * que la personne prend la main — un clic, une entrée de souris, ou un
   * focus au clavier. Il ne démarre pas du tout si le système demande moins
   * de mouvement : la première vue reste affichée, les onglets marchent.
   */
  function installerOnglets(groupe) {
    var onglets = liste(groupe, '[role="tab"]');
    var vues = liste(groupe, '[role="tabpanel"]');
    if (onglets.length === 0 || onglets.length !== vues.length) return;

    var actif = 0;
    var minuteur = 0;

    function choisir(rang) {
      actif = rang;
      onglets.forEach(function (onglet, index) {
        var estActif = index === rang;
        onglet.setAttribute("aria-selected", estActif ? "true" : "false");
        onglet.setAttribute("tabindex", estActif ? "0" : "-1");
        onglet.className = estActif ? onglet.getAttribute("data-classe-active") : onglet.getAttribute("data-classe");
      });
      vues.forEach(function (vue, index) {
        vue.setAttribute("data-actif", index === rang ? "oui" : "non");
      });
      var zone = vues[rang].querySelector("[data-ecran]");
      if (zone) animeZone(zone);
    }

    function arreter() {
      if (!minuteur) return;
      window.clearInterval(minuteur);
      minuteur = 0;
    }

    groupe.addEventListener("mouseenter", arreter);
    groupe.addEventListener("focusin", arreter);

    onglets.forEach(function (onglet, rang) {
      onglet.addEventListener("click", function () {
        arreter();
        choisir(rang);
      });
    });

    /** Les flèches parcourent les onglets, comme l'attend le motif « tablist ». */
    var listeOnglets = groupe.querySelector('[role="tablist"]');
    if (listeOnglets) {
      listeOnglets.addEventListener("keydown", function (evenement) {
        var nombre = onglets.length;
        var cible = null;
        if (evenement.key === "ArrowRight") cible = (actif + 1) % nombre;
        else if (evenement.key === "ArrowLeft") cible = (actif - 1 + nombre) % nombre;
        else if (evenement.key === "Home") cible = 0;
        else if (evenement.key === "End") cible = nombre - 1;
        if (cible === null) return;
        evenement.preventDefault();
        arreter();
        choisir(cible);
        onglets[cible].focus();
      });
    }

    // La première vue s'anime dès que l'écran est en vue, comme les autres.
    var premiere = vues[0].querySelector("[data-ecran]");
    if (premiere) {
      var observateur = new IntersectionObserver(
        function (entrees, lui) {
          entrees.forEach(function (entree) {
            if (!entree.isIntersecting) return;
            lui.unobserve(entree.target);
            animeZone(entree.target);
          });
        },
        { threshold: 0.2 }
      );
      observateur.observe(premiere);
    }

    if (!doux) {
      minuteur = window.setInterval(function () {
        choisir((actif + 1) % onglets.length);
      }, CYCLE);
    }
  }

  /* ------------------------------------------------------------------ *
   * 5. LE SOMMAIRE D'UN ARTICLE
   * ------------------------------------------------------------------ */

  /*
   * UNE SEULE MESURE, et elle regarde le HAUT de la fenêtre : la section en
   * cours est le dernier titre passé sous le quart supérieur — pas celle qui
   * occupe le plus de place à l'écran. Sans script, c'est une liste d'ancres
   * qui fonctionne ; elle ne souligne simplement pas la section en cours.
   */
  function installerSommaire(sommaire) {
    var liens = liste(sommaire, "a[href^='#']");
    var cibles = liens
      .map(function (lien) {
        return document.getElementById(decodeURIComponent(lien.getAttribute("href").slice(1)));
      })
      .filter(Boolean);
    if (cibles.length === 0 || cibles.length !== liens.length) return;

    var dernier = -1;
    var mesurer = function () {
      var limite = window.innerHeight * 0.25;
      var courant = 0;
      for (var index = 0; index < cibles.length; index++) {
        if (cibles[index].getBoundingClientRect().top <= limite) courant = index;
      }
      if (courant === dernier) return;
      dernier = courant;
      liens.forEach(function (lien, index) {
        if (index === courant) lien.setAttribute("aria-current", "true");
        else lien.removeAttribute("aria-current");
      });
    };

    mesurer();
    window.addEventListener("scroll", mesurer, { passive: true });
    window.addEventListener("resize", mesurer, { passive: true });
  }

  /* ------------------------------------------------------------------ */

  liste(document, "[data-deroulant]").forEach(installerDeroulant);
  liste(document, "[data-onglets]").forEach(installerOnglets);
  liste(document, "[data-sommaire]").forEach(installerSommaire);
  installerMouvement();
})();
