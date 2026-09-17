"use client";

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * LE CHAMP DE SAISIE DU SOCLE — composant client depuis le chantier
 * « champs de saisie » du 2026-09-17, pour porter UNE FOIS ce que chaque
 * champ numérique du produit devait savoir :
 *
 * - la molette ne change jamais la valeur d'un champ nombre. Constaté en
 *   production : sur la fiche affaire, un montant estimé est passé de
 *   100 000 à 100 139 pendant un simple défilement de page, parce que le
 *   champ avait le focus. Les navigateurs n'incrémentent qu'un champ
 *   FOCALISÉ : on lui retire le focus le temps de l'événement, puis on le
 *   lui rend sans faire défiler jusqu'à lui — la page défile, la valeur
 *   reste. Les flèches haut et bas du clavier, elles, restent actives :
 *   c'est un geste volontaire ;
 * - pas de flèches d'incrément (spinners), dans les deux moteurs de rendu
 *   (`appearance: textfield` pour Gecko, les pseudo-éléments WebKit/Blink
 *   masqués) ;
 * - un champ DATE (date, date et heure, mois, semaine, heure) ouvre son
 *   sélecteur d'un clic n'importe où dans le champ (`showPicker()`), pas
 *   seulement sur l'icône du calendrier — la saisie au clavier reste
 *   possible (Échap referme le sélecteur, les segments se tapent). Un clic
 *   sur la zone de l'icône garde le comportement natif (qui ouvre déjà),
 *   pour ne pas ouvrir puis refermer. L'icône elle-même est agrandie
 *   (Chromium/WebKit : le pseudo-élément prend une marge cliquable).
 */
const NUMBER_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none";

function keepValueOnWheel(event: React.WheelEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (document.activeElement !== input) return;
  input.blur();
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

const DATE_TYPES = new Set(["date", "datetime-local", "month", "week", "time"]);
const DATE_CLASS =
  "[&::-webkit-calendar-picker-indicator]:-my-1 [&::-webkit-calendar-picker-indicator]:-mr-1.5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:rounded-md [&::-webkit-calendar-picker-indicator]:p-1.5 [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:transition-opacity [&:hover::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:hover:bg-muted dark:[&::-webkit-calendar-picker-indicator]:invert";
/** La zone de l'icône native, en bout de champ : un clic dedans ouvre déjà le sélecteur — on n'y ajoute rien. */
const INDICATOR_ZONE_PX = 40;

function openPickerOnClick(event: React.MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (input.disabled || input.readOnly || typeof input.showPicker !== "function") return;
  if (event.clientX >= input.getBoundingClientRect().right - INDICATOR_ZONE_PX) return;
  try {
    input.showPicker();
  } catch {
    // Déjà ouvert, ou refusé par le navigateur (sans geste, hors fenêtre) : le comportement natif reste.
  }
}

function Input({ className, type, onWheel, onClick, ...props }: React.ComponentProps<"input">) {
  const isNumber = type === "number";
  const isDate = type !== undefined && DATE_TYPES.has(type);
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        isNumber && NUMBER_CLASS,
        isDate && DATE_CLASS,
        className
      )}
      onWheel={
        isNumber
          ? (event) => {
              keepValueOnWheel(event);
              onWheel?.(event);
            }
          : onWheel
      }
      onClick={
        isDate
          ? (event) => {
              openPickerOnClick(event);
              onClick?.(event);
            }
          : onClick
      }
      {...props}
    />
  )
}

export { Input }
