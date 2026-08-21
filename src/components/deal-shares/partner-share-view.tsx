"use client";

import { useState, type ReactNode } from "react";
import { Ban, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  PublicShareAction,
  PublicShareStatus,
  PublicShareView,
} from "@/db/queries/deal-shares-public";
import {
  firstNameOf,
  formatCommission,
  formatDate,
  formatDateTime,
  formatEuros,
} from "@/lib/format";
import { DEFAULT_BRAND_PRIMARY } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * La page la plus soignée du produit : seul écran vu par quelqu'un
 * d'extérieur à l'organisation. Toute action passe par la route publique
 * déjà revue (`/api/partage/[token]`) — pas de chemin parallèle, pas de
 * Server Action ici qui contournerait son rate limiting et ses en-têtes.
 */

/**
 * État du partage — icône + phrase, jamais la couleur seule : cette page
 * est lue par quelqu'un d'extérieur, sur un écran quelconque, parfois
 * imprimée. Les jetons sémantiques du produit remplacent ici les couleurs
 * Tailwind brutes qui y étaient codées en dur.
 */
const STATUS_BANNER: Record<
  PublicShareStatus,
  { label: string; className: string; icon: ReactNode }
> = {
  pending: {
    label: "En attente de votre réponse",
    className: "border-warning/40 bg-warning/10",
    icon: <Clock className="size-4 shrink-0 text-warning" />,
  },
  accepted: {
    label: "Vous avez accepté ce partage",
    className: "border-success/40 bg-success/10",
    icon: <CheckCircle2 className="size-4 shrink-0 text-success" />,
  },
  declined: {
    label: "Vous avez refusé ce partage",
    className: "border-border bg-muted",
    icon: <XCircle className="size-4 shrink-0 text-muted-foreground" />,
  },
  revoked: {
    label: "Ce partage a été révoqué",
    className: "border-border bg-muted",
    icon: <Ban className="size-4 shrink-0 text-muted-foreground" />,
  },
};

/**
 * La route publique renvoie des codes techniques (`already_resolved`,
 * `rate_limited`…) — jamais affichés tels quels : aucun jargon interne sur
 * cette page. Repli générique pour tout code non prévu ici.
 */
const ACTION_ERROR_MESSAGES: Record<string, string> = {
  // Mêmes messages, mêmes deux catégories que la page d'erreur d'entrée
  // (src/app/partage/[token]/page.tsx) : jamais de nom, jamais de détail
  // qui distinguerait plus finement une raison d'une autre.
  not_found: "Ce lien n'est plus valide.",
  revoked: "Ce lien n'est plus valable. Contactez directement la personne qui vous l'a envoyé.",
  expired: "Ce lien n'est plus valable. Contactez directement la personne qui vous l'a envoyé.",
  already_resolved: "Vous avez déjà répondu à ce partage.",
  rate_limited: "Trop de tentatives — réessayez dans une minute.",
  invalid_action: "Une erreur est survenue.",
};

function actionErrorMessage(code: string): string {
  return ACTION_ERROR_MESSAGES[code] ?? "Une erreur est survenue.";
}

async function callAction(
  token: string,
  action: PublicShareAction
): Promise<{ ok: true; view: PublicShareView } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/partage/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    const data = await res.json();
    if (!res.ok) {
      const code = typeof data?.error === "string" ? data.error : "";
      return { ok: false, error: actionErrorMessage(code) };
    }
    return { ok: true, view: data.share as PublicShareView };
  } catch {
    return { ok: false, error: "Connexion impossible. Réessayez." };
  }
}

