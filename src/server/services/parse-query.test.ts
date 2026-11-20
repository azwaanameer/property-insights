import { describe, expect, it } from "vitest";
import { normName, parseQuery, suggestText } from "./parse-query";

describe("parseQuery fixtures", () => {
  it("310/628 Flinders St", () => {
    const p = parseQuery("310/628 Flinders St");
    expect(p).toMatchObject({ unit: "310", level: null, number: "628", number_last: null });
    expect(p.streets[0]).toEqual({ name: "FLINDERS", type: "STREET", locality: null });
  });

  it("310/628 Flinders St Docklands (locality, state and postcode)", () => {
    const p = parseQuery("310/628 Flinders St, Docklands VIC 3008");
    expect(p.unit).toBe("310");
    expect(p.postcode).toBe("3008");
    expect(p.streets[0]).toEqual({ name: "FLINDERS", type: "STREET", locality: "DOCKLANDS" });
  });

  it("Unit 5, 12 Smith Rd", () => {
    const p = parseQuery("Unit 5, 12 Smith Rd");
    expect(p).toMatchObject({ unit: "5", level: null, number: "12" });
    expect(p.streets[0]).toEqual({ name: "SMITH", type: "ROAD", locality: null });
  });

  it("Level 3, 1 X St: a level is not a unit", () => {
    const p = parseQuery("Level 3, 1 X St");
    expect(p).toMatchObject({ unit: null, level: "3", number: "1" });
    expect(p.streets[0]).toEqual({ name: "X", type: "STREET", locality: null });
  });

  it("keeps St Kilda Road intact (St at index 0 is part of the name)", () => {
    const p = parseQuery("100 St Kilda Rd");
    expect(p.streets[0]).toEqual({ name: "ST KILDA", type: "ROAD", locality: null });
  });

  it("letter-prefixed flat numbers in the slash form: G05/12 X St, B5/20 X St", () => {
    expect(parseQuery("G05/12 X St")).toMatchObject({ unit: "G05", number: "12" });
    expect(parseQuery("B5/20 X St")).toMatchObject({ unit: "B5", number: "20" });
    expect(parseQuery("Gd1/7 X St")).toMatchObject({ unit: "GD1", number: "7" });
    expect(parseQuery("310/628 Flinders St").unit).toBe("310");
  });

  it("handles suffixes, ranges and no street number", () => {
    expect(parseQuery("12A Smith Rd").number).toBe("12A");
    expect(parseQuery("12-14 Smith Rd")).toMatchObject({ number: "12", number_last: "14" });
    const street = parseQuery("Smith Rd");
    expect(street.number).toBeNull();
    expect(street.streets[0].name).toBe("SMITH");
  });

  it("suggestText drops unit and expands type abbreviations", () => {
    expect(suggestText(parseQuery("310/628 Flinders St"))).toBe("628 flinders street");
    expect(suggestText(parseQuery("628 flinders"))).toBe("628 flinders");
  });

  it("normName", () => {
    expect(normName("O'Connor St.")).toBe("OCONNOR ST");
    expect(normName("  St  Kilda ")).toBe("ST KILDA");
  });
});
