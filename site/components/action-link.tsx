import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Les deux seuls appels à l'action du site. Ce sont des LIENS, jamais des
 * boutons : ils naviguent. Le lien de prise de rendez-vous sort du site —
 * il porte alors `rel="noopener"` et la mention « nouvel onglet » pour les
 * lecteurs d'écran, jamais une icône seule.
 *
 * Hauteur minimale de 48 px : au-dessus de la cible tactile recommandée
 * (44 px). La forme est une PILULE — rayon plein, jamais un rectangle
 * arrondi : c'est la seule forme ronde du site, et elle ne sert qu'à
 * l'action.
 *
 * PIÈGE : ne jamais passer un utilitaire `display` par `className`
 * (« hidden sm:inline-flex ») — il entre en conflit avec le `inline-flex`
 * de base, et c'est l'ordre de la feuille de style qui tranche, pas celui
 * des classes. Un repli responsive se porte sur une enveloppe.
 */
const STYLES = {
  primaire:
    "bg-primary text-primary-foreground hover:bg-primary-hover border border-transparent",
  secondaire: "bg-card text-foreground border border-border hover:bg-muted",
} as const;

export function ActionLink({
  href,
  variante = "primaire",
  externe = false,
  mentionNouvelOnglet,
  children,
  className,
}: {
  href: string;
  variante?: keyof typeof STYLES;
  externe?: boolean;
  /** Le texte lu par une synthèse vocale à la place de rien : « (nouvel onglet) ». */
  mentionNouvelOnglet?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const classes = cn(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-colors",
    STYLES[variante],
    className
  );
  if (externe) {
    return (
      <a href={href} target="_blank" rel="noopener" className={classes}>
        {children}
        {mentionNouvelOnglet && <span className="sr-only">{mentionNouvelOnglet}</span>}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
