"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * L'état actif est dérivé de l'URL courante, jamais passé en prop depuis
 * chaque page : une page qui oublierait de se déclarer laisserait la
 * navigation muette sur « où suis-je ». C'est la seule raison pour laquelle
 * ce fragment est un composant client.
 *
 * Le PRÉCHARGEMENT est au survol, pas à l'affichage (chantier UI/UX,
 * constat D4 de l'audit) : par défaut, Next précharge chaque lien visible
 * — vingt écrans dynamiques, chacun rendant la coquille et ses requêtes,
 * à chaque page ouverte. Sur la base locale de preuve, c'est ce qui
 * saturait le proxy ; en production, c'est autant de requêtes Neon pour
 * rien. Au survol (ou au focus clavier), le préchargement part une bonne
 * seconde avant le clic : la navigation reste immédiate, sans le coût.
 */
export function NavLink({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Compteur d'éléments à traiter — absent (et non « 0 ») quand il n'y a rien. */
  badge?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // `/affaires` doit rester actif sur `/affaires/<id>` ; on évite le
  // `startsWith` nu qui ferait matcher `/affaires-archivees`.
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const prefetch = () => router.prefetch(href);

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      )}
    >
      <span
        className={cn(
          "shrink-0 transition-colors [&_svg]:size-4",
          active ? "text-primary-ink" : "text-muted-foreground group-hover:text-foreground"
        )}
      >
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.6875rem] leading-none font-semibold tabular-nums",
            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
