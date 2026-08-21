"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { PartnerShareView } from "@/components/deal-shares/partner-share-view";
import type { PublicShareView } from "@/db/queries/deal-shares-public";
import { createDealShareAction } from "@/lib/deals/actions";
import { formatCommission } from "@/lib/format";
import type { RenderBrand } from "@/lib/newsletter/render-email";

type PartnerOption = {
  id: string;
  name: string;
  company: string | null;
  profession: string | null;
};

type Props = {
  dealId: string;
  deal: {
    title: string;
    clientName: string;
    typeLabel: string;
    estimatedAmount: string | null;
    description: string | null;
  };
  organizationName: string;
  brand: RenderBrand;
  issuedByName: string | null;
  currentDealStatus: { id: string; label: string; color: string | null };
  availableStatuses: { id: string; label: string; color: string | null }[];
  partners: PartnerOption[];
};

type CommissionBasis = "percentage" | "fixed";

function computeAmount(
  basis: CommissionBasis,
  rate: string,
  fixedAmount: string,
  baseAmount: string
): number | null {
  if (basis === "fixed") {
    const n = Number(fixedAmount);
    return fixedAmount && !Number.isNaN(n) ? n : null;
  }
  const r = Number(rate);
  const b = Number(baseAmount);
  if (!rate || !baseAmount || Number.isNaN(r) || Number.isNaN(b)) return null;
  return (r * b) / 100;
}

/**
 * L'écran où le conseiller fixe une commission qui l'engage vis-à-vis d'un
 * confrère : la commission est calculée explicitement à l'écran (pas juste
 * un pourcentage dans un champ), l'aperçu est le RENDU RÉEL de la page
 * partenaire (même composant, mode preview), et une confirmation
 * récapitule partenaire + conditions avant l'envoi effectif.
 */
