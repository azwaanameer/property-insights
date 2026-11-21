// L19 Photos and L20 Nearby places, run on the Docklands fixture address with fake vendor adapters (no network). One test per row of the
// spec's I/O matrix, plus the rights, ordering, wording and attribution checks.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ANONYMOUS, type ResolvedAddress } from "../contracts/address";
import type { LayerResult } from "../contracts/layer";
import { assembleReport } from "../services/assemble-report";
import { resolveQuery } from "../services/resolve-address";
import { createSuburbDataTestDb, type TestDb } from "../testing/db";
import { fakeVendors, moved, ok, osmPlace, placeImage, streetImage } from "../testing/fake-vendors";
import { createVendors } from "../vendors";
import type { VendorAdapters } from "../vendors/types";
import { LAYERS } from "./index";
import { L14Attribution } from "./L14-attribution";
import { L19Photos, MAX_PLACE_IMAGES, MAX_STREET_IMAGES, NO_PHOTOS_MESSAGE, OLD_STREET_NOTE, pickStreetImages, UNAVAILABLE_MESSAGE as PHOTOS_UNAVAILABLE } from "./L19-photos";
import { L20Places, NOTHING_MESSAGE, OSM_CREDIT, UNAVAILABLE_MESSAGE as PLACES_UNAVAILABLE, UNNAMED } from "./L20-places";
import { NO_COORDINATES_MESSAGE } from "./shared/location";
import { UNAVAILABLE_VENDORS } from "../vendors/types";

const DOCKLANDS_UNIT = "310/628 Flinders St Docklands";

let db: TestDb;
let close: () => Promise<void>;
let address: ResolvedAddress;
let lat: number;
let lon: number;
beforeAll(async () => {
  ({ db, close } = await createSuburbDataTestDb());
  address = await resolveQuery(db, DOCKLANDS_UNIT);
  lat = address.lat!;
  lon = address.lon!;
});
afterAll(() => close());

const run = (layer: typeof L19Photos, vendors: VendorAdapters, over: Partial<ResolvedAddress> = {}) => layer.run({ db, address: { ...address, ...over }, request_id: "t", vendors });
const at = (north: number, east: number) => moved(lat, lon, north, east);
const yearsAgo = (n: number, month = 3) => new Date(Date.UTC(new Date().getUTCFullYear() - n, month, 1)).toISOString();
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};

