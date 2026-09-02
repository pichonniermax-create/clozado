import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiKeyCreator } from "@/components/acquisition/api-key-creator";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { getCollectionStatus, listApiKeys, listSiteKeys } from "@/db/queries/acquisition";
import {
  createSiteKeyAction,
  revokeApiKeyAction,
  revokeSiteKeyAction,
  updateAllowedDomainsAction,
} from "@/lib/acquisition/actions";
import { getFormats } from "@/i18n/formats";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  getOwnOrganization,
  updateOrganizationBranding,
  updateOrganizationPack,
} from "@/db/queries/organizations";
import { listLossReasons } from "@/db/queries/loss-reasons";
import { listPipelinesWithStages } from "@/db/queries/pipelines";
import {
  createLossReasonAction,
  createPipelineAction,
  createStageAction,
  deleteLossReasonAction,
  moveStageAction,
  updatePipelineLabelAction,
  updateStageAction,
} from "@/lib/deals/actions";
import { DEFAULT_BRAND_PRIMARY } from "@/lib/brand";
import { BrandColorPicker } from "@/components/brand/brand-color-picker";
import { BrandLogoUploader } from "@/components/brand/brand-logo-uploader";
import { listOrganizationAssetMeta } from "@/db/queries/organization-assets";
import { assetUrlsFromMeta } from "@/lib/brand/assets";
import { normalizeHex } from "@/lib/brand/color";
import { brandStyle, deriveBrandTokens } from "@/lib/brand/derive";
import { isPlausibleEmail } from "@/lib/email/address";
import { EmailDomainCard } from "@/components/settings/email-domain-card";
import { AutoSendCard } from "@/components/settings/auto-send-card";
import { IngestAddressCard } from "@/components/settings/ingest-address-card";
import { LegalFootprintCard } from "@/components/settings/legal-footprint-card";
import { inboundDomain, sharedSendingDomain } from "@/lib/email/config";
import { resolveSender } from "@/lib/email/sender";
import { withError } from "@/lib/form-actions";
import { BUSINESS_PACK_LIST, resolveBusinessPack } from "@/lib/metrics";
import { requestOrigin } from "@/lib/request-origin";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import type { TranslatorOf } from "@/i18n/translator";
import { isAppLocale, LOCALES, localeDisplayName } from "@/i18n/locales";
import { CURRENCIES, currencyDisplayName, isCurrency } from "@/lib/currencies";
import { isTimeZone, listTimeZones } from "@/lib/timezone";
import { updateOrganizationSettings } from "@/db/queries/organizations";

const SELECT_CLASS = "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm";

async function saveBranding(formData: FormData) {
  "use server";
  const t = await getTranslations("settings.page");
  // On revalide tout côté serveur : le formulaire peut être désactivé
  // côté client, mais le vrai garde-fou est ici.
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  // La couleur vient du sélecteur, déjà normalisée ; on la revalide quand
  // même — une chaîne libre n'entre jamais en base.
  const rawColor = String(formData.get("primaryColor") ?? "").trim();
  const primaryColor = rawColor ? normalizeHex(rawColor) : null;
  if (rawColor && !primaryColor) {
    redirect(withError("/settings", t("la_couleur_n_est_pas_un_466e")));
  }

  // L'expéditeur des emails : le nom sans retour à la ligne (un en-tête
  // d'email s'injecte par là), l'adresse en minuscules et plausible.
  const senderName = String(formData.get("senderName") ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120) || null;
  const senderEmail = String(formData.get("senderEmail") ?? "").trim().toLowerCase() || null;
  if (senderEmail && !isPlausibleEmail(senderEmail)) {
    redirect(withError("/settings", t("l_adresse_de_reponse_ne_semble_ac1b")));
  }
  await updateOrganizationBranding(user, {
    name,
    primaryColor,
    fontFamily: String(formData.get("fontFamily") ?? "").trim() || null,
    senderName,
    senderEmail,
  });

  revalidatePath("/settings");
  redirect(withError("/settings", t("marque_enregistree"), "info"));
}

