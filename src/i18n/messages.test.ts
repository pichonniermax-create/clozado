import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

/**
 * LE CONTRÔLE DES LANGUES (chantier C, partie 1) : chaque clé de messages
 * existe dans CHAQUE langue, avec les MÊMES arguments ICU (variables,
 * pluriels, balises) — une clé absente casse l'écran en MISSING_MESSAGE
 * dans le navigateur, un argument renommé rend « {n} » tel quel. Ce test
 * échoue avant que ça n'arrive.
 */
const ROOT = join(__dirname, "..", "messages");
const LOCALES = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const REFERENCE = "fr";

type Flat = Record<string, string>;

function flatten(value: unknown, prefix: string, out: Flat): Flat {
  if (typeof value === "string") {
    out[prefix] = value;
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function load(locale: string, file: string): Flat {
  return flatten(JSON.parse(readFileSync(join(ROOT, locale, file), "utf8")), "", {});
}

/** Les arguments d'un message ICU : « nom:type » pour les variables, pluriels, sélections et balises, sans l'ordre. */
function icuArguments(message: string): string[] {
  const names = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const element of elements) {
      if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
      if (element.type === TYPE.plural || element.type === TYPE.select) {
        names.add(`${element.value}:${element.type === TYPE.plural ? "plural" : "select"}`);
        for (const option of Object.values(element.options)) walk(option.value);
        continue;
      }
      if (element.type === TYPE.tag) {
        names.add(`${element.value}:tag`);
        walk(element.children);
        continue;
      }
      names.add(`${element.value}:arg`);
    }
  };
  walk(parse(message, { ignoreTag: false }));
  return [...names].sort();
}

describe("les messages parlent toutes les langues", () => {
  it("connaît au moins le français et l'anglais", () => {
    expect(LOCALES).toContain("fr");
    expect(LOCALES).toContain("en");
  });

  const files = readdirSync(join(ROOT, REFERENCE)).filter((file) => file.endsWith(".json")).sort();

  for (const locale of LOCALES.filter((l) => l !== REFERENCE)) {
    it(`${locale} : les mêmes fichiers que ${REFERENCE}`, () => {
      const own = readdirSync(join(ROOT, locale)).filter((file) => file.endsWith(".json")).sort();
      expect(own).toEqual(files);
    });

    for (const file of files) {
      it(`${locale}/${file} : chaque clé de ${REFERENCE} existe, aucune en trop, et chaque message se lit en ICU`, () => {
        const reference = load(REFERENCE, file);
        const own = load(locale, file);
        const missing = Object.keys(reference).filter((key) => !(key in own));
        const extra = Object.keys(own).filter((key) => !(key in reference));
        expect(missing, `clés absentes en ${locale}`).toEqual([]);
        expect(extra, `clés en trop en ${locale}`).toEqual([]);
        const unreadable = Object.entries(own).flatMap(([key, message]) => {
          try {
            parse(message, { ignoreTag: false });
            return [];
          } catch (error) {
            return [`${key}: ${String(error)}`];
          }
        });
        expect(unreadable, `messages ICU illisibles en ${locale}`).toEqual([]);
      });

      it(`${locale}/${file} : les mêmes arguments ICU que ${REFERENCE} (variables, pluriels, balises)`, () => {
        const reference = load(REFERENCE, file);
        const own = load(locale, file);
        const drift = Object.keys(reference)
          .filter((key) => key in own)
          .flatMap((key) => {
            const a = icuArguments(reference[key]);
            const b = icuArguments(own[key]);
            return a.join(",") === b.join(",") ? [] : [`${key}: ${REFERENCE}=[${a.join(" ")}] ${locale}=[${b.join(" ")}]`];
          });
        expect(drift).toEqual([]);
      });
    }
  }
});
