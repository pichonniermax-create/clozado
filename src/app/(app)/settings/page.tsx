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
import { formatDateTime } from "@/lib/format";
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
import { withError } from "@/lib/form-actions";
import { BUSINESS_PACK_LIST, METRICS, resolveBusinessPack } from "@/lib/metrics";
import { requestOrigin } from "@/lib/request-origin";
import { requireUser } from "@/lib/session";

async function saveBranding(formData: FormData) {
  "use server";
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
    redirect(withError("/settings", "La couleur n'est pas un code hexadécimal valide."));
  }

  // L'expéditeur des emails : le nom sans retour à la ligne (un en-tête
  // d'email s'injecte par là), l'adresse en minuscules et plausible.
  const senderName = String(formData.get("senderName") ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120) || null;
  const senderEmail = String(formData.get("senderEmail") ?? "").trim().toLowerCase() || null;
  if (senderEmail && !isPlausibleEmail(senderEmail)) {
    redirect(withError("/settings", "L'adresse de réponse ne semble pas valide."));
  }
  await updateOrganizationBranding(user, {
    name,
    primaryColor,
    fontFamily: String(formData.get("fontFamily") ?? "").trim() || null,
    senderName,
    senderEmail,
  });

  revalidatePath("/settings");
  redirect(withError("/settings", "Marque enregistrée.", "info"));
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

