// L09 Suburb compare: this suburb side by side with the suburbs that share a boundary with it (G-NAF locality neighbours).
// Side by side only: one table of plain measures, and for each measure the suburb's position in the list ("3 of 8"). Positions are
// Estimated, say how they were worked out, and are never added up or turned into a score or a "best" (AD-5, AD-10).
import type { Figure } from "../../contracts/layer";
import { currentDataset } from "../../repos/datasets";
import { listPrices, listRents, RENT_SOURCE, VGV_SOURCE } from "../../repos/series";
import { CENSUS_SOURCE, listMarkers, listNeighbours, NEIGHBOUR_SOURCE, SEIFA_SOURCE, SUBURB_SOURCE, type MarkerMap } from "../../repos/suburb";
import type { LayerDef, LayerRunOutput } from "../types";
import { dwellingFamily, FAMILY, rankAmong } from "../shared/derive";
import { figure, SUBURB_NOT_MATCHED_MESSAGE, UNIT } from "../shared/figures";
import { rentPeriods, snapshot, type Snapshot } from "../shared/suburb-data";

export const L09_SOURCE_IDS = [NEIGHBOUR_SOURCE, SUBURB_SOURCE, VGV_SOURCE, RENT_SOURCE, CENSUS_SOURCE, SEIFA_SOURCE];

/** At most this many adjacent suburbs go in the table. Real adjacency lists run to about a dozen. */
export const MAX_NEIGHBOURS = 24;

type ColumnKey = "price_cents" | "rent_weekly_cents" | "gross_yield" | "price_cagr_5y" | "seifa_irsad" | "flat_share" | "owner_share";

interface Column {
  key: ColumnKey;
  label: string;
  unit: string;
  chip: "Observed" | "Estimated";
  source_ids: string[];
  as_of: string | null;
  note?: string;
  /** Ranked for the subject suburb. Owner share is shown but not ranked. */
  ranked: boolean;
}

