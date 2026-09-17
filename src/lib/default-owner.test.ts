import { describe, expect, it } from "vitest";
import { defaultOwnerId } from "./default-owner";

const claire = { id: "claire", role: "admin" as const, createdAt: new Date("2026-01-01") };
const paul = { id: "paul", role: "admin" as const, createdAt: new Date("2026-03-01") };
const thomas = { id: "thomas", role: "member" as const, createdAt: new Date("2026-02-01") };

describe("defaultOwnerId", () => {
  it("garde la personne connectée quand elle est de l'organisation (membre ou admin)", () => {
    expect(defaultOwnerId({ id: "thomas" }, [claire, thomas, paul])).toBe("thomas");
    expect(defaultOwnerId({ id: "paul" }, [claire, thomas, paul])).toBe("paul");
  });
  it("retombe sur l'admin le plus ancien pour un super admin en substitution", () => {
    expect(defaultOwnerId({ id: "super" }, [paul, thomas, claire])).toBe("claire");
  });
  it("ne propose jamais un membre à la place d'un admin absent, et personne sans admin", () => {
    expect(defaultOwnerId({ id: "super" }, [thomas])).toBeNull();
    expect(defaultOwnerId({ id: "super" }, [])).toBeNull();
  });
});
