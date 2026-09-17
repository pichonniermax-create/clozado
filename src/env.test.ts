import { describe, expect, it } from "vitest";
import { EnvError, readEnv } from "./env";

const complete = {
  DATABASE_URL: "postgres://user:pass@host/db",
  AUTH_SECRET: "s".repeat(32),
  EMAIL_FROM: "Clozado <connexion@mail.example.test>",
  RESEND_API_KEY: "re_x",
  EMAIL_SHARED_DOMAIN: "mail.example.test",
  EMAIL_INBOUND_DOMAIN: "in.example.test",
  APP_URL: "https://app.example.test",
  RESEND_WEBHOOK_SECRET: "whsec",
  RESEND_MARKETING_API_KEY: "re_m",
  EMAIL_MARKETING_DOMAIN: "news.example.test",
  RESEND_MARKETING_WEBHOOK_SECRET: "whsec_m",
  CRON_SECRET: "cron",
  ANTHROPIC_API_KEY: "sk-ant",
  ANTHROPIC_MODEL: "claude-sonnet-5",
  ANTHROPIC_WATCH_MODEL: "claude-sonnet-5",
  AUTH_TRUST_HOST: "true",
  DATABASE_HTTP_ENDPOINT: "http://localhost:4444/sql",
};

describe("readEnv", () => {
  it("ne se plaint de rien quand tout est là", () => {
    expect(readEnv(complete).warnings).toEqual([]);
  });
  it("lève une EnvError qui NOMME les indispensables absentes", () => {
    let caught: unknown;
    try {
      readEnv({ ...complete, DATABASE_URL: "", AUTH_SECRET: undefined });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvError);
    expect((caught as EnvError).missing).toEqual(["DATABASE_URL", "AUTH_SECRET"]);
    expect((caught as EnvError).message).toContain("DATABASE_URL, AUTH_SECRET");
  });
  it("une facultative absente ne bloque pas : un avertissement qui dit ce qui est désactivé", () => {
    const { warnings } = readEnv({ ...complete, ANTHROPIC_API_KEY: undefined, CRON_SECRET: "  " });
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.startsWith("CRON_SECRET absente"))).toBe(true);
    expect(warnings.some((w) => w.startsWith("ANTHROPIC_API_KEY absente") && w.includes("IA"))).toBe(true);
  });
  it("ignore les variables qui ne la regardent pas", () => {
    expect(() => readEnv({ ...complete, NODE_ENV: "production", PATH: "/usr/bin" })).not.toThrow();
  });
});
