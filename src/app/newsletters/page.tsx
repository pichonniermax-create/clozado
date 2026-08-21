import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteNewsletter, listNewsletters } from "@/lib/newsletter/actions";
import { requireUser } from "@/lib/session";

export default async function NewslettersPage() {
  const user = await requireUser();
  const items = await listNewsletters();

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            ← Retour au tableau de bord
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Newsletters</h1>
        </div>
        <Button render={<Link href="/newsletters/new">Nouvelle newsletter</Link>} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {user.role === "super_admin"
              ? "Toutes les organisations"
              : "Ton organisation"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {items.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <Link href={`/newsletters/${n.id}`} className="flex flex-col">
                  <span className="text-sm font-medium">{n.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {n.subject ?? "Sans objet"}
                  </span>
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await deleteNewsletter(n.id);
                    redirect("/newsletters");
                  }}
                >
                  <Button variant="ghost" size="sm" type="submit">
                    Supprimer
                  </Button>
                </form>
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Aucune newsletter pour l&apos;instant.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
