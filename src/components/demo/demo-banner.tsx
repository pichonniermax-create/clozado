import Link from "next/link";
import { Suspense } from "react";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { DEMO_TOUR_PARAM } from "@/lib/demo/public";
import { DemoReadOnlyNotice } from "./demo-notice";

/**
 * Le bandeau de la démo publique (docs/module-demo.md §1.4) — le pendant du
 * bandeau super admin, pour le visiteur : dit d'entrée que le cabinet est
 * fictif, les données inventées et l'écran en lecture seule, et offre les
 * trois sorties utiles : la visite guidée, la création d'un compte, la
 * fin de la visite. Tout est un LIEN (GET) : le proxy refuse les
 * formulaires d'un visiteur, c'est le principe. Les deux sorties sont des
 * `<a>` sans préchargement : `/demo/quitter` agit (elle efface le cookie),
 * et le préchargement de `Link` l'appellerait dès l'affichage du bandeau
 * (voir `DemoAccountLinks`).
 */
export function DemoBanner({ personaName }: { personaName: string | null }) {
  const t = useTranslations("demo.banner");
  return (
    <div className="sticky top-14 z-30 border-b border-warning/50 bg-warning/15 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm md:px-8">
        <span className="flex items-center gap-1.5 font-semibold">
          <Eye className="size-4" />
          {t("titre")}
        </span>
        <span className="text-muted-foreground">{personaName ? t("texte_avec_persona", { name: personaName }) : t("texte")}</span>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 text-xs font-medium">
          <Link href={`/dashboard?${DEMO_TOUR_PARAM}=1`} className="underline underline-offset-2">
            {t("visite_guidee")}
          </Link>
          <a href="/demo/quitter?vers=/inscription" className="underline underline-offset-2">
            {t("creer_mon_compte")}
          </a>
          <a href="/demo/quitter" className="underline underline-offset-2">
            {t("quitter")}
          </a>
        </span>
      </div>
      <Suspense fallback={null}>
        <DemoReadOnlyNotice />
      </Suspense>
    </div>
  );
}
