import Link from "next/link";
import { ArrowRight, CircleCheck, CircleDashed, Compass, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setOnboardingVisibilityAction } from "@/lib/onboarding/actions";
import type { OnboardingProgress } from "@/lib/onboarding/steps";
import { TOUR_PARAM } from "@/lib/tour/steps";
import { cn } from "@/lib/utils";

/**
 * La carte « Premiers pas » du tableau de bord (chantier UI/UX,
 * src/lib/onboarding/steps.ts) : une barre de progression, huit gestes
 * cochés par les données, chacun avec son lien ; le prochain geste non
 * fait est mis en avant. « Masquer » pose un cookie ; la carte disparaît
 * d'elle-même quand tout est fait (l'appelant ne la rend pas).
 */
export async function OnboardingChecklist({ progress }: { progress: OnboardingProgress }) {
  const t = await getTranslations("dashboard.onboarding");
  const next = progress.steps.find((step) => !step.done) ?? null;
  const percent = Math.round((progress.done / progress.total) * 100);
  return (
    <Card data-tour="premiers-pas" className="border-primary/30 bg-primary-soft/30">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>{t("titre")}</CardTitle>
          <CardDescription>{t("description", { done: progress.done, total: progress.total })}</CardDescription>
        </div>
        <form action={setOnboardingVisibilityAction}>
          <input type="hidden" name="visibilite" value="masque" />
          <Button type="submit" variant="ghost" size="icon-xs" aria-label={t("masquer")} title={t("masquer")}>
            <X />
          </Button>
        </form>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t("progression")}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {progress.steps.map((step) => (
            <li key={step.key}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-card",
                  step.done ? "text-muted-foreground" : "text-foreground",
                  next?.key === step.key && "bg-card font-medium shadow-sm ring-1 ring-primary/20"
                )}
              >
                {step.done ? <CircleCheck className="size-4 shrink-0 text-success" aria-hidden /> : <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                <span className={cn("min-w-0 flex-1", step.done && "line-through decoration-muted-foreground/50")}>{t(`etapes.${step.key}`)}</span>
                {next?.key === step.key && <ArrowRight className="size-4 shrink-0 text-primary-ink" aria-hidden />}
              </Link>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          {next && (
            <Link href={next.href} className={buttonVariants({ size: "sm" })}>
              {t(`gestes.${next.key}`)}
              <ArrowRight />
            </Link>
          )}
          <Link href={`/dashboard?${TOUR_PARAM}=1`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Compass />
            {t("visite_guidee")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
