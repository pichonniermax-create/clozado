import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { db } = await import("@/db");
  const { organizations, emailMessages } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const org = await db.query.organizations.findFirst({ where: eq(organizations.slug, "_engage-test") });
  const msgs = await db.query.emailMessages.findMany({ where: eq(emailMessages.organizationId, org!.id) });
  for (const m of msgs) console.log(JSON.stringify({ id: m.id, kind: m.kind, to: m.toEmail, from: m.fromEmail, replyTo: m.replyTo, status: m.status, provider: m.providerMessageId, sentAt: m.sentAt, failure: m.failureReason, subject: m.subject }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
