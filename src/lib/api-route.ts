import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { errorMessage } from "@/lib/form-actions";
import { log } from "@/lib/log";

/**
 * La réponse d'une route API à une erreur attrapée (audit, constat Q5) —
 * le pendant de `errorMessage` pour les actions : une `AppError` expose sa
 * phrase traduite et son statut (401, 403, 404, 429…) ; tout le reste est
 * un accident technique — journalisé avec la route et l'organisation, puis
 * le message générique en 500. Jamais `err.message` brut au navigateur :
 * un message de SDK ou de pilote n'est ni traduit ni fait pour être lu.
 */
export async function apiErrorResponse(error: unknown, context: { route: string; organizationId?: string | null }): Promise<NextResponse> {
  if (!isAppError(error)) {
    log.error("api_route_error", { route: context.route, organizationId: context.organizationId ?? null, error });
  }
  const status = isAppError(error) ? error.status : 500;
  return NextResponse.json({ error: await errorMessage(error) }, { status });
}