const REJECTION_LABELS: Record<string, string> = {
  domain_not_allowed: "Domaine non déclaré",
  origin_missing: "Requête sans domaine d'origine",
  site_key_revoked: "Clé de site révoquée encore utilisée",
  api_key_revoked: "Clé d'API révoquée encore utilisée",
  rate_limited: "Débit dépassé",
  payload_too_large: "Charge trop volumineuse",
  invalid_payload: "Charge invalide",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ erreur?: string; info?: string }> }) {
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
        title="Marque & réglages"
        description={
          readOnly
            ? "Lecture seule — seul l'admin de l'organisation peut modifier ces réglages."
            : "Ton nom, ta couleur et ton logo : ce que voit ton équipe dans l'application, tes partenaires sur les pages de partage, tes contacts dans tes emails."
        }
      />

      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}
      {info && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{info}</p>}

      <Card id="marque" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>{org.name}</CardTitle>
          <CardDescription>
            Identifiant : {org.slug}. Une seule couleur : le système en dérive les boutons, les liens, les fonds légers
            et la ligne active de la navigation, en garantissant que tout reste lisible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveBranding} className="flex flex-col gap-5">
            <Field label="Nom affiché" htmlFor="name" className="max-w-xl">
              <Input id="name" name="name" defaultValue={org.name} disabled={readOnly} required />
            </Field>

            <Field label="Couleur de la marque" htmlFor="brand-color">
              <BrandColorPicker initialHex={org.primaryColor} name="primaryColor" disabled={readOnly} />
            </Field>

            <Field label="Police des emails" htmlFor="fontFamily" hint="N'affecte que le gabarit des emails — la typographie de l'application ne se personnalise pas." className="max-w-xl">
              <Input id="fontFamily" name="fontFamily" placeholder="Inter" defaultValue={org.fontFamily ?? ""} disabled={readOnly} />
            </Field>

            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-semibold">Expéditeur des emails</h3>
                <p className="text-xs text-muted-foreground text-pretty">
                  Les emails envoyés en ton nom partent depuis l&apos;adresse du produit, avec ton nom d&apos;expéditeur devant ;
                  ton adresse reçoit les réponses. Elle deviendra l&apos;expéditeur lui-même une fois ton domaine d&apos;envoi vérifié.
                </p>
              </div>
              <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nom d'expéditeur" htmlFor="senderName" hint="Sans lui, le nom de l'organisation.">
                  <Input id="senderName" name="senderName" placeholder={org.name} defaultValue={org.senderName ?? ""} disabled={readOnly} maxLength={120} />
                </Field>
                <Field label="Adresse de réponse" htmlFor="senderEmail" hint="Reçoit les réponses de tes contacts.">
                  <Input id="senderEmail" name="senderEmail" type="email" placeholder="contact@mon-cabinet.fr" defaultValue={org.senderEmail ?? ""} disabled={readOnly} />
                </Field>
              </div>
            </div>

            {!readOnly && (
              <Button type="submit" className="w-fit">
                Enregistrer la marque
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card id="logo" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Une version pour fond clair, une version pour fond sombre si tu l&apos;as, et l&apos;icône d&apos;onglet dérivée
            automatiquement. Sans logo, la marque par défaut s&apos;affiche.
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
          <CardTitle>Pack métier</CardTitle>
          <CardDescription>
            Les indicateurs mis en avant sur le tableau de bord sont ceux de ton métier — un CGP suit ses encours et sa
            collecte, un courtier ses volumes et ses délais.
            {!resolveBusinessPack(org.businessPack).chosen && " Aucun pack n'est choisi pour l'instant : le tableau de bord montre le pack « Tout métier »."}
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
                  <span className="text-sm font-medium">{pack.label}</span>
                  <span className="text-xs text-muted-foreground">{pack.audience}</span>
                  <span className="text-xs text-pretty">{pack.description}</span>
                  <span className="text-xs text-muted-foreground text-pretty">
                    Sur le tableau de bord : {pack.indicators.map((id) => METRICS[id].label.toLowerCase()).join(" · ")}.
                  </span>
                </span>
              </label>
            ))}
            {!readOnly && (
              <Button type="submit" className="w-fit">
                Enregistrer le pack
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
                  aria-label="Nom du pipeline"
                />
                {!readOnly && (
                  <Button type="submit" variant="ghost" size="sm">
                    Renommer
                  </Button>
                )}
              </form>
            </CardTitle>
            <CardDescription>
              Les étapes de ce pipeline — leur ordre est celui du kanban. Probabilité indicative en %,
              marqueur gagné/perdu sur les étapes terminales.
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
                    aria-label={`Monter ${stage.label}`}
                    className="text-muted-foreground disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="submit"
                    formAction={moveStageDownForm}
                    disabled={readOnly || index === pipeline.stages.length - 1}
                    aria-label={`Descendre ${stage.label}`}
                    className="text-muted-foreground disabled:opacity-30"
                  >
                    ▼
                  </button>
                </span>
                <Input name="label" defaultValue={stage.label} disabled={readOnly} className="w-44" aria-label="Libellé de l'étape" />
                <Input name="color" defaultValue={stage.color ?? ""} disabled={readOnly} placeholder={DEFAULT_BRAND_PRIMARY} className="w-28" aria-label="Couleur" />
                <Input
                  name="probability"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={stage.probability ?? ""}
                  disabled={readOnly}
                  placeholder="%"
                  className="w-20 text-right tabular-nums"
                  aria-label="Probabilité"
                />
                <select
                  name="outcome"
                  defaultValue={stage.outcome ?? ""}
                  disabled={readOnly}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                  aria-label="Marqueur de fin"
                >
                  <option value="">Étape intermédiaire</option>
                  <option value="won">Gagné</option>
                  <option value="lost">Perdu</option>
                </select>
                {!readOnly && (
                  <Button type="submit" variant="ghost" size="sm">
                    Enregistrer
                  </Button>
                )}
              </form>
            ))}

            {!readOnly && (
              <form action={addStage} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
                <input type="hidden" name="pipelineId" value={pipeline.id} />
                <Input name="label" placeholder="Nouvelle étape" required className="w-44" aria-label="Libellé de la nouvelle étape" />
                <Input name="color" placeholder={DEFAULT_BRAND_PRIMARY} className="w-28" aria-label="Couleur" />
                <Input name="probability" type="number" min="0" max="100" placeholder="%" className="w-20 text-right" aria-label="Probabilité" />
                <select name="outcome" defaultValue="" className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" aria-label="Marqueur de fin">
                  <option value="">Étape intermédiaire</option>
                  <option value="won">Gagné</option>
                  <option value="lost">Perdu</option>
                </select>
                <Button type="submit" variant="outline" size="sm">
                  Ajouter l&apos;étape
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ))}

      {!readOnly && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Nouveau pipeline</CardTitle>
            <CardDescription>
              Une famille d&apos;affaires avec ses propres étapes (crédit, placement, transaction…).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addPipeline} className="flex items-end gap-2">
              <Field label="Nom du pipeline" htmlFor="newPipelineLabel" className="flex-1">
                <Input id="newPipelineLabel" name="label" placeholder="Placement" required />
              </Field>
              <Button type="submit">Créer</Button>
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
          <CardTitle>Collecte des leads et des visites</CardTitle>
          <CardDescription>
            Deux entrées : les leads, envoyés par tes simulateurs côté serveur avec une clé d&apos;API ; les visites et
            simulations, envoyées par une ligne de script posée sur tes sites, acceptées seulement depuis les domaines
            déclarés ci-dessous.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {nothingConnected ? (
            <EmptyState title="Rien n'est branché pour l'instant">
              Aucune visite ni aucun lead reçus. Le reste du produit fonctionne sans ; le funnel d&apos;acquisition
              se remplira dès que la ligne de script sera posée et un domaine déclaré, et dès qu&apos;un simulateur
              enverra des leads avec une clé d&apos;API.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Visites (30 jours)</p>
                <p className="text-2xl font-semibold tabular-nums">{collection.visits30d}</p>
                <p className="text-xs text-muted-foreground">
                  {collection.lastEventAt ? `dernier événement le ${formatDateTime(collection.lastEventAt)}` : "aucun événement"}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Simulations (30 jours)</p>
                <p className="text-2xl font-semibold tabular-nums">{collection.simulations30d}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Leads (30 jours)</p>
                <p className="text-2xl font-semibold tabular-nums">{collection.leads30d}</p>
                <p className="text-xs text-muted-foreground">
                  {collection.lastLeadAt ? `dernier le ${formatDateTime(collection.lastLeadAt)}` : "aucun lead"}
                </p>
              </div>
            </div>
          )}

          {collection.rejections.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p className="text-sm font-medium">Requêtes refusées — à corriger, sinon la collecte reste muette</p>
              <ul className="flex flex-col gap-1 text-sm">
                {collection.rejections.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      {REJECTION_LABELS[r.reason] ?? r.reason} · <span className="font-medium">{r.detail}</span>
                      {r.reason === "domain_not_allowed" && (
                        <span className="text-muted-foreground"> — ajoute ce domaine ci-dessous s&apos;il est à toi</span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {r.count} fois · dernière le {formatDateTime(r.lastSeenAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Ligne de script à poser sur tes sites</h3>
            {activeSiteKeys.map((k) => (
              <div key={k.id} className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  {k.label} · clé créée le {formatDateTime(k.createdAt)}
                </p>
                <code className="block rounded-md bg-muted px-3 py-2 text-xs break-all select-all">
                  {`<script src="${appOrigin}/s.js" data-site="${k.key}" async></script>`}
                </code>
                {!readOnly && activeSiteKeys.length > 1 && (
                  <form action={revokeSiteKeyAction.bind(null, k.id)}>
                    <Button type="submit" variant="ghost" size="sm">Révoquer cette clé de site</Button>
                  </form>
                )}
              </div>
            ))}
            {siteKeyRows.some((k) => k.revokedAt) && (
              <p className="text-xs text-muted-foreground">
                {siteKeyRows.filter((k) => k.revokedAt).length} clé(s) de site révoquée(s) — les scripts qui les portent encore sont refusés et comptés ci-dessus.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Pour faire tourner une clé sans couper la collecte : crée la nouvelle, pose-la sur tes sites, puis révoque l&apos;ancienne.
              Pour un simulateur, ajoute <code>data-simulator=&quot;…&quot;</code> et appelle{" "}
              <code>clozado.track(&quot;simulation_started&quot;)</code> / <code>clozado.track(&quot;simulation_completed&quot;)</code>.
            </p>
            {!readOnly && (
              <form action={createSiteKeyAction} className="flex flex-wrap items-end gap-2">
                <Field label="Nouvelle clé de site" htmlFor="site-key-label" className="w-72">
                  <Input id="site-key-label" name="label" placeholder="Site vitrine" />
                </Field>
                <Button type="submit" variant="outline">Créer</Button>
              </form>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Domaines autorisés</h3>
            <form action={updateAllowedDomainsAction} className="flex flex-col gap-2">
              <Field
                label="Un domaine par ligne (hôte seul, sans https:// ni chemin)"
                htmlFor="allowed-domains"
                hint="Rien n'est accepté tant que cette liste est vide — c'est voulu : sans elle, n'importe qui pourrait polluer ta collecte. Les refus sont comptés plus haut."
              >
                <Textarea id="allowed-domains" name="domains" defaultValue={org.allowedDomains.join("\n")} disabled={readOnly} className="min-h-20 max-w-xl font-mono text-xs" placeholder={"www.mon-cabinet.fr\nsimulateur.mon-cabinet.fr"} />
              </Field>
              {!readOnly && (
                <Button type="submit" variant="outline" className="w-fit">Enregistrer les domaines</Button>
              )}
            </form>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Clés d&apos;API (leads, côté serveur)</h3>
            {apiKeyRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune clé. Chaque intégration serveur reçoit la sienne — révocable séparément.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {apiKeyRows.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">
                        {k.label} <code className="text-xs text-muted-foreground">{k.keyPrefix}…</code>
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        créée le {formatDateTime(k.createdAt)}
                        {k.lastUsedAt ? ` · dernier usage le ${formatDateTime(k.lastUsedAt)}` : " · jamais utilisée"}
                        {k.revokedAt && ` · révoquée le ${formatDateTime(k.revokedAt)}`}
                      </span>
                    </span>
                    {!readOnly && !k.revokedAt && (
                      <form action={revokeApiKeyAction.bind(null, k.id)}>
                        <Button type="submit" variant="ghost" size="sm">Révoquer</Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && <ApiKeyCreator />}
            <p className="text-xs text-muted-foreground">
              Envoi : <code>POST {appOrigin}/api/leads</code>, en-tête <code>Authorization: Bearer clz_…</code>, JSON avec au moins <code>email</code> ou <code>phone</code>, et <code>origin</code>, <code>simulator</code>, <code>visitor_id</code>, <code>utm_*</code>, <code>payload</code> (≤ 16 Ko).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Motifs de perte</CardTitle>
          <CardDescription>
            Proposés quand une affaire part sur une étape « perdu ». Un motif utilisé par une
            affaire ne peut plus être supprimé.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {lossReasons.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucun motif pour l&apos;instant — « Taux concurrent », « Projet abandonné »…
            </p>
          )}
          {lossReasons.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <span className="text-sm">{r.label}</span>
              {!readOnly && (
                <form action={removeLossReason}>
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Supprimer
                  </Button>
                </form>
              )}
            </div>
          ))}
          {!readOnly && (
            <form action={addLossReason} className="flex items-end gap-2 pt-1">
              <Field label="Nouveau motif" htmlFor="newLossReason" className="flex-1">
                <Input id="newLossReason" name="label" required />
              </Field>
              <Button type="submit" variant="outline">
                Ajouter
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </>
  );
}