export const L09SuburbCompare: LayerDef = {
  layer_id: "L09-suburb-compare",
  title: "Suburb compare",
  tier: "free",
  source_ids: L09_SOURCE_IDS,
  dataset_ids: L09_SOURCE_IDS,
  teaser: "This suburb next to the suburbs around it: price, rent, yield, growth and the Census picture.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const sal = address.sal_code;
    if (!sal) return { status: "gap", figures: [], payload: {}, message: SUBURB_NOT_MATCHED_MESSAGE };

    const nb = await listNeighbours(db, sal, MAX_NEIGHBOURS);
    if (!nb) return { status: "gap", figures: [], payload: {}, message: "Suburb adjacency is not loaded." };
    const neighbours = nb.rows;
    // The true adjacency count, even when the table shows only the first MAX_NEIGHBOURS.
    const total = nb.total;
    if (neighbours.length === 0) {
      return {
        status: "gap",
        figures: [],
        payload: { sal_code: sal, neighbour_count: 0, total_neighbours: 0 },
        message: "No adjacent suburbs are recorded for this suburb, so there is nothing to compare it with.",
      };
    }

    const family = dwellingFamily(address);
    const def = FAMILY[family];
    const sals = [sal, ...neighbours.map((n) => n.sal_code)];
    const [prices, rentDs, census, seifa] = await Promise.all([
      listPrices(db, sals),
      currentDataset(db, RENT_SOURCE),
      listMarkers(db, CENSUS_SOURCE, sals, ["flat_share", "owner_share"]),
      listMarkers(db, SEIFA_SOURCE, sals, ["seifa_irsad"]),
    ]);
    const rents = rentDs ? await listRents(db, sals, [rentPeriods(rentDs.as_of).latest]) : null;
    if (!prices || !rents || !census || !seifa) return { status: "gap", figures: [], payload: {}, message: "A dataset the comparison needs is not loaded." };

    const yieldAsOf = prices.as_of < rents.as_of ? prices.as_of : rents.as_of;
    const columns: Column[] = [
      { key: "price_cents", label: `Median ${def.noun} price`, unit: UNIT.money, chip: "Observed", source_ids: [VGV_SOURCE], as_of: prices.as_of, note: "Valuer-General median for the latest quarter.", ranked: true },
      { key: "rent_weekly_cents", label: `Median weekly rent, ${def.primary_bedrooms}-bedroom ${def.rent_noun}`, unit: UNIT.weeklyRent, chip: "Observed", source_ids: [RENT_SOURCE], as_of: rents.as_of, note: "Homes Victoria moving annual median.", ranked: true },
      { key: "gross_yield", label: "Gross yield", unit: UNIT.fraction, chip: "Estimated", source_ids: [RENT_SOURCE, VGV_SOURCE], as_of: yieldAsOf, note: "Derived: weekly rent x 52 / median price. Indicative, see the Rent section.", ranked: true },
      { key: "price_cagr_5y", label: `Median ${def.noun} price growth, 5-year annual rate`, unit: UNIT.fraction, chip: "Estimated", source_ids: [VGV_SOURCE], as_of: prices.as_of, note: "Derived from calendar-year medians. Past change only.", ranked: true },
      { key: "seifa_irsad", label: "SEIFA IRSAD (ABS index)", unit: UNIT.index, chip: "Observed", source_ids: [SEIFA_SOURCE], as_of: seifa.as_of, note: "ABS Index of Relative Socio-economic Advantage and Disadvantage, 2021. Higher is more advantaged.", ranked: true },
      { key: "flat_share", label: "Households in flats or apartments", unit: UNIT.fraction, chip: "Observed", source_ids: [CENSUS_SOURCE], as_of: census.as_of, note: "2021 Census.", ranked: true },
      { key: "owner_share", label: "Households that own their home", unit: UNIT.fraction, chip: "Observed", source_ids: [CENSUS_SOURCE], as_of: census.as_of, note: "2021 Census: owned outright or with a mortgage, out of owned and rented.", ranked: false },
    ];

    const valuesFor = (sc: string, snap: Snapshot): { values: Record<ColumnKey, number | null>; thin: ColumnKey[] } => {
      const mk = (m: MarkerMap, k: string) => m.get(sc)?.[k]?.value ?? null;
      const values: Record<ColumnKey, number | null> = {
        price_cents: snap.price_cents,
        rent_weekly_cents: snap.rent_weekly_cents,
        gross_yield: snap.gross_yield,
        price_cagr_5y: snap.price_cagr_5y,
        seifa_irsad: mk(seifa.markers, "seifa_irsad"),
        flat_share: mk(census.markers, "flat_share"),
        owner_share: mk(census.markers, "owner_share"),
      };
      const thin: ColumnKey[] = [];
      // ABS flags a SEIFA score "q" when the suburb population is small: kept, but not shown as an unqualified observation.
      if (seifa.markers.get(sc)?.seifa_irsad?.flag === "q") thin.push("seifa_irsad");
      if (snap.price_thin) thin.push("price_cents");
      if (snap.rent_thin) thin.push("rent_weekly_cents");
      if (snap.price_thin || snap.rent_thin) thin.push("gross_yield");
      return { values, thin };
    };

    const subjectName = address.sal_name ?? sal;
    const people = [{ sal_code: sal, name: subjectName, is_subject: true }, ...neighbours.map((n) => ({ sal_code: n.sal_code, name: n.name, is_subject: false }))];
    const rows = people.map((p) => ({ ...p, ...valuesFor(p.sal_code, snapshot(p.sal_code, family, prices.rows, rents.rows, rents.as_of)) }));

    // A neighbour with no figure at all adds nothing to a comparison; the layer says how many were left out.
    const hasData = (r: (typeof rows)[number]) => Object.values(r.values).some((v) => v !== null);
    const shown = rows.filter((r) => r.is_subject || hasData(r));
    if (shown.length < 2) {
      return {
        status: "gap",
        figures: [],
        payload: { sal_code: sal, neighbour_count: total, total_neighbours: total },
        message: "None of the adjacent suburbs has published price, rent or Census figures to compare with.",
      };
    }
    const left_out = rows.length - shown.length;
    const seifaCol = columns.find((c) => c.key === "seifa_irsad")!;
    if (shown.some((r) => r.thin.includes("seifa_irsad"))) {
      seifaCol.chip = "Estimated";
      seifaCol.note = `${seifaCol.note} Marked * where the ABS flags the score as based on a small population, so treat it as indicative.`;
    }

    const figures: Figure[] = [
      figure({
        key: "neighbour_count",
        label: "Adjacent suburbs",
        value: total,
        unit: UNIT.count,
        chip: "Estimated",
        source_ids: [NEIGHBOUR_SOURCE, SUBURB_SOURCE],
        as_of: nb.as_of,
        note: `Suburbs that share a boundary with this one in the G-NAF locality neighbour table, matched to ABS suburbs by name${total > neighbours.length ? `, showing the first ${neighbours.length} of ${total}` : ""}.${left_out > 0 ? ` ${left_out} of them have no published figures and are left out of the table.` : ""}`,
      }),
    ];
    const subject = shown[0];
    for (const col of columns) {
      if (!col.ranked) continue;
      const own = subject.values[col.key];
      const all = shown.map((r) => r.values[col.key]).filter((v): v is number => v !== null);
      const r = rankAmong(own, all);
      if (!r) continue;
      figures.push(
        figure({
          key: `rank_${col.key}`,
          label: `${col.label}: position among these suburbs`,
          value: `${r.position} of ${r.of}`,
          unit: UNIT.rank,
          chip: "Estimated",
          source_ids: col.source_ids,
          as_of: col.as_of,
          note: `Derived: this suburb's value ranked from highest to lowest among this suburb and the adjacent suburbs that have a value (${r.of} in all). A place in a list, not a score. It is not combined with any other measure.`,
        }),
      );
    }

    return {
      status: "ok",
      figures,
      payload: {
        sal_code: sal,
        dwelling_family: family,
        neighbour_count: total,
        total_neighbours: total,
        left_out,
        table: {
          columns: columns.map((c) => ({ key: c.key, label: c.label, unit: c.unit, chip: c.chip, source_ids: c.source_ids, as_of: c.as_of, note: c.note })),
          rows: shown.map((r) => ({ sal_code: r.sal_code, name: r.name, is_subject: r.is_subject, values: r.values, thin: r.thin })),
        },
      },
    };
  },
};
