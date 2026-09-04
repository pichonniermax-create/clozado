"use client";

import Link from "next/link";
import { Check, Compass, LogOut, Settings, UserRound } from "lucide-react";
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
import { useLocale, useTranslations } from "next-intl";
import { LOCALES, localeDisplayName, type AppLocale } from "@/i18n/locales";
import { TOUR_PARAM } from "@/lib/tour/steps";

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
  localeChoice,
  signOutAction,
  setLocaleAction,
}: {
  name: string | null;
  email: string | null;
  hasOrganization: boolean;
  /** La langue mémorisée de la personne — null quand elle suit celle de l'organisation. */
  localeChoice: AppLocale | null;
  signOutAction: () => Promise<void>;
  setLocaleAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("shell.accountMenu");
  const current = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t("mon_compte")}
            title={email ?? t("mon_compte")}
            className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <Avatar>
          <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary-ink">
            {initialsOf(name, email)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{name ?? t("mon_compte")}</span>
            {email && <span className="truncate text-xs font-normal">{email}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profil" />}>
          <UserRound />
          {t("mon_profil")}
        </DropdownMenuItem>
        {hasOrganization && (
          <DropdownMenuItem render={<Link href={`/dashboard?${TOUR_PARAM}=1`} />}>
            <Compass />
            {t("visite_guidee")}
          </DropdownMenuItem>
        )}
        {hasOrganization && (
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings />
            {t("marque_reglages")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("langue")}</DropdownMenuLabel>
          {LOCALES.map((locale) => (
            <form action={setLocaleAction} key={locale}>
              <input type="hidden" name="locale" value={locale} />
              <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>
                {localeChoice === locale ? <Check /> : <span aria-hidden className="size-4" />}
                {localeDisplayName(locale)}
              </DropdownMenuItem>
            </form>
          ))}
          {hasOrganization && (
            <form action={setLocaleAction}>
              <input type="hidden" name="locale" value="" />
              <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>
                {localeChoice === null ? <Check /> : <span aria-hidden className="size-4" />}
                {t("celle_de_l_organisation", { language: localeDisplayName(current as AppLocale) })}
              </DropdownMenuItem>
            </form>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          {/* Un vrai <button> de formulaire : Base UI doit le savoir (nativeButton) pour lui laisser son comportement natif. */}
          <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>
            <LogOut />
            {t("se_deconnecter")}
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
