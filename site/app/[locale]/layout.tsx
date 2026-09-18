import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader, SkipLink } from "@/components/site-header";
import { getDictionary, HTML_LANG, isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { donneesStructurees } from "@/lib/metadata";
import { SITE_CONFIG } from "@/lib/site-config";
import "../globals.css";

/**
 * LA COQUILLE — et la coquille RACINE : le segment de langue est placé
 * avant elle, ce qui permet à `<html lang>` de porter la vraie langue de
 * la page (`next/root-params`). C'est ce qui rend l'ajout d'une langue
 * gratuit : aucune page n'est à dupliquer.
 *
 * La police est AUTO-HÉBERGÉE : le fichier `.woff2` est versionné dans le
 * dépôt (sous-ensemble latin, 29 Ko, graisses 100 à 900). Aucune requête
 * ne part vers un tiers, ni depuis le navigateur, ni pendant le build.
 */
/**
 * LES CHIFFRES ONT LEUR POLICE : Geist Mono, auto-hébergée elle aussi
 * (sous-ensemble latin, 23 Ko, graisses 400 à 600). Un chiffre proportionnel
 * danse d'une ligne à l'autre ; en chasse fixe et en `tabular-nums`, les
 * colonnes s'alignent et un compteur qui monte ne fait pas bouger sa ligne.
 * C'est la SEULE seconde famille admise, et elle ne sert qu'aux nombres.
 */
const geistMono = localFont({
  src: "../fonts/geist-mono-latin.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  variable: "--font-geist-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

const geist = localFont({
  src: "../fonts/geist-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-geist",
  // La pile de repli du produit, et l'ajustement des métriques : le texte
  // affiché avant la police définitive occupe la même place, donc aucun
  // décalage de mise en page (CLS).
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

/** Les langues à générer au build. Une seule aujourd'hui ; la liste vit dans lib/i18n.ts. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

/** Une langue inconnue n'est pas rendue à la demande : elle est introuvable. */
export const dynamicParams = false;

export async function generateMetadata(): Promise<Metadata> {
  const valeur = await rootLocale();
  const locale: Locale = valeur && isLocale(valeur) ? valeur : LOCALES[0];
  const { common } = getDictionary(locale);
  return {
    metadataBase: new URL(SITE_CONFIG.origin),
    title: { default: common.meta.titreParDefaut, template: common.meta.gabaritDeTitre },
    description: common.pied.presentation,
    applicationName: common.meta.nomDuSite,
    // Le site est un site public : il s'indexe. Les pages en 404 portent
    // leur `noindex` toutes seules (Next l'ajoute).
    robots: { index: true, follow: true },
    icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
  };
}

export default async function LocaleLayout(props: LayoutProps<"/[locale]">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common } = getDictionary(locale);

  return (
    <html lang={HTML_LANG[locale]} className={`${geist.variable} ${geistMono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <SkipLink label={common.coquille.allerAuContenu} />
        <SiteHeader locale={locale} />
        <main id="contenu" className="flex-1">
          {props.children}
        </main>
        <SiteFooter locale={locale} />
        <script
          type="application/ld+json"
          // Des données construites par nous, jamais une saisie : rien à échapper d'autre que la fin de balise.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(donneesStructurees(locale)).replace(/</g, "\\u003c"),
          }}
        />
      </body>
    </html>
  );
}
