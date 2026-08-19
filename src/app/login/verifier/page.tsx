import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function VerifyRequestPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Vérifie tes emails</CardTitle>
          <CardDescription>
            Un lien de connexion vient de t&apos;être envoyé. Clique dessus
            pour accéder à ton espace.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Rien reçu après quelques minutes ? Vérifie tes spams, ou retente
          depuis la page de connexion.
        </CardContent>
      </Card>
    </div>
  );
}
