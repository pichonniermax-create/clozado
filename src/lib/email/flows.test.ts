import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "@/lib/log";
import { apiKeyFor, marketingApiKey, marketingFlowConfigured, marketingSendingDomain, resetFlowWarningsForTests, transactionalApiKey, webhookSecrets } from "./flows";

const KEYS = ["RESEND_API_KEY", "RESEND_MARKETING_API_KEY", "EMAIL_SHARED_DOMAIN", "EMAIL_MARKETING_DOMAIN", "RESEND_WEBHOOK_SECRET", "RESEND_MARKETING_WEBHOOK_SECRET"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.RESEND_API_KEY = "re_transactional";
  process.env.EMAIL_SHARED_DOMAIN = "Mail.Example.Test";
  resetFlowWarningsForTests();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("flux marketing non configuré", () => {
  it("retombe sur le compte transactionnel et le dit UNE fois", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined);
    expect(marketingFlowConfigured()).toBe(false);
    expect(marketingApiKey()).toBe("re_transactional");
    expect(apiKeyFor("marketing")).toBe("re_transactional");
    expect(apiKeyFor("transactional")).toBe("re_transactional");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe("email_marketing_flow_not_isolated");
    expect(marketingSendingDomain()).toBe("mail.example.test");
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it("n'accepte que le secret de webhook transactionnel", () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_a";
    expect(webhookSecrets()).toEqual(["whsec_a"]);
  });
});

describe("flux marketing isolé", () => {
  it("utilise sa clé, son domaine et son secret sans avertissement", () => {
    process.env.RESEND_MARKETING_API_KEY = "re_marketing";
    process.env.EMAIL_MARKETING_DOMAIN = "News.Example.Test";
    process.env.RESEND_WEBHOOK_SECRET = "whsec_a";
    process.env.RESEND_MARKETING_WEBHOOK_SECRET = "whsec_b";
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined);
    expect(marketingFlowConfigured()).toBe(true);
    expect(marketingApiKey()).toBe("re_marketing");
    expect(transactionalApiKey()).toBe("re_transactional");
    expect(marketingSendingDomain()).toBe("news.example.test");
    expect(webhookSecrets()).toEqual(["whsec_a", "whsec_b"]);
    expect(warn).not.toHaveBeenCalled();
  });
  it("signale une clé marketing sans domaine, une fois, et garde le domaine historique", () => {
    process.env.RESEND_MARKETING_API_KEY = "re_marketing";
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined);
    expect(marketingSendingDomain()).toBe("mail.example.test");
    expect(marketingSendingDomain()).toBe("mail.example.test");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe("email_marketing_domain_missing");
  });
});
