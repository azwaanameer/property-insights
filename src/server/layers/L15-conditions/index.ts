// L15 Conditions: how the suburb's Census conditions compare, and a rating only where the rating has been tested (AD-5).
//
// The switch is table market_validation (state, dwelling type): the rating is returned only when its status is `validated` (today
// Victorian units). Its test result, windows and date are read from that row, never written here. Everywhere else the layer returns a
// descriptive profile (owner, flat and unoccupied shares) labelled "descriptive, not a rating", with no score, fifth or position.
// The rating is always labelled a conditions rating, not a price forecast (AD-10). It is free for now: see migration 0006.
import type { Figure } from "../../contracts/layer";
import { getRating } from "../../repos/rating";
import { getMarketValidation } from "../../repos/source";
import { CENSUS_SOURCE, listMarkers } from "../../repos/suburb";
import type { LayerDef, LayerRunOutput } from "../types";
import { dwellingFamily } from "../shared/derive";
import { figure, gapFigure, SUBURB_NOT_MATCHED_MESSAGE, UNIT } from "../shared/figures";

// The rating rests on Valuer-General data too (which suburbs have a unit price history, and the backtest), so L15 depends on that source.
export const L15_SOURCE_IDS = ["conditions_rating", CENSUS_SOURCE, "vgv_medians"];
const RATING_SOURCE = "conditions_rating";

/** A suburb needs at least this many private dwellings to be rated. Mirrors pipeline/derive/rating.mjs (a test keeps them equal). */
export const MIN_DWELLINGS = 300;

export const RATING_LABEL = "Conditions rating, not a price forecast";
export const FIFTH_LABELS = ["Top fifth", "Second fifth", "Middle fifth", "Fourth fifth", "Bottom fifth"] as const;

const SHARES = [
  { key: "owner_share", label: "Households that own their home", note: "2021 Census: owned outright or with a mortgage, out of owned and rented." },
  { key: "flat_share", label: "Households in flats or apartments", note: "2021 Census." },
  { key: "unoccupied_share", label: "Private dwellings unoccupied on Census night", note: "2021 Census: private dwellings with nobody at home on Census night." },
] as const;
type ShareKey = (typeof SHARES)[number]["key"];

const STATE_ADJECTIVE: Record<string, string> = { VIC: "Victorian" };

