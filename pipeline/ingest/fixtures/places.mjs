// A tiny OpenStreetMap excerpt (places/places-excerpt.osm, XML) for tests: 22 places taken from 20 tagged nodes, 4 tagged ways and one
// multipolygon relation (plus untagged vertices and an untagged outline), placed around the Docklands test address (-37.8230, 144.9490) and the Melbourne CBD point. It holds the cases the extractor must
// get right: an unnamed place, a blank name, a node tagged both cafe and bakery (counts once, as groceries), a way and a relation that take
// a centroid, an open way, a closed way that is only a building (not a place), a shop of another kind (not a place), a place in Sydney
// (outside Victoria's box) and a supermarket more than 800 m from the address. It is read by the same extractor as the real file.
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExtractor } from "../osm-places.mjs";

export const PLACES_FIXTURE_OSM = path.join(path.dirname(fileURLToPath(import.meta.url)), "places", "places-excerpt.osm");
export const PLACES_AS_OF = "2026-11-20";
/** The checks scaled to the excerpt: 22 places, no supermarket-count bound, one park, one food place near the CBD point. */
/** @type {import("../osm-places.mjs").PlacesExpect} */
export const PLACES_EXPECT = { total: [10, 100], supermarkets: null, parks: 1, cbdFood: 1 };
/** What the excerpt holds after extraction, by category. */
export const PLACES_COUNTS = { fitness: 3, food: 5, groceries: 6, library: 1, medical: 4, parks: 3 };

let extracted;
/** The excerpt extracted once per test file (it runs python); resolves to the directory holding places.jsonl and manifest.json. */
export const placesFixtureDir = () =>
  (extracted ??= (async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), "places-fixture-"));
    runExtractor({ input: PLACES_FIXTURE_OSM, out, as_of: PLACES_AS_OF });
    return out;
  })());
