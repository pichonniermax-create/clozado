import type { Instrumentation } from "next";
import { log } from "@/lib/log";

/**
 * L'INSTRUMENTATION de Next (chantier audit et production-ready, étape 2,
 * constats Q4 et D12) — deux choses, et rien d'autre :
 *
 * - `register` : au démarrage d'une instance serveur Node.js, la validation
 *   des variables d'environnement (`src/env.ts`). Jamais pendant `next
 *   build` (le build n'a pas besoin de ces variables) ni dans le runtime
 *   Edge (le proxy n'en lit aucune).
 * - `onRequestError` : chaque erreur qu'une requête a fait échouer — rendu,
 *   route, action serveur — une ligne JSON dans le journal, avec le chemin,
 *   la méthode, la route et le `digest` que l'écran d'erreur montre : c'est
 *   ce qui relie « la page a planté » à sa cause, dans les journaux Vercel.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { validateEnv } = await import("@/env");
  validateEnv();
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  log.error("request_error", {
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    error,
  });
};
