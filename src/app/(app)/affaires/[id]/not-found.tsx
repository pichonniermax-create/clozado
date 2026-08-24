import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Affaire introuvable — id inconnu, ou affaire d'une autre organisation. */
export default function DealNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm font-medium">Cette affaire n&apos;existe pas.</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Le lien est peut-être périmé, ou l&apos;affaire appartient à un autre espace.
      </p>
      <Link href="/affaires" className={buttonVariants({ variant: "outline" })}>
        Retour aux affaires
      </Link>
    </div>
  );
}
