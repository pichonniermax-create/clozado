"use client";

import { useEffect, useState } from "react";
import { Crop, ImageUp } from "lucide-react";
import { WorkspaceMark } from "@/components/app-shell/workspace-mark";
import { LogoCropper, type LogoCropperLabels } from "@/components/brand/logo-cropper";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { removeDarkLogoAction, removeLogoAction, saveLogoAction } from "@/lib/brand/actions";
import type { BrandAssetUrls } from "@/lib/brand/assets";
import { containRect, type CropRect, type Size } from "@/lib/brand/crop";
import { loadImageFrom, rasterizeSource, renderCrop, type Rendered } from "@/lib/brand/render-crop";
import { useTranslations } from "next-intl";

/**
 * Le téléversement du logo (chantier marque blanche, étape 2), avec le
 * CADRAGE (correctif du chantier C partie 1, 2026-09-17). Tout le travail
 * d'image se fait ICI, dans le navigateur, sans dépendance :
 *
 * 1. l'image choisie (PNG, JPEG, WebP, GIF, SVG) est rastérisée en PNG —
 *    la SOURCE, 1 600 px au plus — et conservée en base : recadrer plus
 *    tard ne demande pas de renvoyer le fichier ;
 * 2. deux cadres sur cette source : le LOGO (3:1 — barre latérale, page de
 *    partage, emails) et l'ICÔNE d'onglet (carré) ; on zoome et on
 *    repositionne dans chacun ; la version sombre a son propre cadre 3:1 ;
 * 3. ce que les cadres contiennent est rendu à taille bornée (1 200 × 400,
 *    128 × 128), le logo débarrassé de ses marges transparentes, le poids
 *    borné — et c'est CE rendu que les aperçus en situation montrent (la
 *    barre latérale par `WorkspaceMark`, le composant même de la coquille,
 *    la page de partage, un email, un fond sombre, l'onglet) et que le
 *    serveur reçoit, cadres compris.
 */
const LOGO_RATIO = 3;
const LOGO_MAX: Size = { width: 1200, height: 400 };
const ICON_MAX: Size = { width: 128, height: 128 };
const SOURCE_MAX_SIDE = 1600;
const SOURCE_MAX_BYTES = 1_000_000;
const OUTPUT_MAX_BYTES = 400_000;

type Source = { img: HTMLImageElement; size: Size; url: string; /** L'image à envoyer — null quand la source est déjà enregistrée. */ dataUrl: string | null };
export type BrandCrops = Partial<Record<"logo_light" | "logo_dark" | "icon", CropRect | null>>;

