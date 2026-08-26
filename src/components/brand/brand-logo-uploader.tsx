"use client";

import { useState } from "react";
import { ImageUp } from "lucide-react";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { removeDarkLogoAction, removeLogoAction, saveLogoAction } from "@/lib/brand/actions";
import type { BrandAssetUrls } from "@/lib/brand/assets";
import { cn } from "@/lib/utils";

/**
 * Le téléversement du logo (chantier marque blanche, étape 2). Tout le
 * travail d'image se fait ICI, dans le navigateur : l'image choisie (PNG,
 * JPEG, WebP, GIF, SVG) est dessinée sur un canevas, réduite à 1 200 × 400
 * au plus, rendue en PNG ; un SVG est rastérisé au passage (plus rien à
 * nettoyer côté serveur). L'icône est dérivée du logo : le logo posé
 * « contenu » dans un carré transparent de 128 × 128. Aucune dépendance.
 *
 * L'aperçu est EN SITUATION : la barre latérale, la page de connexion, un
 * email — pas une vignette. Sans logo, c'est la marque par défaut.
 */
const MAX_W = 1200;
const MAX_H = 400;
const ICON_SIZE = 128;
const MAX_BYTES = 400_000;

type Prepared = { dataUrl: string; width: number; height: number };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("L'image n'a pas pu être lue."));
    };
    img.src = url;
  });
}

/** Le PNG doit tenir dans la limite : au-delà, on réduit encore (30 % à chaque essai). */
function toPng(draw: (scale: number) => HTMLCanvasElement): Prepared {
  let scale = 1;
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = draw(scale);
    const dataUrl = canvas.toDataURL("image/png");
    const bytes = Math.floor(((dataUrl.length - "data:image/png;base64,".length) * 3) / 4);
    if (bytes <= MAX_BYTES || attempt === 3) return { dataUrl, width: canvas.width, height: canvas.height };
    scale *= 0.7;
  }
  throw new Error("L'image reste trop lourde.");
}

async function prepareLogo(file: File): Promise<Prepared> {
  const img = await loadImage(file);
  const naturalW = img.naturalWidth || MAX_W;
  const naturalH = img.naturalHeight || MAX_H;
  const fit = Math.min(1, MAX_W / naturalW, MAX_H / naturalH);
  return toPng((scale) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalW * fit * scale));
    canvas.height = Math.max(1, Math.round(naturalH * fit * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Le navigateur ne sait pas dessiner l'image.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  });
}

/** L'icône : le logo « contenu » dans un carré transparent — un logo large devient une bande centrée, c'est voulu. */
async function prepareIcon(logo: Prepared): Promise<Prepared> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("L'icône n'a pas pu être dérivée."));
    img.src = logo.dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Le navigateur ne sait pas dessiner l'image.");
  const fit = Math.min((ICON_SIZE - 8) / logo.width, (ICON_SIZE - 8) / logo.height);
  const w = logo.width * fit;
  const h = logo.height * fit;
  ctx.drawImage(img, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);
  return { dataUrl: canvas.toDataURL("image/png"), width: ICON_SIZE, height: ICON_SIZE };
}

