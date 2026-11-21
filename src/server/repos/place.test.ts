// The places repository: a bounding-box prefilter over the loaded table, read through the current dataset pointer (AD-7).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../testing/db";
import { clearPlaces, osmPlace, setPlaces } from "../testing/places";
import { listPlacesInBox } from "./place";

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const LAT = -37.823;
const LON = 144.949;

describe("listPlacesInBox", () => {
  it("is null when no places dataset is published", async () => {
    expect(await listPlacesInBox(db, LAT, LON, 800)).toBeNull();
  });

  it("returns the places inside the box that holds the circle, with the dataset's as_of, and nothing outside it", async () => {
    await setPlaces(
      db,
      [
        osmPlace({ osm_id: "node/1", category: "food", name: "Near", lat: LAT + 0.002, lon: LON }),
        osmPlace({ osm_id: "node/2", category: "parks", name: null, lat: LAT, lon: LON - 0.005 }),
        osmPlace({ osm_id: "node/3", category: "library", name: "Far", lat: LAT + 0.05, lon: LON }),
      ],
      "2026-11-20",
    );
    const res = await listPlacesInBox(db, LAT, LON, 800);
    expect(res!.as_of).toBe("2026-11-20");
    expect(res!.rows.map((r) => r.osm_id)).toEqual(["node/1", "node/2"]);
    expect(res!.rows[0]).toEqual({ osm_id: "node/1", category: "food", name: "Near", lat: LAT + 0.002, lon: LON });
    expect(res!.rows[1].name).toBeNull();
    expect(typeof res!.rows[0].lat).toBe("number");
  });

  it("reads only the current version, and a cleared pointer is null again", async () => {
    await setPlaces(db, [osmPlace({ osm_id: "node/9", category: "medical", lat: LAT, lon: LON })], "2026-12-01");
    const res = await listPlacesInBox(db, LAT, LON, 800);
    expect(res!.rows.map((r) => r.osm_id)).toEqual(["node/9"]);
    expect(res!.as_of).toBe("2026-12-01");
    await clearPlaces(db);
    expect(await listPlacesInBox(db, LAT, LON, 800)).toBeNull();
  });
});
