// AD-2: assemble the one ReportModel. Web and (later) PDF render from it. Locked layers carry no figures (AD-3).
import type { Principal, ResolvedAddress } from "../contracts/address";
import { ReportModel } from "../contracts/report";
import type { Db } from "../db";
import { LAYERS } from "../layers";
import type { LayerDef } from "../layers/types";
import { listCurrentDatasets } from "../repos/datasets";
import { listLayerConfig, listSources } from "../repos/source";
import { runLayers, type RightsContext } from "./layer-runner";

export interface AssembleInput {
  db: Db;
  address: ResolvedAddress;
  principal: Principal;
  request_id: string;
  /** Overridable for tests; defaults to the registry. */
  layers?: LayerDef[];
  now?: Date;
  timeout_ms?: number;
}

export async function loadRights(db: Db): Promise<RightsContext> {
  const [sources, config, datasets] = await Promise.all([listSources(db), listLayerConfig(db), listCurrentDatasets(db)]);
  return {
    sources: new Map(sources.map((s) => [s.source_id, s])),
    config: new Map(config.map((c) => [c.layer_id, c])),
    datasets: new Set(datasets.map((d) => d.source_id)),
  };
}

export function matchNote(address: ResolvedAddress): string | null {
  if (address.match !== "building") return null;
  // A house (no units under it in G-NAF) is fully described by its property-level address: no note.
  if (!address.is_multi_unit && !address.unit_requested) return null;
  return address.unit_requested
    ? `Matched to building only: unit ${address.unit_requested} is not in G-NAF, so unit-level facts are not shown.`
    : "Matched to building only: no unit was given, so unit-level facts are not shown.";
}

export async function assembleReport(input: AssembleInput): Promise<ReportModel> {
  const { db, address, principal, request_id } = input;
  const rights = await loadRights(db);
  const layers = await runLayers(input.layers ?? LAYERS, { db, address, principal, request_id, rights, timeout_ms: input.timeout_ms });
  return ReportModel.parse({
    report_version: 1,
    request_id,
    generated_at: (input.now ?? new Date()).toISOString(),
    reader_view: "investor",
    address,
    header: {
      title: address.display_address,
      subtitle: `${address.locality} ${address.state}${address.postcode ? ` ${address.postcode}` : ""}`,
      match_note: matchNote(address),
    },
    layers,
  });
}
