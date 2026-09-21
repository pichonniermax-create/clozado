import { use } from "react";
import { AlertTriangle, Check, OctagonX } from "lucide-react";
import { getFormats } from "@/i18n/formats";
import { useTranslations } from "next-intl";
import type { AudienceBreakdown, PreflightRow, PreflightState } from "@/lib/newsletter/preflight";

/**
 * LA LISTE DU CONTRÔLE AVANT ENVOI (chantier envoi, partie 3) : une ligne
 * par contrôle, toujours les mêmes, toujours dans le même ordre — au vert
 * comme au rouge. Une liste qui ne montrerait que les problèmes ne dirait
 * pas ce qui a été vérifié, et c'est justement ce qu'on veut savoir avant
 * d'écrire à trois cents personnes.
 *
 * La revue est pure et rend des codes (`lib/newsletter/preflight.ts`) ;
 * c'est ici, et seulement ici, que les phrases existent — dans les deux
 * langues.
 *
 * Composant SERVEUR synchrone, comme la carte d'envoi : `useTranslations`
 * et `use(getFormats())` s'y lisent sans embarquer les formats dans le
 * paquet du navigateur.
 */

const TONE: Record<PreflightState, { icon: typeof Check; className: string }> = {
  ok: { icon: Check, className: "text-muted-foreground" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  blocking: { icon: OctagonX, className: "text-destructive" },
};

export function PreflightList({ rows, audience }: { rows: PreflightRow[]; audience: AudienceBreakdown }) {
  const t = useTranslations("newsletters.preflight");
  const fmt = use(getFormats());

  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => {
        const { icon: Icon, className } = TONE[row.state];
        const params = { ...(row.params ?? {}) } as Record<string, string | number>;
        if (typeof params.at === "string") params.at = fmt.dateTime(new Date(params.at));
        return (
          <li key={row.code} className="flex items-start gap-3 py-2.5">
            <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${className}`} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium">{t(`libelles.${row.code}`)}</p>
              <p className="text-sm text-muted-foreground text-pretty">
                {/* La phrase vient du code ET de ses valeurs : jamais une chaîne composée à la main. */}
                {t(`details.${row.detail}`, params)}
              </p>
              {row.code === "destinataires" && row.state !== "ok" && <ExclusionReasons audience={audience} />}
            </div>
            <span className="sr-only">{t(`etats.${row.state}`)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Le détail des exclusions : seulement les raisons qui ont rattrapé quelqu'un, avec leur nombre. */
function ExclusionReasons({ audience }: { audience: AudienceBreakdown }) {
  const t = useTranslations("newsletters.preflight");
  const reasons = [
    { key: "without_email", count: audience.withoutEmail },
    { key: "consent_missing", count: audience.consentMissing },
    { key: "objected", count: audience.objected },
    { key: "suppressed", count: audience.suppressed },
    { key: "platform", count: audience.platformSuppressed },
  ] as const;
  const present = reasons.filter((r) => r.count > 0);
  if (present.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      {present.map((r) => (
        <li key={r.key} className="tabular-nums">
          {t(`raisons.${r.key}`, { count: r.count })}
        </li>
      ))}
    </ul>
  );
}
