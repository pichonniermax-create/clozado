import { drawPlacement, opaqueBounds, outputSize, type CropRect, type Size } from "./crop";
import { AppError } from "@/lib/errors";

/**
 * LE RENDU D'UN CADRE, dans le navigateur (canevas) — correctif cadrage
 * du logo, 2026-09-17. Ce que le cadre contient, à une taille bornée ;
 * pour le logo, les marges entièrement transparentes sont retirées (un
 * logo carré cadré dans un 3:1 ressort carré, pas bordé de vide) ; le PNG
 * est réduit tant qu'il dépasse le poids maximal. Aucune dépendance.
 */
export type Rendered = { dataUrl: string; width: number; height: number };

const PNG_PREFIX = "data:image/png;base64,";
export const pngBytes = (dataUrl: string) => Math.floor(((dataUrl.length - PNG_PREFIX.length) * 3) / 4);

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AppError("le_navigateur_ne_sait_pas_dessiner_l_d979");
  return [canvas, ctx];
}

/** Une image chargée depuis une adresse (fichier local ou notre route /brand, même origine). */
export function loadImageFrom(url: string, error: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new AppError(error));
    img.src = url;
  });
}

/**
 * La SOURCE : l'image choisie, rastérisée en PNG (un SVG au passage),
 * réduite à `maxSide` au plus et au poids maximal — c'est elle qui est
 * conservée pour recadrer plus tard.
 */
export function rasterizeSource(img: HTMLImageElement, maxSide: number, maxBytes: number): Rendered {
  const naturalW = img.naturalWidth || maxSide;
  const naturalH = img.naturalHeight || maxSide;
  let scale = Math.min(1, maxSide / naturalW, maxSide / naturalH);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [canvas, ctx] = canvasOf(naturalW * scale, naturalH * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    if (pngBytes(dataUrl) <= maxBytes || attempt === 4) return { dataUrl, width: canvas.width, height: canvas.height };
    scale *= 0.7;
  }
  throw new AppError("l_image_reste_trop_lourde");
}

/** Le rendu d'un cadre sur une source : borné à `max`, marges transparentes retirées si `trim`, poids borné. */
export function renderCrop(img: HTMLImageElement, source: Size, rect: CropRect, max: Size, trim: boolean, maxBytes: number): Rendered {
  let shrink = 1;
  for (let attempt = 0; attempt < 5; attempt++) {
    const out = outputSize(rect, { width: max.width * shrink, height: max.height * shrink });
    const [canvas, ctx] = canvasOf(out.width, out.height);
    const p = drawPlacement(rect, source, { width: canvas.width, height: canvas.height });
    ctx.drawImage(img, p.dx, p.dy, p.dw, p.dh);
    let result = canvas;
    if (trim) {
      const bounds = opaqueBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (bounds && (bounds.w < canvas.width || bounds.h < canvas.height)) {
        const [trimmed, tctx] = canvasOf(bounds.w, bounds.h);
        tctx.drawImage(canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
        result = trimmed;
      }
    }
    const dataUrl = result.toDataURL("image/png");
    if (pngBytes(dataUrl) <= maxBytes || attempt === 4) return { dataUrl, width: result.width, height: result.height };
    shrink *= 0.7;
  }
  throw new AppError("l_image_reste_trop_lourde");
}
