import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { requireUser } from "@/lib/session";

async function saveBranding(formData: FormData) {
  "use server";
  // On revalide tout côté serveur : le formulaire peut être désactivé
  // côté client, mais le vrai garde-fou est ici.
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await updateOrganizationBranding(user, {
    name,
    logoUrl: String(formData.get("logoUrl") ?? "").trim() || null,
    primaryColor: String(formData.get("primaryColor") ?? "").trim() || null,
    fontFamily: String(formData.get("fontFamily") ?? "").trim() || null,
  });

  redirect("/settings");
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

export default async function SettingsPage() {
  const user = await requireUser();

  // Le super_admin n'a pas d'organisation propre : cet écran ne le concerne pas.
  if (!user.organizationId) {
    redirect("/dashboard");
  }

  const org = await getOwnOrganization(user);
  if (!org) {
    redirect("/dashboard");
  }

  const readOnly = user.role !== "admin";
  const [pipelines, lossReasons] = await Promise.all([
    listPipelinesWithStages(user),
    listLossReasons(user),
  ]);

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
            : "Ce que voient tes partenaires sur les pages de partage et dans tes emails."
        }
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{org.name}</CardTitle>
          <CardDescription>Identifiant : {org.slug}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveBranding} className="flex flex-col gap-4">
            <Field label="Nom affiché" htmlFor="name">
              <Input
                id="name"
                name="name"
                defaultValue={org.name}
                disabled={readOnly}
                required
              />
            </Field>

            <Field label="Logo (lien vers une image)" htmlFor="logoUrl">
              <Input
                id="logoUrl"
                name="logoUrl"
                type="url"
                placeholder="https://..."
                defaultValue={org.logoUrl ?? ""}
                disabled={readOnly}
              />
            </Field>

            <Field label="Couleur principale" htmlFor="primaryColor">
              <div className="flex items-center gap-2">
                <Input
                  id="primaryColor"
                  name="primaryColor"
                  placeholder={DEFAULT_BRAND_PRIMARY}
                  defaultValue={org.primaryColor ?? ""}
                  disabled={readOnly}
                  className="max-w-40"
                />
                {org.primaryColor && (
                  <span
                    aria-hidden
                    className="h-8 w-8 shrink-0 rounded-md border"
                    style={{ backgroundColor: org.primaryColor }}
                  />
                )}
              </div>
            </Field>

            <Field label="Police" htmlFor="fontFamily">
              <Input
                id="fontFamily"
                name="fontFamily"
                placeholder="Inter"
                defaultValue={org.fontFamily ?? ""}
                disabled={readOnly}
              />
            </Field>

            {!readOnly && (
              <Button type="submit" className="w-fit">
                Enregistrer
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
                <Input name="color" defaultValue={stage.color ?? ""} disabled={readOnly} placeholder="#16a34a" className="w-28" aria-label="Couleur" />
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
                <Input name="color" placeholder="#2563eb" className="w-28" aria-label="Couleur" />
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
