import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "../contracts/errors";
import { createLoadedTestDb, type TestDb } from "../testing/db";
import { resolveByPid, resolveQuery, suggest } from "./resolve-address";

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createLoadedTestDb());
});
afterAll(() => close());

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error("expected ApiError");
}

describe("resolveQuery (I/O matrix)", () => {
  it("unit found: 310/628 Flinders St Docklands", async () => {
    const a = await resolveQuery(db, "310/628 Flinders St Docklands");
    expect(a).toMatchObject({
      match: "unit",
      gnaf_pid: "GAVIC100000002",
      building_id: "GAVIC100000001",
      sal_code: "20766",
      sal_name: "Docklands",
      tier: "A",
      unit_number: "310",
      unit_requested: null,
    });
  });

  it("building only: unit absent from G-NAF", async () => {
    const a = await resolveQuery(db, "999/628 Flinders St Docklands");
    expect(a).toMatchObject({ match: "building", gnaf_pid: "GAVIC100000001", unit_requested: "999", unit_number: null });
  });

  it("a level is not a unit: Level 3, 1 X St is matched to the building", async () => {
    const a = await resolveQuery(db, "Level 3, 1 X St");
    expect(a).toMatchObject({ match: "building", gnaf_pid: "GAVIC100000020" });
  });

  it("Unit 5, 12 Smith Rd resolves the unit", async () => {
    expect(await resolveQuery(db, "Unit 5, 12 Smith Rd")).toMatchObject({ match: "unit", gnaf_pid: "GAVIC100000011" });
  });

  it("multi-word street: 100 St Kilda Rd", async () => {
    expect(await resolveQuery(db, "100 St Kilda Rd")).toMatchObject({ match: "building", gnaf_pid: "GAVIC100000050" });
  });

  it("street only: no report, address_not_found with candidates", async () => {
    const e = await failure(resolveQuery(db, "Flinders St"));
    expect(e).toMatchObject({ status: 404, code: "address_not_found", match: "street" });
    expect(e.candidates?.length).toBeGreaterThan(0);
  });

  it("number and street shared by two suburbs is ambiguous and returns both as candidates", async () => {
    const e = await failure(resolveQuery(db, "628 Flinders St"));
    expect(e).toMatchObject({ status: 404, code: "address_not_found" });
    expect(e.candidates?.map((c) => c.gnaf_pid).sort()).toEqual(["GAVIC100000001", "GAVIC100000040"]);
  });

  it("unknown address returns address_not_found", async () => {
    expect(await failure(resolveQuery(db, "55 Nonexistent Ave"))).toMatchObject({ status: 404, code: "address_not_found" });
  });

  it("empty text is a bad request", async () => {
    expect(await failure(resolveQuery(db, "   "))).toMatchObject({ status: 400, code: "bad_request" });
  });

  it("a locality with no single SAL match still resolves, with sal_code null", async () => {
    const a = await resolveQuery(db, "5 Odd Court Fakeville");
    expect(a).toMatchObject({ gnaf_pid: "GAVIC100000060", sal_code: null, sal_match_type: "ambiguous" });
  });
});

describe("resolveByPid", () => {
  it("a unit pid is a unit match; a property pid is a building match", async () => {
    expect(await resolveByPid(db, "GAVIC100000003")).toMatchObject({ match: "unit", building_id: "GAVIC100000001" });
    expect(await resolveByPid(db, "GAVIC100000001")).toMatchObject({ match: "building" });
  });

  it("a building pid with ?unit= finds an existing unit and returns match unit", async () => {
    expect(await resolveByPid(db, "GAVIC100000001", "310")).toMatchObject({ match: "unit", gnaf_pid: "GAVIC100000002", unit_requested: null });
  });

  it("a building pid with a missing ?unit= stays building-only and records the unit asked for", async () => {
    expect(await resolveByPid(db, "GAVIC100000001", "999")).toMatchObject({ match: "building", unit_requested: "999" });
  });

  it("two rows share flat number 5 in one building: the unit-type row wins over the car space", async () => {
    const a = await resolveQuery(db, "5/12 Smith Rd");
    expect(a).toMatchObject({ match: "unit", gnaf_pid: "GAVIC100000011", flat_type: "UNIT" });
    // the car space has the lower pid, so only the flat-type preference makes UNIT win
    expect("GAVIC100000009" < "GAVIC100000011").toBe(true);
  });

  it("non-VIC pids with an underscore (GASA_, GAWA_, GANT_) are 404 not_covered, not 400", async () => {
    for (const pid of ["GASA_414000001", "GAWA_141000001", "GANT_704000001", "GANSW718000001"]) {
      expect(await failure(resolveByPid(db, pid))).toMatchObject({ status: 404, code: "not_covered" });
    }
  });

  it("non-VIC pid: 404 not_covered", async () => {
    expect(await failure(resolveByPid(db, "GANSW718000001"))).toMatchObject({ status: 404, code: "not_covered" });
  });

  it("unknown VIC pid: 404 address_not_found", async () => {
    expect(await failure(resolveByPid(db, "GAVIC999999999"))).toMatchObject({ status: 404, code: "address_not_found" });
  });
});

describe("suggest", () => {
  it("628 flinders returns candidates with gnaf_pid, ordered by similarity, at most 10", async () => {
    const c = await suggest(db, "628 flinders");
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c.length).toBeLessThanOrEqual(10);
    expect(c.map((x) => x.gnaf_pid)).toEqual(expect.arrayContaining(["GAVIC100000001", "GAVIC100000040"]));
    for (let i = 1; i < c.length; i++) expect(c[i - 1].similarity).toBeGreaterThanOrEqual(c[i].similarity);
    // units are not suggested (property-level rows only)
    expect(c.map((x) => x.gnaf_pid)).not.toContain("GAVIC100000002");
  });

  it("limits to 10", async () => {
    expect((await suggest(db, "smith", 50)).length).toBeLessThanOrEqual(10);
  });
});
