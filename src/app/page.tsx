import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Fondation technique
          </Badge>
          <CardTitle className="text-2xl">Clozado</CardTitle>
          <CardDescription>
            Suite d&apos;outils d&apos;assistance marketing multi-clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Le projet est initialisé. Les outils métier arriveront ensuite,
          brique par brique.
        </CardContent>
      </Card>
    </div>
  );
}
