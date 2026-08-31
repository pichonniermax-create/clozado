import { promises as dns } from "node:dns";

/**
 * LE RÉSOLVEUR DNS de l'authentification d'expéditeur (docs/module-engagement.md
 * §4.2) — une interface minuscule, pour que les preuves à blanc injectent des
 * réponses connues et que la production interroge le vrai DNS. Chaque
 * fonction distingue « pas d'enregistrement » (tableau vide) d'« erreur
 * temporaire » (exception `DnsTemporaryError`) : SPF en a besoin (`none`
 * contre `temperror`).
 */

export interface DnsResolver {
  txt(name: string): Promise<string[]>;
  a(name: string): Promise<string[]>;
  aaaa(name: string): Promise<string[]>;
  mx(name: string): Promise<string[]>;
}

export class DnsTemporaryError extends Error {
  constructor(name: string, code: string) {
    super(`DNS ${code} pour ${name}`);
    this.name = "DnsTemporaryError";
  }
}

/**
 * Les codes qui signifient « ça n'existe pas » (réponse définitive) plutôt
 * qu'« on ne sait pas ». `EBADNAME` en fait partie : un nom malformé ne
 * deviendra jamais valide, le prendre pour une panne temporaire faisait
 * répondre `temperror` là où le protocole veut une réponse définitive.
 */
const NOT_FOUND_CODES = new Set(["ENOTFOUND", "ENODATA", "EBADNAME"]);

async function query<T>(name: string, run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch (error) {
    const code = (error as { code?: string }).code ?? "EUNKNOWN";
    if (NOT_FOUND_CODES.has(code)) return [];
    throw new DnsTemporaryError(name, code);
  }
}

/** Le résolveur de production : `node:dns`, sans dépendance. */
export const systemResolver: DnsResolver = {
  // Un TXT est rendu en morceaux (limite de 255 octets par chaîne) : on les recolle, c'est la règle du protocole.
  txt: (name) => query(name, async () => (await dns.resolveTxt(name)).map((chunks) => chunks.join(""))),
  a: (name) => query(name, () => dns.resolve4(name)),
  aaaa: (name) => query(name, () => dns.resolve6(name)),
  mx: (name) => query(name, async () => (await dns.resolveMx(name)).sort((x, y) => x.priority - y.priority).map((m) => m.exchange)),
};
