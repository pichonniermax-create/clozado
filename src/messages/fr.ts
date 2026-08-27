import activities from "./fr/activities.json";
import analytics from "./fr/analytics.json";
import auth from "./fr/auth.json";
import brand from "./fr/brand.json";
import contacts from "./fr/contacts.json";
import dashboard from "./fr/dashboard.json";
import deals from "./fr/deals.json";
import email from "./fr/email.json";
import errors from "./fr/errors.json";
import figures from "./fr/figures.json";
import followup from "./fr/followup.json";
import home from "./fr/home.json";
import metrics from "./fr/metrics.json";
import nav from "./fr/nav.json";
import newsletters from "./fr/newsletters.json";
import partners from "./fr/partners.json";
import profile from "./fr/profile.json";
import settings from "./fr/settings.json";
import shares from "./fr/shares.json";
import shell from "./fr/shell.json";
import targets from "./fr/targets.json";
import templates from "./fr/templates.json";
import tasks from "./fr/tasks.json";
import ui from "./fr/ui.json";
import watch from "./fr/watch.json";

/**
 * Le français — un fichier par namespace (un écran, un module), assemblés
 * ici. Les clés sont dérivées du texte français d'origine (stables,
 * cherchables : la phrase mène à la clé, la clé mène à l'usage) ; les
 * registres (indicateurs, gabarits, navigation, erreurs) portent des clés
 * nommées par leur identifiant. Ajouter une langue : le même jeu de
 * fichiers dans `src/messages/<code>/`, un `<code>.ts` identique à
 * celui-ci, et son code dans `src/i18n/locales.ts`.
 */
const fr = {
  activities,
  analytics,
  auth,
  brand,
  contacts,
  dashboard,
  deals,
  email,
  errors,
  figures,
  followup,
  home,
  metrics,
  nav,
  newsletters,
  partners,
  profile,
  settings,
  shares,
  shell,
  targets,
  templates,
  tasks,
  ui,
  watch,
};

export default fr;
