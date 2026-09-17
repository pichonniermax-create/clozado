/**
 * Reprise des compteurs d'envoi de l'espace de DÉMO (audit newsletter du
 * 2026-09-17, §A.3) : la graine posait `queued = sent` sur
 * `newsletter_sends`, d'où « 26 envoyés · 26 en attente » sur chaque
 * newsletter envoyée de la démo. La reprise recompte chaque envoi de la
 * seule organisation de démo depuis ses messages, par la fonction même que
 * l'envoi réel utilise (`refreshSendCounters`). Rien d'autre n'est touché.
 *
 *   npx tsx --env-file=.env.local scripts/repair-demo-send-counters.ts            (compte, n'écrit rien)
 *   npx tsx --env-file=.env.local scripts/repair-demo-send-counters.ts --apply    (recompte, journal avant/après)
 */
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { refreshSendCounters } from "@/db/queries/email-sends";

async function main() {
  const apply = process.argv.includes("--apply");
  const demos = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.isDemo, true));
  if (demos.length !== 1) throw new Error(`une seule organisation de démo attendue, ${demos.length} trouvée(s)`);
  const org = demos[0];
  console.log(`organisation : ${org.name} (${org.id}) · mode : ${apply ? "APPLY" : "compte seulement"}`);
  const rows = await db.execute(sql`
    select s.id, n.title, s.queued, s.sent, s.failed,
      (select count(*)::int from email_messages m where m.send_id = s.id and m.status = 'queued') as queued_reel,
      (select count(*)::int from email_messages m where m.send_id = s.id and m.status not in ('queued', 'failed', 'draft', 'canceled')) as sent_reel,
      (select count(*)::int from email_messages m where m.send_id = s.id and m.status = 'failed') as failed_reel
    from newsletter_sends s join newsletters n on n.id = s.newsletter_id
    where s.organization_id = ${org.id} order by s.started_at`);
  let wrong = 0;
  for (const r of rows.rows as { id: string; title: string; queued: number; sent: number; failed: number; queued_reel: number; sent_reel: number; failed_reel: number }[]) {
    const bad = r.queued !== r.queued_reel || r.sent !== r.sent_reel || r.failed !== r.failed_reel;
    if (bad) wrong += 1;
    console.log(`${bad ? "À REPRENDRE" : "cohérent   "} « ${r.title} » : stocké ${r.sent} envoyés · ${r.queued} en attente · ${r.failed} en échec — réel ${r.sent_reel} · ${r.queued_reel} · ${r.failed_reel}`);
    if (apply && bad) {
      const after = await refreshSendCounters(r.id);
      console.log(`  → recompté : ${after.sent} envoyés · ${after.queued} en attente · ${after.failed} en échec`);
    }
  }
  console.log(`${rows.rows.length} envoi(s) de la démo, ${wrong} à reprendre`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
