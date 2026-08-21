import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Fiche introuvable — id inconnu, ou fiche d'une autre organisation. */
export default function ContactNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm font-medium">Cette fiche n&apos;existe pas.</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Le lien est peut-être périmé, ou la fiche appartient à un autre espace.
      </p>
      <Link href="/contacts" className={buttonVariants({ variant: "outline" })}>
        Retour aux contacts
      </Link>
    </div>
  );
}
