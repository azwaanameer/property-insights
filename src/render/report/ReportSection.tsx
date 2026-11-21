import type { LayerResult } from "../../server/contracts/layer";
import { PROFILE_HEADING, REPORT, SECTION_QUESTIONS } from "../../site/copy";
import { FigureTile } from "./FigureTile";
import { LockCard } from "./LockCard";
import { BuildingPanel, SchoolsPanel, SupplyPanel, TransportPanel } from "./LocationPanels";
import { AttributionList, ScreenerTable } from "./NearbyPanels";
import { QuestionsList } from "./QuestionsList";
import { RatingPanel } from "./RatingPanel";
import { ReturnCalculator } from "./ReturnCalculator";
import { CompareTable, HistoryTable } from "./tables";

/** Free; Unlocked only when a paid layer actually returned its content; every other paid layer is still a Full report section. */
function TierChip({ layer }: { layer: LayerResult }) {
  if (layer.tier === "free") return <span className="chip free"><i />{REPORT.free}</span>;
  if (layer.status === "ok") return <span className="chip free"><i />{REPORT.unlocked}</span>;
  return <span className="chip full"><i />{REPORT.fullReport}</span>;
}

const NOTICE: Record<"gap" | "not_covered" | "error", { label: string; cls: string }> = {
  gap: { label: REPORT.gap, cls: "means gapmsg" },
  not_covered: { label: REPORT.notCovered, cls: "means gapmsg" },
  error: { label: REPORT.error, cls: "means errmsg" },
};

/** The tables a figure list cannot carry. They read the payload only, and only for layers that are ok. */
function Extras({ layer }: { layer: LayerResult }) {
  if (layer.layer_id === "L07-history") return <HistoryTable payload={layer.payload} />;
  if (layer.layer_id === "L09-suburb-compare") return <CompareTable payload={layer.payload} />;
  if (layer.layer_id === "L05-return") return <ReturnCalculator payload={layer.payload} />;
  if (layer.layer_id === "L15-conditions") return <RatingPanel payload={layer.payload} />;
  if (layer.layer_id === "L13-questions") return <QuestionsList payload={layer.payload} />;
  if (layer.layer_id === "L16-transport") return <TransportPanel payload={layer.payload} />;
  if (layer.layer_id === "L17-schools") return <SchoolsPanel payload={layer.payload} />;
  if (layer.layer_id === "L11-building") return <BuildingPanel payload={layer.payload} />;
  if (layer.layer_id === "L08-supply") return <SupplyPanel payload={layer.payload} />;
  if (layer.layer_id === "L10-screener") return <ScreenerTable payload={layer.payload} />;
  if (layer.layer_id === "L14-attribution") return <AttributionList payload={layer.payload} />;
  return null;
}

/**
 * One report section. It draws what the layer returned and nothing else: a locked layer gets its teaser and a lock card and
 * never a value (AD-3); gap, not_covered and error layers say why in place and leave every other section alone (AD-9).
 */
export function ReportSection({ layer, pid }: { layer: LayerResult; pid: string }) {
  // L15 outside the validated scope is a descriptive profile, and its heading says so (AD-5).
  const profile = layer.layer_id === "L15-conditions" && layer.payload.mode === "profile";
  const heading = profile ? PROFILE_HEADING : (SECTION_QUESTIONS[layer.layer_id] ?? layer.title);
  return (
    <section className="rsec" id={`r-${layer.layer_id}`} data-layer={layer.layer_id} data-status={layer.status} aria-labelledby={`h-${layer.layer_id}`}>
      <div className="sh">
        <h2 id={`h-${layer.layer_id}`}>{heading}</h2>
        <TierChip layer={layer} />
      </div>
      {layer.status === "locked" ? (
        <LockCard teaser={layer.teaser ?? ""} pid={pid} />
      ) : (
        <>
          {layer.figures.length > 0 && (
            <div className="tg">
              {layer.figures.map((f) => (
                <FigureTile key={f.key} figure={f} />
              ))}
            </div>
          )}
          {layer.status !== "ok" && (
            <p className={NOTICE[layer.status].cls} role="note">
              <b>{NOTICE[layer.status].label}.</b> {layer.message}
            </p>
          )}
          {layer.status === "ok" && <Extras layer={layer} />}
        </>
      )}
    </section>
  );
}
