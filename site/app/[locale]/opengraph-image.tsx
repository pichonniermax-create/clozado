import { ImageResponse } from "next/og";
import { DEFAULT_LOCALE, getDictionary, isLocale, LOCALES } from "@/lib/i18n";
import { SITE_CONFIG } from "@/lib/site-config";

/**
 * L'IMAGE DE PARTAGE, générée AU BUILD (une par langue) : aucun rendu à la
 * requête, aucun fichier binaire versionné. Elle est faite de texte et
 * d'aplats — pas de photo, donc quelques kilo-octets.
 *
 * Elle porte la même chose que la page : la marque, la phrase d'accroche,
 * le domaine. Aucun chiffre, aucune promesse qui ne serait pas tenue par
 * la page elle-même.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = getDictionary(DEFAULT_LOCALE).common.meta.imagePartageAlt;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function Image(props: { params: Promise<{ locale: string }> }) {
  const { locale: brut } = await props.params;
  const locale = isLocale(brut) ? brut : DEFAULT_LOCALE;
  const { common, accueil } = getDictionary(locale);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0d1117",
          color: "#f0f2f4",
          padding: 80,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#3262c8",
              color: "#fbfcfd",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
            }}
          >
            {common.marque.charAt(0)}
          </div>
          <div style={{ fontSize: 38, letterSpacing: -0.5 }}>{common.marque}</div>
        </div>

        <div style={{ display: "flex", fontSize: 62, lineHeight: 1.15, letterSpacing: -1.5, maxWidth: 940 }}>
          {accueil.hero.titre}
        </div>

        <div style={{ display: "flex", fontSize: 28, color: "#9fa5b0" }}>
          {SITE_CONFIG.origin.replace("https://", "")}
        </div>
      </div>
    ),
    size
  );
}