async function saveRegionalSettings(formData: FormData) {
  "use server";
  const t = await getTranslations("settings.page");
  const user = await requireUser();
  const defaultLocale = String(formData.get("defaultLocale") ?? "");
  const currency = String(formData.get("currency") ?? "");
  const timezone = String(formData.get("timezone") ?? "");
  // Validé contre les listes du code, jamais contre le formulaire : une valeur inconnue ne passe pas.
  if (!isAppLocale(defaultLocale) || !isCurrency(currency) || !isTimeZone(timezone)) {
    redirect(withError("/settings", t("langue_devise_ou_fuseau_inconnu")));
  }
  await updateOrganizationSettings(user, { defaultLocale, currency, timezone });
  // Toute l'interface en dépend (la langue par défaut, les montants, les dates) : la coquille entière est revalidée.
  revalidatePath("/", "layout");
  redirect(withError("/settings", t("langue_devise_et_fuseau_enregistres"), "info"));
}

async function savePack(formData: FormData) {
  "use server";
  const user = await requireUser();
  await updateOrganizationPack(user, String(formData.get("businessPack") ?? ""));
  // La cible ne diffère de la page courante que par l'ancre : sans
  // revalidation, le routeur remonte la page depuis son cache et le
  // formulaire réapparaît dans l'état d'AVANT (aucun pack coché, la mention
  // « aucun pack choisi » encore là) — vu au navigateur. Les autres actions
  // de cette page redirigent sans ancre et n'en ont pas besoin.
  revalidatePath("/settings");
  redirect("/settings#pack-metier");
}

// Au niveau module, pas dans le composant : une closure d'action serveur
// ne peut capturer que des valeurs sérialisables, jamais une fonction.
function stageInputFrom(formData: FormData) {
  const probRaw = String(formData.get("probability") ?? "").trim();
  const outcomeRaw = String(formData.get("outcome") ?? "");
  return {
    label: String(formData.get("label") ?? "").trim(),
    color: String(formData.get("color") ?? "").trim() || null,
    probability: probRaw === "" ? null : Math.max(0, Math.min(100, Number(probRaw) || 0)),
    outcome: outcomeRaw === "won" ? ("won" as const) : outcomeRaw === "lost" ? ("lost" as const) : null,
  };
}

