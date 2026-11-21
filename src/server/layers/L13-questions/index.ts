// L13 Questions: what to ask next. A synthesis layer (AD-1): it runs after the other layers and reads their RESULTS (`ctx.siblings`),
// never calling them. Every question either names the report fact that triggered it, with that fact's evidence chip, or is marked
// "standard". It invents no fact: a sibling that did not run, is locked, or has a gap simply triggers nothing.
// The thresholds below only decide when a Census share is worth a question; they are not claims about any market.
import type { Chip, Figure, LayerResult } from "../../contracts/layer";
import type { LayerDef, LayerRunOutput } from "../types";
import { dwellingFamily, percentText } from "../shared/derive";

export const L13_SOURCE_IDS = ["gnaf", "vgv_medians", "homes_victoria_rents", "abs_census_2021", "conditions_rating"];

/** A suburb where fewer than this share of households own their home is worth asking about the building's owners. */
export const LOW_OWNER_SHARE = 0.5;
/** A suburb with at least this share of private dwellings unoccupied on Census night is worth asking about empty and short-stay homes. */
export const HIGH_UNOCCUPIED_SHARE = 0.1;
/** The conditions rating's fourth and bottom fifths are worth a question about the building. */
export const WEAK_FIFTH = 4;

export type Ask = "agent" | "conveyancer" | "owners corporation" | "property manager" | "building inspector";

export interface Trigger {
  /** The report fact, in words. */
  text: string;
  layer_id: string;
  figure_key: string | null;
  chip: Chip;
  source_ids: string[];
  as_of: string | null;
}

export interface Question {
  id: string;
  question: string;
  why: string;
  ask: Ask;
  /** True when the question is asked of every report of this kind, not prompted by a fact in it. */
  standard: boolean;
  trigger: Trigger | null;
}

const asObj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** What this layer may read of a sibling: only a layer that ran (ok or gap) and only its figures and payload. */
class Sibling {
  constructor(private readonly result: LayerResult | undefined) {}
  get status() {
    return this.result?.status;
  }
  get ran() {
    return this.result?.status === "ok" || this.result?.status === "gap";
  }
  get payload(): Record<string, unknown> {
    return this.ran ? asObj(this.result?.payload) : {};
  }
  fig(key: string): Figure | null {
    return this.ran ? (this.result!.figures.find((f) => f.key === key) ?? null) : null;
  }
  num(key: string): number | null {
    return num(this.fig(key)?.value);
  }
}

function triggerFrom(layer_id: string, f: Figure | null, text: string, fallback: { chip: Chip; source_ids: string[]; as_of: string | null }): Trigger {
  return { text, layer_id, figure_key: f?.key ?? null, chip: f?.chip ?? fallback.chip, source_ids: f?.source_ids ?? fallback.source_ids, as_of: f ? f.as_of : fallback.as_of };
}

