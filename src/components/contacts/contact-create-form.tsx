"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createContactAction, type CreateContactState } from "@/lib/contacts/actions";
import { useTranslations } from "next-intl";

const initialState: CreateContactState = { error: null, duplicates: null };

type OrgUser = { id: string; name: string | null; email: string };

/**
 * Création d'une fiche. Champs contrôlés à dessein : quand la détection de
 * doublons suspend la création, le formulaire revient avec sa réponse — ce
 * qui venait d'être saisi doit rester à l'écran (React 19 vide un
 * formulaire non contrôlé après l'action).
 */
export function ContactCreateForm({ orgUsers, currentUserId }: { orgUsers: OrgUser[]; currentUserId: string }) {
  const t = useTranslations("contacts.contactCreateForm");
  const [state, action, pending] = useActionState(createContactAction, initialState);
  const [kind, setKind] = useState<"person" | "company">("person");
  const [v, setV] = useState<Record<string, string>>({});
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));
  const val = (k: string) => v[k] ?? "";

  const isPerson = kind === "person";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />

      {/* Personne physique / personne morale — conditionne la fiche. */}
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="kindChoice"
            checked={isPerson}
            onChange={() => setKind("person")}
          />
          {t("personne")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="kindChoice"
            checked={!isPerson}
            onChange={() => setKind("company")}
          />
          {t("societe")}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isPerson ? (
          <>
            <Field label={t("prenom")} htmlFor="firstName">
              <Input id="firstName" name="firstName" value={val("firstName")} onChange={set("firstName")} />
            </Field>
            <Field label={t("nom")} htmlFor="lastName">
              <Input id="lastName" name="lastName" required value={val("lastName")} onChange={set("lastName")} />
            </Field>
          </>
        ) : (
          <Field label={t("raison_sociale")} htmlFor="name" className="sm:col-span-2">
            <Input id="name" name="name" required value={val("name")} onChange={set("name")} />
          </Field>
        )}
        <Field label={t("email")} htmlFor="email">
          <Input id="email" name="email" type="email" value={val("email")} onChange={set("email")} />
        </Field>
        <Field label={t("telephone")} htmlFor="phone">
          <Input id="phone" name="phone" value={val("phone")} onChange={set("phone")} />
        </Field>
        {isPerson && (
          <>
            <Field label={t("societe")} htmlFor="companyName">
              <Input id="companyName" name="companyName" value={val("companyName")} onChange={set("companyName")} />
            </Field>
            <Field label={t("fonction")} htmlFor="jobTitle">
              <Input id="jobTitle" name="jobTitle" value={val("jobTitle")} onChange={set("jobTitle")} />
            </Field>
            <Field label={t("date_de_naissance")} htmlFor="birthDate">
              <Input id="birthDate" name="birthDate" type="date" value={val("birthDate")} onChange={set("birthDate")} />
            </Field>
          </>
        )}
        <Field label={t("ville")} htmlFor="city">
          <Input id="city" name="city" value={val("city")} onChange={set("city")} />
        </Field>
        <Field label={t("code_postal")} htmlFor="postalCode">
          <Input id="postalCode" name="postalCode" value={val("postalCode")} onChange={set("postalCode")} />
        </Field>
        <Field label={t("pays")} htmlFor="country">
          <Input id="country" name="country" value={val("country")} onChange={set("country")} />
        </Field>
        {/* Le conseiller, la personne connectée par défaut (stabilisation, P3) — seule, elle n'a rien à choisir ;
            à plusieurs, le select natif du socle, comme sur la fiche. Avant : « Personne » par défaut, et un
            sélecteur affiché dès un seul utilisateur. */}
        {orgUsers.length > 1 ? (
          <Field label={t("conseiller_attribue")} htmlFor="ownerId">
            <NativeSelect id="ownerId" name="ownerId" defaultValue={currentUserId}>
              <option value="">{t("personne")}</option>
              {orgUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <input type="hidden" name="ownerId" value={currentUserId} />
        )}
      </div>
      <Field label={t("notes")} htmlFor="notes">
        <Textarea id="notes" name="notes" className="min-h-16" value={val("notes")} onChange={set("notes")} />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {state.duplicates && state.duplicates.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-medium">
            {t("ce_contact_ressemble_a_une_fiche_d1ab", { count: state.duplicates.length })}
          </p>
          <ul className="flex flex-col gap-1">
            {state.duplicates.map((d) => (
              <li key={d.id} className="text-sm">
                <Link href={`/contacts/${d.id}`} className="font-medium underline underline-offset-2">
                  {d.name}
                </Link>
                <span className="text-muted-foreground">
                  {[d.email, d.companyName].filter(Boolean).map((x) => ` · ${x}`)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button type="submit" name="force" value="1" variant="outline" disabled={pending}>
              {t("creer_quand_meme")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("ou_ouvre_la_fiche_existante_ci_13e1")}
          </p>
        </div>
      ) : (
        <Button type="submit" className="w-fit" disabled={pending}>
          {pending ? t("creation") : t("creer_le_contact")}
        </Button>
      )}
    </form>
  );
}
