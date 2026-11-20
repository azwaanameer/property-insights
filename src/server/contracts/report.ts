// AD-2: one ReportModel, rendered by the web page and later the PDF. Render code never queries data.
import { z } from "zod";
import { LayerResult } from "./layer";
import { ResolvedAddress } from "./address";

export const ReportHeader = z.object({
  title: z.string(),
  subtitle: z.string(),
  /** Set when the match is building-only: "Matched to building only ...". */
  match_note: z.string().nullable(),
});

export const ReportModel = z.object({
  report_version: z.literal(1),
  request_id: z.string(),
  generated_at: z.string(),
  reader_view: z.enum(["investor"]),
  address: ResolvedAddress,
  header: ReportHeader,
  layers: z.array(LayerResult),
});
export type ReportModel = z.infer<typeof ReportModel>;