export function BrandLogoUploader({
  organizationName,
  urls,
  disabled,
  brandHex,
}: {
  organizationName: string;
  /** Les images déjà enregistrées, avec leur version dans l'adresse. */
  urls: BrandAssetUrls;
  disabled?: boolean;
  /** La couleur de marque enregistrée, pour le bouton de l'aperçu email. */
  brandHex: string;
}) {
  const [light, setLight] = useState<Prepared | null>(null);
  const [dark, setDark] = useState<Prepared | null>(null);
  const [icon, setIcon] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lightSrc = light?.dataUrl ?? urls.logo_light ?? null;
  const darkSrc = dark?.dataUrl ?? urls.logo_dark ?? null;
  const iconSrc = icon?.dataUrl ?? urls.icon ?? null;
  const onDarkSrc = darkSrc ?? lightSrc;
  const hasSaved = Boolean(urls.logo_light || urls.logo_dark);

  const onFile = async (file: File | undefined, variant: "light" | "dark") => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const prepared = await prepareLogo(file);
      if (variant === "light") {
        setLight(prepared);
        setIcon(await prepareIcon(prepared));
      } else {
        setDark(prepared);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'image n'a pas pu être préparée.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <form action={saveLogoAction} className="flex flex-col gap-4">
        <input type="hidden" name="logoLight" value={light?.dataUrl ?? ""} />
        <input type="hidden" name="logoDark" value={dark?.dataUrl ?? ""} />
        <input type="hidden" name="icon" value={icon?.dataUrl ?? ""} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Logo (pour fond clair)" htmlFor="logo-light" hint="PNG, JPEG, WebP ou SVG. Redimensionné ici même, jamais déformé. L'icône d'onglet en est dérivée.">
            <input
              id="logo-light"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              disabled={disabled || busy}
              onChange={(e) => onFile(e.target.files?.[0], "light")}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-2.5 file:py-1 file:text-sm file:font-medium hover:file:bg-muted"
            />
          </Field>
          <Field label="Logo pour fond sombre (facultatif)" htmlFor="logo-dark" hint="Utilisé sur les fonds sombres (emails, thème sombre). Sans lui, la version claire sert partout.">
            <input
              id="logo-dark"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              disabled={disabled || busy}
              onChange={(e) => onFile(e.target.files?.[0], "dark")}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-2.5 file:py-1 file:text-sm file:font-medium hover:file:bg-muted"
            />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {(light || dark) && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {light ? `Logo prêt : ${light.width} × ${light.height} px. ` : ""}
            {dark ? `Version sombre prête : ${dark.width} × ${dark.height} px. ` : ""}
            {icon ? `Icône dérivée : ${icon.width} × ${icon.height} px.` : ""}
          </p>
        )}
        {!disabled && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy || (!light && !dark)}>
              <ImageUp />
              Enregistrer le logo
            </Button>
          </div>
        )}
      </form>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium text-muted-foreground">Aperçu en situation</span>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <PreviewFrame label="Barre latérale">
            <div className="flex h-full flex-col gap-2 rounded-lg border border-sidebar-border bg-sidebar p-3">
              <LogoOrMark src={lightSrc} name={organizationName} />
              <div className="mt-1 flex flex-col gap-1">
                <span className="rounded-md bg-sidebar-accent px-2 py-1 text-xs font-medium text-sidebar-accent-foreground">Tableau de bord</span>
                <span className="px-2 py-1 text-xs text-muted-foreground">Contacts</span>
                <span className="px-2 py-1 text-xs text-muted-foreground">Affaires</span>
              </div>
            </div>
          </PreviewFrame>
          <PreviewFrame label="Page de connexion">
            <div className="flex h-full flex-col items-center gap-3 rounded-lg bg-muted/40 p-4">
              <LogoOrMark src={lightSrc} name={organizationName} size="lg" />
              <div className="w-full rounded-lg border border-border bg-card p-3">
                <div className="mb-2 h-2.5 w-24 rounded bg-foreground/80" />
                <div className="mb-3 h-2 w-40 rounded bg-muted-foreground/30" />
                <div className="h-7 w-full rounded-md bg-primary" />
              </div>
            </div>
          </PreviewFrame>
          <PreviewFrame label="Email">
            <div className="flex h-full flex-col gap-3 rounded-lg border border-border bg-white p-4" style={{ color: "#1f2937" }}>
              {lightSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lightSrc} alt={organizationName} className="h-8 w-auto max-w-full self-start object-contain" />
              ) : (
                <span className="text-base font-bold">{organizationName}</span>
              )}
              <span className="text-sm">Bonjour Camille,</span>
              <span className="h-2 w-5/6 rounded bg-neutral-200" />
              <span className="h-2 w-3/4 rounded bg-neutral-200" />
              <span className="mt-1 w-fit rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: brandHex }}>
                Prendre rendez-vous
              </span>
            </div>
          </PreviewFrame>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <PreviewFrame label="Sur fond sombre">
            <div className="flex h-full items-center justify-center rounded-lg p-4" style={{ backgroundColor: "#12151c" }}>
              {onDarkSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={onDarkSrc} alt={organizationName} className="h-8 w-auto max-w-full object-contain" />
              ) : (
                <span className="text-sm font-semibold text-white">{organizationName}</span>
              )}
            </div>
            {!darkSrc && lightSrc && <span className="text-[0.6875rem] text-muted-foreground">Version sombre non fournie : la version claire est utilisée.</span>}
          </PreviewFrame>
          <PreviewFrame label="Icône d'onglet">
            <div className="flex h-full items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <span className="flex size-8 items-center justify-center rounded-md border border-border bg-white">
                {iconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconSrc} alt="" className="size-6 object-contain" />
                ) : (
                  <span className="flex size-5 items-center justify-center rounded-sm bg-primary text-[0.5rem] font-bold text-primary-foreground">C</span>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">{organizationName} — Tableau de bord</span>
            </div>
          </PreviewFrame>
        </div>
      </div>

      {hasSaved && !disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <form action={removeLogoAction}>
            <Button type="submit" variant="ghost" size="sm">
              Retirer le logo
            </Button>
          </form>
          {urls.logo_dark && (
            <form action={removeDarkLogoAction}>
              <Button type="submit" variant="ghost" size="sm">
                Retirer la version sombre
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <div className="min-h-32">{children}</div>
    </div>
  );
}

function LogoOrMark({ src, name, size = "sm" }: { src: string | null; name: string; size?: "sm" | "lg" }) {
  if (!src) return <BrandMark size={size} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} className={cn("w-auto max-w-full object-contain", size === "lg" ? "h-10" : "h-8")} />
  );
}
