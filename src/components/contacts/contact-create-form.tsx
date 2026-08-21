"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createContactAction, type CreateContactState } from "@/lib/contacts/actions";

const initialState: CreateContactState = { error: null, duplicates: null };

type OrgUser = { id: string; name: string | null; email: string };

/**
 * Création d'une fiche. Champs contrôlés à dessein : quand la détection de
 * doublons suspend la création, le formulaire revient avec sa réponse — ce
 * qui venait d'être saisi doit rester à l'écran (React 19 vide un
 * formulaire non contrôlé après l'action).
 */
export function ContactCreateForm({ orgUsers }: { orgUsers: OrgUser[] }) {
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
          Personne
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="kindChoice"
            checked={!isPerson}
            onChange={() => setKind("company")}
          />
          Société
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isPerson ? (
          <>
            <Field label="Prénom" htmlFor="firstName">
              <Input id="firstName" name="firstName" value={val("firstName")} onChange={set("firstName")} />
            </Field>
            <Field label="Nom" htmlFor="lastName">
              <Input id="lastName" name="lastName" required value={val("lastName")} onChange={set("lastName")} />
            </Field>
          </>
        ) : (
          <Field label="Raison sociale" htmlFor="name" className="sm:col-span-2">
            <Input id="name" name="name" required value={val("name")} onChange={set("name")} />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" value={val("email")} onChange={set("email")} />
        </Field>
        <Field label="Téléphone" htmlFor="phone">
          <Input id="phone" name="phone" value={val("phone")} onChange={set("phone")} />
        </Field>
        {isPerson && (
          <>
            <Field label="Société" htmlFor="companyName">
              <Input id="companyName" name="companyName" value={val("companyName")} onChange={set("companyName")} />
            </Field>
            <Field label="Fonction" htmlFor="jobTitle">
              <Input id="jobTitle" name="jobTitle" value={val("jobTitle")} onChange={set("jobTitle")} />
            </Field>
            <Field label="Date de naissance" htmlFor="birthDate">
              <Input id="birthDate" name="birthDate" type="date" value={val("birthDate")} onChange={set("birthDate")} />
            </Field>
          </>
        )}
        <Field label="Ville" htmlFor="city">
          <Input id="city" name="city" value={val("city")} onChange={set("city")} />
        </Field>
        <Field label="Code postal" htmlFor="postalCode">
          <Input id="postalCode" name="postalCode" value={val("postalCode")} onChange={set("postalCode")} />
        </Field>
        <Field label="Pays" htmlFor="country">
          <Input id="country" name="country" value={val("country")} onChange={set("country")} />
        </Field>
        {orgUsers.length > 0 && (
          <Field label="Conseiller attribué" htmlFor="ownerId">
            <Select
              name="ownerId"
              items={[
                { label: "Personne", value: "" },
                ...orgUsers.map((u) => ({ label: u.name || u.email, value: u.id })),
              ]}
            >
              <SelectTrigger id="ownerId" className="w-full">
                <SelectValue placeholder="Personne" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Personne</SelectItem>
                {orgUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>
      <Field label="Notes" htmlFor="notes">
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
            Ce contact ressemble à {state.duplicates.length > 1 ? "des fiches existantes" : "une fiche existante"} —
            rien n&apos;a été créé.
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
              Créer quand même
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ou ouvre la fiche existante ci-dessus — tu pourras y fusionner les informations.
          </p>
        </div>
      ) : (
        <Button type="submit" className="w-fit" disabled={pending}>
          {pending ? "Création…" : "Créer le contact"}
        </Button>
      )}
    </form>
  );
}
