// L17 Schools: which government school zones contain the address (2026 zones) and where the nearest schools are. Zones come from the
// Department of Education zone files; locations from the Department's school locations file. Distances are straight lines.
// This layer says nothing about how good any school is: no test score, no index and no ranking of schools is stored or shown.
// The zone-year, the "confirm with the school" line and the Department's own caution about property purchases are always carried in the
// payload and drawn in the section.
import type { Figure } from "../../contracts/layer";
import { haversineMetres, offsetMetres, pointInPolygon } from "../../geo";
import { listSchoolsByKey, listSchoolsInBox, listZonedSchoolKeys, listZoneCandidates, LOCATIONS_SOURCE, ZONES_SOURCE, type SchoolRow, type Sector } from "../../repos/school";
import type { LayerDef, LayerRunOutput } from "../types";
import { figure, gapFigure, UNIT } from "../shared/figures";
import { NO_COORDINATES_MESSAGE, STRAIGHT_LINE_NOTE } from "../shared/location";

/** `gnaf` is listed because the address point comes from G-NAF. */
export const L17_SOURCE_IDS = [ZONES_SOURCE, LOCATIONS_SOURCE, "gnaf"];

/** The zone year(s) come from the loaded zones (their boundary_year), never from this file. Mixed years are all listed. */
export const zoneYearText = (years: number[]) => (years.length === 1 ? String(years[0]) : years.join(" and "));
export const zoneYearNotice = (years: number[]) =>
  years.length === 1 ? `These are the ${years[0]} school zones. Zones are set again each year.` : `These school zones are for more than one year (${zoneYearText(years)}). Zones are set again each year.`;
export const NO_ZONE_LISTED = "No zone is listed for this school.";
export const CONFIRM_NOTICE = "A zone is not a guarantee of a place. Confirm with the school or the Department of Education before relying on it.";
export const PURCHASE_NOTICE = "The Department says zones should not be relied on for property purchase decisions.";
export const NO_ZONE_MESSAGE =
  "No government school zone contains this address. Only government neighbourhood schools have zones, so this address may have none, or its government school may have no zone.";
export const SCOPE_NOTICE = "This section shows where the address sits against zones and where schools are. It says nothing about how good any school is.";

/** The nearest schools are looked for in these growing circles. */
const SEARCH_RADII_M = [2_000, 5_000, 15_000, 40_000] as const;
/** Schools listed for each group in the table. */
const PER_GROUP = 3;
const GROUPS = [
  { key: "government_primary", label: "Government primary", sectors: ["Government"] as Sector[], levels: ["Primary", "Pri/Sec"] },
  { key: "government_secondary", label: "Government secondary", sectors: ["Government"] as Sector[], levels: ["Secondary", "Pri/Sec"] },
  { key: "non_government_primary", label: "Non-government primary", sectors: ["Catholic", "Independent"] as Sector[], levels: ["Primary", "Pri/Sec"] },
  { key: "non_government_secondary", label: "Non-government secondary", sectors: ["Catholic", "Independent"] as Sector[], levels: ["Secondary", "Pri/Sec"] },
] as const;

interface NearSchool extends SchoolRow {
  distance_m: number;
}

