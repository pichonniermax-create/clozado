import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { toAppLocale } from "@/i18n/locales";
import { translatorFor } from "@/i18n/translator";
import { PRODUCT_NAME } from "@/lib/brand";
import { resolveUnsubscribe, unsubscribeByMessage, type UnsubscribeOutcome } from "@/lib/email/unsubscribe";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * /desinscription/[id] — la page PUBLIQUE de désinscription, sans compte :
 * l'id du message (uuid v4, ni devinable ni énumérable) désigne l'adresse
 * et l'organisation ; la page est dans la LANGUE DE L'ORGANISATION (la
 * langue du contact n'est pas connue). Un lien inconnu et un lien d'une
 * autre organisation reçoivent la même réponse neutre (404). Le geste est
 * un formulaire (action serveur) : il marche sans JavaScript, et un GET
 * ne désinscrit jamais. Un email de test ne désinscrit personne.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false }, title: PRODUCT_NAME };
}

async function guard(id: string): Promise<void> {
  if (!UUID.test(id)) notFound();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "inconnue";
  if (!checkRateLimit(`unsub-page:ip:${ip}`, { limit: 60, windowMs: 60_000 })) notFound();
}

export default async function UnsubscribePage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await props.params;
  const query = await props.searchParams;
  await guard(id);
  const outcome = await resolveUnsubscribe(id);
  if (outcome.kind === "invalid") notFound();

  async function confirm() {
    "use server";
    await unsubscribeByMessage(id, "link");
    redirect(`/desinscription/${id}?fait=1`);
  }

  const locale = toAppLocale(outcome.locale);
  const t = await translatorFor(locale, "email.unsubscribe");
  const done = query.fait === "1";
  // Le même cadre que /login et /inscription (audit UI du 2026-09-14) : c'est la page publique la plus vue par des
  // non-utilisateurs (elle part dans chaque email), et c'était la seule qui ne ressemblait pas au produit — une carte nue
  // posée en haut d'une page blanche. Dans la langue de l'organisation.
  const { title, text } = wording(outcome, done, t);
  return (
    <AuthShell lang={locale} title={title} description={text}>
      {/* « already » = un vrai message dont l'adresse n'est pas encore supprimée (le nom vient du geste idempotent). */}
      {(outcome.kind === "already" || outcome.kind === "done") && !done && (
        <form action={confirm}>
          <Button type="submit" size="lg" className="w-full sm:w-auto">
            {t("confirm")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

function wording(outcome: UnsubscribeOutcome, done: boolean, t: Awaited<ReturnType<typeof translatorFor<"email.unsubscribe">>>): { title: string; text: string } {
  if (outcome.kind === "test") return { title: t("test_title"), text: t("test", { product: PRODUCT_NAME }) };
  if (outcome.kind === "demo") return { title: t("demo_title"), text: t("demo", { product: PRODUCT_NAME }) };
  if (outcome.kind === "invalid") return { title: t("invalid_title"), text: t("invalid") };
  const { organizationName, email } = outcome;
  if (done) return { title: t("done_title"), text: t("done", { organization: organizationName, email }) };
  return { title: t("title"), text: t("intro", { organization: organizationName, email }) };
}
