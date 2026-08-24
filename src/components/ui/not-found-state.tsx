import Link from "next/link";
import type { ReactNode } from "react";
import { SearchX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

/**
 * « Ça n'existe pas » — le panneau des `not-found.tsx` : un identifiant
 * inconnu, un lien périmé, ou une donnée d'un autre espace (on ne distingue
 * jamais les deux derniers cas : dire « ça existe mais pas pour toi »
 * confirmerait l'existence d'une donnée qu'on n'a pas le droit de voir).
 */
export function NotFoundState({
  title,
  children,
  backHref,
  backLabel,
}: {
  title: string;
  children?: ReactNode;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5"
      >
        <SearchX />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{title}</p>
        {children && <p className="max-w-md text-sm text-muted-foreground text-pretty">{children}</p>}
      </div>
      <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
        {backLabel}
      </Link>
    </div>
  );
}
