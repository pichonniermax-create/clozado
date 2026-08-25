import {
  BookUser,
  Briefcase,
  Funnel,
  Handshake,
  LayoutDashboard,
  ListTodo,
  Mail,
  Route,
  Target,
  Timer,
  TrendingDown,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * La navigation, en données : une entrée = un module. Ajouter un écran au
 * produit, c'est ajouter une ligne ici — la barre latérale, ses sections et
 * ses compteurs suivent. Regroupée par intention, pas par table :
 * « Aujourd'hui » (ce qu'il y a à faire) avant « Dossiers » (la matière),
 * les outils annexes en dernier.
 */
export type NavBadge = "tasksDue" | "followUp";

export type NavEntry = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Compteur affiché à droite — calculé par la coquille, absent quand il est nul. */
  badge?: NavBadge;
  /**
   * L'écran n'existe que rapporté à une organisation : masqué en vue globale
   * super admin (l'écran se défend quand même si on y arrive par l'URL).
   */
  requiresOrganization?: boolean;
};

export type NavSection = { label: string; entries: NavEntry[] };

export const NAVIGATION: NavSection[] = [
  {
    label: "Aujourd'hui",
    entries: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/taches", label: "Tâches", icon: ListTodo, badge: "tasksDue", requiresOrganization: true },
      { href: "/suivi", label: "Suivi", icon: Target, badge: "followUp", requiresOrganization: true },
    ],
  },
  {
    label: "Dossiers",
    entries: [
      { href: "/contacts", label: "Contacts", icon: BookUser },
      { href: "/affaires", label: "Affaires", icon: Briefcase },
      { href: "/partenaires", label: "Partenaires", icon: Users },
    ],
  },
  {
    label: "Analytique",
    entries: [
      { href: "/analytique/funnel", label: "Funnel", icon: Funnel, requiresOrganization: true },
      { href: "/analytique/delais", label: "Délais", icon: Timer, requiresOrganization: true },
      { href: "/analytique/pertes", label: "Pertes", icon: TrendingDown, requiresOrganization: true },
      { href: "/analytique/partenaires", label: "Partenariats", icon: Handshake, requiresOrganization: true },
      { href: "/analytique/origines", label: "Origines", icon: Route, requiresOrganization: true },
    ],
  },
  {
    label: "Outils",
    entries: [{ href: "/newsletters", label: "Newsletters", icon: Mail }],
  },
];

/** Les gestes de création proposés par le menu « Nouveau » de l'en-tête — chacun ouvre le formulaire déjà déplié. */
export const QUICK_CREATE: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/contacts?nouveau=1", label: "Contact", icon: BookUser },
  { href: "/affaires?nouveau=1", label: "Affaire", icon: Briefcase },
  { href: "/taches#nouvelle-tache", label: "Tâche", icon: ListTodo },
  { href: "/partenaires?nouveau=1", label: "Partenaire", icon: Users },
];
