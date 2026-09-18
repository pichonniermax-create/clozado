"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, EyeOff, Home, ListFilter, Pencil, Plus, RotateCcw, Save, Share2, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  resetDisplayAction,
  saveViewAction,
  setDefaultViewAction,
  toggleHiddenViewAction,
  viewCommandAction,
} from "@/lib/display/actions";

/**
 * Un geste du menu part directement vers son action serveur : une entrée
 * de menu n'est pas un formulaire (le socle en fait un élément de rôle
 * `menuitem`), et imbriquer un `<form>` dedans casse le clavier. L'action
 * redirige elle-même — la page revient avec sa notification.
 */
function run(action: (formData: FormData) => Promise<void>, fields: Record<string, string>): void {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  void action(formData).catch(() => undefined);
}

/**
 * LE MENU « VUES » d'une liste (lot 1, étape 3) — le même sur toutes les
 * listes du produit : les vues fournies, celles de l'équipe, les siennes ;
 * enregistrer l'affichage courant, le mettre à jour, renommer, dupliquer,
 * partager (admin seulement), supprimer, choisir la vue d'accueil du
 * module, masquer une vue fournie, réinitialiser l'affichage.
 *
 * Tout passe par des formulaires serveur : aucune écriture ne se fait
 * depuis le navigateur, et une personne sans JavaScript garde ses liens de
 * vues (des `<a>` vers `?v=<id>`). Le composant ne décide RIEN : ce que la
 * personne a le droit de faire lui arrive déjà calculé (`editable`,
 * `isAdmin`) — les mêmes règles sont revérifiées côté serveur.
 */
export type ViewChip = {
  id: string;
  /** Le nom saisi ; `null` pour une vue fournie, dont le nom est traduit ici. */
  name: string | null;
  /** La clé d'une vue fournie (`mes-contacts`…). */
  builtin?: string;
  shared: boolean;
  editable: boolean;
  mine: boolean;
};

