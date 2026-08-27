import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
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
  // La coquille racine pose <html> et <body> : cette page, publique, ne rend que sa carte — dans la langue de l'organisation.
  return (
    <main lang={locale} className="mx-auto my-12 w-full max-w-md rounded-xl border border-border bg-card p-8 text-card-foreground">
      <Content outcome={outcome} done={done} t={t} confirm={confirm} />
    </main>
  );
}

function Content({ outcome, done, t, confirm }: { outcome: UnsubscribeOutcome; done: boolean; t: Awaited<ReturnType<typeof translatorFor<"email.unsubscribe">>>; confirm: () => Promise<void> }) {
  if (outcome.kind === "test") {
    return (
      <>
        <h1 className="mb-3 text-xl font-semibold">{t("test_title")}</h1>
        <p className="text-sm leading-relaxed">{t("test", { product: PRODUCT_NAME })}</p>
      </>
    );
  }
  if (outcome.kind === "invalid") return null;
  const { organizationName, email } = outcome;
  if (done) {
    return (
      <>
        <h1 className="mb-3 text-xl font-semibold">{t("done_title")}</h1>
        <p className="text-sm leading-relaxed">{t("done", { organization: organizationName, email })}</p>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">{t("title")}</h1>
      <p className="mb-5 text-sm leading-relaxed">{t("intro", { organization: organizationName, email })}</p>
      <form action={confirm}>
        <Button type="submit">{t("confirm")}</Button>
      </form>
    </>
  );
}
