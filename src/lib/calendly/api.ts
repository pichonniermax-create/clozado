import { AppError } from "@/lib/errors";

/**
 * Le client Calendly (API v2) — utilisé UNE fois à la connexion, avec le
 * jeton d'accès personnel que la personne colle : `GET /users/me` puis
 * `POST /webhook_subscriptions`. Le jeton n'est jamais conservé (§5.1) ;
 * seule la clé de signature que NOUS générons est gardée, chiffrée.
 * Zéro dépendance : `fetch`, comme le client Resend.
 */

const API = "https://api.calendly.com";

type CalendlyUser = {
  /** L'URI de la personne chez Calendly (`https://api.calendly.com/users/…`). */
  uri: string;
  organizationUri: string;
};

async function call(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      // eslint-disable-next-line local/no-visible-text -- en-tête HTTP, jamais lu par une personne
      authorization: `Bearer ${token.trim()}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
}

/** Traduit un refus Calendly en erreur lisible — le plan gratuit refuse les webhooks (403), un jeton faux répond 401. */
async function refuse(response: Response): Promise<never> {
  if (response.status === 401) throw new AppError("calendly_jeton_refuse", undefined, 401);
  if (response.status === 403) throw new AppError("calendly_webhooks_reserves_aux_plans_payants", undefined, 403);
  const detail = (await response.text().catch(() => "")).slice(0, 200);
  throw new AppError("calendly_erreur_du_fournisseur", { status: response.status, detail }, 502);
}

export async function getCalendlyUser(token: string): Promise<CalendlyUser> {
  const response = await call(token, "/users/me");
  if (!response.ok) await refuse(response);
  const data = (await response.json()) as { resource?: { uri?: string; current_organization?: string } };
  const uri = data.resource?.uri;
  const organizationUri = data.resource?.current_organization;
  if (!uri || !organizationUri) throw new AppError("calendly_erreur_du_fournisseur", { status: 200, detail: "users/me incomplet" }, 502);
  return { uri, organizationUri };
}

export async function createCalendlyWebhook(
  token: string,
  input: { callbackUrl: string; userUri: string; organizationUri: string; signingKey: string }
): Promise<{ subscriptionUri: string | null }> {
  const response = await call(token, "/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url: input.callbackUrl,
      events: ["invitee.created", "invitee.canceled"],
      organization: input.organizationUri,
      user: input.userUri,
      scope: "user",
      signing_key: input.signingKey,
    }),
  });
  if (!response.ok) await refuse(response);
  const data = (await response.json()) as { resource?: { uri?: string } };
  return { subscriptionUri: data.resource?.uri ?? null };
}
