import { describe, expect, it } from "vitest";
import { signSvix, verifySvixSignature, verifySvixSignatureWithAny } from "./svix";

const A = "whsec_" + Buffer.from("secret-transactionnel").toString("base64");
const B = "whsec_" + Buffer.from("secret-marketing").toString("base64");
const body = JSON.stringify({ type: "email.delivered", data: { email_id: "x" } });
const now = () => String(Math.floor(Date.now() / 1000));

describe("verifySvixSignatureWithAny", () => {
  it("accepte un webhook signé par l'un ou l'autre des comptes", () => {
    const ts = now();
    const fromA = { id: "msg_1", timestamp: ts, signature: signSvix("msg_1", ts, body, A) };
    const fromB = { id: "msg_2", timestamp: ts, signature: signSvix("msg_2", ts, body, B) };
    expect(verifySvixSignatureWithAny(fromA, body, [A, B])).toBe(true);
    expect(verifySvixSignatureWithAny(fromB, body, [A, B])).toBe(true);
    expect(verifySvixSignature(fromB, body, A)).toBe(false);
  });
  it("refuse un secret inconnu, un corps modifié, aucun secret, un horodatage périmé", () => {
    const ts = now();
    const fromB = { id: "msg_3", timestamp: ts, signature: signSvix("msg_3", ts, body, B) };
    expect(verifySvixSignatureWithAny(fromB, body, [A])).toBe(false);
    expect(verifySvixSignatureWithAny(fromB, body + " ", [A, B])).toBe(false);
    expect(verifySvixSignatureWithAny(fromB, body, [])).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect(verifySvixSignatureWithAny({ id: "msg_4", timestamp: old, signature: signSvix("msg_4", old, body, B) }, body, [B])).toBe(false);
  });
});