export function ShareComposer({
  dealId,
  deal,
  organizationName,
  brand,
  issuedByName,
  currentDealStatus,
  availableStatuses,
  partners,
}: Props) {
  const router = useRouter();

  const [phase, setPhase] = useState<"compose" | "confirm" | "sending" | "done">("compose");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sentToken, setSentToken] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [proposedTerms, setProposedTerms] = useState("");
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  // Cochée par défaut : le produit pousse à formaliser la commission dès
  // l'envoi, sans en faire une impasse quand elle n'est pas encore connue.
  const [withCommission, setWithCommission] = useState(true);
  const [basis, setBasis] = useState<CommissionBasis>("percentage");
  const [rate, setRate] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [baseAmount, setBaseAmount] = useState(deal.estimatedAmount ?? "");

  const computedAmount = computeAmount(basis, rate, fixedAmount, baseAmount);
  const commissionValid =
    basis === "percentage" ? Boolean(rate) && Boolean(baseAmount) && computedAmount !== null : Boolean(fixedAmount);

  const selectedPartner = partners.find((p) => p.id === partnerId);

  const draftCommission =
    withCommission && commissionValid && computedAmount !== null
      ? {
          basis,
          rate: basis === "percentage" ? rate : null,
          fixedAmount: basis === "fixed" ? fixedAmount : null,
          baseAmount: basis === "percentage" ? baseAmount : null,
          computedAmount: String(computedAmount),
          state: "prevue" as const,
        }
      : null;

  // Objet simple, recalculé à chaque rendu — pas de useMemo : c'est un
  // aperçu client-only, le coût de reconstruction est négligeable, et ça
  // évite un tableau de dépendances à tenir juste en cas d'oubli.
  const draftView: PublicShareView = {
    shareId: "preview",
    status: "pending",
    organization: { name: organizationName },
    issuedByName,
    partnerName: selectedPartner?.name ?? "Votre partenaire",
    deal,
    proposedTerms: proposedTerms || null,
    message: message || null,
    brand,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    respondedAt: null,
    currentDealStatus,
    availableStatuses,
    commission: draftCommission,
    events: [],
  };

  const canSubmit = Boolean(partnerId) && (!withCommission || commissionValid);

  async function send() {
    setPhase("sending");
    setError(null);
    try {
      const { token } = await createDealShareAction({
        dealId,
        partnerId,
        proposedTerms: proposedTerms || null,
        message: message || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        commission: draftCommission,
      });
      setSentToken(token);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'envoi a échoué.");
      setPhase("confirm");
    }
  }

  async function copyToken() {
    if (!sentToken) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/partage/${sentToken}`);
      setCopied(true);
    } catch {
      // Best-effort : le champ reste sélectionnable manuellement si le presse-papier échoue.
    }
  }

  if (phase === "done" && sentToken) {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/partage/${sentToken}`;
    // Jetons sémantiques plutôt que couleurs Tailwind en dur, et tutoiement
    // comme partout ailleurs dans le produit.
    return (
      <Card className="border-warning/40 bg-warning/5">
        <CardHeader>
          <CardTitle>Lien créé — à copier maintenant</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            Ce lien ne sera plus jamais réaffiché. Copie-le maintenant et transmets-le à{" "}
            {selectedPartner?.name}. Si tu le perds, il faudra renvoyer le partage — ce qui
            annulera celui-ci et en créera un nouveau.
          </p>
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex gap-2">
            <Button onClick={copyToken}>{copied ? "Copié !" : "Copier le lien"}</Button>
            <Button
              variant="outline"
              onClick={() => {
                router.refresh();
                setPhase("compose");
                setSentToken(null);
                setCopied(false);
                setProposedTerms("");
                setMessage("");
                setExpiresAt("");
                setRate("");
                setFixedAmount("");
              }}
            >
              J&apos;ai copié le lien — Terminé
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Partager cette affaire</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Partenaire" htmlFor="partnerId">
              <Select
                value={partnerId}
                onValueChange={(v) => setPartnerId(String(v))}
                // Voir la note dans partner-share-view.tsx : sans `items`, le
                // déclencheur affiche l'UUID du partenaire au lieu de son nom.
                items={partners.map((p) => ({
                  label: p.company ? `${p.name} · ${p.company}` : p.name,
                  value: p.id,
                }))}
              >
                <SelectTrigger id="partnerId" className="w-full">
                  <SelectValue placeholder="Choisir un partenaire" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.company ? ` · ${p.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {partners.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucun partenaire actif. Ajoutez-en un depuis l&apos;écran Partenaires.
                </p>
              )}
            </Field>

            <Field label="Conditions proposées" htmlFor="proposedTerms">
              <Textarea
                id="proposedTerms"
                value={proposedTerms}
                onChange={(e) => setProposedTerms(e.target.value)}
                placeholder="Ex : commission versée à l'acte, sous réserve de signature."
                className="min-h-16"
              />
            </Field>

            <Field label="Message au partenaire" htmlFor="message">
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-16"
              />
            </Field>

            <Field
              label="Le lien cesse de fonctionner le"
              htmlFor="expiresAt"
              hint="Facultatif. Sans date, le lien reste valable tant que tu ne le révoques pas."
            >
              <Input
                id="expiresAt"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-48"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commission</CardTitle>
            <CardDescription>
              La fixer maintenant, c&apos;est ce qui t&apos;engage vis-à-vis du confrère — plutôt
              que de la laisser en texte libre à interpréter plus tard.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Choix explicite. Avant, la commission était obligatoire de
                fait : le bouton d'envoi restait grisé tant qu'elle n'était
                pas valide, sans jamais dire pourquoi — alors que la couche
                base accepte un partage sans commission. */}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={withCommission}
                onChange={(e) => setWithCommission(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Fixer une commission pour ce partage
                <span className="block text-xs text-muted-foreground">
                  Décoche si elle sera négociée plus tard.
                </span>
              </span>
            </label>

            {withCommission && (
              <>
            {/* « Base » désignait à la fois le MODE de calcul et le MONTANT
                de référence, sur le même écran. Deux libellés distincts. */}
            <Field label="Comment la calculer" htmlFor="basis">
              <Select
                value={basis}
                onValueChange={(v) => setBasis(v as CommissionBasis)}
                items={[
                  { label: "Pourcentage", value: "percentage" },
                  { label: "Montant fixe", value: "fixed" },
                ]}
              >
                <SelectTrigger id="basis" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Pourcentage</SelectItem>
                  <SelectItem value="fixed">Montant fixe</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {basis === "percentage" ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Taux (%)" htmlFor="rate">
                  <Input
                    id="rate"
                    type="number"
                    min="0"
                    step="0.1"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </Field>
                <Field label="Montant de référence (€)" htmlFor="baseAmount">
                  <Input
                    id="baseAmount"
                    type="number"
                    min="0"
                    value={baseAmount}
                    onChange={(e) => setBaseAmount(e.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <Field label="Montant (€)" htmlFor="fixedAmount">
                <Input
                  id="fixedAmount"
                  type="number"
                  min="0"
                  value={fixedAmount}
                  onChange={(e) => setFixedAmount(e.target.value)}
                />
              </Field>
            )}

            {/* Calcul explicite, pas juste un champ rempli. */}
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {draftCommission ? (
                <span className="font-medium">{formatCommission(draftCommission)}</span>
              ) : (
                <span className="text-muted-foreground">
                  Renseigne {basis === "percentage" ? "le taux et le montant de référence" : "le montant"} pour voir
                  le calcul.
                </span>
              )}
            </div>
              </>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {phase === "compose" && (
          <div className="flex flex-col gap-2">
            <Button className="w-fit" disabled={!canSubmit} onClick={() => setPhase("confirm")}>
              Envoyer le partage
            </Button>
            {/* Un bouton grisé doit toujours dire ce qui lui manque. */}
            {!canSubmit && (
              <p className="text-xs text-muted-foreground">
                {!partnerId
                  ? "Choisis d'abord un partenaire."
                  : basis === "percentage"
                    ? "Renseigne le taux et le montant de référence, ou décoche « Fixer une commission »."
                    : "Renseigne le montant de la commission, ou décoche « Fixer une commission »."}
              </p>
            )}
          </div>
        )}

        {(phase === "confirm" || phase === "sending") && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle>Confirme l&apos;envoi</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm">
                Tu partages <span className="font-medium">{deal.title}</span> avec{" "}
                <span className="font-medium">{selectedPartner?.name}</span>.
              </p>
              {draftCommission && (
                <p className="text-sm">
                  Commission : <Badge variant="secondary">{formatCommission(draftCommission)}</Badge>
                </p>
              )}
              {proposedTerms && (
                <p className="text-sm text-muted-foreground">Conditions : {proposedTerms}</p>
              )}
              <div className="flex gap-3">
                <Button onClick={send} disabled={phase === "sending"}>
                  {phase === "sending" ? "Envoi..." : "Confirmer et générer le lien"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setPhase("compose")}
                  disabled={phase === "sending"}
                >
                  Modifier
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Aperçu</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[80vh] overflow-y-auto rounded-md border">
            <PartnerShareView token="" initialView={draftView} preview />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
