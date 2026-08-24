"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { setActiveOrganizationAction } from "@/lib/admin/actions";

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
    <div className="sticky top-14 z-30 border-b border-warning/50 bg-warning/15 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm md:px-8">
        <span className="flex items-center gap-1.5 font-semibold">
          <ShieldAlert className="size-4" />
          Super admin
        </span>
        <span className="text-muted-foreground">
          {known ? "Tu travailles dans :" : "Vue globale — choisis une organisation pour agir :"}
        </span>
        <select
          value={known ? activeOrgId! : ""}
          onChange={(e) => choose(e.target.value)}
          disabled={pending}
          aria-label="Organisation active"
          className="h-7 rounded-lg border border-warning/50 bg-background px-2 text-sm font-medium"
        >
          <option value="">Vue globale (aucune organisation)</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {activeOrgId && !known && (
          <span className="text-xs text-destructive">
            L&apos;organisation mémorisée n&apos;existe plus — re-choisis dans la liste.
          </span>
        )}
        {pending && <span className="text-xs text-muted-foreground">Changement…</span>}
      </div>
    </div>
  );
}