describe("L19 photos", () => {
  it("shows up to 4 recent street images newest first, spread across facing directions, each with creator, licence and a source link, plus up to 3 Wikimedia photos within 1 km", async () => {
    const images = [
      // five facing north (newest), then one each other way; only 4 are shown and each direction is used before a second north
      ...[0, 1, 2, 3, 4].map((i) => streetImage({ id: `n${i}`, compass_angle: 5, captured_at: yearsAgo(0, 5 - i), ...at(10 + i, 5) })),
      streetImage({ id: "east", compass_angle: 95, captured_at: yearsAgo(1), ...at(20, 0) }),
      streetImage({ id: "south", compass_angle: 185, captured_at: yearsAgo(1, 4), ...at(-20, 0) }),
      streetImage({ id: "west", compass_angle: 275, captured_at: yearsAgo(1, 2), ...at(0, -20) }),
      streetImage({ id: "far", compass_angle: 90, captured_at: yearsAgo(0, 6), ...at(400, 0) }), // beyond 150 m
    ];
    const places = [1, 2, 3, 4].map((i) => placeImage({ title: `Photo_${i}.jpg`, ...at(i * 100, 0), author: `Author ${i}` }));
    const out = await run(L19Photos, fakeVendors({ streetImages: async () => ok(images), placeImages: async () => ok(places) }));
    expect(out.status).toBe("ok");
    const street = out.payload.street as { id: string; year: number; creator: string; licence: string; source_url: string; alt: string; captured_at: string }[];
    expect(street).toHaveLength(MAX_STREET_IMAGES);
    expect(street.map((s) => s.id)).not.toContain("far");
    expect(new Set(street.map((s) => s.id)).size).toBe(4);
    // newest first
    const times = street.map((s) => Date.parse(s.captured_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // every facing direction is represented before a second north image
    expect(street.map((s) => s.id).filter((id) => id.startsWith("n"))).toHaveLength(1);
    for (const s of street) {
      expect(s.creator).toBe("street_walker");
      expect(s.licence).toBe("CC BY-SA 4.0");
      expect(s.source_url).toMatch(/^https:\/\/www\.mapillary\.com\/app\/\?pKey=/);
      expect(s.alt).toBe(`Street view near ${address.display_address}, ${s.year}`);
    }
    const pics = out.payload.places as { author: string; licence: string; source_url: string; distance_m: number }[];
    expect(pics).toHaveLength(MAX_PLACE_IMAGES);
    expect(pics.map((p) => p.author)).toEqual(["Author 1", "Author 2", "Author 3"]); // nearest first
    for (const p of pics) expect(p.licence && p.source_url).toBeTruthy();
    expect(out.figures.map((f) => [f.key, f.source_ids[0], f.chip])).toEqual([
      ["newest_street_photo", "mapillary", "Observed"],
      ["place_photos", "wikimedia_commons", "Observed"],
    ]);
    expect(out.figures[0].value).toBe(new Date().getUTCFullYear());
  });

  it("says the photos are of the street and not of the property, and never calls an image the property", async () => {
    const out = await run(L19Photos, fakeVendors({ streetImages: async () => ok([streetImage({ id: "a", captured_at: yearsAgo(0, 1), ...at(10, 0) })]) }));
    const text = strings(out.payload).join(" ");
    expect(text).toContain("not photos of this property");
    expect(text).not.toMatch(/photo of the property|the property itself/i);
  });

  it("shows an old newest image with its year and a note that the street may have changed", async () => {
    const out = await run(L19Photos, fakeVendors({ streetImages: async () => ok([streetImage({ id: "old", captured_at: yearsAgo(6), ...at(10, 0) })]) }));
    expect(out.status).toBe("ok");
    expect((out.payload.street as { year: number }[])[0].year).toBe(new Date().getUTCFullYear() - 6);
    expect(out.payload.notes).toContain(OLD_STREET_NOTE);
  });

  it("does not add the old-image note for a recent image", async () => {
    const out = await run(L19Photos, fakeVendors({ streetImages: async () => ok([streetImage({ id: "new", captured_at: yearsAgo(1), ...at(10, 0) })]) }));
    expect(out.payload.notes).not.toContain(OLD_STREET_NOTE);
  });

  it("with no images anywhere it is the gap 'No public photos found near this address.'", async () => {
    const out = await run(L19Photos, fakeVendors());
    expect(out).toMatchObject({ status: "gap", message: NO_PHOTOS_MESSAGE, figures: [] });
    expect(NO_PHOTOS_MESSAGE).toBe("No public photos found near this address.");
  });

  it("with the token missing it uses Wikimedia only, and when that has none either it is the no-photos gap (no error)", async () => {
    const noKey = { streetImages: async () => ({ ok: false, reason: "no_key" }) as const };
    const withPhotos = await run(L19Photos, fakeVendors({ ...noKey, placeImages: async () => ok([placeImage({ title: "A.jpg", ...at(50, 0) })]) }));
    expect(withPhotos.status).toBe("ok");
    expect(withPhotos.payload.street).toEqual([]);
    expect(withPhotos.payload.notes).not.toContain("Street photos are not available right now.");
    expect(withPhotos.figures.map((f) => f.key)).toEqual(["place_photos"]);
    const none = await run(L19Photos, fakeVendors(noKey));
    expect(none).toMatchObject({ status: "gap", message: NO_PHOTOS_MESSAGE });
  });

  it("with the vendors down it is the gap 'Photos are not available right now.'", async () => {
    const out = await run(L19Photos, UNAVAILABLE_VENDORS);
    expect(out).toMatchObject({ status: "gap", message: PHOTOS_UNAVAILABLE });
    expect(PHOTOS_UNAVAILABLE).toBe("Photos are not available right now.");
  });

  it("when only one vendor is down the other's photos still show, with a note about the one that is missing", async () => {
    const out = await run(L19Photos, fakeVendors({ streetImages: async () => ({ ok: false, reason: "unavailable" }), placeImages: async () => ok([placeImage({ title: "A.jpg", ...at(50, 0) })]) }));
    expect(out.status).toBe("ok");
    expect(out.payload.notes).toContain("Street photos are not available right now.");
  });

  it("an address with no coordinates is a gap and the vendors are never asked", async () => {
    const streetImages = vi.fn();
    const out = await run(L19Photos, fakeVendors({ streetImages }), { lat: null, lon: null });
    expect(out).toMatchObject({ status: "gap", message: NO_COORDINATES_MESSAGE });
    expect(streetImages).not.toHaveBeenCalled();
  });

  it("pickStreetImages ignores images beyond 150 m and prefers images from the last two years of the newest", () => {
    const picked = pickStreetImages(
      [
        streetImage({ id: "recent-n", compass_angle: 0, captured_at: yearsAgo(0, 4), ...at(5, 0) }),
        streetImage({ id: "old-e", compass_angle: 90, captured_at: yearsAgo(8), ...at(5, 5) }),
        streetImage({ id: "far", compass_angle: 180, captured_at: yearsAgo(0, 4), ...at(500, 0) }),
      ],
      lat,
      lon,
    );
    expect(picked.map((p) => p.id)).toEqual(["recent-n", "old-e"]);
  });
});

describe("L20 nearby places", () => {
  const makePlaces = () => [
    osmPlace({ osm_id: "node/1", category: "groceries", name: "Corner Grocer", ...at(120, 0) }),
    osmPlace({ osm_id: "node/2", category: "groceries", name: "Big Market", ...at(0, 700) }),
    osmPlace({ osm_id: "node/3", category: "groceries", name: "Too Far", ...at(0, 850) }), // beyond 800 m: not counted
    osmPlace({ osm_id: "node/4", category: "food", name: null, ...at(50, 0) }),
    osmPlace({ osm_id: "node/5", category: "food", name: "Named Cafe", ...at(300, 0) }),
    osmPlace({ osm_id: "node/6", category: "parks", name: "Little Park", ...at(0, 500) }),
  ];

  it("gives each category's nearest place (name, straight-line metres) and counts within 400 m and 800 m", async () => {
    const places = makePlaces();
    const out = await run(L20Places, fakeVendors({ places: async () => ok({ places, truncated: false }) }));
    expect(out.status).toBe("ok");
    const cats = Object.fromEntries((out.payload.categories as { key: string; nearest: { name: string | null; distance_m: number } | null; within_400: number; within_800: number }[]).map((c) => [c.key, c]));
    expect(cats.groceries.nearest).toMatchObject({ name: "Corner Grocer" });
    expect(cats.groceries.nearest!.distance_m).toBeGreaterThan(110);
    expect(cats.groceries.nearest!.distance_m).toBeLessThan(130);
    expect(cats.groceries).toMatchObject({ within_400: 1, within_800: 2 });
    expect(cats.food).toMatchObject({ within_400: 2, within_800: 2 });
    expect(cats.parks).toMatchObject({ within_400: 0, within_800: 1 });
    expect(cats.medical.nearest).toBeNull();
    expect(cats.library.nearest).toBeNull();
    const f = Object.fromEntries(out.figures.map((x) => [x.key, x]));
    expect(f.nearest_groceries).toMatchObject({ unit: "metres", chip: "Estimated", source_ids: ["openstreetmap"], as_of: "2026-11-21" });
    expect(f.nearest_groceries.note).toContain("Corner Grocer");
    expect(f.nearest_groceries.note).toContain("Straight-line distance");
    expect(f.nearest_medical).toMatchObject({ value: null, chip: "Unknown" });
    expect(out.payload.straight_line).toBe(true);
    expect(out.payload.credit).toEqual(OSM_CREDIT);
    expect(OSM_CREDIT.text).toBe("© OpenStreetMap contributors");
    expect(OSM_CREDIT.url).toBe("https://www.openstreetmap.org/copyright");
  });

  it("counts a place without a name but never lists it by name", async () => {
    const places = makePlaces();
    const out = await run(L20Places, fakeVendors({ places: async () => ok({ places: [places[3], places[4]], truncated: false }) }));
    const food = (out.payload.categories as { key: string; nearest: { name: string | null }; within_400: number }[]).find((c) => c.key === "food")!;
    expect(food.nearest.name).toBeNull();
    expect(food.within_400).toBe(2);
    const note = out.figures.find((f) => f.key === "nearest_food")!.note!;
    expect(note).toContain(UNNAMED);
    expect(note).not.toContain("Named Cafe");
  });

  it("has no rating, review, score or walkability wording anywhere in the section", async () => {
    const places = makePlaces();
    const out = await run(L20Places, fakeVendors({ places: async () => ok({ places, truncated: true }) }));
    const text = [...strings(out.payload), ...out.figures.flatMap((f) => [f.label, f.note ?? ""])].join(" ");
    expect(text).not.toMatch(/\b(rating|rated|review|reviews|stars?|score|scored|walk ?score|walkability|best|top[- ]rated)\b/i);
    expect(out.payload.notes).toContain("OpenStreetMap returned the most places this search allows, so the counts may be understated.");
  });

  it("when nothing is listed within 800 m it is a gap, never an invented list", async () => {
    const places = makePlaces();
    const out = await run(L20Places, fakeVendors({ places: async () => ok({ places: [places[2]], truncated: false }) }));
    expect(out).toMatchObject({ status: "gap", message: NOTHING_MESSAGE, figures: [] });
  });

  it("with the vendor down it is the gap 'Nearby places are not available right now.'", async () => {
    expect(await run(L20Places, UNAVAILABLE_VENDORS)).toMatchObject({ status: "gap", message: PLACES_UNAVAILABLE });
    expect(PLACES_UNAVAILABLE).toBe("Nearby places are not available right now.");
  });

  it("an address with no coordinates is a gap and the vendor is never asked", async () => {
    const spy = vi.fn();
    const out = await run(L20Places, fakeVendors({ places: spy }), { lat: null, lon: null });
    expect(out).toMatchObject({ status: "gap", message: NO_COORDINATES_MESSAGE });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("in the assembled report", () => {
  const report = async (vendors: VendorAdapters, timeout_ms?: number) => {
    const model = await assembleReport({ db, address, principal: ANONYMOUS, request_id: "t", vendors, timeout_ms });
    return Object.fromEntries(model.layers.map((l) => [l.layer_id, l])) as Record<string, LayerResult>;
  };

  it("L19 comes right after L01 and L20 right after L16; both are free and enabled by the migration", async () => {
    const ids = LAYERS.map((l) => l.layer_id);
    expect(ids.indexOf("L19-photos")).toBe(ids.indexOf("L01-property") + 1);
    expect(ids.indexOf("L20-places")).toBe(ids.indexOf("L16-transport") + 1);
    const layers = await report(fakeVendors());
    expect(layers["L19-photos"].tier).toBe("free");
    expect(layers["L20-places"].tier).toBe("free");
    expect(layers["L19-photos"].status).toBe("gap");
  });

  it("a vendor that times out turns only its sections into gaps; every other section still renders", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const never = () => new Promise<Response>(() => undefined);
    const layers = await report(createVendors({ db, env: { MAPILLARY_ACCESS_TOKEN: "t" }, fetch: never, timeout_ms: 40 }));
    expect(layers["L19-photos"]).toMatchObject({ status: "gap", message: PHOTOS_UNAVAILABLE });
    expect(layers["L20-places"]).toMatchObject({ status: "gap", message: PLACES_UNAVAILABLE });
    for (const id of ["L01-property", "L16-transport", "L17-schools", "L14-attribution"]) expect(layers[id].status, id).toBe("ok");
    vi.restoreAllMocks();
  });

  it("a vendor method that throws is an error section for that layer only", async () => {
    const boom = fakeVendors({ places: async () => { throw new Error("boom"); } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const layers = await report(boom);
    expect(layers["L20-places"].status).toBe("error");
    expect(layers["L01-property"].status).toBe("ok");
    vi.restoreAllMocks();
  });

  it("L14 credits OpenStreetMap, Mapillary and Wikimedia Commons only when those sections returned data, with the OpenStreetMap credit linked", async () => {
    const vendors = fakeVendors({
      streetImages: async () => ok([streetImage({ id: "a", captured_at: yearsAgo(0, 1), ...at(10, 0) })]),
      placeImages: async () => ok([placeImage({ title: "A.jpg", ...at(50, 0) })]),
      places: async () => ok({ places: [osmPlace({ osm_id: "node/1", category: "food", ...at(50, 0) })], truncated: false }),
    });
    const full = await report(vendors);
    const sources = (full["L14-attribution"].payload.sources as { source_id: string; attribution_text: string; licence_url: string | null; credit_url: string | null; used_by: string[] }[]);
    const by = Object.fromEntries(sources.map((s) => [s.source_id, s]));
    expect(by.openstreetmap).toMatchObject({ attribution_text: expect.stringContaining("© OpenStreetMap contributors"), licence_url: "https://opendatacommons.org/licenses/odbl/1-0/", credit_url: "https://www.openstreetmap.org/copyright", used_by: ["L20-places"] });
    expect(by.mapillary).toMatchObject({ attribution_text: "Photos: Mapillary contributors, CC BY-SA 4.0", licence_url: "https://creativecommons.org/licenses/by-sa/4.0/", used_by: ["L19-photos"] });
    expect(by.wikimedia_commons).toMatchObject({ attribution_text: "Images from Wikimedia Commons; each image carries its own author and licence", licence_url: null });

    const empty = await report(fakeVendors());
    const ids = ((empty["L14-attribution"].payload.sources ?? []) as { source_id: string }[]).map((s) => s.source_id);
    for (const id of ["openstreetmap", "mapillary", "wikimedia_commons"]) expect(ids).not.toContain(id);
  });

  it("the rights gate fails closed: a pending source makes the layer not_covered and it never runs", async () => {
    await db.query("UPDATE src_source SET rights_status = 'pending' WHERE source_id = 'openstreetmap'");
    try {
      const spy = vi.fn();
      const layers = await report(fakeVendors({ places: spy }));
      expect(layers["L20-places"].status).toBe("not_covered");
      expect(spy).not.toHaveBeenCalled();
      expect(layers["L19-photos"].status).not.toBe("not_covered");
    } finally {
      await db.query("UPDATE src_source SET rights_status = 'cleared' WHERE source_id = 'openstreetmap'");
    }
  });

  it("L14 is still a synthesis layer reading the others (smoke)", () => {
    expect(L14Attribution.synthesis).toBe(true);
  });
});
