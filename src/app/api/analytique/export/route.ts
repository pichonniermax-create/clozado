import { NextResponse } from "next/server";
import { listOrigins } from "@/db/queries/acquisition";
import { listOrgUsers } from "@/db/queries/contacts";
import { listDealTypes } from "@/db/queries/deal-types";
import { getOwnOrganization } from "@/db/queries/organizations";
import { listPipelinesWithStages } from "@/db/queries/pipelines";
import { csvDocument } from "@/lib/csv";
import {
  exportFilename,
  exportPreamble,
  exportTables,
  parseExportView,
  parseMetricFilters,
  type ExportLookups,
  type MetricSearchParams,
} from "@/lib/metrics";
import { requireUser } from "@/lib/session";

/**
 * GET /api/analytique/export?vue=<delais|funnel|pertes|partenaires>&<filtres>
 * — le CSV d'une vue analytique, avec les filtres de l'URL : les mêmes
 * paramètres que l'écran (`parseMetricFilters`), le même rapport, la même
 * organisation. Authentifié comme une page (session, substitution du super
 * admin comprise) ; sans organisation, rien à exporter — un agrégat ne
 * traverse jamais la frontière entre deux clients.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const view = parseExportView(url.searchParams.get("vue"));
  if (!view) {
    return new NextResponse("Vue inconnue : vue=delais, funnel, pertes ou partenaires.", { status: 400 });
  }
  if (!user.organizationId) {
    return new NextResponse("L'export se fait pour une organisation précise : choisis une organisation dans le bandeau super admin.", {
      status: 400,
    });
  }

  const raw: MetricSearchParams = Object.fromEntries(url.searchParams);
  const parsed = parseMetricFilters(raw);
  const [org, users, types, pipelines, origins] = await Promise.all([
    getOwnOrganization(user),
    listOrgUsers(user),
    listDealTypes(user),
    listPipelinesWithStages(user),
    listOrigins(user),
  ]);
  const lookups: ExportLookups = {
    organizationName: org?.name ?? "",
    users,
    types,
    pipelines: pipelines.map((p) => ({ id: p.id, label: p.label })),
    origins,
  };
  const now = new Date();
  const tables = await exportTables(view, user, parsed.filters, lookups);
  const body = csvDocument([exportPreamble(view, parsed, lookups, now), ...tables]);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(view, parsed, now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
