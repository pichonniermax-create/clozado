import { Settings } from "lucide-react";
import { NavLink } from "@/components/app-shell/nav-link";
import { NAVIGATION, type NavBadge } from "@/components/app-shell/navigation";

/**
 * La liste de navigation rendue depuis `navigation.ts` — la même dans la
 * barre latérale (grand écran) et dans le panneau replié (petit écran) :
 * une seule source, deux emplacements, jamais deux listes à maintenir.
 */
export function NavigationList({
  hasOrganization,
  badges,
}: {
  /** Faux en vue globale super admin : les écrans propres à une organisation sont masqués. */
  hasOrganization: boolean;
  badges: Record<NavBadge, number>;
}) {
  return (
    <>
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
    </>
  );
}