export function buildQuestions(siblings: LayerResult[], family: "unit" | "house"): Question[] {
  const by = (id: string) => new Sibling(siblings.find((s) => s.layer_id === id));
  const L01 = by("L01-property");
  const L03 = by("L03-price");
  const L05 = by("L05-return");
  const L15 = by("L15-conditions");
  const noun = family === "unit" ? "unit" : "house";
  const triggered: Question[] = [];
  const add = (q: Omit<Question, "standard">) => triggered.push({ ...q, standard: false });

  // ---- facts about the match
  if (L01.payload.unit_claims_suppressed === true) {
    const f = L01.fig("unit");
    add({
      id: "match-unit",
      question: "Which lot is for sale, and can you confirm its lot number, level and owners corporation plan number?",
      why: "The report could match the building but not the unit, so nothing here is specific to your unit.",
      ask: "agent",
      // L01 has a `unit` figure only when a unit was asked for and not found.
      trigger: triggerFrom("L01-property", f, f ? "Matched to building only: the unit was not found in the national address file." : "A multi-unit building address was given without a unit, so nothing here is specific to one unit.", { chip: "Unknown", source_ids: ["gnaf"], as_of: L01.fig("address")?.as_of ?? null }),
    });
  }

  // ---- facts about price and rent
  // A gap from L05 that names its dwelling family found neither a price nor a rent: both are missing. (A suburb-not-matched gap names neither.)
  const neither = L05.status === "gap" && typeof L05.payload.dwelling_family === "string";
  const needs = neither ? ["price", "rent"] : Array.isArray(L05.payload.needs_input) ? (L05.payload.needs_input as unknown[]) : [];
  if (needs.includes("rent")) {
    add({
      id: "rent-missing",
      question: "What weekly rent could this home achieve, and what is that figure based on?",
      why: "No median rent is published for this size of home in this suburb, so the calculator has no rent to start from.",
      ask: "property manager",
      trigger: triggerFrom("L05-return", L05.fig("weekly_rent"), "No median rent is published for this size of home in this suburb.", { chip: "Unknown", source_ids: ["homes_victoria_rents"], as_of: null }),
    });
  }
  if (needs.includes("price")) {
    add({
      id: "price-missing",
      question: "What price is the seller expecting, and which recent sales of similar homes support it?",
      why: "No median price is published for this kind of home in this suburb, so the calculator has no price to start from.",
      ask: "agent",
      trigger: triggerFrom("L05-return", L05.fig("median_price"), `No median ${noun} price is published for this suburb.`, { chip: "Unknown", source_ids: ["vgv_medians"], as_of: null }),
    });
  }
  if (L05.payload.rent_thin === true) {
    const n = num(L05.payload.lettings_count);
    add({
      id: "rent-thin",
      question: "How many comparable lettings is the rent estimate based on, and what is the current or appraised rent for this home?",
      why: "A median resting on few lettings can move a lot from one lease.",
      ask: "property manager",
      trigger: triggerFrom("L05-return", L05.fig("weekly_rent"), `The suburb median rent rests on ${n === null ? "few" : n} new lettings.`, { chip: "Estimated", source_ids: ["homes_victoria_rents"], as_of: null }),
    });
  }
  if (L05.payload.price_thin === true) {
    const n = num(L05.payload.sales_count);
    add({
      id: "price-thin",
      question: "Which recent sales of similar homes nearby is the asking price compared with?",
      why: "A median resting on few sales can move a lot from one sale.",
      ask: "agent",
      trigger: triggerFrom("L05-return", L05.fig("median_price"), `The suburb median price rests on ${n === null ? "few" : n} sales.`, { chip: "Estimated", source_ids: ["vgv_medians"], as_of: null }),
    });
  }
  const change = L03.num(`${noun}_price_change_1y`);
  if (change !== null && change < 0) {
    add({
      id: "price-fell",
      question: `What have ${family === "unit" ? "apartments in this building" : "homes on this street"} sold for over the past year, compared with the suburb median?`,
      why: "The suburb median price fell over the past year. That is a past change in a suburb, and it may not match this home.",
      ask: "agent",
      trigger: triggerFrom("L03-price", L03.fig(`${noun}_price_change_1y`), `The suburb median ${noun} price fell ${percentText(change)} over the past year.`, { chip: "Estimated", source_ids: ["vgv_medians"], as_of: null }),
    });
  }
  const growth = L05.num("price_cagr_5y");
  if (growth !== null && growth < 0) {
    add({
      id: "price-history",
      question: "What did this home, or the last comparable sale in the building or street, sell for five years ago?",
      why: "The suburb median price is lower than it was five years earlier. That is history only, and it may not match this home.",
      ask: "agent",
      trigger: triggerFrom("L05-return", L05.fig("price_cagr_5y"), `The suburb median ${noun} price fell by an average of ${percentText(growth)} a year over five years.`, { chip: "Estimated", source_ids: ["vgv_medians"], as_of: null }),
    });
  }
  const gy = L05.num("gross_yield");
  if (gy !== null) {
    add({
      id: "yield-costs",
      question: `What are the yearly council rates, water charges and ${family === "unit" ? "owners corporation fees" : "insurance"} for this home, so I can turn the gross yield into a net one?`,
      why: "The yield in this report is before any costs.",
      ask: "agent",
      trigger: triggerFrom("L05-return", L05.fig("gross_yield"), `The suburb gross yield is ${percentText(gy)} before any costs.`, { chip: "Estimated", source_ids: ["vgv_medians", "homes_victoria_rents"], as_of: null }),
    });
  }

  // ---- facts about the suburb's Census conditions (units only: the questions are about a building)
  const rating = asObj(L15.payload.rating);
  const fifth = num(rating.fifth);
  if (family === "unit" && L15.payload.mode === "rating" && fifth !== null && fifth >= WEAK_FIFTH) {
    add({
      id: "conditions-weak",
      question: "What share of the apartments in this building are lived in by their owners, and how many are empty or let short-term?",
      why: "The conditions rating leans on owner share, flat share and unoccupied dwellings, and a lower fifth is a reason to ask about the building itself. It describes the suburb, not this building.",
      ask: "owners corporation",
      trigger: triggerFrom("L15-conditions", L15.fig("conditions_fifth"), `The conditions rating places this suburb in the ${String(rating.fifth_label ?? "lower").toLowerCase()} of ${num(rating.of) ?? "the"} rated suburbs.`, { chip: "Estimated", source_ids: ["conditions_rating", "abs_census_2021", "vgv_medians"], as_of: null }),
    });
  }
  const owner = L15.num("owner_share");
  if (family === "unit" && owner !== null && owner < LOW_OWNER_SHARE) {
    add({
      id: "owners-low",
      question: "Who owns the apartments in this building: how many are owner-occupied, and how many are investor-owned?",
      why: "Fewer than half of the households in this suburb own their home. That describes the suburb, not this building.",
      ask: "owners corporation",
      trigger: triggerFrom("L15-conditions", L15.fig("owner_share"), `${percentText(owner)} of households in the suburb own their home (2021 Census).`, { chip: "Observed", source_ids: ["abs_census_2021"], as_of: null }),
    });
  }
  const unocc = L15.num("unoccupied_share");
  if (family === "unit" && unocc !== null && unocc >= HIGH_UNOCCUPIED_SHARE) {
    add({
      id: "unoccupied-high",
      question: "How many apartments in this building sit empty or are used for short stays, and what do the owners corporation rules say about short stays?",
      why: "A high share of dwellings in the suburb were unoccupied on Census night. That describes the suburb, not this building, and the report does not check whether short stays are allowed.",
      ask: "owners corporation",
      trigger: triggerFrom("L15-conditions", L15.fig("unoccupied_share"), `${percentText(unocc)} of private dwellings in the suburb were unoccupied on Census night (2021 Census).`, { chip: "Observed", source_ids: ["abs_census_2021"], as_of: null }),
    });
  }

  // ---- standard questions: asked of every report of this kind
  const standard: Omit<Question, "standard" | "trigger">[] = [
    { id: "std-sales", question: "What have comparable homes sold for in the last six months, and which sales is the asking price compared with?", why: "A suburb median cannot tell you what this home is worth.", ask: "agent" },
    { id: "std-tenancy", question: "Is it tenanted? If so, what is the current rent, when does the lease end, and what is the bond?", why: "The rent in this report is a suburb median, not this home's rent.", ask: "agent" },
    { id: "std-contract", question: "Can I see the contract of sale and the vendor's statement (section 32) before I make an offer?", why: "Title, easements, rates and approvals are not in this report.", ask: "conveyancer" },
    ...(family === "unit"
      ? [
          { id: "std-oc", question: "Can I see the owners corporation certificate, minutes, insurance and any building defect or maintenance reports?", why: "Fees, special levies and the state of the building are not in this report.", ask: "owners corporation" as Ask },
          { id: "std-shortstay", question: "Do the owners corporation rules allow short stays, and are any apartments used that way?", why: "This report does not check whether short stays are allowed in the building.", ask: "owners corporation" as Ask },
        ]
      : [{ id: "std-block", question: "Are there easements, planning overlays or planned works that affect this block?", why: "Overlays and easements are not covered in this report.", ask: "conveyancer" as Ask }]),
    { id: "std-inspection", question: "Which inspections should I book before I sign: building, pest and, for a unit, the common areas?", why: "A report built from public data cannot see the condition of the home.", ask: "building inspector" },
  ];
  return [...triggered, ...standard.map((q) => ({ ...q, standard: true, trigger: null }))];
}

export const L13Questions: LayerDef = {
  layer_id: "L13-questions",
  title: "Questions",
  tier: "free",
  synthesis: true,
  source_ids: L13_SOURCE_IDS,
  teaser: "The questions this report suggests you take to the agent, the conveyancer and the owners corporation.",
  async run({ address, siblings }): Promise<LayerRunOutput> {
    const family = dwellingFamily(address);
    const questions = buildQuestions(siblings ?? [], family);
    const prompted = questions.filter((q) => !q.standard).length;
    return {
      status: "ok",
      figures: [],
      payload: { dwelling_family: family, prompted_count: prompted, standard_count: questions.length - prompted, questions },
    };
  },
};
