"use client";

import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { QUICK_CREATE } from "@/components/app-shell/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * « Nouveau » — les gestes de création depuis n'importe quel écran. Chaque
 * entrée envoie sur l'écran concerné avec son formulaire déjà déplié
 * (`?nouveau=1`, posé à l'étape 2) : le menu n'est qu'un raccourci, il ne
 * duplique aucun formulaire.
 */
export function QuickCreateMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <Plus />
        Nouveau
        <ChevronDown className="opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {QUICK_CREATE.map(({ href, label, icon: Icon }) => (
          <DropdownMenuItem key={href} render={<Link href={href} />}>
            <Icon />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
