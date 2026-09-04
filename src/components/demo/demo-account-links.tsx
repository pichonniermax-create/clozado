import { LogOut, UserRoundPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";

/**
 * À la place du menu de compte, pour un visiteur de la démo publique : pas
 * de profil, pas de réglages, pas de langue à mémoriser (le proxy refuse
 * de toute façon les actions serveur d'un visiteur) — créer son compte ou
 * quitter la démo, en liens.
 *
 * Des `<a>` et non des `Link` : `/demo/quitter` est une route qui AGIT
 * (elle efface le cookie de visite). Le préchargement de `Link` l'appelle
 * dès que le lien est à l'écran (`GET …?_rsc=… Next-Router-Prefetch: 1`),
 * ce qui terminait la visite à la seconde où le bandeau apparaissait —
 * constaté au navigateur le 2026-09-04. Même motif que le lien d'export
 * de la fiche contact (`/api/contacts/[id]/export`).
 */
export function DemoAccountLinks() {
  const t = useTranslations("demo.banner");
  return (
    <div className="flex items-center gap-1">
      <a href="/demo/quitter?vers=/inscription" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <UserRoundPlus />
        <span className="hidden sm:inline">{t("creer_mon_compte")}</span>
      </a>
      <a href="/demo/quitter" className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={t("quitter")}>
        <LogOut />
        <span className="hidden sm:inline">{t("quitter")}</span>
      </a>
    </div>
  );
}
