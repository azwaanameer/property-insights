// A schematic of what is near the address: the address at the centre, distance rings, and the stops or schools by their position east and
// north of it. Plain SVG with no dependency and no map tiles (OpenStreetMap's tile policy bars bulk use, and no street network is loaded).
// It is a diagram of straight-line positions and says so on the page. Points come from the layer payload only.
import { LOCATION } from "../../site/copy";

export type PointKind = "train" | "tram" | "bus" | "coach" | "zoned" | "school";

export interface MapPoint {
  kind: PointKind;
  name: string;
  /** Metres east and north of the address. */
  east: number;
  north: number;
  /** Draw the name beside the point. */
  label?: boolean;
}

const SIZE = 340;
const C = SIZE / 2;
/** Pixels from the centre to the outer ring. */
const R = 140;

const KIND_LABEL: Record<PointKind, string> = { train: "Train", tram: "Tram", bus: "Bus", coach: "Regional coach", zoned: "School it is zoned for", school: "Nearest school" };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Points from a payload list, kept only when they are well formed. Anything else is dropped rather than drawn in the wrong place. */
export function asPoints(v: unknown, kindOf: (row: Record<string, unknown>) => PointKind | null, labelled: (row: Record<string, unknown>) => boolean = () => false): MapPoint[] {
  if (!Array.isArray(v)) return [];
  const out: MapPoint[] = [];
  for (const row of v) {
    if (!isObj(row) || !isNum(row.east) || !isNum(row.north) || typeof row.name !== "string") continue;
    const kind = kindOf(row);
    if (kind) out.push({ kind, name: row.name, east: row.east, north: row.north, label: labelled(row) });
  }
  return out;
}

export function asRings(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => isNum(x) && x > 0).sort((a, b) => a - b) : [];
}

function Marker({ kind, x, y }: { kind: PointKind; x: number; y: number }) {
  const cls = `mk mk-${kind}`;
  switch (kind) {
    case "train":
      return <rect className={cls} x={x - 4.5} y={y - 4.5} width={9} height={9} />;
    case "tram":
      return <circle className={cls} cx={x} cy={y} r={4.5} />;
    case "bus":
      return <rect className={cls} x={x - 4} y={y - 4} width={8} height={8} transform={`rotate(45 ${x} ${y})`} />;
    case "coach":
      return <polygon className={cls} points={`${x},${y - 5.5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} />;
    case "zoned":
      return <circle className={cls} cx={x} cy={y} r={7} />;
    default:
      return <circle className={cls} cx={x} cy={y} r={5} />;
  }
}

export function SchematicMap({ rings, points, what }: { rings: number[]; points: MapPoint[]; what: string }) {
  if (rings.length === 0) return null;
  const outer = rings[rings.length - 1];
  const scale = R / outer;
  const drawn = points.filter((p) => Math.hypot(p.east, p.north) <= outer);
  const kinds = [...new Set(drawn.map((p) => p.kind))];
  return (
    <figure className="smap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={LOCATION.mapLabel(what)} data-points={drawn.length}>
        <title>{LOCATION.mapLabel(what)}</title>
        {rings.map((m) => (
          <g key={m}>
            <circle className="ring" cx={C} cy={C} r={m * scale} />
            <text className="ringlbl" x={C + 3} y={C - m * scale - 3}>{LOCATION.mapRing(m)}</text>
          </g>
        ))}
        <line className="axis" x1={C} y1={C - R - 12} x2={C} y2={C - 4} />
        <text className="north" x={C + 5} y={C - R - 2}>N</text>
        {drawn.map((p, i) => {
          const x = C + p.east * scale;
          const y = C - p.north * scale;
          return (
            <g key={`${p.kind}-${i}`} data-kind={p.kind}>
              <title>{`${KIND_LABEL[p.kind]}: ${p.name}`}</title>
              <Marker kind={p.kind} x={x} y={y} />
              {p.label && (
                <text className="ptlbl" x={x + 8} y={y + 3}>{p.name.length > 26 ? `${p.name.slice(0, 25)}...` : p.name}</text>
              )}
            </g>
          );
        })}
        <g className="you" aria-label={LOCATION.you}>
          <circle cx={C} cy={C} r={6} />
          <circle className="you-in" cx={C} cy={C} r={2.2} />
        </g>
      </svg>
      <figcaption>
        <b>{LOCATION.mapTitle}.</b> {LOCATION.mapNote}
        <ul className="legend" aria-label="Key">
          <li><span className="mk-key you-key" aria-hidden="true" />{LOCATION.you}</li>
          {kinds.map((k) => (
            <li key={k}><span className={`mk-key mk-${k}`} aria-hidden="true" />{KIND_LABEL[k]}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