export function ViewsMenu({
  screen,
  basePath,
  views,
  currentId,
  modified,
  state,
  isAdmin,
  defaultViewId,
}: {
  /** La clé d'écran des vues (`contacts`, `affaires`, `partenaires`). */
  screen: string;
  basePath: string;
  views: ViewChip[];
  currentId: string | null;
  /** L'affichage courant s'écarte de la vue ouverte. */
  modified: boolean;
  /** L'affichage courant, en paramètres d'adresse (sans `v`) — ce qu'une vue enregistrerait. */
  state: string;
  isAdmin: boolean;
  defaultViewId: string | null;
}) {
  const t = useTranslations("ui.display");
  const tb = useTranslations("ui.views.builtIn");
  const [dialog, setDialog] = useState<null | "enregistrer" | "renommer" | "dupliquer">(null);

  const label = (view: ViewChip) => view.name ?? (view.builtin ? tb(view.builtin as never) : t("vue_sans_nom"));
  const current = views.find((v) => v.id === currentId) ?? null;
  const currentLabel = current ? label(current) : t("affichage_libre");
  const href = (id: string | null) => (id ? `${basePath}?v=${encodeURIComponent(id)}` : basePath);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
            <ListFilter />
            <span className="max-w-40 truncate">{currentLabel}</span>
            {modified && <span className="text-muted-foreground">{t("modifiee_marque")}</span>}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("vues")}</DropdownMenuLabel>
              <DropdownMenuItem render={<Link href={href(null)} />}>
                <span className="flex-1">{t("tout_afficher")}</span>
                {!currentId && <Check className="size-4" aria-hidden />}
              </DropdownMenuItem>
              {views.map((view) => (
                <DropdownMenuItem key={view.id} render={<Link href={href(view.id)} />}>
                  <span className="min-w-0 flex-1 truncate">{label(view)}</span>
                  {view.shared && !view.mine && <Users className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("vue_d_equipe")} />}
                  {/* La vue par défaut se voit d'un coup d'œil : le mot, pas seulement une icône (2026-09-18). */}
                  {view.id === defaultViewId && (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">{t("par_defaut")}</span>
                  )}
                  {view.id === currentId && <Check className="size-4 shrink-0" aria-hidden />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("cet_affichage")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setDialog("enregistrer")}>
                <Plus className="size-4" aria-hidden />
                {t("enregistrer_comme_vue")}
              </DropdownMenuItem>
              {current && current.editable && modified && (
                <DropdownMenuItem onClick={() => run(viewCommandAction, { ecran: screen, vue: current.id, geste: "mettre-a-jour", etat: state })}>
                  <Save className="size-4" aria-hidden />
                  {t("mettre_a_jour_la_vue")}
                </DropdownMenuItem>
              )}
              {current && (
                <>
                  <DropdownMenuItem onClick={() => setDialog("dupliquer")}>
                    <Plus className="size-4" aria-hidden />
                    {t("dupliquer_la_vue")}
                  </DropdownMenuItem>
                  {current.editable && (
                    <DropdownMenuItem onClick={() => setDialog("renommer")}>
                      <Pencil className="size-4" aria-hidden />
                      {t("renommer_la_vue")}
                    </DropdownMenuItem>
                  )}
                  {isAdmin && current.editable && !current.builtin && (
                    <DropdownMenuItem
                      onClick={() => run(viewCommandAction, { ecran: screen, vue: current.id, geste: "partager", partagee: current.shared ? "0" : "1" })}
                    >
                      <Share2 className="size-4" aria-hidden />
                      {current.shared ? t("ne_plus_partager") : t("partager_a_l_equipe")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => run(setDefaultViewAction, { ecran: screen, vue: current.id === defaultViewId ? "" : current.id })}>
                    <Home className="size-4" aria-hidden />
                    {current.id === defaultViewId ? t("retirer_par_defaut") : t("definir_comme_vue_par_defaut")}
                  </DropdownMenuItem>
                  {current.builtin && (
                    <DropdownMenuItem onClick={() => run(toggleHiddenViewAction, { ecran: screen, vue: current.id })}>
                      <EyeOff className="size-4" aria-hidden />
                      {t("masquer_cette_vue_fournie")}
                    </DropdownMenuItem>
                  )}
                  {current.editable && !current.builtin && (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => run(viewCommandAction, { ecran: screen, vue: current.id, geste: "supprimer" })}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      {t("supprimer_la_vue")}
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => run(resetDisplayAction, { ecran: screen })}>
              <RotateCcw className="size-4" aria-hidden />
              {t("reinitialiser_l_affichage")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Enregistrer, renommer, dupliquer : le même dialogue, un nom à saisir. */}
      <Dialog open={dialog !== null} onOpenChange={(open) => setDialog(open ? dialog : null)}>
        <DialogContent>
          <form
            action={dialog === "enregistrer" ? saveViewAction : viewCommandAction}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="ecran" value={screen} />
            {dialog !== "enregistrer" && <input type="hidden" name="vue" value={current?.id ?? ""} />}
            {dialog !== "enregistrer" && <input type="hidden" name="geste" value={dialog ?? ""} />}
            {dialog === "enregistrer" && <input type="hidden" name="etat" value={state} />}
            <DialogHeader>
              <DialogTitle>
                {dialog === "renommer" ? t("renommer_la_vue") : dialog === "dupliquer" ? t("dupliquer_la_vue") : t("enregistrer_comme_vue")}
              </DialogTitle>
              <DialogDescription>
                {dialog === "renommer" ? t("le_nom_que_verra_ton_equipe") : t("l_affichage_courant_filtres_tri_colonnes")}
              </DialogDescription>
            </DialogHeader>
            <Field label={t("nom_de_la_vue")} htmlFor="nom-de-la-vue">
              <Input
                // La clé remet le champ à zéro quand on passe d'« enregistrer » à « renommer » sans fermer.
                key={dialog ?? ""}
                id="nom-de-la-vue"
                name="nom"
                required
                maxLength={80}
                autoFocus
                defaultValue={dialog === "renommer" ? (current?.name ?? (current?.builtin ? tb(current.builtin as never) : "")) : ""}
                placeholder={t("mes_dossiers_du_mois")}
              />
            </Field>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="ghost" />}>{t("annuler")}</DialogClose>
              <Button type="submit">{t("enregistrer")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Le lien « Vues » d'un écran qui n'a pas la place du menu (vide, chargement) — même destination. */
export function ViewsLink({ basePath, label }: { basePath: string; label: string }) {
  return (
    <Link href={basePath} className={buttonVariants({ variant: "ghost", size: "sm" })}>
      <ListFilter />
      {label}
    </Link>
  );
}
