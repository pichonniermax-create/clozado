"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Le panneau d'édition d'UNE tâche, monté À L'OUVERTURE seulement
 * (performance, 2026-09-17) : avant, l'écran des tâches rendait le
 * formulaire complet de chacune de ses cinquante lignes — titre, échéance,
 * priorité, responsable, récurrence, notes, suppression — dans le HTML ET
 * dans sa copie RSC : 1,29 Mo pour une page qu'on ne fait que lire.
 * Désormais la ligne ne porte que ses valeurs ; le crayon monte le
 * formulaire au clic, et le formulaire reste un `<form action>` serveur —
 * les actions liées (`updateTaskAction.bind`, `deleteTaskAction.bind`)
 * voyagent comme n'importe quelle référence d'action.
 *
 * Les libellés viennent de l'écran (serveur), traduits une fois et passés
 * par référence à toutes les lignes : ce composant ne lit aucun message.
 */
export type TaskEditorLabels = {
  modifier: string;
  titre: string;
  echeance: string;
  priorite: string;
  responsable: string;
  recurrence: string;
  notes: string;
  enregistrer: string;
  personne: string;
  tousLes: string;
  pasDeRecurrence: string;
  uniteDeRecurrence: string;
  jamais: string;
  jours: string;
  semaines: string;
  mois: string;
  ans: string;
  priorites: { low: string; normal: string; high: string };
  supprimerTitre: string;
  supprimerCetteTache: string;
  annuler: string;
};

export type TaskEditorValues = {
  id: string;
  title: string;
  /** La valeur d'un `<input type="date">` (AAAA-MM-JJ), vide sans échéance. */
  dueDate: string;
  priority: "low" | "normal" | "high";
  assigneeId: string;
  recurUnit: string;
  recurEvery: number;
  notes: string;
  /** Une tâche générée par le suivi : ses notes se lisent, ne s'éditent pas, et elle ne se supprime pas. */
  autoRule: boolean;
};

export type TaskEditorUser = { id: string; name: string | null; email: string | null };

const PRIORITIES = ["low", "normal", "high"] as const;
const RECUR_UNITS = ["day", "week", "month", "year"] as const;

export function TaskEditor({
  task,
  orgUsers,
  labels,
  deleteDescription,
  update,
  remove,
}: {
  task: TaskEditorValues;
  orgUsers: readonly TaskEditorUser[];
  labels: TaskEditorLabels;
  /** La phrase de confirmation de la suppression, propre à la tâche. */
  deleteDescription: string;
  /** `updateTaskAction` liée à la tâche et à l'écran de retour. */
  update: (formData: FormData) => Promise<void>;
  /** `deleteTaskAction` liée — null pour une tâche automatique. */
  remove: (() => Promise<void>) | null;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `edition-${task.id}`;
  const unitLabel: Record<(typeof RECUR_UNITS)[number], string> = { day: labels.jours, week: labels.semaines, month: labels.mois, year: labels.ans };
  return (
    <>
      {/* Le crayon en fin de ligne (audit UI du 2026-09-14) : à la souris, au survol, au clavier ou une fois ouvert ; au doigt, toujours. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={labels.modifier}
        title={labels.modifier}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "absolute top-2.5 right-3 sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus-visible:opacity-100",
          open && "sm:opacity-100"
        )}
      >
        {open ? <X aria-hidden /> : <Pencil aria-hidden />}
      </Button>
      {open && (
        <div id={panelId} className="mt-3 flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:ml-10">
          {task.autoRule && task.notes && <p className="text-xs text-muted-foreground">{task.notes}</p>}
          <form action={update} className="flex flex-col gap-3">
            <Field label={labels.titre} htmlFor={`title-${task.id}`}>
              <Input id={`title-${task.id}`} name="title" defaultValue={task.title} required autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Field label={labels.echeance} htmlFor={`dueDate-${task.id}`}>
                <Input id={`dueDate-${task.id}`} name="dueDate" type="date" defaultValue={task.dueDate} />
              </Field>
              <Field label={labels.priorite} htmlFor={`priority-${task.id}`}>
                <NativeSelect id={`priority-${task.id}`} name="priority" defaultValue={task.priority} className="w-auto max-w-full">
                  {PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {labels.priorites[value]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={labels.responsable} htmlFor={`assignee-${task.id}`}>
                <NativeSelect id={`assignee-${task.id}`} name="assigneeId" defaultValue={task.assigneeId} className="w-auto max-w-full">
                  <option value="">{labels.personne}</option>
                  {orgUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={labels.recurrence} htmlFor={`${task.id}-recurUnit`}>
                {/* Unité + pas — deux champs qui vont ensemble (les contraintes en base les lient déjà). */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{labels.tousLes}</span>
                  <Input
                    id={`${task.id}-recurEvery`}
                    name="recurEvery"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={task.recurEvery}
                    aria-label={labels.pasDeRecurrence}
                    className="w-14"
                  />
                  <NativeSelect id={`${task.id}-recurUnit`} name="recurUnit" defaultValue={task.recurUnit} aria-label={labels.uniteDeRecurrence} className="flex-1">
                    <option value="">{labels.jamais}</option>
                    {RECUR_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unitLabel[unit]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </Field>
            </div>
            {task.autoRule ? (
              <input type="hidden" name="notes" value={task.notes} />
            ) : (
              <Field label={labels.notes} htmlFor={`notes-${task.id}`}>
                <Textarea id={`notes-${task.id}`} name="notes" defaultValue={task.notes} className="min-h-12" />
              </Field>
            )}
            <Button type="submit" size="sm" className="w-fit">
              {labels.enregistrer}
            </Button>
          </form>
          {remove && (
            <div className="border-t border-border pt-3">
              {/* Derrière la confirmation du socle (stabilisation, D5). */}
              <ConfirmSubmit
                action={remove}
                title={labels.supprimerTitre}
                description={deleteDescription}
                confirmLabel={labels.supprimerCetteTache}
                cancelLabel={labels.annuler}
                className="text-destructive"
              >
                {labels.supprimerCetteTache}
              </ConfirmSubmit>
            </div>
          )}
        </div>
      )}
    </>
  );
}
