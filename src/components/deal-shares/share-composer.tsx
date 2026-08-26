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
import { useTranslations } from "next-intl";

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
  const t = useTranslations("shares.shareComposer");
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
    partnerName: selectedPartner?.name ?? t("votre_partenaire"),
    deal,
    proposedTerms: proposedTerms || null,
    message: message || null,
    brand,
    // L'icône d'onglet ne se voit pas dans l'aperçu : il est encadré par la page de l'affaire.
    iconUrl: null,
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
      setError(err instanceof Error ? err.message : t("l_envoi_a_echoue_de_notre_2adc"));
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
          <CardTitle>{t("lien_cree_a_copier_maintenant")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {t("ce_lien_ne_sera_plus_jamais_4980", { name: (selectedPartner?.name) ?? "" })}
          </p>
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex gap-2">
            <Button onClick={copyToken}>{copied ? t("copie") : t("copier_le_lien")}</Button>
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
              {t("j_ai_copie_le_lien_termine")}
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
            <CardTitle>{t("partager_cette_affaire")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label={t("partenaire")} htmlFor="partnerId">
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
                  <SelectValue placeholder={t("choisir_un_partenaire")} />
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
                  {t("aucun_partenaire_actif_ajoutez_en_un_de95")}
                </p>
              )}
            </Field>

            <Field label={t("conditions_proposees")} htmlFor="proposedTerms">
              <Textarea
                id="proposedTerms"
                value={proposedTerms}
                onChange={(e) => setProposedTerms(e.target.value)}
                placeholder={t("ex_commission_versee_a_l_acte_ddd2")}
                className="min-h-16"
              />
            </Field>

            <Field label={t("message_au_partenaire")} htmlFor="message">
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-16"
              />
            </Field>

            <Field
              label={t("le_lien_cesse_de_fonctionner_le")}
              htmlFor="expiresAt"
              hint={t("facultatif_sans_date_le_lien_reste_98db")}
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
            <CardTitle>{t("commission")}</CardTitle>
            <CardDescription>
              {t("la_fixer_maintenant_c_est_ce_9dcd")}
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
                {t.rich("fixer_une_commission_pour_ce_partage_2a94", { span: (chunks) => <span className="block text-xs text-muted-foreground">{chunks}</span> })}
              </span>
            </label>

            {withCommission && (
              <>
            {/* « Base » désignait à la fois le MODE de calcul et le MONTANT
                de référence, sur le même écran. Deux libellés distincts. */}
            <Field label={t("comment_la_calculer")} htmlFor="basis">
              <Select
                value={basis}
                onValueChange={(v) => setBasis(v as CommissionBasis)}
                items={[
                  { label: t("pourcentage"), value: "percentage" },
                  { label: t("montant_fixe"), value: "fixed" },
                ]}
              >
                <SelectTrigger id="basis" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">{t("pourcentage")}</SelectItem>
                  <SelectItem value="fixed">{t("montant_fixe")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {basis === "percentage" ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("taux")} htmlFor="rate">
                  <Input
                    id="rate"
                    type="number"
                    min="0"
                    step="0.1"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </Field>
                <Field label={t("montant_de_reference")} htmlFor="baseAmount">
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
              <Field label={t("montant")} htmlFor="fixedAmount">
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
                  {t("renseigne_pour_voir_le_calcul", { value: basis === "percentage" ? t("le_taux_et_le_montant_de_fa0e") : t("le_montant") })}
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
              {t("envoyer_le_partage")}
            </Button>
            {/* Un bouton grisé doit toujours dire ce qui lui manque. */}
            {!canSubmit && (
              <p className="text-xs text-muted-foreground">
                {!partnerId
                  ? t("choisis_d_abord_un_partenaire")
                  : basis === "percentage"
                    ? t("renseigne_le_taux_et_le_montant_ddd6")
                    : t("renseigne_le_montant_de_la_commission_a84e")}
              </p>
            )}
          </div>
        )}

        {(phase === "confirm" || phase === "sending") && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle>{t("confirme_l_envoi")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm">
                {t.rich("tu_partages_avec", { title: deal.title, name: (selectedPartner?.name) ?? "", span: (chunks) => <span className="font-medium">{chunks}</span>, span2: (chunks) => <span className="font-medium">{chunks}</span> })}
              </p>
              {draftCommission && (
                <p className="text-sm">
                  {t("commission_4315")} <Badge variant="secondary">{formatCommission(draftCommission)}</Badge>
                </p>
              )}
              {proposedTerms && (
                <p className="text-sm text-muted-foreground">{t("conditions", { proposedTerms })}</p>
              )}
              <div className="flex gap-3">
                <Button onClick={send} disabled={phase === "sending"}>
                  {phase === "sending" ? t("envoi") : t("confirmer_et_generer_le_lien")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setPhase("compose")}
                  disabled={phase === "sending"}
                >
                  {t("modifier")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{t("apercu")}</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[80vh] overflow-y-auto rounded-md border">
            <PartnerShareView token="" initialView={draftView} preview />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
