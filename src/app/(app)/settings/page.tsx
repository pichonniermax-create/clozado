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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getOwnOrganization,
  updateOrganizationBranding,
} from "@/db/queries/organizations";
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nom affiché</Label>
              <Input
                id="name"
                name="name"
                defaultValue={org.name}
                disabled={readOnly}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="logoUrl">Logo (lien vers une image)</Label>
              <Input
                id="logoUrl"
                name="logoUrl"
                type="url"
                placeholder="https://..."
                defaultValue={org.logoUrl ?? ""}
                disabled={readOnly}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="primaryColor">Couleur principale</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="primaryColor"
                  name="primaryColor"
                  placeholder="#2563eb"
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
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="fontFamily">Police</Label>
              <Input
                id="fontFamily"
                name="fontFamily"
                placeholder="Inter"
                defaultValue={org.fontFamily ?? ""}
                disabled={readOnly}
              />
            </div>

            {!readOnly && (
              <Button type="submit" className="w-fit">
                Enregistrer
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </>
  );
}
