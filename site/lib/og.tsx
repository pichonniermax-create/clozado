import { readFileSync } from "node:fs";
import { join } from "node:path";
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
 *
 * ELLE EST CLAIRE ET BORDEAUX depuis le 2026-09-18, comme le site : fond
 * blanc cassé, titre quasi noir, et l'accent réduit au carré de la marque
 * et au souligné du titre. C'est la SEULE image du site — et elle ne
 * s'affiche jamais dans une page : elle ne vit que dans la vignette d'un
 * partage.
 *
 * LA POLICE EST GEIST, comme le site. Le générateur d'images ne sait pas
 * lire un `.woff2` : ce sont les `.ttf` de `app/fonts/` qu'il lit, au
 * build uniquement — ils ne sont jamais servis à un navigateur et ne
 * pèsent rien sur une page. Les lire à `process.cwd()` est sûr ici : ces
 * images sont toutes générées au build, jamais à la requête.
 */
const POLICES = [
  { nom: "Geist", fichier: "geist-400.ttf", graisse: 400 as const },
  { nom: "Geist", fichier: "geist-600.ttf", graisse: 600 as const },
].map(({ nom, fichier, graisse }) => ({
  name: nom,
  data: readFileSync(join(process.cwd(), "app", "fonts", fichier)),
  weight: graisse,
  style: "normal" as const,
}));
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
          background: "#fafaf8",
          color: "#141310",
          padding: 80,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#89202b",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 600,
            }}
          >
            {common.marque.charAt(0)}
          </div>
          <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: -0.5 }}>{common.marque}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
          {surtitre && (
            <div style={{ display: "flex", fontSize: 24, fontWeight: 600, letterSpacing: 3, color: "#5c5a52" }}>
              {surtitre.toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 58, fontWeight: 600, lineHeight: 1.15, letterSpacing: -1.5 }}>
            {titre}
          </div>
          <div style={{ display: "flex", width: 96, height: 6, borderRadius: 3, background: "#89202b" }} />
        </div>

        <div style={{ display: "flex", fontSize: 28, color: "#5c5a52" }}>
          {SITE_CONFIG.origin.replace("https://", "")}
        </div>
      </div>
    ),
    { ...TAILLE_PARTAGE, fonts: POLICES }
  );
}
