import { ImageResponse } from "next/og";
import { DEFAULT_LOCALE, getDictionary } from "./i18n";
import { SITE_CONFIG } from "./site-config";

/**
 * L'IMAGE DE PARTAGE, une par page, générée AU BUILD : aucun rendu à la
 * requête, aucun binaire versionné, quelques dizaines de kilo-octets de
 * texte et d'aplats.
 *
 * Elle existe par page et pas seulement à la racine parce qu'une image
 * posée sur un segment parent n'est PAS reprise par ses enfants dès que
 * ceux-ci déclarent leur propre `openGraph` — constaté sur /fr/cgp, qui
 * partait sans vignette. Or ce sont justement les pages d'atterrissage de
 * la prospection.
 *
 * Elle ne porte aucun chiffre : rien qu'une page ne dise pas elle-même.
 */
export const TAILLE_PARTAGE = { width: 1200, height: 630 };
export const TYPE_PARTAGE = "image/png";

export function imagePartage({ titre, surtitre }: { titre: string; surtitre?: string }) {
  const { common } = getDictionary(DEFAULT_LOCALE);
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

        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
          {surtitre && (
            <div style={{ display: "flex", fontSize: 24, letterSpacing: 3, color: "#9fa5b0" }}>
              {surtitre.toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 58, lineHeight: 1.15, letterSpacing: -1.5 }}>{titre}</div>
        </div>

        <div style={{ display: "flex", fontSize: 28, color: "#9fa5b0" }}>
          {SITE_CONFIG.origin.replace("https://", "")}
        </div>
      </div>
    ),
    TAILLE_PARTAGE
  );
}
