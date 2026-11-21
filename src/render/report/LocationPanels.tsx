// The panels the figure tiles cannot carry for the location sections: transport (L16), schools (L17), building (L11) and supply (L08).
// Each draws the layer payload only. Payloads are `unknown` on the wire, so every shape is checked before it is drawn, and anything that
// does not fit is left out rather than guessed. No distance is worked out here: the layer gave straight-line metres, and this formats them.
import { Chip } from "../../server/contracts/layer";
import { LOCATION } from "../../site/copy";
import { formatValue, NOT_AVAILABLE } from "../format";
import { ChipBadge, provenanceText } from "./FigureTile";
import { asPoints, asRings, SchematicMap, type MapPoint } from "./SchematicMap";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string");

function Meta({ payload }: { payload: Record<string, unknown> }) {
  const m = isObj(payload.meta) ? payload.meta : null;
  if (!m || !Chip.safeParse(m.chip).success) return null;
  const text = provenanceText(strings(m.source_ids), typeof m.as_of === "string" ? m.as_of : null);
  return (
    <p className="tabnote">
      <ChipBadge chip={m.chip as Chip} /> {text ? `${text}. ` : ""}
      {LOCATION.straightLine}
    </p>
  );
}

// ---------------------------------------------------------------- transport (L16)

const MODES = ["train", "tram", "bus", "coach"] as const;

