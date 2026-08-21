import Link from "next/link";
import { Composer } from "@/components/newsletter/composer";
import { listMailTargets } from "@/db/queries/mail-targets";
import { requireUser } from "@/lib/session";

export default async function NewNewsletterPage() {
  const user = await requireUser();
  const targets = await listMailTargets(user);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-8">
      <div>
        <Link href="/newsletters" className="text-sm text-muted-foreground hover:underline">
          ← Retour aux newsletters
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Nouvelle newsletter</h1>
      </div>
      <Composer targets={targets} />
    </div>
  );
}