/** Les motifs de refus de la collecte, en mots — `settings.page.rejections.<motif>` ; un motif inconnu s'affiche tel quel. */
const REJECTION_REASONS = ["domain_not_allowed", "origin_missing", "site_key_revoked", "api_key_revoked", "rate_limited", "payload_too_large", "invalid_payload"] as const;
function rejectionLabel(reason: string, t: TranslatorOf<"settings.page">): string {
  return (REJECTION_REASONS as readonly string[]).includes(reason) ? t(`rejections.${reason as (typeof REJECTION_REASONS)[number]}`) : reason;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ erreur?: string; info?: string }> }) {
  const t = await getTranslations("settings.page");
  const tm = await getTranslations("metrics");
  const fmt = await getFormats();
  const user = await requireUser();
  const { erreur, info } = await searchParams;

  // Le super_admin n'a pas d'organisation propre : cet écran ne le concerne pas.
  if (!user.organizationId) {
    redirect("/dashboard");
  }

  const org = await getOwnOrganization(user);
  if (!org) {
    redirect("/dashboard");
  }

  const readOnly = user.role !== "admin";
  const [pipelines, lossReasons, apiKeyRows, siteKeyRows, collection, appOrigin, assetMeta] = await Promise.all([
    listPipelinesWithStages(user),
    listLossReasons(user),
    listApiKeys(user),
    listSiteKeys(user),
    getCollectionStatus(user),
    requestOrigin(),
    listOrganizationAssetMeta(org.id),
  ]);
  const savedHex = normalizeHex(org.primaryColor ?? "") ?? DEFAULT_BRAND_PRIMARY;
  // Les aperçus du logo se rendent sous les jetons dérivés de la couleur ENREGISTRÉE.
  const savedBrand = brandStyle(deriveBrandTokens(savedHex, "light").tokens);
  const assetUrls = assetUrlsFromMeta(org.id, assetMeta);
  const activeSiteKeys = siteKeyRows.filter((k) => !k.revokedAt);
  // L'expéditeur effectif aujourd'hui (repli ou domaine propre) — sans EMAIL_SHARED_DOMAIN, la carte le dit.
  let sharedDomain = "";
  let effectiveFrom = "";
  try {
    sharedDomain = sharedSendingDomain();
    effectiveFrom = resolveSender(org, null).from;
  } catch {
    sharedDomain = "";
    effectiveFrom = "";
  }
  // Le domaine de réception (Partie 2) : sans la variable, la carte d'ingestion le dit plutôt que d'afficher une adresse fausse.
  let receivingDomain: string | null = null;
  try {
    receivingDomain = inboundDomain();
  } catch {
    receivingDomain = null;
  }
  const nothingConnected = collection.lastEventAt === null && collection.lastLeadAt === null;

  async function saveStage(formData: FormData) {
    "use server";
    await updateStageAction(String(formData.get("stageId")), stageInputFrom(formData));
    redirect("/settings");
  }
  async function addStage(formData: FormData) {
    "use server";
    await createStageAction(String(formData.get("pipelineId")), stageInputFrom(formData));
    redirect("/settings");
  }
  // Deux actions plutôt qu'un name="direction" sur les boutons : React
  // écrase le name d'un bouton porteur de formAction (il y encode l'id de
  // l'action), le champ n'arriverait jamais dans le FormData.
  async function moveStageUpForm(formData: FormData) {
    "use server";
    await moveStageAction(String(formData.get("stageId")), "up");
    redirect("/settings");
  }
  async function moveStageDownForm(formData: FormData) {
    "use server";
    await moveStageAction(String(formData.get("stageId")), "down");
    redirect("/settings");
  }
  async function renamePipeline(formData: FormData) {
    "use server";
    await updatePipelineLabelAction(String(formData.get("pipelineId")), String(formData.get("label") ?? ""));
    redirect("/settings");
  }
  async function addPipeline(formData: FormData) {
    "use server";
    await createPipelineAction(String(formData.get("label") ?? ""));
    redirect("/settings");
  }
  async function addLossReason(formData: FormData) {
    "use server";
    await createLossReasonAction(String(formData.get("label") ?? ""));
    redirect("/settings");
  }
  async function removeLossReason(formData: FormData) {
    "use server";
    await deleteLossReasonAction(String(formData.get("id")));
    redirect("/settings");
  }

  return (
    <>
      <PageHeader
        title={t("marque_reglages")}
        description={
          readOnly
            ? t("lecture_seule_seul_l_admin_de_0a29")
            : t("ton_nom_ta_couleur_et_ton_08c6")
        }
      />

      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}
      {info && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{info}</p>}

      <Card id="marque" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>{org.name}</CardTitle>
          <CardDescription>
            {t("identifiant_une_seule_couleur_le_systeme_0d04", { slug: org.slug })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveBranding} className="flex flex-col gap-5">
            <Field label={t("nom_affiche")} htmlFor="name" className="max-w-xl">
              <Input id="name" name="name" defaultValue={org.name} disabled={readOnly} required />
            </Field>

            <Field label={t("couleur_de_la_marque")} htmlFor="brand-color">
              <BrandColorPicker initialHex={org.primaryColor} name="primaryColor" disabled={readOnly} />
            </Field>

            <Field label={t("police_des_emails")} htmlFor="fontFamily" hint={t("n_affecte_que_le_gabarit_des_c966")} className="max-w-xl">
              <Input id="fontFamily" name="fontFamily" placeholder={t("inter")} defaultValue={org.fontFamily ?? ""} disabled={readOnly} />
            </Field>

            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-semibold">{t("expediteur_des_emails")}</h3>
                <p className="text-xs text-muted-foreground text-pretty">
                  {t("les_emails_envoyes_en_ton_nom_c54e")}
                </p>
              </div>
              <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("nom_d_expediteur")} htmlFor="senderName" hint={t("sans_lui_le_nom_de_l_4941")}>
                  <Input id="senderName" name="senderName" placeholder={org.name} defaultValue={org.senderName ?? ""} disabled={readOnly} maxLength={120} />
                </Field>
                <Field label={t("adresse_de_reponse")} htmlFor="senderEmail" hint={t("recoit_les_reponses_de_tes_contacts")}>
                  <Input id="senderEmail" name="senderEmail" type="email" placeholder={t("contact_mon_cabinet_fr")} defaultValue={org.senderEmail ?? ""} disabled={readOnly} />
                </Field>
              </div>
            </div>

            {!readOnly && (
              <Button type="submit" className="w-fit">
                {t("enregistrer_la_marque")}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <EmailDomainCard org={org} readOnly={readOnly} sharedDomain={sharedDomain} effectiveFrom={effectiveFrom} />

      <LegalFootprintCard org={org} readOnly={readOnly} />

      <IngestAddressCard org={org} readOnly={readOnly} inboundDomain={receivingDomain} />

      <AutoSendCard org={org} readOnly={readOnly} />

      <Card id="langue" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>{t("langue_devise_et_fuseau")}</CardTitle>
          <CardDescription>{t("la_langue_de_l_espace_par_defaut_1a2b")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveRegionalSettings} className="flex flex-col gap-5">
            <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t("langue_par_defaut")} htmlFor="defaultLocale" hint={t("chaque_membre_peut_choisir_la_sienne_c3d4")}>
                <select id="defaultLocale" name="defaultLocale" defaultValue={org.defaultLocale} disabled={readOnly} className={SELECT_CLASS}>
                  {LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                      {localeDisplayName(locale)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("devise")} htmlFor="currency" hint={t("les_montants_s_affichent_dans_cette_e5f6")}>
                <select id="currency" name="currency" defaultValue={org.currency} disabled={readOnly} className={SELECT_CLASS}>
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency} — {currencyDisplayName(currency, fmt.tag)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("fuseau_horaire")} htmlFor="timezone" hint={t("dates_heures_et_echeances_se_lisent_a7b8")}>
                <select id="timezone" name="timezone" defaultValue={org.timezone} disabled={readOnly} className={SELECT_CLASS}>
                  {listTimeZones().map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {!readOnly && (
              <Button type="submit" className="w-fit">
                {t("enregistrer_langue_devise_et_fuseau")}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card id="logo" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>{t("logo")}</CardTitle>
          <CardDescription>
            {t("une_version_pour_fond_clair_une_0410")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div style={savedBrand}>
            <BrandLogoUploader organizationName={org.name} urls={assetUrls} disabled={readOnly} brandHex={savedHex} />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------
          Le pack métier : la liste des indicateurs mis en avant sur le
          tableau de bord vient d'ici — une donnée de l'organisation, pas
          une condition dans le code du tableau de bord.
      ------------------------------------------------------------------ */}
      <Card id="pack-metier" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>{t("pack_metier")}</CardTitle>
          <CardDescription>
            {t("les_indicateurs_mis_en_avant_sur_4291", { n: (!resolveBusinessPack(org.businessPack).chosen && t("aucun_pack_n_est_choisi_pour_b897")) || "" })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={savePack} className="flex flex-col gap-3">
            {BUSINESS_PACK_LIST.map((pack) => (
              <label key={pack.key} className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
                <input
                  type="radio"
                  name="businessPack"
                  value={pack.key}
                  defaultChecked={org.businessPack === pack.key}
                  disabled={readOnly}
                  className="mt-1 accent-primary"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  {t.rich("sur_le_tableau_de_bord", { label: tm(`packs.${pack.key}.label`), audience: tm(`packs.${pack.key}.audience`), description: tm(`packs.${pack.key}.description`), join: pack.indicators.map((id) => tm(`definitions.${id}.label`).toLowerCase()).join(" · "), span: (chunks) => <span className="text-sm font-medium">{chunks}</span>, span2: (chunks) => <span className="text-xs text-muted-foreground">{chunks}</span>, span3: (chunks) => <span className="text-xs text-pretty">{chunks}</span>, span4: (chunks) => <span className="text-xs text-muted-foreground text-pretty">{chunks}</span> })}
                </span>
              </label>
            ))}
            {!readOnly && (
              <Button type="submit" className="w-fit">
                {t("enregistrer_le_pack")}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------
          Pipelines et étapes — des lignes de table par organisation, jamais
          un vocabulaire figé. Les étapes se renomment et se réordonnent, ne
          se suppriment pas (l'historique des affaires les référence).
      ------------------------------------------------------------------ */}
      {pipelines.map((pipeline) => (
        <Card key={pipeline.id}>
          <CardHeader>
            <CardTitle>
              <form action={renamePipeline} className="flex items-center gap-2">
                <input type="hidden" name="pipelineId" value={pipeline.id} />
                <Input
                  name="label"
                  defaultValue={pipeline.label}
                  disabled={readOnly}
                  className="max-w-60 font-semibold"
                  aria-label={t("nom_du_pipeline")}
                />
                {!readOnly && (
                  <Button type="submit" variant="ghost" size="sm">
                    {t("renommer")}
                  </Button>
                )}
              </form>
            </CardTitle>
            <CardDescription>
              {t("les_etapes_de_ce_pipeline_leur_6f64")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {pipeline.stages.map((stage, index) => (
              <form
                key={stage.id}
                action={saveStage}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <input type="hidden" name="stageId" value={stage.id} />
                <span className="flex flex-col gap-0.5">
                  <button
                    type="submit"
                    formAction={moveStageUpForm}
                    disabled={readOnly || index === 0}
                    aria-label={t("monter", { label: stage.label })}
                    className="text-muted-foreground disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="submit"
                    formAction={moveStageDownForm}
                    disabled={readOnly || index === pipeline.stages.length - 1}
                    aria-label={t("descendre", { label: stage.label })}
                    className="text-muted-foreground disabled:opacity-30"
                  >
                    ▼
                  </button>
                </span>
                <Input name="label" defaultValue={stage.label} disabled={readOnly} className="w-44" aria-label={t("libelle_de_l_etape")} />
                <Input name="color" defaultValue={stage.color ?? ""} disabled={readOnly} placeholder={DEFAULT_BRAND_PRIMARY} className="w-28" aria-label={t("couleur")} />
                <Input
                  name="probability"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={stage.probability ?? ""}
                  disabled={readOnly}
                  placeholder="%"
                  className="w-20 text-right tabular-nums"
                  aria-label={t("probabilite")}
                />
                <select
                  name="outcome"
                  defaultValue={stage.outcome ?? ""}
                  disabled={readOnly}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                  aria-label={t("marqueur_de_fin")}
                >
                  <option value="">{t("etape_intermediaire")}</option>
                  <option value="won">{t("gagne")}</option>
                  <option value="lost">{t("perdu")}</option>
                </select>
                {!readOnly && (
                  <Button type="submit" variant="ghost" size="sm">
                    {t("enregistrer")}
                  </Button>
                )}
              </form>
            ))}

            {!readOnly && (
              <form action={addStage} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
                <input type="hidden" name="pipelineId" value={pipeline.id} />
                <Input name="label" placeholder={t("nouvelle_etape")} required className="w-44" aria-label={t("libelle_de_la_nouvelle_etape")} />
                <Input name="color" placeholder={DEFAULT_BRAND_PRIMARY} className="w-28" aria-label={t("couleur")} />
                <Input name="probability" type="number" min="0" max="100" placeholder="%" className="w-20 text-right" aria-label={t("probabilite")} />
                <select name="outcome" defaultValue="" className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" aria-label={t("marqueur_de_fin")}>
                  <option value="">{t("etape_intermediaire")}</option>
                  <option value="won">{t("gagne")}</option>
                  <option value="lost">{t("perdu")}</option>
                </select>
                <Button type="submit" variant="outline" size="sm">
                  {t("ajouter_l_etape")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ))}

      {!readOnly && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{t("nouveau_pipeline")}</CardTitle>
            <CardDescription>
              {t("une_famille_d_affaires_avec_ses_e8c5")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addPipeline} className="flex items-end gap-2">
              <Field label={t("nom_du_pipeline")} htmlFor="newPipelineLabel" className="flex-1">
                <Input id="newPipelineLabel" name="label" placeholder={t("placement")} required />
              </Field>
              <Button type="submit">{t("creer")}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}

      {/* ------------------------------------------------------------------
          Collecte des leads et des visites (module analytique) : clés
          d'API serveur, clés de site et extrait, domaines autorisés
          (fail-closed, jamais silencieux : les refus sont comptés ici).
      ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>{t("collecte_des_leads_et_des_visites")}</CardTitle>
          <CardDescription>
            {t("deux_entrees_les_leads_envoyes_par_ee12")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {nothingConnected ? (
            <EmptyState title={t("rien_n_est_branche_pour_l_6c0a")}>
              {t("aucune_visite_ni_aucun_lead_recus_d528")}
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{t("visites_30_jours")}</p>
                <p className="text-2xl font-semibold tabular-nums">{collection.visits30d}</p>
                <p className="text-xs text-muted-foreground">
                  {collection.lastEventAt ? t("dernier_evenement_le", { formatDateTime: fmt.dateTime(collection.lastEventAt) }) : t("aucun_evenement")}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{t("simulations_30_jours")}</p>
                <p className="text-2xl font-semibold tabular-nums">{collection.simulations30d}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{t("leads_30_jours")}</p>
                <p className="text-2xl font-semibold tabular-nums">{collection.leads30d}</p>
                <p className="text-xs text-muted-foreground">
                  {collection.lastLeadAt ? t("dernier_le", { formatDateTime: fmt.dateTime(collection.lastLeadAt) }) : t("aucun_lead")}
                </p>
              </div>
            </div>
          )}

          {collection.rejections.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p className="text-sm font-medium">{t("requetes_refusees_a_corriger_sinon_la_f8d0")}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {collection.rejections.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      {rejectionLabel(r.reason, t)} · <span className="font-medium">{r.detail}</span>
                      {r.reason === "domain_not_allowed" && (
                        <span className="text-muted-foreground"> {t("ajoute_ce_domaine_ci_dessous_s_79a9")}</span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {t("fois_derniere_le", { count: r.count, formatDateTime: fmt.dateTime(r.lastSeenAt) })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t("ligne_de_script_a_poser_sur_276d")}</h3>
            {activeSiteKeys.map((k) => (
              <div key={k.id} className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  {t("cle_creee_le", { label: k.label, formatDateTime: fmt.dateTime(k.createdAt) })}
                </p>
                <code className="block rounded-md bg-muted px-3 py-2 text-xs break-all select-all">
                  {t("script_src_s_js_data_site_ae81", { appOrigin, key: k.key })}
                </code>
                {!readOnly && activeSiteKeys.length > 1 && (
                  <form action={revokeSiteKeyAction.bind(null, k.id)}>
                    <Button type="submit" variant="ghost" size="sm">{t("revoquer_cette_cle_de_site")}</Button>
                  </form>
                )}
              </div>
            ))}
            {siteKeyRows.some((k) => k.revokedAt) && (
              <p className="text-xs text-muted-foreground">
                {t("cle_s_de_site_revoquee_s_e4b5", { count: siteKeyRows.filter((k) => k.revokedAt).length })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t.rich("pour_faire_tourner_une_cle_sans_7a76", { code: (chunks) => <code>{chunks}</code>, code2: (chunks) => <code>{chunks}</code>, code3: (chunks) => <code>{chunks}</code> })}
            </p>
            {!readOnly && (
              <form action={createSiteKeyAction} className="flex flex-wrap items-end gap-2">
                <Field label={t("nouvelle_cle_de_site")} htmlFor="site-key-label" className="w-72">
                  <Input id="site-key-label" name="label" placeholder={t("site_vitrine")} />
                </Field>
                <Button type="submit" variant="outline">{t("creer")}</Button>
              </form>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t("domaines_autorises")}</h3>
            <form action={updateAllowedDomainsAction} className="flex flex-col gap-2">
              <Field
                label={t("un_domaine_par_ligne_hote_seul_e84e")}
                htmlFor="allowed-domains"
                hint={t("rien_n_est_accepte_tant_que_d6a1")}
              >
                <Textarea id="allowed-domains" name="domains" defaultValue={org.allowedDomains.join("\n")} disabled={readOnly} className="min-h-20 max-w-xl font-mono text-xs" placeholder={t("www_mon_cabinet_fr_simulateur_mon_c2b2")} />
              </Field>
              {!readOnly && (
                <Button type="submit" variant="outline" className="w-fit">{t("enregistrer_les_domaines")}</Button>
              )}
            </form>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t("cles_d_api_leads_cote_serveur")}</h3>
            {apiKeyRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aucune_cle_chaque_integration_serveur_recoit_5bce")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {apiKeyRows.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="flex min-w-0 flex-col">
                      {t.rich("creee_le", { label: k.label, keyPrefix: k.keyPrefix, formatDateTime: fmt.dateTime(k.createdAt), value: k.lastUsedAt ? t("dernier_usage_le", { formatDateTime: fmt.dateTime(k.lastUsedAt) }) : t("jamais_utilisee"), n: (k.revokedAt && t("revoquee_le", { formatDateTime: fmt.dateTime(k.revokedAt) })) ?? "", code: (chunks) => <code className="text-xs text-muted-foreground">{chunks}</code>, span: (chunks) => <span className="font-medium">{chunks}</span>, span2: (chunks) => <span className="text-xs tabular-nums text-muted-foreground">{chunks}</span> })}
                    </span>
                    {!readOnly && !k.revokedAt && (
                      <form action={revokeApiKeyAction.bind(null, k.id)}>
                        <Button type="submit" variant="ghost" size="sm">{t("revoquer")}</Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && <ApiKeyCreator />}
            <p className="text-xs text-muted-foreground">
              {t.rich("envoi_post_api_leads_en_tete_7cd8", { appOrigin, code: (chunks) => <code>{chunks}</code>, code2: (chunks) => <code>{chunks}</code>, code3: (chunks) => <code>{chunks}</code>, code4: (chunks) => <code>{chunks}</code>, code5: (chunks) => <code>{chunks}</code>, code6: (chunks) => <code>{chunks}</code>, code7: (chunks) => <code>{chunks}</code>, code8: (chunks) => <code>{chunks}</code>, code9: (chunks) => <code>{chunks}</code> })}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t("motifs_de_perte")}</CardTitle>
          <CardDescription>
            {t("proposes_quand_une_affaire_part_sur_8e27")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {lossReasons.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("aucun_motif_pour_l_instant_taux_72e7")}
            </p>
          )}
          {lossReasons.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <span className="text-sm">{r.label}</span>
              {!readOnly && (
                <form action={removeLossReason}>
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    {t("supprimer")}
                  </Button>
                </form>
              )}
            </div>
          ))}
          {!readOnly && (
            <form action={addLossReason} className="flex items-end gap-2 pt-1">
              <Field label={t("nouveau_motif")} htmlFor="newLossReason" className="flex-1">
                <Input id="newLossReason" name="label" required />
              </Field>
              <Button type="submit" variant="outline">
                {t("ajouter")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </>
  );
}
