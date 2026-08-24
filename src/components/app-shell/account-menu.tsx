"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** « Camille Rousseau » → « CR », « camille@… » → « C ». */
function initialsOf(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * Le menu de compte de l'en-tête : qui est connecté, les réglages de son
 * organisation, la déconnexion. Avant, la déconnexion était une icône au
 * pied de la navigation et rien ne disait le nom du compte au-delà de
 * l'email. La déconnexion reste un formulaire (action serveur) : elle
 * marche même sans JavaScript.
 */
export function AccountMenu({
  name,
  email,
  hasOrganization,
  signOutAction,
}: {
  name: string | null;
  email: string | null;
  hasOrganization: boolean;
  signOutAction: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Mon compte"
            title={email ?? "Mon compte"}
            className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <Avatar>
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initialsOf(name, email)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{name ?? "Mon compte"}</span>
            {email && <span className="truncate text-xs font-normal">{email}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {hasOrganization && (
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings />
            Marque &amp; réglages
          </DropdownMenuItem>
        )}
        <form action={signOutAction}>
          {/* Un vrai <button> de formulaire : Base UI doit le savoir (nativeButton) pour lui laisser son comportement natif. */}
          <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>
            <LogOut />
            Se déconnecter
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
