"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { setActiveOrganizationAction } from "@/lib/admin/actions";
import { useTranslations } from "next-intl";
import { NativeSelect } from "@/components/ui/native-select";

type OrgOption = { id: string; name: string; slug: string };

/**
 * Le bandeau permanent du super admin — il n'existe QUE pour lui, un
 * utilisateur normal ne le voit jamais. Toujours visible, toujours au même
 * endroit, visuellement distinct : impossible de confondre « je travaille
 * chez un client » et « je suis en vue globale ». Le choix est mémorisé en
 * cookie, d'un écran et d'une session à l'autre, et TOUT le produit en
 * tient compte (la substitution vit dans requireUser, pas dans les écrans).
 */
export function SuperAdminBar({
  organizations,
  activeOrgId,
}: {
  organizations: OrgOption[];
  activeOrgId: string | null;
}) {
  const t = useTranslations("shell.superAdminBar");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const known = activeOrgId && organizations.some((o) => o.id === activeOrgId);

  function choose(value: string) {
    startTransition(async () => {
      await setActiveOrganizationAction(value || null);
      router.refresh();
    });
  }

  return (
    // Collant dès md seulement (audit UI du 2026-09-14) : sur un téléphone, en-tête + bandeau + barre d'onglets figeaient ~210 px.
    <div className="border-b border-warning/50 bg-warning/15 backdrop-blur">
      {/* COMPACT (lot 4) : une ligne, pas deux. Le sélecteur porte déjà le nom de l'organisation — c'est LE seul
          endroit où il s'écrit pour un super admin, l'en-tête ne le répète plus. La phrase d'explication ne
          s'affiche qu'en vue globale, là où elle dit quoi faire ; en substitution, elle redisait le sélecteur. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 text-sm md:px-8">
        <span className="flex items-center gap-1.5 font-semibold" title={t("super_admin")}>
          <ShieldAlert className="size-4" />
          <span className="sr-only sm:not-sr-only">{t("super_admin")}</span>
        </span>
        {!known && (
          <span className="hidden text-foreground/80 sm:inline">
            {t("vue_globale_choisis_une_organisation_pour_d974")}
          </span>
        )}
        <NativeSelect
          value={known ? activeOrgId! : ""}
          onChange={(e) => choose(e.target.value)}
          disabled={pending}
          aria-label={t("organisation_active")}
          className="min-w-0 flex-1 sm:w-auto sm:flex-none sm:max-w-64"
        >
          <option value="">{t("vue_globale_aucune_organisation")}</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </NativeSelect>
        {activeOrgId && !known && (
          <span className="text-xs text-destructive">
            {t("l_organisation_memorisee_n_existe_plus_c1ce")}
          </span>
        )}
        {pending && <span className="text-xs text-muted-foreground">{t("changement")}</span>}
      </div>
    </div>
  );
}
