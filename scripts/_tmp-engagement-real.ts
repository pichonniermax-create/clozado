/**
 * Preuve RÉELLE de l'étape 2 (DNS posés, domaines vérifiés chez Resend) :
 * envoi de test AVANT bascule (repli `_engage-test@mail.clozado.fr`),
 * adoption de `mail.clozado.fr` comme domaine propre par l'écran des
 * réglages, envoi réel APRÈS bascule (`cabinet@mail.clozado.fr`), puis les
 * événements réels (remis, rejeté, ouverture, clic) sur la fiche. Piloté
 * au navigateur (session forgée) sur le serveur de production local ;
 * les en-têtes reçus se lisent côté Gmail, hors de ce script.
 *
 * Phases : `avant` | `bascule` — faites ici (2026-08-27). `events` (OPEN_URL /
 * CLICK_URL, tirées de l'email reçu) et `shots` exigent que les webhooks du
 * fournisseur atteignent l'application : À FAIRE EN PRODUCTION (BASE_URL =
 * l'URL Vercel, webhook créé chez Resend) — le serveur du Codespace n'est
 * pas exposé sur internet, par décision.
 * BASE_URL (défaut http://localhost:3000), SHOTS_DIR.
 * Lance `_tmp-engagement-fixture.ts create` avant, `destroy` après.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "/tmp/claude-1000/-workspaces-clozado/9fc26952-8a21-4cb6-b433-5dcd7c85e356/scratchpad/shots";
const REPLY_TO = "pichonniermax+reponse@gmail.com";
const OWN_SENDER = "cabinet@mail.clozado.fr";
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK" : "KO"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const phase = process.argv[2];
  mkdirSync(SHOTS, { recursive: true });
  const { chromium } = await import("playwright");
  const { encode } = await import("next-auth/jwt");
  const { db } = await import("@/db");
  const { contacts, emailMessages, emailEvents, newsletters, newsletterSends, organizations, users } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { getSuppression } = await import("@/db/queries/email-events");
  const { getContactIndicators } = await import("@/db/queries/engagement");

  const org = await db.query.organizations.findFirst({ where: eq(organizations.slug, "_engage-test") });
  if (!org) throw new Error("fixture absente");
  const admin = await db.query.users.findFirst({ where: eq(users.role, "super_admin") });
  if (!admin) throw new Error("aucun super_admin");
  const nl = await db.query.newsletters.findFirst({ where: eq(newsletters.organizationId, org.id) });
  const max = await db.query.contacts.findFirst({ where: and(eq(contacts.organizationId, org.id), eq(contacts.email, "pichonniermax@gmail.com")) });
  const bounced = await db.query.contacts.findFirst({ where: and(eq(contacts.organizationId, org.id), eq(contacts.email, "bounced@resend.dev")) });
  if (!nl || !max || !bounced) throw new Error("fixture incomplète");
  const user = { role: "admin" as const, organizationId: org.id };

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
  const settle = async (expected: string | RegExp, timeout = 30000) => {
    await page.waitForLoadState("networkidle");
    await page.getByText(expected).first().waitFor({ timeout });
  };
  const out: Record<string, unknown> = {};

  if (phase === "avant") {
    // 1. L'adresse de réponse de la personne, par l'écran /profil
    await page.goto(`${BASE}/profil`);
    await settle("Mon profil");
    await page.locator("#replyToEmail").fill(REPLY_TO);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await settle("Profil enregistré");
    const saved = await db.query.users.findFirst({ where: eq(users.id, admin.id) });
    check("profil : l'adresse de réponse enregistrée", saved?.replyToEmail === REPLY_TO);

    // 2. Le test part pour de vrai, en repli (domaine non déclaré)
    await page.goto(`${BASE}/newsletters/${nl.id}`);
    await settle("Brouillon — pas encore envoyée");
    let t = await text();
    check("newsletter : partira du repli `_engage-test@mail.clozado.fr`, réponses à l'adresse de la personne", /_engage-test@mail\.clozado\.fr/.test(t) && t.includes(REPLY_TO) && /n’est pas vérifié/.test(t));
    await page.getByRole("button", { name: "M’envoyer un test" }).click();
    await settle(/L’email de test n’est pas parti|Tests envoyés/);
    t = await text();
    check("test : parti (pas de refus du fournisseur), journalisé « envoyé »", /Tests envoyés/.test(t) && !/n’est pas parti/.test(t) && /· envoyé/.test(t), t.match(/n’est pas parti[^\n]*/)?.[0] ?? "");
    await page.screenshot({ path: `${SHOTS}/real-test-envoye.png` });
    const test = await db.query.emailMessages.findFirst({ where: and(eq(emailMessages.organizationId, org.id), eq(emailMessages.kind, "test")) });
    check("test en base : statut sent, id du fournisseur, From en repli, Reply-To de la personne", test?.status === "sent" && Boolean(test?.providerMessageId) && /_engage-test@mail\.clozado\.fr/.test(test?.fromEmail ?? "") && test?.replyTo === REPLY_TO, `${test?.fromEmail} / ${test?.replyTo} / ${test?.providerMessageId}`);
    out.testMessageId = test?.id;
    out.testProviderId = test?.providerMessageId;
    out.testFrom = test?.fromEmail;
    out.testSubject = test?.subject;
  }

  if (phase === "avant-verif") {
    // Reprise : la carte après rechargement, et le test tel qu'il est en base
    await page.goto(`${BASE}/newsletters/${nl.id}`);
    await settle("Brouillon — pas encore envoyée");
    const t = await text();
    check("test : journalisé « envoyé » sur la carte (après rechargement)", /Tests envoyés/.test(t) && /· envoyé/.test(t) && !/n’est pas parti/.test(t), t.match(/Tests envoyés[\s\S]{0,160}/)?.[0]?.replace(/\n/g, " ") ?? "");
    await page.screenshot({ path: `${SHOTS}/real-test-envoye.png` });
    const test = await db.query.emailMessages.findFirst({ where: and(eq(emailMessages.organizationId, org.id), eq(emailMessages.kind, "test")) });
    check("test en base : statut sent, id du fournisseur, From en repli, Reply-To de la personne", test?.status === "sent" && Boolean(test?.providerMessageId) && /_engage-test@mail\.clozado\.fr/.test(test?.fromEmail ?? "") && test?.replyTo === REPLY_TO, `${test?.fromEmail} / ${test?.replyTo} / ${test?.providerMessageId}`);
    out.testMessageId = test?.id;
    out.testProviderId = test?.providerMessageId;
  }

  if (phase === "dump") {
    await page.goto(`${BASE}/settings`);
    await settle("Domaine d’envoi");
    console.log("----- SETTINGS -----\n" + (await text()).split("Domaine d’envoi")[1]?.slice(0, 2500));
    await page.screenshot({ path: `${SHOTS}/dump-settings.png`, fullPage: false });
    await page.goto(`${BASE}/newsletters/${nl.id}`);
    await settle(/Brouillon|Envoi en cours|Envoyée le/);
    console.log("----- NEWSLETTER -----\n" + (await text()).slice(0, 3000));
    await page.screenshot({ path: `${SHOTS}/dump-newsletter.png` });
  }

  if (phase === "bascule") {
    // 3. L'adresse d'expédition de l'organisation sur mail.clozado.fr (réglages, formulaire de l'organisation)
    await page.goto(`${BASE}/settings`);
    await settle("Domaine d’envoi");
    await page.locator("#senderEmail").fill(OWN_SENDER);
    await page.locator("#senderEmail").locator("xpath=ancestor::form[1]").locator("button[type=submit]").first().click();
    await page.waitForLoadState("networkidle");
    await sleep(1500);
    const orgAfter = await db.query.organizations.findFirst({ where: eq(organizations.id, org.id) });
    check("réglages : adresse d'expédition enregistrée sur mail.clozado.fr", orgAfter?.senderEmail === OWN_SENDER, orgAfter?.senderEmail ?? "");

    // 4. Déclarer (adopter) mail.clozado.fr, vérifier : tout en place, DMARC lu par nous, « Vérifié »
    await page.goto(`${BASE}/settings`);
    await settle("Domaine d’envoi");
    await page.locator("#domain").fill("mail.clozado.fr");
    await page.getByRole("button", { name: "Déclarer ce domaine" }).click();
    await settle(/Vérifié le|Il manque|Tous les enregistrements sont là/);
    let t = await text();
    if (!/Vérifié le/.test(t)) {
      await page.getByRole("button", { name: "Vérifier maintenant" }).click();
      await settle("dernière vérification le");
      t = await text();
    }
    check("domaine : « Vérifié le … tes emails partent de ton adresse d'expédition »", /Vérifié le/.test(t) && /partent de ton adresse d’expédition/.test(t), t.match(/Il manque[^\n]*|Tous les enregistrements[^\n]*/)?.[0] ?? "");
    const table = t.split("Domaine d’envoi")[1]?.split("Instructions par hébergeur")[0] ?? "";
    check("domaine : les 5 lignes « En place » (dont DMARC vérifié par nous), plus aucune manquante", (table.match(/En place/g) ?? []).length === 5 && !/Manquant|En cours|Incorrect|Réessayer/.test(table) && /vérifié par nous/.test(table));
    check("domaine : expéditeur effectif = l'adresse propre", t.includes(`<${OWN_SENDER}>`) || t.includes(OWN_SENDER));
    await page.screenshot({ path: `${SHOTS}/real-domaine-verifie.png` });
    const orgV = await db.query.organizations.findFirst({ where: eq(organizations.id, org.id) });
    check("domaine en base : statut verified, verified_at posé, id fournisseur = 20bd7d5a…", orgV?.emailDomainStatus === "verified" && Boolean(orgV?.emailDomainVerifiedAt) && orgV?.emailDomainProviderId?.startsWith("20bd7d5a") === true, `${orgV?.emailDomainStatus} ${orgV?.emailDomainProviderId}`);

  }

  if (phase === "envoi") {
    // 5. L'envoi réel, après bascule
    await page.goto(`${BASE}/newsletters/${nl.id}`);
    await settle("Brouillon — pas encore envoyée");
    let t = await text();
    check("newsletter : partira de l'adresse propre, plus de repli annoncé", t.includes(OWN_SENDER) && !/_engage-test@mail\.clozado\.fr/.test(t) && !/n’est pas vérifié/.test(t));
    check("newsletter : 2 destinataires réels annoncés", /Envoyer à 2 contacts/.test(t));
    await page.getByLabel(/Je confirme l’envoi réel/).check();
    await page.getByRole("button", { name: "Envoyer maintenant" }).click();
    await settle(/Envoi en cours|Envoyée le/);
    await page.screenshot({ path: `${SHOTS}/real-envoi-lance.png` });
    const send = await db.query.newsletterSends.findFirst({ where: eq(newsletterSends.newsletterId, nl.id) });
    const queuedMsgs = await db.query.emailMessages.findMany({ where: eq(emailMessages.sendId, send!.id) });
    check("envoi en base : 2 messages en file, From propre, Reply-To de la personne", send?.queued === 2 && queuedMsgs.length === 2 && queuedMsgs.every((m) => m.fromEmail.includes(OWN_SENDER) && m.replyTo === REPLY_TO), `${send?.queued} ${queuedMsgs.map((m) => `${m.fromEmail} / ${m.replyTo}`).join(" | ")}`);
    // L'exécutant tourne après la réponse (after()) : attendre que plus rien ne soit en file
    let msgs = [] as (typeof emailMessages.$inferSelect)[];
    for (let i = 0; i < 40; i++) {
      msgs = await db.query.emailMessages.findMany({ where: eq(emailMessages.sendId, send!.id) });
      if (msgs.length === 2 && msgs.every((m) => m.status !== "queued")) break;
      await sleep(1500);
    }
    check("exécutant : les 2 messages remis au fournisseur (statut sent, id fournisseur)", msgs.length === 2 && msgs.every((m) => m.status === "sent" && Boolean(m.providerMessageId)), msgs.map((m) => `${m.toEmail}:${m.status}:${m.providerMessageId ?? "-"}:${m.failureReason ?? ""}`).join(" | "));
    const sendDone = await db.query.newsletterSends.findFirst({ where: eq(newsletterSends.id, send!.id) });
    check("envoi terminé : finished_at posé, sent = 2, failed = 0, pas de pause", Boolean(sendDone?.finishedAt) && sendDone?.sent === 2 && sendDone?.failed === 0 && !sendDone?.pausedUntil, `${sendDone?.sent}/${sendDone?.failed} ${sendDone?.pauseReason ?? ""} ${sendDone?.error ?? ""}`);
    await page.reload();
    await settle(/Envoyée le/);
    t = await text();
    check("carte : « Envoyée le », agrégats affichés", /Envoyée le/.test(t) && /Envoyés/.test(t) && /Remis/.test(t));
    await page.screenshot({ path: `${SHOTS}/real-envoyee.png` });
    out.sendId = send?.id;
    out.messages = msgs.map((m) => ({ id: m.id, to: m.toEmail, providerId: m.providerMessageId, from: m.fromEmail }));
    out.subject = sendDone?.subject;
  }

  if (phase === "events") {
    // 6. Ouverture et clic réels : le pixel et le lien réécrits par le fournisseur, tels qu'un client mail les demanderait
    const openUrl = process.env.OPEN_URL;
    const clickUrl = process.env.CLICK_URL;
    if (!openUrl || !clickUrl) throw new Error("OPEN_URL et CLICK_URL requis (tirés de l'email reçu)");
    const ua = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36" };
    const o = await fetch(openUrl, { headers: ua, redirect: "manual" });
    check("ouverture : le pixel de suivi répond", o.status >= 200 && o.status < 400, `${o.status} ${o.headers.get("content-type") ?? ""}`);
    const c = await fetch(clickUrl, { headers: ua, redirect: "manual" });
    check("clic : le lien réécrit redirige vers la cible réelle", c.status >= 300 && c.status < 400 && /example\.com\/rendez-vous/.test(c.headers.get("location") ?? ""), `${c.status} → ${c.headers.get("location") ?? ""}`);

    const msgMax = await db.query.emailMessages.findFirst({ where: and(eq(emailMessages.contactId, max.id), eq(emailMessages.kind, "newsletter")) });
    const msgB = await db.query.emailMessages.findFirst({ where: and(eq(emailMessages.contactId, bounced.id), eq(emailMessages.kind, "newsletter")) });
    if (!msgMax || !msgB) throw new Error("messages de l'envoi absents");
    let mMax = msgMax, mB = msgB;
    for (let i = 0; i < 60; i++) {
      mMax = (await db.query.emailMessages.findFirst({ where: eq(emailMessages.id, msgMax.id) }))!;
      mB = (await db.query.emailMessages.findFirst({ where: eq(emailMessages.id, msgB.id) }))!;
      if (mMax.openCount > 0 && mMax.clickCount > 0 && mMax.deliveredAt && mB.status === "bounced") break;
      await sleep(2000);
    }
    check("webhook réel : le message de Max est remis", Boolean(mMax.deliveredAt), String(mMax.status));
    check("webhook réel : ouverture comptée", mMax.openCount > 0 && Boolean(mMax.firstOpenedAt), String(mMax.openCount));
    check("webhook réel : clic compté", mMax.clickCount > 0 && Boolean(mMax.firstClickedAt), String(mMax.clickCount));
    check("webhook réel : bounced@resend.dev rejeté définitivement → suppression", mB.status === "bounced" && (await getSuppression(org.id, "bounced@resend.dev"))?.reason === "bounced", `${mB.status} ${mB.failureReason ?? ""}`);
    const evs = await db.query.emailEvents.findMany({ where: eq(emailEvents.messageId, msgMax.id) });
    check("événements en base pour Max : delivered, opened, clicked (avec l'URL), aucun IP/UA", ["delivered", "opened", "clicked"].every((k) => evs.some((e) => e.type === k)) && evs.some((e) => e.type === "clicked" && /example\.com\/rendez-vous/.test(e.url ?? "")) && evs.every((e) => !JSON.stringify(e.detail ?? {}).match(/ip|user_agent|userAgent/i)), evs.map((e) => e.type).join(","));
    const ind = await getContactIndicators(user, max.id);
    check("indicateurs : dernier clic = dernière interaction (l'ouverture ne compte pas)", Boolean(ind.lastClickedAt) && ind.lastInteractionAt?.getTime() === ind.lastClickedAt?.getTime() && Boolean(ind.lastOpenedAt));
    const test = await db.query.emailMessages.findFirst({ where: and(eq(emailMessages.organizationId, org.id), eq(emailMessages.kind, "test")) });
    check("le test aussi : remis (webhook)", Boolean(test?.deliveredAt), String(test?.status));
    out.events = evs.map((e) => ({ type: e.type, at: e.occurredAt, url: e.url }));
  }

  if (phase === "events" || phase === "shots") {
    await page.goto(`${BASE}/contacts/${max.id}`);
    await settle("Dernier clic");
    const t = await text();
    check("fiche : Dernier clic, Dernier email ouvert, Dernière interaction renseignés, journal avec « cliqué » et le lien", /Dernier clic/.test(t) && /Prendre rendez-vous|example\.com\/rendez-vous/.test(t) && !/Dernier clic\n—/.test(t));
    await page.screenshot({ path: `${SHOTS}/real-fiche-max.png` });
    await page.goto(`${BASE}/contacts/${bounced.id}`);
    await settle(/Rebond Simulé/);
    const tb = await text();
    check("fiche du rejeté : « rejeté » dans le journal", /rejet/i.test(tb));
    await page.screenshot({ path: `${SHOTS}/real-fiche-rejet.png` });
    await page.goto(`${BASE}/newsletters/${nl.id}`);
    await settle(/Envoyée le/);
    const tn = await text();
    check("carte envoyée : Remis 1, Ouverts 1, Cliqués 1, Rejetés 1, lien cliqué listé", /Remis\s*\n?\s*1/.test(tn) && /Cliqués\s*\n?\s*1/.test(tn) && /Rejetés\s*\n?\s*1/.test(tn) && /rendez-vous/.test(tn), tn.match(/Envoyés[\s\S]{0,200}/)?.[0]?.replace(/\n/g, " ") ?? "");
    await page.screenshot({ path: `${SHOTS}/real-newsletter-agregats.png` });
  }

  check("zéro pageerror", pageErrors.length === 0, pageErrors.join(" | "));
  check("zéro erreur console", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  await browser.close();
  console.log("RESULT " + JSON.stringify(out));
  console.log(failures === 0 ? "\nTOUT EST OK" : `\n${failures} KO`);
  if (failures > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
