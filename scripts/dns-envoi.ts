/**
 * L'ÉTAT DNS DE NOS DOMAINES D'ENVOI, lu depuis le vrai DNS.
 *
 *     npx tsx scripts/dns-envoi.ts [domaine…]
 *
 * Sans argument : les domaines de la plateforme (envoi du produit, envoi
 * marketing, réception) et le domaine racine. Le script ne modifie rien —
 * il LIT, et il dit ce qui manque, dans l'ordre où une messagerie regarde :
 * SPF (le serveur a-t-il le droit d'envoyer), DKIM (la signature),
 * DMARC (que faire si l'un des deux échoue) et l'ALIGNEMENT.
 *
 * Il sert deux fois : avant de poser les enregistrements chez l'hébergeur,
 * pour savoir ce qui manque ; après, pour prouver que c'est en place —
 * la propagation prend de quelques minutes à quelques heures.
 *
 * Les organisations clientes, elles, ont leur propre écran (Réglages →
 * domaine d'envoi) : ce script ne regarde QUE nos domaines à nous.
 */
import dns from "node:dns/promises";

/** Les sous-domaines que Resend fait créer : la signature, et le chemin de retour (SPF + rebonds). */
const DKIM_SELECTOR = "resend._domainkey";
const RETURN_PATH = "send";

type Etat = { libelle: string; valeur: string | null; verdict: "ok" | "manque" | "à revoir" | "sans objet"; note?: string };
/** Un domaine d'ENVOI se signe et se déclare ; un domaine de RÉCEPTION n'a besoin que de son MX ; une VITRINE n'envoie rien. */
type Role = "envoi" | "reception" | "vitrine";

async function txt(nom: string): Promise<string | null> {
  try {
    const records = await dns.resolveTxt(nom);
    const valeurs = records.map((parts) => parts.join(""));
    return valeurs.length > 0 ? valeurs.join(" ⏎ ") : null;
  } catch {
    return null;
  }
}

async function mx(nom: string): Promise<string | null> {
  try {
    const records = await dns.resolveMx(nom);
    return records.length > 0 ? records.map((r) => `${r.priority} ${r.exchange}`).join(" ⏎ ") : null;
  } catch {
    return null;
  }
}

async function etatDuDomaine(domaine: string, role: Role): Promise<Etat[]> {
  const [spf, spfRetour, dkim, dmarc, rebonds, entrant] = await Promise.all([
    txt(domaine),
    txt(`${RETURN_PATH}.${domaine}`),
    txt(`${DKIM_SELECTOR}.${domaine}`),
    txt(`_dmarc.${domaine}`),
    mx(`${RETURN_PATH}.${domaine}`),
    mx(domaine),
  ]);

  const spfDomaine = spf?.split(" ⏎ ").find((v) => v.startsWith("v=spf1")) ?? null;
  const spfChemin = spfRetour?.split(" ⏎ ").find((v) => v.startsWith("v=spf1")) ?? null;
  const politique = dmarc?.match(/p=([a-z]+)/)?.[1] ?? null;
  const rapports = dmarc?.includes("rua=") ?? false;
  const bits = dkim?.match(/p=([A-Za-z0-9+/=]+)/)?.[1];
  const longueur = bits ? Math.round((bits.length * 3) / 4) * 8 - 256 : 0; // approximation : l'en-tête ASN.1 pèse ~32 octets

  const envoie = role === "envoi";
  const attendu = (present: boolean): Etat["verdict"] => (present ? "ok" : envoie ? "manque" : "sans objet");
  return [
    // Une vitrine qui n'envoie rien se protège par un SPF vide (`v=spf1 -all`) : c'est le seul cas où « manque » vaut pour elle aussi.
    { libelle: "SPF du domaine", valeur: spfDomaine, verdict: spfDomaine ? "ok" : role === "reception" ? "sans objet" : "manque", note: spfDomaine ? undefined : "sans SPF, le domaine se laisse usurper" },
    { libelle: "SPF du chemin de retour", valeur: spfChemin, verdict: attendu(Boolean(spfChemin)) },
    { libelle: "MX des rebonds", valeur: rebonds, verdict: attendu(Boolean(rebonds)) },
    { libelle: "MX du domaine", valeur: entrant, verdict: entrant ? "ok" : role === "reception" ? "manque" : "sans objet" },
    { libelle: "DKIM", valeur: dkim ? `${dkim.slice(0, 48)}… (~${longueur} bits)` : null, verdict: dkim ? (longueur >= 2048 ? "ok" : "à revoir") : envoie ? "manque" : "sans objet", note: dkim && longueur < 2048 ? "Google recommande 2048 bits" : undefined },
    { libelle: "DMARC", valeur: dmarc, verdict: dmarc ? (politique === "none" || !rapports ? "à revoir" : "ok") : role === "reception" ? "sans objet" : "manque", note: dmarc && !rapports ? "sans rua=, personne ne lit les rapports" : undefined },
  ];
}

const SIGNES = { ok: "✓", "à revoir": "~", manque: "✗", "sans objet": "·" } as const;

/** Nos domaines et leur rôle. Un argument `domaine:role` remplace la liste. */
const PLATEFORME: [string, Role][] = [
  ["clozado.fr", "vitrine"],
  ["mail.clozado.fr", "envoi"],
  ["news.clozado.fr", "envoi"],
  ["in.clozado.fr", "reception"],
];

async function main() {
  const args = process.argv.slice(2);
  const cibles: [string, Role][] = args.length > 0 ? args.map((a) => {
    const [domaine, role] = a.split(":");
    return [domaine, (role as Role) ?? "envoi"];
  }) : PLATEFORME;
  let manques = 0;
  for (const [domaine, role] of cibles) {
    console.log(`\n=== ${domaine} (${role})`);
    for (const e of await etatDuDomaine(domaine, role)) {
      if (e.verdict === "manque") manques += 1;
      console.log(`${SIGNES[e.verdict]} ${e.libelle.padEnd(24)} ${e.valeur ?? "—"}${e.note ? `  (${e.note})` : ""}`);
    }
  }
  console.log(manques === 0 ? "\nRien ne manque." : `\n${manques} enregistrement(s) manquant(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
