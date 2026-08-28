import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { db } = await import("@/db");
  const { organizations, users, newsletters, emailMessages, contacts } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const org = await db.query.organizations.findFirst({ where: eq(organizations.slug, "_engage-test") });
  console.log("org:", org ? { id: org.id, senderEmail: org.senderEmail, emailDomain: org.emailDomain, status: org.emailDomainStatus, providerId: org.emailDomainProviderId, verifiedAt: org.emailDomainVerifiedAt } : null);
  const admin = await db.query.users.findFirst({ where: eq(users.role, "super_admin") });
  console.log("admin:", admin ? { id: admin.id, email: admin.email, replyToEmail: admin.replyToEmail, locale: admin.locale } : null);
  if (org) {
    const nls = await db.query.newsletters.findMany({ where: eq(newsletters.organizationId, org.id) });
    console.log("newsletters:", nls.map((n) => ({ id: n.id, title: n.title, sentAt: n.sentAt, sendMode: n.sendMode })));
    const msgs = await db.query.emailMessages.findMany({ where: eq(emailMessages.organizationId, org.id) });
    console.log("messages:", msgs.length);
    const cs = await db.query.contacts.findMany({ where: eq(contacts.organizationId, org.id) });
    console.log("contacts:", cs.map((c) => `${c.name} <${c.email}> ${c.id}`));
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
