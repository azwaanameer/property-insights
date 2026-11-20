import { describe, expect, it } from "vitest";
import { normName as loaderNorm } from "../../../pipeline/lib/normalise.mjs";
import { normName as appNorm } from "./parse-query";

// The build plane and serve plane normalise separately; they must agree or exact lookups silently miss.
describe("normName parity between pipeline and app", () => {
  const samples = ["St Kilda", "O'Connor", "FLINDERS", "Mount  Alexander", "Smith-Jones Rd.", "d’Arcy", "  x  ", "4th Ave", ""];
  it.each(samples)("agrees on %j", (s) => {
    expect(appNorm(s)).toBe(loaderNorm(s));
  });
});
