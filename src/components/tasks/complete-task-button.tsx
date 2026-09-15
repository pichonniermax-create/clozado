import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { completeTaskAction } from "@/lib/tasks/actions";

/**
 * Le rond « marquer comme faite » — le geste le plus fréquent du produit,
 * copié à l'identique sur le tableau de bord, l'écran des tâches et les
 * fiches ; une seule fois ici (audit UI du 2026-09-14). Le rendu reste un
 * bouton de 28 px à la souris ; la zone de frappe, elle, fait 44 px
 * (`before:-inset-2`), sans empiéter sur le titre (le débordement de 8 px
 * tient dans le `gap-3` de la ligne).
 */
export function CompleteTaskButton({ taskId, backTo, title }: { taskId: string; backTo: string; title: string }) {
  const t = useTranslations("tasks.taskSection");
  return (
    <form action={completeTaskAction.bind(null, { taskId, backTo })}>
      <Button
        type="submit"
        variant="outline"
        size="icon-sm"
        className="relative rounded-full before:absolute before:-inset-2 before:content-['']"
        aria-label={t("marquer_comme_faite", { title })}
        title={t("marquer_comme_faite_bb0d")}
      >
        <Check />
      </Button>
    </form>
  );
}
