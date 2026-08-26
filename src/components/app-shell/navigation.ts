import type { Messages } from "@/i18n/messages";
import {
  BookUser,
  Briefcase,
  Funnel,
  Handshake,
  LayoutDashboard,
  ListTodo,
  Mail,
  Newspaper,
  Radar,
  Route,
  Sigma,
  Target,
  Timer,
  TrendingDown,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/**
 * La navigation, en données : une entrée = un module. Ajouter un écran au
 * produit, c'est ajouter une ligne ici — la barre latérale, ses sections et
 * ses compteurs suivent. Regroupée par intention, pas par table :
 * « Aujourd'hui » (ce qu'il y a à faire) avant « Dossiers » (la matière),
 * les outils annexes en dernier. Les libellés vivent dans les messages
 * (`nav.json`, chantier i18n) : ici, leurs CLÉS — typées contre le
 * français, une clé absente ne compile pas.
 */
export type NavBadge = "tasksDue" | "followUp";

export type NavEntry = {
  href: string;
  key: keyof Messages["nav"]["entries"];
  icon: LucideIcon;
  /** Compteur affiché à droite — calculé par la coquille, absent quand il est nul. */
  badge?: NavBadge;
  /**
   * L'écran n'existe que rapporté à une organisation : masqué en vue globale
   * super admin (l'écran se défend quand même si on y arrive par l'URL).
   */
  requiresOrganization?: boolean;
};

export type NavSection = { key: keyof Messages["nav"]["sections"]; entries: NavEntry[] };

export const NAVIGATION: NavSection[] = [
  {
    key: "aujourd_hui",
    entries: [
      { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
      { href: "/taches", key: "taches", icon: ListTodo, badge: "tasksDue", requiresOrganization: true },
      { href: "/suivi", key: "suivi", icon: Target, badge: "followUp", requiresOrganization: true },
    ],
  },
  {
    key: "dossiers",
    entries: [
      { href: "/contacts", key: "contacts", icon: BookUser },
      { href: "/affaires", key: "affaires", icon: Briefcase },
      { href: "/partenaires", key: "partenaires", icon: Users },
    ],
  },
  {
    key: "analytique",
    entries: [
      { href: "/analytique/funnel", key: "analytique_funnel", icon: Funnel, requiresOrganization: true },
      { href: "/analytique/delais", key: "analytique_delais", icon: Timer, requiresOrganization: true },
      { href: "/analytique/pertes", key: "analytique_pertes", icon: TrendingDown, requiresOrganization: true },
      { href: "/analytique/partenaires", key: "analytique_partenaires", icon: Handshake, requiresOrganization: true },
      { href: "/analytique/origines", key: "analytique_origines", icon: Route, requiresOrganization: true },
    ],
  },
  {
    key: "outils",
    entries: [
      { href: "/cibles", key: "cibles", icon: UsersRound, requiresOrganization: true },
      { href: "/veille", key: "veille", icon: Newspaper, requiresOrganization: true },
      { href: "/concurrents", key: "concurrents", icon: Radar, requiresOrganization: true },
      { href: "/chiffres", key: "chiffres", icon: Sigma, requiresOrganization: true },
      { href: "/newsletters", key: "newsletters", icon: Mail },
    ],
  },
];

/** Les gestes de création proposés par le menu « Nouveau » de l'en-tête — chacun ouvre le formulaire déjà déplié. */
export const QUICK_CREATE: { href: string; key: keyof Messages["nav"]["quickCreate"]; icon: LucideIcon }[] = [
  { href: "/contacts?nouveau=1", key: "contacts", icon: BookUser },
  { href: "/affaires?nouveau=1", key: "affaires", icon: Briefcase },
  { href: "/taches#nouvelle-tache", key: "taches", icon: ListTodo },
  { href: "/partenaires?nouveau=1", key: "partenaires", icon: Users },
];
