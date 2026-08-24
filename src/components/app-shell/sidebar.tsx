import { Settings } from "lucide-react";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { NavLink } from "@/components/app-shell/nav-link";
import { NAVIGATION, type NavBadge } from "@/components/app-shell/navigation";

/**
 * Navigation permanente du produit, rendue depuis `navigation.ts`.
 *
 * Identité Clozado seule (décision de la refonte, étape 3) : la barre ne
 * porte plus le logo ni la couleur du client — c'était la marque d'un
 * client qui teintait l'interface de l'application, exactement ce que le
 * chantier interdit. Le nom de l'organisation vit dans l'en-tête, comme un
 * contexte, pas comme une marque ; la marque du client ne s'affiche que
 * sur la vitrine de partage et dans les emails.
 */
export function Sidebar({
  hasOrganization,
  badges,
}: {
  /** Faux en vue globale super admin : les écrans propres à une organisation sont masqués. */
  hasOrganization: boolean;
  badges: Record<NavBadge, number>;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="px-4 py-4">
        <BrandMark href="/dashboard" />
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
        {NAVIGATION.map((section) => {
          const entries = section.entries.filter((e) => hasOrganization || !e.requiresOrganization);
          if (entries.length === 0) return null;
          return (
            <div key={section.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
                {section.label}
              </p>
              {entries.map((entry) => (
                <NavLink
                  key={entry.href}
                  href={entry.href}
                  label={entry.label}
                  icon={<entry.icon />}
                  badge={entry.badge ? badges[entry.badge] : undefined}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {hasOrganization && (
        <div className="border-t border-sidebar-border px-3 py-3">
          <NavLink href="/settings" label="Marque & réglages" icon={<Settings />} />
        </div>
      )}
    </aside>
  );
}
