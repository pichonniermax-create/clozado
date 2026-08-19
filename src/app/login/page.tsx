import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function sendMagicLink(formData: FormData) {
  "use server";
  const email = formData.get("email");
  if (typeof email !== "string" || !email) return;
  // Ce redirectTo s'applique une fois le lien magique VALIDÉ (pas avant) :
  // c'est là qu'on veut atterrir sur /dashboard. La page "vérifie tes
  // emails" s'affiche automatiquement juste après, via pages.verifyRequest
  // dans src/auth.ts — pas besoin de la référencer ici.
  await signIn("nodemailer", { email, redirectTo: "/dashboard" });
}

const errorMessages: Record<string, string> = {
  AccessDenied:
    "Cet email n'est pas reconnu. Contacte l'administrateur de ton organisation pour être invité.",
  Verification: "Ce lien de connexion a expiré ou a déjà été utilisé.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? (errorMessages[error] ?? "Une erreur est survenue.") : null;

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Connexion à Clozado</CardTitle>
          <CardDescription>
            Entre ton email professionnel, tu recevras un lien de connexion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendMagicLink} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="toi@exemple.com"
                required
              />
            </div>
            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
            <Button type="submit">Envoyer le lien de connexion</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
