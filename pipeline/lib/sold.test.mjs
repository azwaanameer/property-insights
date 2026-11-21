// The pure parsing of the sold-listings pipeline: price, floor, sale date and address. The price and floor rules are those of
// scripts/23-price-drivers.mjs, so the cases below include the ones that script handled.
import { describe, expect, it } from "vitest";
import { BUILDING_TYPES as SERVE_BUILDING_TYPES, STREET_TYPES as SERVE_STREET_TYPES } from "../../src/server/repos/sale";
import { BUILDING_TYPES, STREET_TYPES, floorOf, median, parsePrice, parseSaleAddress, parseSoldDate, splitStreetNo, streetKeyOf } from "./sold.mjs";

describe("parsePrice", () => {
  it("reads the first number in the text, with commas and a dollar sign", () => {
    expect(parsePrice("$560,000")).toBe(560000);
    expect(parsePrice("$1,200,000")).toBe(1200000);
    expect(parsePrice("  $ 495,888 ")).toBe(495888);
    expect(parsePrice(742000)).toBe(742000);
  });
  it("is null when there is no usable number", () => {
    for (const s of ["", "Contact agent", "Price on application", null, undefined, "$0"]) expect(parsePrice(s), String(s)).toBeNull();
  });
});

describe("floorOf (the script's floor parsing)", () => {
  it("the hundreds of a unit number of three digits or more: 2105 is floor 21", () => {
    expect(floorOf("2105/628 Flinders Street")).toBe(21);
    expect(floorOf("304/610 St Kilda Road")).toBe(3);
    expect(floorOf("303B/399 Bourke Street")).toBe(3);
    expect(floorOf("Level 4, 405/12 Foo Street")).toBe(4);
    expect(floorOf("1/1 Foo Street")).toBeNull();
  });
  it("is null with fewer than three digits, no slash, or a prefix the script did not read", () => {
    for (const a of ["12/30 Foo Street", "14 Elizabeth Court", "G04/74 Queens Road", "Apt 1406/265 Exhibition Street", "27/K11 Raleigh Street", "1 & 2/30 Alexandra Street", ""]) expect(floorOf(a), a).toBeNull();
  });
});

describe("parseSoldDate", () => {
  it("reads '10 Nov 2026' as an ISO date and rejects anything that is not a real day", () => {
    expect(parseSoldDate("10 Nov 2026")).toBe("2026-11-10");
    expect(parseSoldDate("03 Mar 2025")).toBe("2025-03-03");
    expect(parseSoldDate("29 Feb 2024")).toBe("2024-02-29");
    for (const s of ["29 Feb 2025", "31 Apr 2026", "Sold", "", "2026-11-10", "10 Xyz 2026"]) expect(parseSoldDate(s), s).toBeNull();
  });
});

describe("parseSaleAddress", () => {
  it.each([
    ["2105/628 Flinders Street", { unit_no: "2105", street_no: "628", street_key: "FLINDERS STREET" }],
    ["304/610 St Kilda Road", { unit_no: "304", street_no: "610", street_key: "ST KILDA ROAD" }],
    ["403/11-17 Cohen Place", { unit_no: "403", street_no: "11-17", street_key: "COHEN PLACE" }],
    ["G04/74 Queens Road", { unit_no: "G04", street_no: "74", street_key: "QUEENS ROAD" }],
    ["Apt 1406/265 Exhibition St", { unit_no: "1406", street_no: "265", street_key: "EXHIBITION STREET" }],
    ["M-City 102/868 Blackburn Road", { unit_no: "102", street_no: "868", street_key: "BLACKBURN ROAD" }],
    ["713/228 A'Beckett Street", { unit_no: "713", street_no: "228", street_key: "ABECKETT STREET" }],
    ["207/964 Mt Alexander Road", { unit_no: "207", street_no: "964", street_key: "MOUNT ALEXANDER ROAD" }],
    ["226/9  wharf street", { unit_no: "226", street_no: "9", street_key: "WHARF STREET" }],
    ["19A Vale Street", { unit_no: null, street_no: "19A", street_key: "VALE STREET" }],
    ["14 Elizabeth Court", { unit_no: null, street_no: "14", street_key: "ELIZABETH COURT" }],
    ["Penthouse, 101 River Street", { unit_no: null, street_no: "101", street_key: "RIVER STREET" }],
    ["Level 21, 2105/628 Flinders Street", { unit_no: "2105", street_no: "628", street_key: "FLINDERS STREET" }],
    ["Unit 3, 12 Foo Rd", { unit_no: "3", street_no: "12", street_key: "FOO ROAD" }],
    ["1 & 2/30 Alexandra Street", { unit_no: "1 & 2", street_no: "30", street_key: "ALEXANDRA STREET" }],
    ["37 Little Dryburgh Street South", { unit_no: null, street_no: "37", street_key: "LITTLE DRYBURGH STREET SOUTH" }],
  ])("%s", (address, want) => {
    expect(parseSaleAddress(address)).toEqual(want);
  });

  it("is null when no street number is followed by a street", () => {
    for (const a of ["27/K11 Raleigh Street", "Lot Off Footscray Road", "", "Penthouse"]) expect(parseSaleAddress(a), a).toBeNull();
  });

  it("spells out only the last word's abbreviation, so a street name that starts with St stays", () => {
    expect(streetKeyOf("St Kilda Rd")).toBe("ST KILDA ROAD");
    expect(streetKeyOf("St Johns Court")).toBe("ST JOHNS COURT");
    expect(streetKeyOf("Park Ave")).toBe("PARK AVENUE");
  });

  it("splits a range into its first and last number", () => {
    expect(splitStreetNo("11-17")).toEqual({ first: "11", last: "17" });
    expect(splitStreetNo("628")).toEqual({ first: "628", last: null });
    expect(splitStreetNo(null)).toEqual({ first: null, last: null });
  });
});

describe("median", () => {
  it("is the middle value, or the mean of the middle two", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("dwelling types", () => {
  it("the build plane and the serve plane use the same lists (they share no code)", () => {
    expect([...BUILDING_TYPES]).toEqual([...SERVE_BUILDING_TYPES]);
    expect([...STREET_TYPES]).toEqual([...SERVE_STREET_TYPES]);
  });
});
