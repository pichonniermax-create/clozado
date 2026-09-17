"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { containRect, MAX_ZOOM, pan, withZoom, zoomOf, type CropRect, type Size } from "@/lib/brand/crop";
import { cn } from "@/lib/utils";

/**
 * LE CADRE DE CADRAGE (correctif du chantier C partie 1, 2026-09-17) : un
 * cadre de proportion fixe — la source se déplace dessous (glisser, ou les
 * flèches du clavier) et se zoome (curseur, boutons, + et −). Ce qui est
 * dans le cadre est ce que le logo deviendra : la géométrie vit dans
 * `src/lib/brand/crop.ts`, ce composant la dessine par des pourcentages
 * (l'image est posée par rapport au cadre, sans mesurer l'écran). Aucune
 * dépendance.
 */
export type LogoCropperLabels = {
  zoom: string;
  agrandir: string;
  reduire: string;
  cadrerTout: string;
  glisser: string;
};

const ZOOM_STEP = 0.25;

export function LogoCropper({
  src,
  source,
  ratio,
  value,
  onChange,
  labels,
  /** Un fond sombre sous le cadre (la version sombre se juge sur du sombre). */
  dark = false,
  className,
}: {
  src: string;
  source: Size;
  ratio: number;
  value: CropRect;
  onChange: (rect: CropRect) => void;
  labels: LogoCropperLabels;
  dark?: boolean;
  className?: string;
}) {
  const drag = useRef<{ x: number; y: number; rect: CropRect; width: number } | null>(null);
  const zoom = zoomOf(value, source, ratio);
  const setZoom = (z: number) => onChange(withZoom(value, z, source, ratio));

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, rect: value, width: event.currentTarget.getBoundingClientRect().width };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    // Un pixel d'écran vaut `rect.w / largeur du cadre` pixels de source ; l'image suit le doigt, le cadre va en sens inverse.
    const unit = d.rect.w / Math.max(1, d.width);
    onChange(pan(d.rect, -(event.clientX - d.x) * unit, -(event.clientY - d.y) * unit, source));
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = value.w * 0.02;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (event.key in moves) {
      event.preventDefault();
      onChange(pan(value, ...moves[event.key], source));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoom(zoom + ZOOM_STEP);
    } else if (event.key === "-") {
      event.preventDefault();
      setZoom(zoom - ZOOM_STEP);
    }
  }

  const pct = (n: number) => `${n * 100}%`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="application"
        aria-label={labels.glisser}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        style={{ aspectRatio: String(ratio) }}
        className={cn(
          "relative w-full cursor-grab touch-none overflow-hidden rounded-lg border-2 border-ring/60 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
          // Un damier : la transparence se voit.
          dark ? "bg-[#12151c]" : "bg-[length:16px_16px] bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%,transparent_75%,var(--muted)_75%),linear-gradient(45deg,var(--muted)_25%,transparent_25%,transparent_75%,var(--muted)_75%)] bg-[position:0_0,8px_8px] bg-card"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- la source à cadrer, dessinée par rapport au cadre */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none"
          style={{ left: pct(-value.x / value.w), top: pct(-value.y / value.h), width: pct(source.width / value.w) }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon-sm" aria-label={labels.reduire} title={labels.reduire} onClick={() => setZoom(zoom - ZOOM_STEP)} disabled={zoom <= 1}>
          <Minus />
        </Button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          aria-label={labels.zoom}
          className="h-2 min-w-32 flex-1 cursor-pointer accent-primary"
        />
        <Button type="button" variant="outline" size="icon-sm" aria-label={labels.agrandir} title={labels.agrandir} onClick={() => setZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}>
          <Plus />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(containRect(source, ratio))}>
          <Maximize2 />
          {labels.cadrerTout}
        </Button>
      </div>
    </div>
  );
}