export const PROFILE_NOTE =
  "Descriptive, not a rating. These are Census facts about the suburb. The conditions rating is shown only for kinds of home and states where it has passed a test on past data, and this is not one of them.";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export const L15Conditions: LayerDef = {
  layer_id: "L15-conditions",
  title: "Conditions",
  tier: "free",
  source_ids: L15_SOURCE_IDS,
  // The rating dataset is read only inside the validated scope, so a missing one is a "not rated" gap, not a reason to hide the profile.
  dataset_ids: [CENSUS_SOURCE],
  teaser: "How the suburb's Census conditions compare, and where the conditions rating applies.",
  async run({ db, address }): Promise<LayerRunOutput> {
    const sal = address.sal_code;
    if (!sal) return { status: "gap", figures: [], payload: {}, message: SUBURB_NOT_MATCHED_MESSAGE };

    const family = dwellingFamily(address);
    const census = await listMarkers(db, CENSUS_SOURCE, [sal], [...SHARES.map((s) => s.key), "dwellings"]);
    if (!census) return { status: "gap", figures: [], payload: {}, message: "Census figures are not loaded." };
    const m = census.markers.get(sal) ?? {};
    const src = [CENSUS_SOURCE];

    const shareFigures: Figure[] = SHARES.map((s) =>
      m[s.key]
        ? figure({ key: s.key, label: s.label, value: m[s.key].value, unit: UNIT.fraction, chip: "Observed", source_ids: src, as_of: census.as_of, note: s.note })
        : gapFigure({ key: s.key, label: s.label, unit: UNIT.fraction, source_ids: src, as_of: census.as_of, note: "The 2021 Census gives no figure for this suburb." }),
    );
    const profile = Object.fromEntries(SHARES.map((s) => [s.key, m[s.key]?.value ?? null])) as Record<ShareKey, number | null>;
    const base = { sal_code: sal, dwelling_family: family, state: address.state, profile };
    const anyShare = Object.values(profile).some((v) => v !== null);

    // AD-5: the only switch. A validated row with no test result is not served: a band never goes out without its test beside it.
    const validation = await getMarketValidation(db, address.state, family);
    if (validation?.status !== "validated" || validation.pairwise_score_low === null || validation.pairwise_score_high === null) {
      if (!anyShare) {
        return { status: "gap", figures: shareFigures, payload: { ...base, mode: "profile" }, message: "The 2021 Census gives no owner, flat or unoccupied figures for this suburb, so there is no profile to show." };
      }
      return { status: "ok", figures: shareFigures, payload: { ...base, mode: "profile", profile_note: PROFILE_NOTE } };
    }

    const found = await getRating(db, sal, family);
    if (!found.rating) {
      const dwellings = m.dwellings?.value;
      const missing = SHARES.filter((s) => !m[s.key]).map((s) => s.label.toLowerCase());
      const reason =
        dwellings !== undefined && dwellings < MIN_DWELLINGS
          ? `the 2021 Census counts only ${Math.round(dwellings)} private dwellings here, and a rating needs at least ${MIN_DWELLINGS}.`
          : missing.length > 0
            ? `the 2021 Census gives no figure for ${missing.join(" or ")}.`
            : !found.published
              ? "the rating has not been published yet."
              : "the Valuer-General has no complete unit price history for this suburb (every year 2015 to 2025), which the rating needs.";
      return { status: "gap", figures: shareFigures, payload: { ...base, mode: "unrated" }, message: `Not rated: ${reason} The Census figures are shown instead.` };
    }

    const { rating } = found;
    const asOf = found.as_of;
    const scope = `${STATE_ADJECTIVE[address.state] ?? address.state} ${family === "unit" ? "apartment" : "house"} suburbs`;
    const low = validation.pairwise_score_low;
    const high = validation.pairwise_score_high;
    const range = low === null || high === null ? null : low === high ? pct(low) : `${pct(low)} to ${pct(high)}`;
    const checked = validation.checked_on;
    const ratingSrc = [RATING_SOURCE, CENSUS_SOURCE, "vgv_medians"];

    const figures: Figure[] = [
      figure({
        key: "conditions_fifth",
        label: "Conditions rating, fifth of rated suburbs",
        value: FIFTH_LABELS[rating.fifth - 1],
        chip: "Estimated",
        source_ids: ratingSrc,
        as_of: asOf,
        note: `Derived: ${rating.of} ${scope} ranked on three 2021 Census markers (more households owning, fewer in flats, fewer unoccupied dwellings). A ${RATING_LABEL.toLowerCase()}.`,
      }),
      figure({
        key: "conditions_position",
        label: "Position among rated suburbs",
        value: `${rating.position} of ${rating.of}`,
        unit: UNIT.rank,
        chip: "Estimated",
        source_ids: ratingSrc,
        as_of: asOf,
        note: "Derived: the suburb's score ranked from highest to lowest among every rated suburb. A place in a list.",
      }),
      ...shareFigures,
    ];
    if (range) {
      figures.push(
        figure({
          key: "rating_test",
          label: "Past test of this rating",
          value: range,
          chip: "Estimated",
          source_ids: [RATING_SOURCE, "vgv_medians"],
          as_of: checked ?? asOf,
          note: `Across ${validation.windows || "the test windows"}, a random suburb from the top fifth grew faster than a random suburb from the bottom fifth in ${range} of pairs. 50% would be a coin flip.${checked ? ` Checked ${checked}.` : ""} A result on past data only.`,
        }),
      );
    }

    return {
      status: "ok",
      figures,
      payload: {
        ...base,
        mode: "rating",
        label: RATING_LABEL,
        scope,
        rating: { fifth: rating.fifth, fifth_label: FIFTH_LABELS[rating.fifth - 1], position: rating.position, of: rating.of },
        validation: { low, high, range, windows: validation.windows, checked_on: checked },
        meta: { chip: "Estimated", source_ids: ratingSrc, as_of: asOf },
      },
    };
  },
};
