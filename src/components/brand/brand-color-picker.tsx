"use client";

import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LayoutDashboard, Pipette, Target, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_BRAND_PRIMARY } from "@/lib/brand";
import { BRAND_PALETTES, brandStyle, deriveBrandTokens } from "@/lib/brand/derive";
import { normalizeHex } from "@/lib/brand/color";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
  }
}

/**
 * Le sélecteur de couleur de la marque (chantier marque blanche, étape 2).
 * Une pastille qui ouvre le vrai sélecteur du navigateur, une pipette
 * quand le navigateur l'a (API EyeDropper), huit palettes sobres, une
 * saisie hexadécimale repliée — et un APERÇU SUR DE VRAIS ÉLÉMENTS : le
 * bouton, le lien, le badge et la ligne active de navigation du produit,
 * rendus avec les jetons que `deriveBrandTokens` dérive de la couleur
 * choisie, la même fonction que la coquille applique après
 * enregistrement. Jamais un carré de couleur : on juge ce qu'on aura.
 *
 * L'avertissement dit ce que le système fait à la place (assombrir pour
 * les boutons, passer le texte en foncé) — jamais une erreur, jamais un
 * refus.
 */
export function BrandColorPicker({ initialHex, name, disabled }: { initialHex: string | null; name: string; disabled?: boolean }) {
  const [hex, setHex] = useState(normalizeHex(initialHex ?? "") ?? DEFAULT_BRAND_PRIMARY);
  const [draft, setDraft] = useState(hex);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const derived = useMemo(() => deriveBrandTokens(hex, "light"), [hex]);
  // La pipette n'existe que dans certains navigateurs : le serveur rend
  // « sans », le client se resynchronise après l'hydratation — jamais un
  // arbre différent entre les deux (erreur React #418, vue au navigateur).
  const canPick = useSyncExternalStore(
    () => () => {},
    () => typeof window.EyeDropper === "function",
    () => false
  );

  const choose = (value: string) => {
    const normalized = normalizeHex(value);
    if (!normalized) return;
    setHex(normalized);
    setDraft(normalized);
  };

  const openNative = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  };

  const pick = async () => {
    if (!window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      choose(result.sRGBHex);
    } catch {
      // Fermée sans choisir : rien à faire.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name={name} value={hex} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openNative}
          disabled={disabled}
          aria-label={`Couleur de la marque : ${hex}. Ouvrir le sélecteur de couleur`}
          className="relative size-12 shrink-0 rounded-xl border border-border shadow-xs transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: hex }}
        />
        <input
          ref={inputRef}
          type="color"
          value={hex}
          onChange={(e) => choose(e.target.value)}
          disabled={disabled}
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none absolute size-0 opacity-0"
        />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium tabular-nums">{hex}</span>
          <span className="text-xs text-muted-foreground">Clique la pastille pour ouvrir le sélecteur.</span>
        </div>
        {canPick && (
          <Button type="button" variant="outline" size="sm" onClick={pick} disabled={disabled}>
            <Pipette />
            Pipette
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Palettes proposées</span>
        <div className="flex flex-wrap gap-2">
          {BRAND_PALETTES.map((p) => (
            <button
              key={p.hex}
              type="button"
              onClick={() => choose(p.hex)}
              disabled={disabled}
              title={p.name}
              aria-label={`${p.name} (${p.hex})`}
              aria-pressed={hex === p.hex}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors hover:bg-muted disabled:opacity-50",
                hex === p.hex ? "border-foreground" : "border-border"
              )}
            >
              <span aria-hidden className="size-4 rounded-full border border-black/10" style={{ backgroundColor: p.hex }} />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <details className="group text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Saisir un code hexadécimal</summary>
        <div className="flex items-center gap-2 pt-2">
          <Input
            id={`${id}-hex`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const normalized = normalizeHex(e.target.value);
              if (normalized) setHex(normalized);
            }}
            disabled={disabled}
            placeholder="#2563eb"
            className="max-w-36 font-mono"
            aria-label="Code hexadécimal de la couleur"
          />
          {!normalizeHex(draft) && <span className="text-xs text-muted-foreground">Six caractères, de 0 à 9 et de A à F.</span>}
        </div>
      </details>

      {derived.diagnostics.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          {derived.diagnostics.map((d) => (
            <li key={d.code}>{d.message}</li>
          ))}
        </ul>
      )}

      <BrandPreview style={brandStyle(derived.tokens)} />

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">Contrastes vérifiés ({derived.pairs.length})</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <tbody>
            {derived.pairs.map((p) => (
              <tr key={p.label} className="border-t border-border">
                <td className="py-1 pr-2">{p.label}</td>
                <td className="py-1 pr-2 text-right">{p.ratio.toFixed(2)}:1</td>
                <td className="py-1 text-right">{p.ok ? `≥ ${p.required} ✓` : `< ${p.required}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/**
 * De VRAIS éléments, avec les VRAIES classes du produit (celles du bouton,
 * du badge, de `NavLink`) sous les jetons dérivés : ce qu'on voit ici est
 * ce que l'application montrera.
 */
export function BrandPreview({ style, className }: { style: Record<string, string>; className?: string }) {
  return (
    <div style={style} className={cn("grid grid-cols-1 gap-3 rounded-xl border border-border bg-background p-4 md:grid-cols-[14rem_1fr]", className)}>
      <div className="flex flex-col gap-0.5 rounded-lg border border-sidebar-border bg-sidebar p-2">
        <NavRow icon={<LayoutDashboard />} label="Tableau de bord" />
        <NavRow icon={<Users />} label="Contacts" active badge={3} />
        <NavRow icon={<Target />} label="Suivi" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button">Enregistrer</Button>
          <Button type="button" variant="outline">
            Annuler
          </Button>
          <Badge>Nouveau</Badge>
          <Badge variant="secondary">En cours</Badge>
        </div>
        <p className="text-sm">
          Un texte courant avec{" "}
          <a href="#apercu" onClick={(e) => e.preventDefault()} className="font-medium text-primary-ink underline underline-offset-4">
            un lien à la couleur de la marque
          </a>
          , puis la suite de la phrase.
        </p>
        <div className="flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">
          <span className="font-medium">Ligne sélectionnée</span>
          <span className="text-xs">— un fond léger, un texte à la couleur de la marque.</span>
        </div>
      </div>
    </div>
  );
}

function NavRow({ icon, label, active, badge }: { icon: React.ReactNode; label: string; active?: boolean; badge?: number }) {
  return (
    <span
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      )}
    >
      <span className={cn("shrink-0 [&_svg]:size-4", active ? "text-primary-ink" : "text-muted-foreground")}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span
          className={cn(
            "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.6875rem] leading-none font-semibold tabular-nums",
            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {badge}
        </span>
      )}
    </span>
  );
}
