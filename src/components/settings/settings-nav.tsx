import { useTranslations } from "next-intl";

/**
 * LE SOMMAIRE DES RÉGLAGES (audit UI du 2026-09-14) : treize cartes sur
 * plusieurs milliers de pixels, sans rien qui dise ce que l'écran contient
 * avant d'avoir tout fait défiler. Les ancres existaient déjà sur les
 * cartes ; voici ce qui y renvoie — une rangée de liens, collante sous
 * l'en-tête, qui défile horizontalement sur un téléphone. Pas d'onglets :
 * une seule page reste adressable par ses ancres (`/settings#pack-metier`
 * est déjà un lien du tableau de bord).
 */
const SECTIONS = [
  { id: "marque", key: "marque" },
  { id: "domaine", key: "domaine" },
  { id: "pied-de-page", key: "pied_de_page" },
  { id: "ingestion", key: "ingestion" },
  { id: "envois-automatiques", key: "envois_automatiques" },
  { id: "langue", key: "langue" },
  { id: "logo", key: "logo" },
  { id: "pack-metier", key: "pack_metier" },
  { id: "pipelines", key: "pipelines" },
  { id: "types", key: "types" },
  { id: "collecte", key: "collecte" },
  { id: "motifs", key: "motifs" },
] as const;

export function SettingsNav() {
  const t = useTranslations("settings.page.sections");
  return (
    <nav
      aria-label={t("titre")}
      className="sticky top-14 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:mx-0 md:rounded-xl md:border md:px-2"
    >
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {SECTIONS.map((section) => (
          <li key={section.id} className="shrink-0">
            <a
              href={`#${section.id}`}
              className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-10"
            >
              {t(section.key)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