export const L17Schools: LayerDef = {
  layer_id: "L17-schools",
  title: "Schools",
  tier: "free",
  source_ids: L17_SOURCE_IDS,
  dataset_ids: [ZONES_SOURCE, LOCATIONS_SOURCE],
  teaser: "Which government school zones cover this address, and where the nearest government and non-government schools are.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const { lat, lon } = address;
    if (lat === null || lon === null) return { status: "gap", figures: [], payload: {}, message: NO_COORDINATES_MESSAGE };

    const candidates = await listZoneCandidates(db, lat, lon);
    if (!candidates) return { status: "gap", figures: [], payload: {}, message: "School zones are not loaded." };
    // The exact test: the point must lie inside the polygon. A point in two zones is in both: each is listed, none is chosen.
    if (candidates.years.length === 0) return { status: "gap", figures: [], payload: {}, message: "School zones are not loaded." };
    const years = candidates.years;
    const zones = candidates.rows.filter((z) => pointInPolygon(lon, lat, z.rings));
    const located = await listSchoolsByKey(db, zones.map((z) => z.school_key).filter((k): k is string => k !== null));
    if (!located) return { status: "gap", figures: [], payload: {}, message: "School locations are not loaded." };
    const byKey = new Map(located.rows.map((s) => [s.school_key, s]));
    const zoneAsOf = candidates.as_of;
    const zoneSrc = [ZONES_SOURCE];

    const figures: Figure[] = [
      figure({
        key: "zone_year",
        label: years.length === 1 ? "School zone year" : "School zone years",
        value: years.length === 1 ? years[0] : zoneYearText(years),
        ...(years.length === 1 ? { unit: UNIT.year } : {}),
        chip: "Observed",
        source_ids: zoneSrc,
        as_of: zoneAsOf,
        note: `${zoneYearNotice(years)} ${CONFIRM_NOTICE}`,
      }),
    ];

    const zoned = zones.map((z) => {
      const school = z.school_key ? (byKey.get(z.school_key) ?? null) : null;
      return {
        zone_id: z.zone_id,
        school_name: z.school_name,
        level: z.level,
        year_levels: z.year_levels,
        boundary_year: z.boundary_year,
        sector: school?.sector ?? "Government",
        school_type: school?.school_type ?? null,
        address: school ? [school.address, school.locality].filter(Boolean).join(", ") : null,
        distance_m: school ? Math.round(haversineMetres(lat, lon, school.lat, school.lon)) : null,
        school_lat: school?.lat ?? null,
        school_lon: school?.lon ?? null,
      };
    });

    // One figure per zone, so a point inside two zones shows both with their year levels and never picks one.
    for (const level of ["primary", "secondary"] as const) {
      const mine = zoned.filter((z) => z.level === level);
      if (mine.length === 0) {
        figures.push(
          gapFigure({
            key: `zoned_${level}`,
            label: `Zoned ${level} school`,
            source_ids: zoneSrc,
            as_of: zoneAsOf,
            note: NO_ZONE_MESSAGE,
          }),
        );
        continue;
      }
      // The same school can zone several year levels (one zone file per level): one figure per school, year levels joined.
      const bySchool = new Map<string, (typeof mine)[number] & { all_levels: string[] }>();
      for (const z of mine) {
        const k = `${z.school_name}|${z.boundary_year}`;
        const seen = bySchool.get(k);
        if (seen) {
          if (!seen.all_levels.includes(z.year_levels)) seen.all_levels.push(z.year_levels);
        } else bySchool.set(k, { ...z, all_levels: [z.year_levels] });
      }
      [...bySchool.values()].forEach((z, i, all) => {
        figures.push(
          figure({
            key: all.length === 1 ? `zoned_${level}` : `zoned_${level}_${i + 1}`,
            label: `Zoned ${level} school (${z.all_levels.join(", ")})`,
            value: z.school_name,
            chip: "Observed",
            source_ids: zoneSrc,
            as_of: zoneAsOf,
            note: `The address point falls inside this school's ${z.boundary_year} zone.${z.distance_m !== null ? ` The school is ${z.distance_m} m away in a straight line.` : " The school was not found in the locations file, so its distance is not shown."} Near a zone boundary the answer can change: confirm with the school.`,
          }),
        );
      });
    }

    // Nearest schools, by group. Special and language schools are left out: they have no neighbourhood catchment to compare.
    const groups = await Promise.all(
      GROUPS.map(async (g) => {
        let found: NearSchool[] = [];
        for (const radius of SEARCH_RADII_M) {
          const box = await listSchoolsInBox(db, lat, lon, radius, [...g.sectors]);
          found = (box?.rows ?? [])
            .filter((s) => (g.levels as readonly string[]).includes(s.school_type))
            .map((s) => ({ ...s, distance_m: Math.round(haversineMetres(lat, lon, s.lat, s.lon)) }))
            .filter((s) => s.distance_m <= radius)
            .sort((a, b) => a.distance_m - b.distance_m || a.school_key.localeCompare(b.school_key));
          if (found.length >= PER_GROUP) break;
        }
        return { ...g, schools: found.slice(0, PER_GROUP) };
      }),
    );
    const locAsOf = located.as_of;
    const zonedKeys = new Set(zones.map((z) => z.school_key).filter((k): k is string => k !== null));
    // "Not in this school's zone" is only true if the school has a zone in the data; a selective or specialist school has none.
    const hasZone = await listZonedSchoolKeys(db, groups.flatMap((g) => (g.sectors[0] === "Government" ? g.schools.map((s) => s.school_key) : [])));
    for (const g of groups) {
      const first = g.schools[0];
      const label = `Nearest ${g.label.toLowerCase()} school`;
      if (!first) {
        figures.push(gapFigure({ key: `nearest_${g.key}`, label, unit: UNIT.metres, source_ids: [LOCATIONS_SOURCE], as_of: locAsOf, note: `No ${g.label.toLowerCase()} school is listed within ${SEARCH_RADII_M[SEARCH_RADII_M.length - 1] / 1000} km of this address.` }));
        continue;
      }
      figures.push(
        figure({
          key: `nearest_${g.key}`,
          label,
          value: first.distance_m,
          unit: UNIT.metres,
          chip: "Estimated",
          source_ids: [LOCATIONS_SOURCE],
          as_of: locAsOf,
          note: `${first.name} (${first.sector}). ${STRAIGHT_LINE_NOTE}${zonedKeys.has(first.school_key) ? " The address is in this school's zone." : g.sectors[0] !== "Government" ? "" : hasZone.has(first.school_key) ? " The address is not in this school's zone." : ` ${NO_ZONE_LISTED}`}`,
        }),
      );
    }

    const mapSchools = [
      ...zoned.filter((z) => z.school_lat !== null && z.school_lon !== null).map((z) => ({ name: z.school_name, kind: "zoned" as const, distance_m: z.distance_m, ...offsetMetres(lat, lon, z.school_lat!, z.school_lon!) })),
    ];
    return {
      status: "ok",
      figures,
      payload: {
        centre: { lat, lon },
        zone_year: years.length === 1 ? years[0] : null,
        zone_years: years,
        notices: [zoneYearNotice(years), CONFIRM_NOTICE, PURCHASE_NOTICE, SCOPE_NOTICE],
        no_zone_message: zoned.length === 0 ? NO_ZONE_MESSAGE : null,
        zones: zoned.map(({ school_lat: _a, school_lon: _b, ...z }) => z),
        nearest: groups.map((g) => ({
          key: g.key,
          label: g.label,
          schools: g.schools.map((s) => ({ name: s.name, sector: s.sector, school_type: s.school_type, distance_m: s.distance_m, in_zone: zonedKeys.has(s.school_key), has_zone: g.sectors[0] === "Government" ? hasZone.has(s.school_key) : null, ...offsetMetres(lat, lon, s.lat, s.lon) })),
        })),
        map_schools: mapSchools,
        straight_line: true,
        meta: { chip: "Observed", source_ids: [ZONES_SOURCE, LOCATIONS_SOURCE], as_of: zoneAsOf },
      },
    };
  },
};
