import Link from "next/link";
import { signOut } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getVisibleOrganizations } from "@/db/queries/organizations";
import { requireUser } from "@/lib/session";

const roleLabels: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  member: "Membre",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const visibleOrganizations = await getVisibleOrganizations(user);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button render={<Link href="/newsletters">Newsletters</Link>} />
          {user.organizationId && (
            <Button variant="outline" render={<Link href="/settings">Marque & réglages</Link>} />
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button variant="outline" type="submit">
              Se déconnecter
            </Button>
          </form>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ton compte</CardTitle>
          <CardDescription>
            Rôle : <Badge variant="secondary">{roleLabels[user.role] ?? user.role}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {user.organizationId
            ? `Organisation : ${user.organizationId}`
            : "Aucune organisation (vue globale super_admin)"}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organisations visibles</CardTitle>
          <CardDescription>
            {user.role === "super_admin"
              ? "Toutes les organisations (vue super_admin)."
              : "Uniquement ta propre organisation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {visibleOrganizations.map((org) => (
              <li
                key={org.id}
                className="rounded-md border px-3 py-2 text-sm"
              >
                {org.name} <span className="text-muted-foreground">({org.slug})</span>
              </li>
            ))}
            {visibleOrganizations.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Aucune organisation visible.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
