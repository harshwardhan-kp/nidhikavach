import { describe, expect, it } from "vitest";
import { can, distinctActor, permissionsOf, primaryRole, ROLES } from "./roles";

describe("permission matrix", () => {
  it("lets only the institution submit instruments", () => {
    for (const r of ROLES) expect(can([r], "instrument.submit")).toBe(r === "institution");
  });

  it("splits the three release steps across three roles", () => {
    expect(can(["maker"], "release.recommend")).toBe(true);
    expect(can(["maker"], "release.check")).toBe(false);
    expect(can(["checker"], "release.check")).toBe(true);
    expect(can(["checker"], "release.approve")).toBe(false);
    expect(can(["authority"], "release.approve")).toBe(true);
    expect(can(["authority"], "release.recommend")).toBe(false);
  });

  it("keeps the auditor read-only", () => {
    const writes = permissionsOf(["auditor"]).filter((p) => !/view|verify/.test(p));
    expect(writes).toEqual([]);
  });

  it("never gives admin a release decision", () => {
    expect(can(["admin"], "release.approve")).toBe(false);
    expect(can(["admin"], "release.check")).toBe(false);
  });

  it("picks the senior role as the workspace", () => {
    expect(primaryRole(["maker", "checker"])).toBe("checker");
    expect(primaryRole(["institution"])).toBe("institution");
  });
});

describe("maker != checker, by identity", () => {
  it("blocks a person from approving a step they already took", () => {
    expect(distinctActor("u1", ["u1"])).toBe(false);
    expect(distinctActor("u1", ["u2", "u1"])).toBe(false);
  });

  it("allows a different person", () => {
    expect(distinctActor("u3", ["u1", "u2"])).toBe(true);
    expect(distinctActor("u3", [null, undefined])).toBe(true);
  });
});
