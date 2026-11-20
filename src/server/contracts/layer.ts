// AD-1: one layer contract. Every report section returns a LayerResult.
import { z } from "zod";

export const Chip = z.enum(["Observed", "Estimated", "Unknown", "Conflict"]);
export type Chip = z.infer<typeof Chip>;

export const LayerTier = z.enum(["free", "paid"]);
export type LayerTier = z.infer<typeof LayerTier>;

export const LayerStatus = z.enum(["ok", "locked", "gap", "error", "not_covered"]);
export type LayerStatus = z.infer<typeof LayerStatus>;

/** Market tier from OVERVIEW section 9: A = VIC (full), B = SA, C = NSW/QLD/TAS, D = WA/ACT/NT. */
export const MarketTier = z.enum(["A", "B", "C", "D"]);
export type MarketTier = z.infer<typeof MarketTier>;

export const MatchType = z.enum(["unit", "building"]);
export type MatchType = z.infer<typeof MatchType>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO 8601 date");

/** One displayed fact. Money is integer cents with unit "AUD_cents"; rates are fractions. */
export const Figure = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  unit: z.string().optional(),
  chip: Chip,
  source_ids: z.array(z.string()).min(1),
  as_of: IsoDate.nullable(),
  note: z.string().optional(),
});
export type Figure = z.infer<typeof Figure>;

export const Coverage = z.object({
  market_tier: MarketTier,
  match_type: MatchType,
});
export type Coverage = z.infer<typeof Coverage>;

export const LayerResult = z
  .object({
    layer_id: z.string().min(1),
    title: z.string().min(1),
    tier: LayerTier,
    status: LayerStatus,
    coverage: Coverage,
    figures: z.array(Figure),
    payload: z.record(z.unknown()),
    /** Hand-written headline sentence for a locked layer. Never contains a figure value. */
    teaser: z.string().optional(),
    /** For gap, error and not_covered: what is missing and the next step. */
    message: z.string().optional(),
  })
  .superRefine((r, ctx) => {
    // AD-3: locked data does not leave the server.
    if (r.status === "locked") {
      if (r.figures.length > 0) ctx.addIssue({ code: "custom", message: "locked layer must have no figures", path: ["figures"] });
      if (Object.keys(r.payload).length > 0) ctx.addIssue({ code: "custom", message: "locked layer must have an empty payload", path: ["payload"] });
      if (!r.teaser) ctx.addIssue({ code: "custom", message: "locked layer needs a teaser", path: ["teaser"] });
    }
    if ((r.status === "gap" || r.status === "error" || r.status === "not_covered") && !r.message?.trim()) {
      ctx.addIssue({ code: "custom", message: `${r.status} layer needs a message`, path: ["message"] });
    }
    if (r.status !== "ok" && r.status !== "gap" && r.figures.length > 0) {
      ctx.addIssue({ code: "custom", message: `${r.status} layer must have no figures`, path: ["figures"] });
    }
  });
export type LayerResult = z.infer<typeof LayerResult>;