export function PartnerShareView({
  token,
  initialView,
  preview = false,
}: {
  token: string;
  initialView: PublicShareView;
  /**
   * Rendu réel du composant, pas une redescription : utilisé par l'écran
   * de partage pour montrer au conseiller ce que le partenaire verra AVANT
   * d'envoyer (src/app/affaires/[id]/share-composer.tsx). Aucune action
   * n'est déclenchable — pas de jeton réel à ce stade.
   */
  preview?: boolean;
}) {
  const [committedView, setCommittedView] = useState(initialView);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // En aperçu, aucun état interne : la vue dérive directement du formulaire
  // en cours d'édition (initialView), à chaque rendu — jamais figée sur le
  // premier rendu comme le serait un useState synchronisé par effet.
  const view = preview ? initialView : committedView;

  const [showAcceptConfirm, setShowAcceptConfirm] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [comment, setComment] = useState("");

  async function run(action: PublicShareAction) {
    setPending(true);
    setError(null);
    const result = await callAction(token, action);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCommittedView(result.view);
    setShowAcceptConfirm(false);
    setShowDeclineForm(false);
    setDeclineReason("");
    if (action.type === "comment") setComment("");
  }

  const brand = view.brand;
  const accent = brand.primaryColor || DEFAULT_BRAND_PRIMARY;
  const banner = STATUS_BANNER[view.status];
  const isPending = view.status === "pending";

  return (
    // En aperçu, le composant est déjà encadré par le composeur : pas de
    // deuxième cadre ni de fond de page, sinon on empile deux « documents ».
    <div
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col gap-6",
        preview ? "p-1" : "my-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:my-10 sm:p-10"
      )}
    >
      {preview && (
        <div className="rounded-md border border-dashed px-3 py-1.5 text-center text-xs font-medium text-muted-foreground">
          Aperçu — ce que le partenaire verra
        </div>
      )}

      {/* Marque de l'organisation émettrice, et qui écrit — en une seule
          ligne. Le nom de l'organisation apparaissait deux fois quand elle
          n'a pas de logo et que l'émetteur n'a pas de nom renseigné. */}
      <div className="flex flex-col gap-1">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={view.organization.name}
            className="h-9 max-w-48 self-start object-contain object-left"
          />
        ) : (
          <span className="text-lg font-semibold" style={{ color: accent }}>
            {view.organization.name}
          </span>
        )}
        {view.issuedByName && (
          <p className="text-sm text-muted-foreground">
            {view.issuedByName}
            {brand.logoUrl ? ` · ${view.organization.name}` : ""}
          </p>
        )}
      </div>

      <h1 className="text-xl font-semibold">Bonjour {firstNameOf(view.partnerName)},</h1>

      {/* Niveau 1 — statut du partage, seul bandeau de cette taille sur la page */}
      <div
        className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${banner.className}`}
      >
        {banner.icon}
        <span>
          {banner.label}
          {view.status === "accepted" && view.respondedAt && (
            <span className="font-normal text-muted-foreground">
              {" "}
              — le {formatDate(view.respondedAt)}
            </span>
          )}
        </span>
      </div>

      {isPending && view.expiresAt && (
        <p className="text-sm text-warning">À confirmer avant le {formatDate(view.expiresAt)}.</p>
      )}

      {/* L'affaire */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{view.deal.title}</h2>
        <p className="text-sm text-muted-foreground">
          {view.deal.typeLabel} · Client : {view.deal.clientName}
          {view.deal.estimatedAmount && ` · ≈ ${formatEuros(view.deal.estimatedAmount)}`}
        </p>
        {view.deal.description && <p className="text-sm">{view.deal.description}</p>}
      </div>

      {/* Niveau "engagement" — conditions proposées, juste au-dessus de l'action tant que pending,
          affichées de façon permanente une fois acceptées (avec la date qui fait foi). */}
      {(view.proposedTerms || view.message) && (
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Conditions proposées</h3>
          {view.proposedTerms && <p className="text-sm">{view.proposedTerms}</p>}
          {view.message && <p className="text-sm text-muted-foreground">{view.message}</p>}
          {view.status === "accepted" && view.respondedAt && (
            <p className="text-xs text-muted-foreground">
              Acceptées le {formatDate(view.respondedAt)} — cette page fait foi en cas de désaccord.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Action évidente — même poids visuel pour les deux boutons */}
      {!preview && isPending && !showAcceptConfirm && !showDeclineForm && (
        <div className="flex gap-3">
          <Button
            className="flex-1"
            style={{ backgroundColor: accent }}
            onClick={() => setShowAcceptConfirm(true)}
            disabled={pending}
          >
            Accepter
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowDeclineForm(true)}
            disabled={pending}
          >
            Refuser
          </Button>
        </div>
      )}

      {/* Confirmation intermédiaire — un clic accidentel ne doit jamais engager une commission. */}
      {showAcceptConfirm && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Confirmez votre acceptation</p>
          {view.proposedTerms && (
            <p className="text-sm text-muted-foreground">Conditions : {view.proposedTerms}</p>
          )}
          <div className="flex gap-3">
            <Button
              className="flex-1"
              style={{ backgroundColor: accent }}
              onClick={() => run({ type: "accept" })}
              disabled={pending}
            >
              {pending ? "…" : "Confirmer l'acceptation"}
            </Button>
            <Button variant="ghost" onClick={() => setShowAcceptConfirm(false)} disabled={pending}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {showDeclineForm && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Confirmez votre refus</p>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Motif (facultatif)"
            className="min-h-16"
          />
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => run({ type: "decline", reason: declineReason || undefined })}
              disabled={pending}
            >
              {pending ? "…" : "Confirmer le refus"}
            </Button>
            <Button variant="ghost" onClick={() => setShowDeclineForm(false)} disabled={pending}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Niveau 2 — statut de l'affaire : un contrôle discret, pas un badge, actif seulement après acceptation. */}
      <div className="flex items-center gap-2 border-t pt-4 text-sm">
        <span className="text-muted-foreground">Statut de l&apos;affaire :</span>
        {view.status === "accepted" ? (
          <Select
            value={view.currentDealStatus.id}
            onValueChange={(v) => run({ type: "status_change", statusId: String(v) })}
            // Sans `items`, Base UI n'a aucun moyen de retrouver le libellé
            // d'une valeur et affiche la valeur brute — ici un UUID de statut,
            // sur la page vue par le partenaire.
            items={view.availableStatuses.map((s) => ({ label: s.label, value: s.id }))}
          >
            <SelectTrigger className="h-7 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {view.availableStatuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{view.currentDealStatus.label}</Badge>
        )}
      </div>

      {/* Niveau 3 — commission : silencieux si elle n'existe pas encore. */}
      {view.commission && (
        <p className="text-sm text-muted-foreground">
          Commission {formatCommission(view.commission)} —{" "}
          {view.commission.state === "prevue"
            ? "prévue"
            : view.commission.state === "confirmee"
              ? "confirmée"
              : "réglée"}
        </p>
      )}

      {/* Échanges */}
      <div className="flex flex-col gap-3 border-t pt-4">
        <h3 className="text-sm font-semibold">Échanges</h3>
        <ul className="flex flex-col gap-2">
          {view.events.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="font-medium">{e.actor === "vous" ? "Vous" : view.organization.name}</span>
              {e.message && <span> — {e.message}</span>}
              <span className="ml-1 text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
            </li>
          ))}
          {view.events.length === 0 && (
            <li className="text-sm text-muted-foreground">Aucun échange pour l&apos;instant.</li>
          )}
        </ul>
        {preview ? (
          <p className="text-xs text-muted-foreground">
            Le partenaire pourra commenter une fois le lien envoyé.
          </p>
        ) : (
          <div className="flex gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ajouter un commentaire"
              className="min-h-10 flex-1"
            />
            <Button
              variant="outline"
              onClick={() => run({ type: "comment", message: comment })}
              disabled={pending || !comment.trim()}
            >
              Envoyer
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
