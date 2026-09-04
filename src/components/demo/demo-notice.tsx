"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DEMO_READ_ONLY_PARAM, DEMO_READ_ONLY_VALUE } from "@/lib/demo/public";

/**
 * La phrase qui explique un geste refusé au visiteur : le proxy a renvoyé
 * vers la page courante avec `?demo=lecture-seule`, la coquille le dit —
 * une fois, sur la page où le clic a eu lieu.
 */
export function DemoReadOnlyNotice() {
  const t = useTranslations("demo.banner");
  const params = useSearchParams();
  if (params.get(DEMO_READ_ONLY_PARAM) !== DEMO_READ_ONLY_VALUE) return null;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-2 md:px-8">
      <p role="status" className="rounded-lg border border-warning/40 bg-background/80 px-3 py-2 text-sm">
        {t("lecture_seule_notice")}
      </p>
    </div>
  );
}