export function TransportPanel({ payload }: { payload: Record<string, unknown> }) {
  const nearest = isObj(payload.nearest) ? payload.nearest : null;
  const counts = isObj(payload.counts) ? payload.counts : null;
  if (!nearest || !counts) return null;
  const rows = MODES.map((mode) => {
    const n = isObj(nearest[mode]) ? (nearest[mode] as Record<string, unknown>) : null;
    const c = isObj(counts[mode]) ? (counts[mode] as Record<string, unknown>) : {};
    return {
      mode,
      name: n && typeof n.name === "string" ? n.name : null,
      distance: n && isNum(n.distance_m) ? n.distance_m : null,
      routes: n ? strings(n.routes) : [],
      w400: isNum(c.within_400) ? c.within_400 : null,
      w800: isNum(c.within_800) ? c.within_800 : null,
    };
  });
  const rings = asRings(payload.rings_m);
  const nearestKey = (mode: string) => {
    const n = isObj(nearest[mode]) ? (nearest[mode] as Record<string, unknown>) : null;
    return n ? `${n.name}|${n.distance_m}` : null;
  };
  const points: MapPoint[] = asPoints(
    payload.stops,
    (r) => (MODES as readonly string[]).includes(str(r.mode)) ? (r.mode as MapPoint["kind"]) : null,
    (r) => nearestKey(str(r.mode)) === `${r.name}|${r.distance_m}`,
  );
  const H = LOCATION.transportHead;
  return (
    <div className="tw">
      <table>
        <caption>{LOCATION.transportCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{H.mode}</th>
            <th scope="col">{H.stop}</th>
            <th scope="col">{H.routes}</th>
            <th scope="col" className="num">{H.distance}</th>
            <th scope="col" className="num">{H.within400}</th>
            <th scope="col" className="num">{H.within800}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.mode} data-mode={r.mode}>
              <th scope="row">{LOCATION.modes[r.mode]}</th>
              <td>{r.name ?? LOCATION.noStop}</td>
              <td>{r.routes.length > 0 ? r.routes.slice(0, 6).join(", ") + (r.routes.length > 6 ? ` and ${r.routes.length - 6} more` : "") : ""}</td>
              <td className="num">{r.distance === null ? NOT_AVAILABLE : formatValue(r.distance, "metres")}</td>
              <td className="num">{r.w400 === null ? NOT_AVAILABLE : formatValue(r.w400, "count")}</td>
              <td className="num">{r.w800 === null ? NOT_AVAILABLE : formatValue(r.w800, "count")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tabnote">{LOCATION.stopsNotServices}</p>
      <SchematicMap rings={rings} points={points} what="stops" />
      <Meta payload={payload} />
    </div>
  );
}

// ---------------------------------------------------------------- schools (L17)

/** Rings for a map of schools, a few kilometres wide: the smaller ring is half the larger, and the larger covers the farthest point drawn. */
export function schoolRings(maxMetres: number): number[] {
  const steps = [500, 1000, 2000, 4000, 8000, 16000, 40000];
  const step = steps.find((s) => 2 * s >= maxMetres) ?? steps[steps.length - 1];
  return [step, 2 * step];
}

export function SchoolsPanel({ payload }: { payload: Record<string, unknown> }) {
  const notices = strings(payload.notices);
  const zones = list(payload.zones).filter(isObj);
  const groups = list(payload.nearest).filter(isObj);
  const noZone = typeof payload.no_zone_message === "string" ? payload.no_zone_message : null;
  const H = LOCATION.schoolsHead;

  const zoneRows = zones.map((z) => ({
    key: str(z.zone_id),
    name: str(z.school_name),
    level: str(z.level),
    years: str(z.year_levels),
    sector: str(z.sector),
    distance: isNum(z.distance_m) ? z.distance_m : null,
  }));
  const nearestRows = groups.flatMap((g) =>
    list(g.schools)
      .filter(isObj)
      .map((s) => ({
        group: str(g.label),
        name: str(s.name),
        sector: str(s.sector),
        distance: isNum(s.distance_m) ? s.distance_m : null,
        inZone: s.in_zone === true,
        hasZone: s.has_zone !== false,
        government: str(s.sector) === "Government",
      })),
  );

  const zonedPoints = asPoints(payload.map_schools, () => "zoned", () => true);
  const nearestPoints: MapPoint[] = groups.flatMap((g) => asPoints(list(g.schools).slice(0, 1), () => "school", () => false));
  const points = [...zonedPoints, ...nearestPoints];
  const farthest = Math.max(0, ...points.map((p) => Math.hypot(p.east, p.north)));
  const rings = points.length > 0 ? schoolRings(farthest) : [];

  return (
    <div className="tw">
      {notices.length > 0 && (
        <ul className="notices" aria-label="Read this first">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {zoneRows.length > 0 ? (
        <table>
          <caption>{LOCATION.schoolsZoneCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{H.school}</th>
              <th scope="col">{H.level}</th>
              <th scope="col">{H.years}</th>
              <th scope="col">{H.sector}</th>
              <th scope="col" className="num">{H.distance}</th>
            </tr>
          </thead>
          <tbody>
            {zoneRows.map((z) => (
              <tr key={z.key} className="me" data-zone={z.key}>
                <th scope="row">{z.name}</th>
                <td>{z.level === "primary" ? "Primary" : "Secondary"}</td>
                <td>{z.years}</td>
                <td>{z.sector}</td>
                <td className="num">{z.distance === null ? NOT_AVAILABLE : formatValue(z.distance, "metres")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        noZone && (
          <p className="means gapmsg" role="note">
            <b>No zone found.</b> {noZone}
          </p>
        )
      )}
      {nearestRows.length > 0 && (
        <table>
          <caption>{LOCATION.schoolsNearestCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{H.group}</th>
              <th scope="col">{H.school}</th>
              <th scope="col">{H.sector}</th>
              <th scope="col" className="num">{H.distance}</th>
              <th scope="col">{H.inZone}</th>
            </tr>
          </thead>
          <tbody>
            {nearestRows.map((r, i) => (
              <tr key={`${r.group}-${r.name}-${i}`}>
                <th scope="row">{r.group}</th>
                <td>{r.name}</td>
                <td>{r.sector}</td>
                <td className="num">{r.distance === null ? NOT_AVAILABLE : formatValue(r.distance, "metres")}</td>
                <td>{r.government ? (r.inZone ? LOCATION.inZone : r.hasZone ? LOCATION.notInZone : LOCATION.noZoneListed) : LOCATION.notApplicable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SchematicMap rings={rings} points={points} what="schools" />
      <Meta payload={payload} />
    </div>
  );
}

// ---------------------------------------------------------------- building (L11)

export function BuildingPanel({ payload }: { payload: Record<string, unknown> }) {
  const com = isObj(payload.com) ? payload.com : null;
  if (com && typeof com.street_address === "string") {
    return (
      <p className="tabnote" data-basis="matched">
        <b>{LOCATION.buildingBasis}:</b> {com.street_address}, {String(com.census_year)} building census. {str(com.match_text)}
      </p>
    );
  }
  const message = typeof payload.com_message === "string" ? payload.com_message : null;
  return message ? (
    <p className="means gapmsg" role="note" data-basis="unmatched">
      <b>{NOT_AVAILABLE}.</b> {message}
    </p>
  ) : null;
}

// ---------------------------------------------------------------- supply (L08)

export function SupplyPanel({ payload }: { payload: Record<string, unknown> }) {
  const stages = list(payload.stages)
    .filter(isObj)
    .filter((s) => typeof s.label === "string" && isNum(s.projects) && isNum(s.dwellings));
  const projects = list(payload.projects).filter(isObj);
  const total = isNum(payload.projects_total) ? payload.projects_total : projects.length;
  if (stages.length === 0) return null;
  const S = LOCATION.supplyHead;
  const P = LOCATION.supplyProjectHead;
  return (
    <div className="tw">
      <table>
        <caption>{LOCATION.supplyStageCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{S.stage}</th>
            <th scope="col" className="num">{S.projects}</th>
            <th scope="col" className="num">{S.dwellings}</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s) => (
            <tr key={str(s.key)}>
              <th scope="row">{str(s.label)}</th>
              <td className="num">{formatValue(s.projects as number, "count")}</td>
              <td className="num">{formatValue(s.dwellings as number, "count")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {projects.length > 0 && (
        <table>
          <caption>{LOCATION.supplyProjectsCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{P.stage}</th>
              <th scope="col">{P.address}</th>
              <th scope="col" className="num">{P.dwellings}</th>
              <th scope="col" className="num">{P.floors}</th>
              <th scope="col" className="num">{P.distance}</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={str(p.development_key)}>
                <th scope="row">{str(p.stage)}</th>
                <td>{str(p.street_address)}</td>
                <td className="num">{isNum(p.dwellings) ? formatValue(p.dwellings, "count") : NOT_AVAILABLE}</td>
                <td className="num">{isNum(p.floors_above) ? formatValue(p.floors_above, "count") : NOT_AVAILABLE}</td>
                <td className="num">{isNum(p.distance_m) ? formatValue(p.distance_m, "metres") : NOT_AVAILABLE}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tabnote">
        {projects.length < total ? `${LOCATION.supplyMore(projects.length, total)} ` : ""}
        {LOCATION.council}
      </p>
      <Meta payload={payload} />
    </div>
  );
}
