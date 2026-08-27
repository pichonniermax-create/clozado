/**
 * Preuve À BLANC de l'étape 2 (sans envoi réel — les DNS ne sont pas posés) :
 * expéditeur, pied de page, rendu texte, départ atomique, événements
 * signés, désinscription irréversible jusqu'au refus de la base, indicateurs,
 * agrégats, adoption du domaine et enregistrements manquants, jetons non
 * énumérables. Chaque contrôle imprime OK/KO ; le script sort en erreur au
 * premier KO. Lance `_tmp-engagement-fixture.ts create` avant, `destroy` après.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createHmac } from "node:crypto";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK" : "KO"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const { db } = await import("@/db");
  const { contacts, emailMessages, emailSuppressions, newsletters, organizations } = await import("@/db/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const { resolveSender, sharedAddress, ownDomainUsable } = await import("@/lib/email/sender");
  const { buildFooter, missingFooterFacts } = await import("@/lib/email/footer");
  const { UNSUBSCRIBE_PLACEHOLDER, buildOutgoing } = await import("@/lib/email/deliver");
  const { prepareNewsletterEmail } = await import("@/lib/email/send-newsletter");
  const { startNewsletterSend, countSendableMembers, getCampaignStats, markMessagesSent, nextQueuedMessages, getLatestSend, refreshSendCounters, finishSend } = await import("@/db/queries/email-sends");
  const { buildAudienceSnapshot, getRenderContext } = await import("@/db/queries/newsletters");
  const { translatorFor } = await import("@/i18n/translator");
  const { verifySvixSignature, handleResendEvent } = await import("@/lib/email/webhooks");
  const { unsubscribeByMessage, resolveUnsubscribe } = await import("@/lib/email/unsubscribe");
  const { getSuppression, addSuppression } = await import("@/db/queries/email-events");
  const { getContactIndicators, listContactEmailEntries } = await import("@/db/queries/engagement");
  const { listContactJournal } = await import("@/db/queries/activities");
  const { declareEmailDomain, checkEmailDomain, missingRecords, parseDomainRecords, lookupDmarc, forgetEmailDomain } = await import("@/lib/email/domain");
  const { getOwnOrganization } = await import("@/db/queries/organizations");

  const org = await db.query.organizations.findFirst({ where: eq(organizations.slug, "_engage-test") });
  if (!org) throw new Error("fixture absente : lance _tmp-engagement-fixture.ts create");
  const user = { role: "admin" as const, organizationId: org.id };
  const admin = await db.query.users.findFirst({ where: eq((await import("@/db/schema")).users.role, "super_admin") });
  if (!admin) throw new Error("aucun super_admin en base");
  const nl = await db.query.newsletters.findFirst({ where: eq(newsletters.organizationId, org.id) });
  if (!nl) throw new Error("newsletter de la fixture absente");
  const origin = "https://preuve.clozado.test";

  // 1. L'expéditeur — quatre situations
  const fallback = resolveSender(org, { email: admin.email, replyToEmail: null });
  check("expéditeur repli : From sur le sous-domaine mutualisé", fallback.fallback && fallback.from.includes(`<${sharedAddress(org)}>`), fallback.from);
  check("expéditeur repli : Reply-To = adresse de réponse de l'organisation", fallback.replyTo === org.senderEmail, fallback.replyTo);
  const personal = resolveSender(org, { email: admin.email, replyToEmail: "moi@exemple.test" });
  check("Reply-To : la surcharge de la personne l'emporte", personal.replyTo === "moi@exemple.test");
  const noOrg = resolveSender({ ...org, senderEmail: null }, { email: admin.email, replyToEmail: null });
  check("Reply-To : sans adresse d'organisation, l'adresse de connexion", noOrg.replyTo === admin.email.toLowerCase());
  const verifiedOrg = { ...org, emailDomain: "cabinet-engagement.example", emailDomainVerifiedAt: new Date() };
  const own = resolveSender(verifiedOrg, null);
  check("domaine vérifié + adresse dessus : From = adresse propre", !own.fallback && own.from.includes("<contact@cabinet-engagement.example>"), own.from);
  const elsewhere = resolveSender({ ...verifiedOrg, senderEmail: "quelquun@gmail.com" }, null);
  check("domaine vérifié mais adresse ailleurs : repli", elsewhere.fallback && !ownDomainUsable({ ...verifiedOrg, senderEmail: "quelquun@gmail.com" }));

  // 2. Le pied de page et la version texte
  const footer = await buildFooter(org, "fr", { unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER });
  check("pied de page : raison, désinscription, adresse postale, mesure", footer.why.includes(org.name) && footer.unsubscribeLabel.length > 0 && footer.postalAddress === org.postalAddress && Boolean(footer.tracking));
  check("pied de page : rien ne manque avec une adresse postale", missingFooterFacts(org).length === 0);
  check("pied de page : l'adresse postale manque sans elle", missingFooterFacts({ ...org, postalAddress: null })[0] === "postal_address");
  const prepared = await prepareNewsletterEmail(user, admin.id, nl.id, origin, { test: false });
  check("rendu : le HTML porte le pied de page et le marqueur de désinscription", prepared.content.html.includes(UNSUBSCRIBE_PLACEHOLDER) && prepared.content.html.includes("69001 Lyon"));
  check("rendu : la version texte existe, avec le bouton et le pied de page", prepared.content.text.includes("Prendre rendez-vous : https://example.com/rendez-vous") && prepared.content.text.includes(UNSUBSCRIBE_PLACEHOLDER));
  const prepTest = await prepareNewsletterEmail(user, admin.id, nl.id, origin, { test: true });
  check("test : l'avertissement de test figure dans le rendu", prepTest.content.html.includes("Email de test"));
  let refused = false;
  try {
    await prepareNewsletterEmail(user, admin.id, nl.id, origin, { test: false }).then(async () => {
      await db.update(organizations).set({ postalAddress: null }).where(eq(organizations.id, org.id));
      await prepareNewsletterEmail(user, admin.id, nl.id, origin, { test: false });
    });
  } catch (e) { refused = String((e as { key?: string }).key ?? e).includes("adresse_postale"); }
  await db.update(organizations).set({ postalAddress: org.postalAddress }).where(eq(organizations.id, org.id));
  check("envoi refusé sans adresse postale (le test, lui, passe)", refused);

  // 3. Le départ atomique
  const t = await translatorFor("fr", "targets");
  const { target, snapshot } = await buildAudienceSnapshot(nl, t);
  const sendable = await countSendableMembers(target);
  check("audience réelle : 2 contacts avec une adresse sur 3", sendable === 2, String(sendable));
  const started = await startNewsletterSend({ newsletterId: nl.id, organizationId: org.id, target, snapshot, topics: ["rentrée"], startedBy: admin.id, subject: prepared.subject, html: prepared.content.html, textBody: prepared.content.text, from: prepared.from, replyTo: prepared.replyTo });
  check("départ : 2 messages en file", started.queued === 2, JSON.stringify(started));
  const after = await db.query.newsletters.findFirst({ where: eq(newsletters.id, nl.id) });
  check("départ : la newsletter est 'sent' avec son audience figée (3)", after?.sendMode === "sent" && (after.audienceSnapshot as { count?: number })?.count === 3);
  let again = "";
  try { await startNewsletterSend({ newsletterId: nl.id, organizationId: org.id, target, snapshot, topics: [], startedBy: admin.id, subject: "x", html: "x", textBody: "x", from: "x", replyTo: "x" }); } catch (e) { again = String((e as { key?: string }).key ?? e); }
  check("départ : une newsletter déjà partie ne repart pas", again.includes("deja"), again);
  const queued = await nextQueuedMessages(started.sendId, 100);
  const outgoing = buildOutgoing(queued[0], prepared.content, origin);
  check("message : lien de désinscription propre au message, en-têtes List-Unsubscribe", outgoing.html.includes(`${origin}/desinscription/${queued[0].id}`) && outgoing.headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && !outgoing.html.includes(UNSUBSCRIBE_PLACEHOLDER));
  // Les identifiants : uuid v4, aucune structure séquentielle
  const ids = queued.map((m) => m.id);
  const v4 = ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id));
  check("jetons : uuid v4 (version 4, variant RFC) — ni séquentiels ni dérivés", v4, ids.join(" "));

  // 4. Les événements du fournisseur (sans envoi : des ids simulés), signature Svix
  await markMessagesSent(queued.map((m, i) => ({ id: m.id, providerMessageId: `proof-${started.sendId}-${i}` })));
  const secret = "whsec_" + Buffer.from("secret-de-preuve-0123456789").toString("base64");
  const body = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: `proof-${started.sendId}-0` } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`msg_1.${ts}.${body}`).digest("base64");
  check("svix : signature valide acceptée", verifySvixSignature({ id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body, secret));
  check("svix : corps modifié refusé", !verifySvixSignature({ id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body + " ", secret));
  check("svix : horodatage trop ancien refusé", !verifySvixSignature({ id: "msg_1", timestamp: String(Number(ts) - 3600), signature: `v1,${sig}` }, body, secret));
  const delivered = await handleResendEvent(JSON.parse(body), "evt-delivered-1");
  const replay = await handleResendEvent(JSON.parse(body), "evt-delivered-1");
  check("webhook : remis enregistré, rejeu ignoré", delivered === "recorded" && replay === "duplicate", `${delivered}/${replay}`);
  const opened = await handleResendEvent({ type: "email.opened", created_at: new Date().toISOString(), data: { email_id: `proof-${started.sendId}-0` } }, "evt-open-1");
  const clicked = await handleResendEvent({ type: "email.clicked", created_at: new Date().toISOString(), data: { email_id: `proof-${started.sendId}-0`, click: { link: "https://example.com/rendez-vous", timestamp: new Date().toISOString() } } }, "evt-click-1");
  const bounced = await handleResendEvent({ type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: `proof-${started.sendId}-1`, bounce: { type: "Permanent", subType: "General", message: "mailbox does not exist" } } }, "evt-bounce-1");
  check("webhook : ouvert, cliqué, rejeté enregistrés", opened === "recorded" && clicked === "recorded" && bounced === "recorded");
  const m0 = await db.query.emailMessages.findFirst({ where: eq(emailMessages.id, queued[0].id) });
  const m1 = await db.query.emailMessages.findFirst({ where: eq(emailMessages.id, queued[1].id) });
  check("message 0 : remis, ouvert, cliqué (compteurs 1/1)", m0?.status === "delivered" && m0.openCount === 1 && m0.clickCount === 1 && Boolean(m0.firstClickedAt));
  check("message 1 : rejeté, motif conservé, adresse supprimée (bounced)", m1?.status === "bounced" && (m1.failureReason ?? "").includes("mailbox") && (await getSuppression(org.id, "bounced@resend.dev"))?.reason === "bounced");
  const unknown = await handleResendEvent({ type: "email.opened", data: { email_id: "inconnu" } }, "evt-x");
  check("webhook : message inconnu signalé (le fournisseur réessaiera)", unknown === "unknown_message");

  // 5. La désinscription — irréversible jusqu'à la base
  const before = await resolveUnsubscribe(queued[0].id);
  const done = await unsubscribeByMessage(queued[0].id, "link");
  const twice = await unsubscribeByMessage(queued[0].id, "one_click");
  check("désinscription : faite, puis 'déjà' au second geste", before.kind === "already" && done.kind === "done" && twice.kind === "already");
  const supp = await getSuppression(org.id, queued[0].toEmail);
  check("désinscription : ligne 'unsubscribed' par lien, rattachée au message et au contact", supp?.reason === "unsubscribed" && supp.source === "link" && supp.messageId === queued[0].id && supp.contactId === queued[0].contactId);
  let deleteRefused = "";
  try { await db.delete(emailSuppressions).where(and(eq(emailSuppressions.organizationId, org.id), eq(emailSuppressions.email, queued[0].toEmail))); } catch (e) { deleteRefused = String((e as { cause?: { message?: string } }).cause?.message ?? e); }
  check("base : DELETE d'une désinscription REFUSÉ par le déclencheur", deleteRefused.includes("ne se retire ni ne se modifie"), deleteRefused.slice(0, 90));
  let updateRefused = "";
  try { await db.update(emailSuppressions).set({ reason: "manual" }).where(and(eq(emailSuppressions.organizationId, org.id), eq(emailSuppressions.email, queued[0].toEmail))); } catch (e) { updateRefused = String((e as { cause?: { message?: string } }).cause?.message ?? e); }
  check("base : UPDATE d'une désinscription REFUSÉ par le déclencheur", updateRefused.includes("ne se retire ni ne se modifie"));
  check("désinscription : un second ajout ne change rien", (await addSuppression({ organizationId: org.id, email: queued[0].toEmail, reason: "manual", source: "manual" })) === false && (await getSuppression(org.id, queued[0].toEmail))?.reason === "unsubscribed");
  const ignored = await handleResendEvent({ type: "email.opened", created_at: new Date().toISOString(), data: { email_id: `proof-${started.sendId}-0` } }, "evt-open-2");
  check("un désinscrit n'est plus jamais suivi : ouverture ignorée", ignored === "ignored");
  check("audience réelle après désinscription et rejet : 0", (await countSendableMembers(target)) === 0);
  const testMsg = await db.insert(emailMessages).values({ organizationId: org.id, kind: "test", newsletterId: nl.id, toEmail: admin.email, fromEmail: prepared.from, replyTo: prepared.replyTo, subject: "[Test]", status: "sent", sentAt: new Date() }).returning();
  check("un email de test ne désinscrit personne", (await unsubscribeByMessage(testMsg[0].id, "link")).kind === "test");
  check("un id inconnu : réponse neutre", (await resolveUnsubscribe("00000000-0000-4000-8000-000000000000")).kind === "invalid");

  // 6. Indicateurs, journal, agrégats
  const ind = await getContactIndicators(user, queued[0].contactId!);
  check("indicateurs : dernier ouvert, dernier clic, dernière interaction = le clic", Boolean(ind.lastOpenedAt) && Boolean(ind.lastClickedAt) && ind.lastInteractionAt?.getTime() === ind.lastClickedAt?.getTime() && ind.lastAppointmentAt === null);
  const entries = await listContactEmailEntries(org.id, queued[0].contactId!);
  check("journal : l'email avec son clic (lien) et sa désinscription", entries.length === 1 && entries[0].events.some((e) => e.type === "clicked" && e.url === "https://example.com/rendez-vous") && entries[0].events.some((e) => e.type === "unsubscribed"));
  const ta = await translatorFor("fr", "activities.queries");
  const journal = await listContactJournal(user, queued[0].contactId!, ta);
  const kinds = journal.entries.map((e) => e.kind);
  check("journal unifié : envoyé, ouvert, cliqué, désinscription fusionnés", ["email_sent", "email_opened", "email_clicked", "email_unsubscribed"].every((k) => kinds.includes(k as never)), kinds.join(","));
  await refreshSendCounters(started.sendId); await finishSend(started.sendId);
  const stats = await getCampaignStats(nl.id, org.id);
  check("agrégats : 2 envoyés, 1 remis, 1 ouvert, 1 cliqué, 1 rejeté, 1 désinscrit, 1 sans adresse, lien cliqué", stats.sent === 2 && stats.delivered === 1 && stats.opened === 1 && stats.clicked === 1 && stats.bounced === 1 && stats.unsubscribed === 1 && stats.withoutEmail === 1 && stats.links[0]?.url === "https://example.com/rendez-vous", JSON.stringify(stats));
  check("envoi : terminé, compteurs recomptés", (await getLatestSend(nl.id))?.finishedAt !== null && (await getLatestSend(nl.id))?.sent === 2);
  void getRenderContext; void sql; void contacts;

  // 7. Le domaine — adoption de mail.clozado.fr (déjà déclaré chez Resend), enregistrements manquants dits précisément
  const state = await declareEmailDomain(user, "mail.clozado.fr");
  const records = parseDomainRecords(state.emailDomainRecords);
  check("domaine : adopté chez le fournisseur (pas de doublon), 5 enregistrements (4 du fournisseur + DMARC)", Boolean(state.emailDomainProviderId) && records.length === 5, records.map((r) => `${r.type} ${r.fullName} [${r.status}]`).join(" | "));
  // Le statut global vaut « not_started » avant toute vérification, « failed » après une vérification expirée : dans les deux cas, non vérifié et tout manque.
  check("domaine : tout manque, dit ligne par ligne, non vérifié", missingRecords(records).length === 5 && state.emailDomainVerifiedAt === null && state.emailDomainStatus !== "verified");
  check("domaine : DMARC lu par nous (absent aujourd'hui)", (await lookupDmarc("mail.clozado.fr")).status === "not_started");
  const rechecked = await checkEmailDomain(user);
  check("domaine : « vérifier maintenant » relit sans erreur muette", rechecked.emailDomainCheckedAt !== null && rechecked.emailDomainVerifiedAt === null, rechecked.emailDomainCheckError ?? "aucune erreur");
  let bad = "";
  try { await declareEmailDomain(user, "pas un domaine"); } catch (e) { bad = String((e as { key?: string }).key ?? e); }
  check("domaine : un domaine déjà déclaré / invalide est refusé avec une clé", bad.length > 0, bad);
  await forgetEmailDomain(user);
  check("domaine : retiré des réglages, le repli reprend", (await getOwnOrganization(user))?.emailDomainProviderId === null);

  console.log(failures === 0 ? "\nTOUT EST OK" : `\n${failures} KO`);
  if (failures > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
