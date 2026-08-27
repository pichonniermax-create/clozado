/**
 * Preuve NAVIGATEUR de l'étape 2 (session forgée, Chromium) : réglages
 * (domaine — repli, déclaration, enregistrements ; pied de page), newsletter
 * (carte d'envoi en brouillon, test refusé par le fournisseur DIT à
 * l'écran), profil, fiche contact (indicateurs), page publique de
 * désinscription (geste + irréversibilité), liste. Zéro pageerror, zéro
 * erreur console, aucune clé brute — en français puis en anglais.
 * BASE_URL (défaut http://localhost:3000).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "/tmp/claude-1000/-workspaces-clozado/923d09e6-1059-4082-8b23-c241bbb57881/scratchpad/shots";
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK" : "KO"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const RAW_KEY = /\b[a-z]+(?:_[a-z0-9]+){2,}\b/;

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const { chromium } = await import("playwright");
  const { encode } = await import("next-auth/jwt");
  const { db } = await import("@/db");
  const { contacts, emailMessages, newsletters, organizations, users } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { getSuppression } = await import("@/db/queries/email-events");

  const org = await db.query.organizations.findFirst({ where: eq(organizations.slug, "_engage-test") });
  if (!org) throw new Error("fixture absente");
  const admin = await db.query.users.findFirst({ where: eq(users.role, "super_admin") });
  if (!admin) throw new Error("aucun super_admin");
  const nl = await db.query.newsletters.findFirst({ where: eq(newsletters.organizationId, org.id) });
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.organizationId, org.id) });
  if (!nl || !contact) throw new Error("fixture incomplète");

  const token = await encode({ token: { email: admin.email, sub: admin.id, name: admin.name }, secret: process.env.AUTH_SECRET!, salt: "authjs.session-token" });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([
    { name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    { name: "clozado-active-org", value: org.id, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  const text = async () => page.evaluate("document.body.innerText") as Promise<string>;
  const settle = async (expected: string | RegExp) => {
    await page.waitForLoadState("networkidle");
    await page.getByText(expected).first().waitFor({ timeout: 20000 });
  };
  const noRawKeys = async (label: string) => {
    const t = await text();
    const raw = t.match(RAW_KEY);
    check(`${label} : aucune clé brute, ni MISSING_MESSAGE`, !raw && !t.includes("MISSING_MESSAGE") && !t.includes("undefined"), raw?.[0] ?? "");
  };

  for (const locale of ["fr", "en"] as const) {
    await db.update(users).set({ locale }).where(eq(users.id, admin.id));
    const L = locale.toUpperCase();

    // Réglages : le domaine (repli), le pied de page
    await page.goto(`${BASE}/settings`);
    await settle(locale === "fr" ? "Domaine d’envoi" : "Sending domain");
    let t = await text();
    check(`${L} réglages : carte domaine en repli, expéditeur effectif sur mail.clozado.fr`, /_engage-test@mail\.clozado\.fr/.test(t) && (locale === "fr" ? /Repli/.test(t) : /Fallback/.test(t)));
    // L'adresse vit dans un <textarea> : innerText ne voit pas la valeur d'un champ — la lire par inputValue().
    check(`${L} réglages : carte pied de page avec l'adresse postale`, /69001 Lyon/.test(await page.locator("#postalAddress").inputValue()));
    await noRawKeys(`${L} réglages`);
    await page.screenshot({ path: `${SHOTS}/settings-${locale}.png` });

    if (locale === "fr") {
      // Déclarer mail.clozado.fr → adoption, table des enregistrements, ce qui manque
      await page.locator("#domain").fill("mail.clozado.fr");
      await page.getByRole("button", { name: "Déclarer ce domaine" }).click();
      await settle("Il manque");
      t = await text();
      check("FR domaine déclaré : 5 enregistrements manquants nommés, statut « Manquant », DMARC « vérifié par nous »", /Il manque 5 enregistrements/.test(t) && /resend\._domainkey\.mail\.clozado\.fr/.test(t) && /_dmarc\.mail\.clozado\.fr/.test(t) && /vérifié par nous/.test(t));
      check("FR domaine déclaré : le bouton « Vérifier maintenant » et les instructions par hébergeur", /Vérifier maintenant/.test(t) && /Instructions par hébergeur/.test(t));
      await page.screenshot({ path: `${SHOTS}/settings-domaine-fr.png` });
      await page.getByRole("button", { name: "Vérifier maintenant" }).click();
      await settle("dernière vérification le");
      t = await text();
      check("FR vérifier maintenant : date de vérification, toujours ce qui manque, pas d'échec muet", /dernière vérification le/.test(t) && /Il manque/.test(t));
      // Retirer : le repli reprend
      await page.getByRole("button", { name: "Retirer ce domaine" }).click();
      await settle("Tant que ton domaine n’est pas vérifié");
      check("FR domaine retiré : le repli reprend", /Tant que ton domaine n’est pas vérifié/.test(await text()));
    }

    // La newsletter : carte d'envoi en brouillon
    await page.goto(`${BASE}/newsletters/${nl.id}`);
    await settle(locale === "fr" ? "Brouillon — pas encore envoyée" : "Draft — not sent yet");
    t = await text();
    check(`${L} newsletter : expéditeur et adresse de réponse annoncés, test et envoi proposés`, /_engage-test@mail\.clozado\.fr/.test(t) && /contact@cabinet-engagement\.example/.test(t) && (locale === "fr" ? /M’envoyer un test/.test(t) && /Envoyer à 2 contacts/.test(t) : /Send me a test/.test(t) && /Send to 2 contacts/.test(t)));
    check(`${L} newsletter : le repli est dit, avec le lien vers le domaine`, locale === "fr" ? /n’est pas vérifié/.test(t) : /is not verified/.test(t));
    await noRawKeys(`${L} newsletter`);
    await page.screenshot({ path: `${SHOTS}/newsletter-brouillon-${locale}.png` });
    if (locale === "fr") {
      // Le test part vers le fournisseur : domaine non vérifié → refus DIT à l'écran, jamais muet
      await page.getByRole("button", { name: "M’envoyer un test" }).click();
      await settle(/L’email de test n’est pas parti|Tests envoyés/);
      t = await text();
      check("FR test : le refus du fournisseur est affiché (domaine non vérifié), et le test journalisé en échec", /n’est pas parti/.test(t) && /Tests envoyés/.test(t) && /échec/.test(t), t.match(/n’est pas parti[^\n]*/)?.[0] ?? "");
      await page.screenshot({ path: `${SHOTS}/newsletter-test-refuse-fr.png` });
    }

    // Le profil
    await page.goto(`${BASE}/profil`);
    await settle(locale === "fr" ? "Mon profil" : "My profile");
    if (locale === "fr") {
      await page.locator("#replyToEmail").fill("max.perso@exemple.test");
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await settle("Profil enregistré");
      const saved = await db.query.users.findFirst({ where: eq(users.id, admin.id) });
      check("FR profil : l'adresse de réponse enregistrée", saved?.replyToEmail === "max.perso@exemple.test");
      await page.goto(`${BASE}/newsletters/${nl.id}`);
      await settle("Brouillon — pas encore envoyée");
      check("FR newsletter : la surcharge de la personne l'emporte sur l'adresse de l'organisation", /max\.perso@exemple\.test/.test(await text()));
      await db.update(users).set({ replyToEmail: null }).where(eq(users.id, admin.id));
    }
    await noRawKeys(`${L} profil`);
    await page.screenshot({ path: `${SHOTS}/profil-${locale}.png` });

    // La fiche contact : les indicateurs
    await page.goto(`${BASE}/contacts/${contact.id}`);
    await settle(locale === "fr" ? "Dernier email ouvert" : "Last email opened");
    t = await text();
    check(`${L} fiche : les quatre indicateurs, l'ouverture dite approximative`, (locale === "fr" ? /Dernier clic/.test(t) && /Dernière interaction/.test(t) && /Dernier rendez-vous/.test(t) && /Approximatif/.test(t) : /Last click/.test(t) && /Last interaction/.test(t) && /Last appointment/.test(t) && /Approximate/.test(t)));
    await noRawKeys(`${L} fiche`);
    await page.screenshot({ path: `${SHOTS}/contact-${locale}.png` });

    // La liste
    await page.goto(`${BASE}/newsletters`);
    await settle("Preuve engagement");
    await noRawKeys(`${L} liste`);
  }
  await db.update(users).set({ locale: null }).where(eq(users.id, admin.id));

  // La page publique de désinscription — depuis un message réel (en base), sans session
  const [msg] = await db.insert(emailMessages).values({ organizationId: org.id, kind: "newsletter", newsletterId: nl.id, contactId: contact.id, toEmail: contact.email!, fromEmail: "x", replyTo: "y", subject: "Preuve", status: "sent", sentAt: new Date() }).returning();
  const anon = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const pub = await anon.newPage();
  const pubErrors: string[] = [];
  pub.on("pageerror", (e) => pubErrors.push(String(e)));
  await pub.goto(`${BASE}/desinscription/${msg.id}`);
  await pub.waitForLoadState("networkidle");
  await pub.getByText("Se désinscrire").first().waitFor();
  let pt = (await pub.evaluate("document.body.innerText")) as string;
  check("désinscription : la page dit l'organisation et l'adresse, en français (langue de l'organisation)", /Cabinet Engagement \(test\)/.test(pt) && new RegExp(contact.email!).test(pt));
  await pub.screenshot({ path: `${SHOTS}/desinscription-avant.png` });
  await pub.getByRole("button", { name: "Confirmer ma désinscription" }).click();
  await pub.waitForLoadState("networkidle");
  // getByText attraperait aussi l'annonceur de route de Next (strict mode) — ancrer sur le titre.
  await pub.getByRole("heading", { name: "C’est fait" }).waitFor();
  pt = (await pub.evaluate("document.body.innerText")) as string;
  check("désinscription : « C’est fait », définitif, et la suppression écrite en base", /définitive/.test(pt) && (await getSuppression(org.id, contact.email!))?.reason === "unsubscribed");
  await pub.screenshot({ path: `${SHOTS}/desinscription-apres.png` });
  const unknown = await pub.goto(`${BASE}/desinscription/00000000-0000-4000-8000-000000000000`);
  check("désinscription : un id inconnu reçoit un 404 neutre", unknown?.status() === 404);
  const oneClick = await anon.request.post(`${BASE}/api/unsubscribe/${msg.id}`, { form: { "List-Unsubscribe": "One-Click" } });
  check("désinscription en un clic : POST accepté (déjà désinscrit → 'already')", oneClick.status() === 200 && /already/.test(await oneClick.text()));
  const getOne = await anon.request.get(`${BASE}/api/unsubscribe/${msg.id}`, { maxRedirects: 0 });
  check("désinscription en un clic : un GET ne désinscrit pas, il redirige vers la page", getOne.status() === 303);
  const webhookNoSig = await anon.request.post(`${BASE}/api/webhooks/resend`, { data: { type: "email.opened" } });
  check("webhook : sans secret configuré ou sans signature, refus (503/401)", webhookNoSig.status() === 503 || webhookNoSig.status() === 401, String(webhookNoSig.status()));
  const cron = await anon.request.get(`${BASE}/api/cron/envois`);
  check("cron : sans secret, refus (503/401)", cron.status() === 503 || cron.status() === 401, String(cron.status()));
  await page.goto(`${BASE}/contacts/${contact.id}`);
  await settle("Désinscrit");
  check("fiche : le badge « Désinscrit » et la phrase définitive", /Désinscrit/.test(await text()) && /définitif/.test(await text()));
  await page.screenshot({ path: `${SHOTS}/contact-desinscrit-fr.png` });

  check("zéro pageerror (session)", pageErrors.length === 0, pageErrors.join(" | "));
  check("zéro erreur console (session)", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  check("zéro pageerror (page publique)", pubErrors.length === 0, pubErrors.join(" | "));
  await browser.close();
  console.log(failures === 0 ? "\nTOUT EST OK" : `\n${failures} KO`);
  if (failures > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
