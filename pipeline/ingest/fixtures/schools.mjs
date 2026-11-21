// Test fixtures for the school loader: real rows copied from locations2026.csv (the schools within 4 km of the Docklands test address,
// kept in Windows-1252 as the Department publishes it) and the real zone features that contain that address, plus three neighbours:
// South Melbourne Primary (next door, does not contain it), Melbourne Girls College (a standalone zone that does not contain it) and
// Devenish Primary (a zone whose school has no row in the locations excerpt, so it keeps its name only).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZONE_MEMBERS, decodeLocations } from "../school-zones.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "schools");

export const SCHOOL_LOCATIONS_TEXT = decodeLocations(readFileSync(path.join(dir, "locations2026.csv")));
export const SCHOOL_ZONE_TEXTS = Object.fromEntries(ZONE_MEMBERS.map((m) => [m, readFileSync(path.join(dir, "zones", m), "utf8")]));
export const SCHOOL_AS_OF = "2026-11-14";

/** A copy of the zone texts after `edit(member, geojsonObject)` has changed any of them. */
export function editedZoneTexts(edit) {
  return Object.fromEntries(
    Object.entries(SCHOOL_ZONE_TEXTS).map(([m, t]) => {
      const obj = JSON.parse(t);
      edit(m, obj);
      return [m, JSON.stringify(obj)];
    }),
  );
}
