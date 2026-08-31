import { Badge } from "@/components/ui/badge";
import { readAuthDetail } from "@/lib/email/inbound/proposal";
import { useTranslations } from "next-intl";

/**
 * LE VERDICT D'AUTHENTIFICATION d'un email reçu (docs/module-engagement.md
 * §4.2) — calculé par nous depuis le message brut, jamais lu dans un
 * en-tête que l'expéditeur écrit lui-même. Le badge dit le verdict ; sa
 * preuve (le domaine signataire et le sélecteur, ou l'adresse IP et le
 * domaine SPF) s'affiche à côté en clair, comme des données techniques.
 */
const RESULTS = ["dkim_aligned", "spf_aligned", "failed", "unavailable"] as const;
type AuthResult = (typeof RESULTS)[number];

function isKnown(value: string): value is AuthResult {
  return (RESULTS as readonly string[]).includes(value);
}

export function AuthBadge({ result }: { result: string }) {
  const t = useTranslations("inbound.auth");
  if (!isKnown(result)) return <Badge variant="outline">{result}</Badge>;
  const passed = result === "dkim_aligned" || result === "spf_aligned";
  return (
    <Badge variant={passed ? "secondary" : "outline"} className={passed ? undefined : "border-warning/50"}>
      {t(result)}
    </Badge>
  );
}

/** La preuve, en une ligne de faits : ce que DKIM a signé, ce que SPF a évalué. */
export function AuthEvidence({ detail }: { detail: unknown }) {
  const t = useTranslations("inbound.auth");
  const { dkim, spf } = readAuthDetail(detail);
  if (dkim.length === 0 && !spf) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {dkim.map((signature, index) => (
        <span key={`${signature.domain}-${index}`}>
          {t("dkim")} <code className="font-mono">d={signature.domain || "?"} s={signature.selector || "?"}</code>{" "}
          <code className="font-mono">{signature.code ?? signature.status}</code>
          {signature.aligned ? "" : ` · ${t("non_aligne")}`}
        </span>
      ))}
      {spf && (
        <span>
          {t("spf")} <code className="font-mono">{spf.domain || "?"} {spf.ip || "?"}</code> <code className="font-mono">{spf.result}</code>
        </span>
      )}
    </p>
  );
}
