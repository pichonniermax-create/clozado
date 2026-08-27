import activities from "./en/activities.json";
import analytics from "./en/analytics.json";
import auth from "./en/auth.json";
import brand from "./en/brand.json";
import contacts from "./en/contacts.json";
import dashboard from "./en/dashboard.json";
import deals from "./en/deals.json";
import email from "./en/email.json";
import errors from "./en/errors.json";
import figures from "./en/figures.json";
import followup from "./en/followup.json";
import home from "./en/home.json";
import metrics from "./en/metrics.json";
import nav from "./en/nav.json";
import newsletters from "./en/newsletters.json";
import partners from "./en/partners.json";
import profile from "./en/profile.json";
import settings from "./en/settings.json";
import shares from "./en/shares.json";
import shell from "./en/shell.json";
import targets from "./en/targets.json";
import templates from "./en/templates.json";
import tasks from "./en/tasks.json";
import ui from "./en/ui.json";
import watch from "./en/watch.json";

/**
 * Le français — un fichier par namespace (un écran, un module), assemblés
 * ici. Les clés sont dérivées du texte français d'origine (stables,
 * cherchables : la phrase mène à la clé, la clé mène à l'usage) ; les
 * registres (indicateurs, gabarits, navigation, erreurs) portent des clés
 * nommées par leur identifiant. Ajouter une langue : le même jeu de
 * fichiers dans `src/messages/<code>/`, un `<code>.ts` identique à
 * celui-ci, et son code dans `src/i18n/locales.ts`.
 */
const en = {
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

export default en;
