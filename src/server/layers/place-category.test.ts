// The category rule exists twice: categoryOf here (the layer's) and category_of in pipeline/ingest/osm-places-extract.py (the data build's).
// This test runs both over the same tag sets, so a place is loaded under the category the layer expects. Same idea as normalise-parity.test.ts.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { categoryOf } from "./shared/place-category";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../pipeline/ingest/osm-places-extract.py");

const SAMPLES: Record<string, string>[] = [
  { shop: "supermarket" },
  { shop: "convenience" },
  { shop: "greengrocer" },
  { shop: "bakery" },
  { shop: "jewellery" },
  { shop: "clothes", amenity: "cafe" },
  { amenity: "cafe" },
  { amenity: "restaurant" },
  { amenity: "pharmacy" },
  { amenity: "doctors" },
  { amenity: "clinic" },
  { amenity: "hospital" },
  { amenity: "library" },
  { amenity: "gym" },
  { amenity: "bar" },
  { leisure: "park" },
  { leisure: "playground" },
  { leisure: "fitness_centre" },
  { leisure: "pitch" },
  // more than one tag: the first matching rule wins, in the same order on both sides
  { amenity: "cafe", shop: "bakery" },
  { amenity: "cafe", leisure: "park" },
  { amenity: "gym", leisure: "park" },
  { amenity: "library", leisure: "fitness_centre" },
  { amenity: "hospital", leisure: "fitness_centre" },
  { amenity: "restaurant", name: "Named" },
  { name: "No kind at all" },
  {},
];

function pythonCategories(samples: Record<string, string>[]): (string | null)[] {
  // `--categories` needs no osmium and no file, so plain `python -I` runs it (uv is not needed here).
  for (const exe of process.platform === "win32" ? ["python", "py"] : ["python3", "python"]) {
    const r = spawnSync(exe, ["-I", script, "--categories"], { input: JSON.stringify(samples), encoding: "utf8" });
    if (!r.error && r.status === 0) return JSON.parse(r.stdout);
  }
  throw new Error("no python found to run osm-places-extract.py --categories");
}

describe("place category parity between the data build (python) and the layer (TypeScript)", () => {
  const python = pythonCategories(SAMPLES);
  it.each(SAMPLES.map((s, i) => [JSON.stringify(s), i] as const))("agrees on %s", (_label, i) => {
    expect(python[i]).toBe(categoryOf(SAMPLES[i]));
  });

  it("covers every category the table allows", () => {
    expect(new Set(python.filter(Boolean))).toEqual(new Set(["groceries", "food", "parks", "medical", "fitness", "library"]));
  });
});