async function sourceFromFile(file: File): Promise<Source> {
  const url = URL.createObjectURL(file);
  try {
    const chosen = await loadImageFrom(url, "l_image_n_a_pas_pu_etre_f192");
    const raster = rasterizeSource(chosen, SOURCE_MAX_SIDE, SOURCE_MAX_BYTES);
    const img = await loadImageFrom(raster.dataUrl, "l_image_n_a_pas_pu_etre_f192");
    return { img, size: { width: raster.width, height: raster.height }, url: raster.dataUrl, dataUrl: raster.dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** La source déjà enregistrée, relue depuis notre route (même origine : le canevas reste utilisable). */
async function sourceFromUrl(url: string): Promise<Source> {
  const img = await loadImageFrom(url, "l_image_n_a_pas_pu_etre_f192");
  return { img, size: { width: img.naturalWidth, height: img.naturalHeight }, url, dataUrl: null };
}

export function BrandLogoUploader({
  organizationName,
  urls,
  crops = {},
  disabled,
  brandHex,
}: {
  organizationName: string;
  /** Les images déjà enregistrées, avec leur version dans l'adresse. */
  urls: BrandAssetUrls;
  /** Les cadres enregistrés avec les images dérivées — pour rouvrir le cadrage là où il a été laissé. */
  crops?: BrandCrops;
  disabled?: boolean;
  /** La couleur de marque enregistrée, pour le bouton de l'aperçu email. */
  brandHex: string;
}) {
  const t = useTranslations("brand.brandLogoUploader");
  const [lightSource, setLightSource] = useState<Source | null>(null);
  const [darkSource, setDarkSource] = useState<Source | null>(null);
  const [logoRect, setLogoRect] = useState<CropRect | null>(null);
  const [iconRect, setIconRect] = useState<CropRect | null>(null);
  const [darkRect, setDarkRect] = useState<CropRect | null>(null);
  // Chaque rendu garde le cadre dont il vient : tant que le cadre courant n'est pas celui du rendu, le rendu est en retard.
  const [light, setLight] = useState<{ rendered: Rendered; rect: CropRect } | null>(null);
  const [dark, setDark] = useState<{ rendered: Rendered; rect: CropRect } | null>(null);
  const [icon, setIcon] = useState<{ rendered: Rendered; rect: CropRect } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = Boolean((lightSource && (light?.rect !== logoRect || icon?.rect !== iconRect)) || (darkSource && dark?.rect !== darkRect));

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : t("l_image_n_a_pas_pu_3f3f"));

  // Les rendus suivent les cadres, un instant après le dernier geste (un glissement en produit soixante par seconde).
  useEffect(() => {
    if (!lightSource || !logoRect || !iconRect) return;
    const timer = setTimeout(() => {
      try {
        setLight({ rendered: renderCrop(lightSource.img, lightSource.size, logoRect, LOGO_MAX, true, OUTPUT_MAX_BYTES), rect: logoRect });
        setIcon({ rendered: renderCrop(lightSource.img, lightSource.size, iconRect, ICON_MAX, false, OUTPUT_MAX_BYTES), rect: iconRect });
      } catch (e) {
        fail(e);
      }
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fail` ne change pas de sens d'un rendu à l'autre
  }, [lightSource, logoRect, iconRect]);
  useEffect(() => {
    if (!darkSource || !darkRect) return;
    const timer = setTimeout(() => {
      try {
        setDark({ rendered: renderCrop(darkSource.img, darkSource.size, darkRect, LOGO_MAX, true, OUTPUT_MAX_BYTES), rect: darkRect });
      } catch (e) {
        fail(e);
      }
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkSource, darkRect]);

  const lightSrc = light?.rendered.dataUrl ?? urls.logo_light ?? null;
  const darkSrc = dark?.rendered.dataUrl ?? urls.logo_dark ?? null;
  const iconSrc = icon?.rendered.dataUrl ?? urls.icon ?? null;
  const onDarkSrc = darkSrc ?? lightSrc;
  const hasSaved = Boolean(urls.logo_light || urls.logo_dark);

  const startLight = (source: Source, logo: CropRect | null, iconCrop: CropRect | null) => {
    setLightSource(source);
    setLogoRect(logo ?? containRect(source.size, LOGO_RATIO));
    setIconRect(iconCrop ?? containRect(source.size, 1));
  };
  const startDark = (source: Source, rect: CropRect | null) => {
    setDarkSource(source);
    setDarkRect(rect ?? containRect(source.size, LOGO_RATIO));
  };

  const onFile = async (file: File | undefined, variant: "light" | "dark") => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const source = await sourceFromFile(file);
      if (variant === "light") startLight(source, null, null);
      else startDark(source, null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  /** « Recadrer » : la source enregistrée, avec les cadres tels qu'ils ont été laissés. */
  const recrop = async (variant: "light" | "dark") => {
    const url = variant === "light" ? urls.logo_light_source : urls.logo_dark_source;
    if (!url) return;
    setError(null);
    setBusy(true);
    try {
      const source = await sourceFromUrl(url);
      if (variant === "light") startLight(source, crops.logo_light ?? null, crops.icon ?? null);
      else startDark(source, crops.logo_dark ?? null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const cropperLabels: LogoCropperLabels = {
    zoom: t("zoom"),
    agrandir: t("agrandir"),
    reduire: t("reduire"),
    cadrerTout: t("cadrer_tout"),
    glisser: t("glisser_pour_repositionner"),
  };
  const fileClass =
    "block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-2.5 file:py-1 file:text-sm file:font-medium hover:file:bg-muted";

  return (
    <div className="flex flex-col gap-5">
      {/* `autoComplete="off"` : au rechargement, Chromium restaure les valeurs des champs — y compris des champs cachés
          portant un rendu périmé ; ici tout vient de l'état du composant, jamais du navigateur. */}
      <form action={saveLogoAction} autoComplete="off" className="flex flex-col gap-4">
        <input type="hidden" name="logoLight" value={light?.rendered.dataUrl ?? ""} />
        <input type="hidden" name="logoDark" value={dark?.rendered.dataUrl ?? ""} />
        <input type="hidden" name="icon" value={icon?.rendered.dataUrl ?? ""} />
        <input type="hidden" name="logoLightSource" value={lightSource?.dataUrl ?? ""} />
        <input type="hidden" name="logoDarkSource" value={darkSource?.dataUrl ?? ""} />
        <input type="hidden" name="cropLogo" value={logoRect ? JSON.stringify(logoRect) : ""} />
        <input type="hidden" name="cropIcon" value={iconRect ? JSON.stringify(iconRect) : ""} />
        <input type="hidden" name="cropDark" value={darkRect ? JSON.stringify(darkRect) : ""} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("logo_pour_fond_clair")} htmlFor="logo-light" hint={t("png_jpeg_webp_ou_svg_redimensionne_440f")}>
            <input
              id="logo-light"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              disabled={disabled || busy}
              onChange={(e) => onFile(e.target.files?.[0], "light")}
              className={fileClass}
            />
          </Field>
          <Field label={t("logo_pour_fond_sombre_facultatif")} htmlFor="logo-dark" hint={t("utilise_sur_les_fonds_sombres_emails_9157")}>
            <input
              id="logo-dark"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              disabled={disabled || busy}
              onChange={(e) => onFile(e.target.files?.[0], "dark")}
              className={fileClass}
            />
          </Field>
        </div>

        {/* Le cadrage : dès qu'une source est là (fichier choisi, ou « Recadrer » sur une source enregistrée). */}
        {lightSource && logoRect && iconRect && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-cadrage="light">
            <span className="text-xs font-medium text-muted-foreground">{t("cadrage")}</span>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[3fr_1fr]">
              <Field label={t("cadre_du_logo")} htmlFor="cadre-logo">
                <LogoCropper src={lightSource.url} source={lightSource.size} ratio={LOGO_RATIO} value={logoRect} onChange={setLogoRect} labels={cropperLabels} />
              </Field>
              <Field label={t("icone_d_onglet")} htmlFor="cadre-icone">
                <LogoCropper src={lightSource.url} source={lightSource.size} ratio={1} value={iconRect} onChange={setIconRect} labels={cropperLabels} />
              </Field>
            </div>
          </div>
        )}
        {darkSource && darkRect && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4" data-cadrage="dark">
            <Field label={t("cadre_version_sombre")} htmlFor="cadre-sombre">
              <LogoCropper src={darkSource.url} source={darkSource.size} ratio={LOGO_RATIO} value={darkRect} onChange={setDarkRect} labels={cropperLabels} dark className="md:max-w-[75%]" />
            </Field>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {(light || dark) && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {light ? t("logo_pret_px", { width: light.rendered.width, height: light.rendered.height }) : ""}{" "}
            {dark ? t("version_sombre_prete_px", { width: dark.rendered.width, height: dark.rendered.height }) : ""}{" "}
            {icon ? t("icone_derivee_px", { width: icon.rendered.width, height: icon.rendered.height }) : ""}
          </p>
        )}
        {!disabled && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy || pending || (!light && !dark)}>
              <ImageUp />
              {t("enregistrer_le_logo")}
            </Button>
            {/* Recadrer une image déjà enregistrée : sa source est en base, rien à renvoyer. */}
            {urls.logo_light_source && !lightSource && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => recrop("light")}>
                <Crop />
                {t("recadrer")}
              </Button>
            )}
            {urls.logo_dark_source && !darkSource && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => recrop("dark")}>
                <Crop />
                {t("recadrer_la_version_sombre")}
              </Button>
            )}
            {(urls.logo_light_source || urls.logo_dark_source) && <span className="text-xs text-muted-foreground">{t("source_conservee")}</span>}
          </div>
        )}
      </form>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium text-muted-foreground">{t("apercu_en_situation")}</span>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <PreviewFrame label={t("barre_laterale")}>
            <div className="flex h-full flex-col gap-2 rounded-lg border border-sidebar-border bg-sidebar p-3">
              <WorkspaceMark logo={lightSrc} name={organizationName} />
              <div className="mt-1 flex flex-col gap-1">
                {t.rich("tableau_de_bord_contacts_affaires", { span: (chunks) => <span className="rounded-md bg-sidebar-accent px-2 py-1 text-xs font-medium text-sidebar-accent-foreground">{chunks}</span>, span2: (chunks) => <span className="px-2 py-1 text-xs text-muted-foreground">{chunks}</span>, span3: (chunks) => <span className="px-2 py-1 text-xs text-muted-foreground">{chunks}</span> })}
              </div>
            </div>
          </PreviewFrame>
          <PreviewFrame label={t("page_de_partage")}>
            <div className="flex h-full flex-col rounded-lg bg-muted/40 p-4">
              <div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3">
                {lightSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lightSrc} alt={organizationName} className="h-7 w-auto max-w-full self-start object-contain" />
                ) : (
                  <span className="truncate text-sm font-semibold text-primary-ink">{organizationName}</span>
                )}
                <div className="h-2.5 w-24 rounded bg-foreground/80" />
                <div className="h-2 w-40 max-w-full rounded bg-muted-foreground/30" />
                <div className="mt-1 flex gap-2">
                  <div className="h-7 flex-1 rounded-md bg-primary" />
                  <div className="h-7 flex-1 rounded-md border border-border bg-background" />
                </div>
              </div>
            </div>
          </PreviewFrame>
          <PreviewFrame label={t("email")}>
            <div className="flex h-full flex-col gap-3 rounded-lg border border-border bg-white p-4" style={{ color: "#1f2937" }}>
              {lightSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lightSrc} alt={organizationName} className="h-8 w-auto max-w-full self-start object-contain" />
              ) : (
                <span className="text-base font-bold">{organizationName}</span>
              )}
              <span className="text-sm">{t("bonjour_camille")}</span>
              <span className="h-2 w-5/6 rounded bg-neutral-200" />
              <span className="h-2 w-3/4 rounded bg-neutral-200" />
              <span className="mt-1 w-fit rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: brandHex }}>
                {t("prendre_rendez_vous")}
              </span>
            </div>
          </PreviewFrame>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <PreviewFrame label={t("sur_fond_sombre")}>
            <div className="flex h-full items-center justify-center rounded-lg p-4" style={{ backgroundColor: "#12151c" }}>
              {onDarkSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={onDarkSrc} alt={organizationName} className="h-8 w-auto max-w-full object-contain" />
              ) : (
                <span className="text-sm font-semibold text-white">{organizationName}</span>
              )}
            </div>
            {!darkSrc && lightSrc && <span className="text-[0.6875rem] text-muted-foreground">{t("version_sombre_non_fournie_la_version_767a")}</span>}
          </PreviewFrame>
          <PreviewFrame label={t("icone_d_onglet")}>
            <div className="flex h-full items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <span className="flex size-8 items-center justify-center rounded-md border border-border bg-white">
                {iconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconSrc} alt="" className="size-6 object-contain" />
                ) : (
                  <span className="flex size-5 items-center justify-center rounded-sm bg-product text-[0.5rem] font-bold text-product-foreground">{t("c")}</span>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">{t("tableau_de_bord", { organizationName })}</span>
            </div>
          </PreviewFrame>
        </div>
      </div>

      {hasSaved && !disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <form action={removeLogoAction}>
            <Button type="submit" variant="ghost" size="sm">
              {t("retirer_le_logo")}
            </Button>
          </form>
          {urls.logo_dark && (
            <form action={removeDarkLogoAction}>
              <Button type="submit" variant="ghost" size="sm">
                {t("retirer_la_version_sombre")}
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
