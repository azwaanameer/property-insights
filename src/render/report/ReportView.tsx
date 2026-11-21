import type { ReportModel } from "../../server/contracts/report";
import { AddressSearch } from "../../site/AddressSearch";
import { REPORT } from "../../site/copy";
import { formatMelbourneDate } from "../format";
import { ReportSection } from "./ReportSection";
import { UnlockBar } from "./UnlockBar";

/** The report page body. Pure rendering of a ReportModel: no fetching, no figures worked out here (AD-2). */
export function ReportView({ model }: { model: ReportModel }) {
  const pid = model.address.gnaf_pid;
  const anyLocked = model.layers.some((l) => l.status === "locked");
  const unit = model.address.match === "unit";
  return (
    <div className="wrap rwrap">
      <a className="back" href="/">{REPORT.back}</a>
      <header className="rhead">
        <div className="rh-copy">
          <span className={unit ? "chip obs" : "chip est"}>
            <i />
            {unit ? REPORT.matchedUnit : REPORT.matchedBuilding}
          </span>
          <h1>{model.header.title}</h1>
          <p className="sub">{model.header.subtitle}</p>
          {model.header.match_note && <p className="means gapmsg" role="note">{model.header.match_note}</p>}
          <div className="rh-chips">
            <span className="chip unk"><i />{REPORT.generatedOn} {formatMelbourneDate(model.generated_at)}</span>
          </div>
        </div>
      </header>
      {model.layers.map((layer) => (
        <ReportSection key={layer.layer_id} layer={layer} pid={pid} />
      ))}
      {anyLocked && <UnlockBar pid={pid} />}
    </div>
  );
}

/** A message in place of a report (not covered, not found, failed), with a search box so the visitor can carry on. */
export function ReportMessage({
  title,
  message,
  kind,
  onRetry,
}: {
  title: string;
  message: string;
  kind: "not_covered" | "not_found" | "failed";
  /** Failed view only: reload the same report. */
  onRetry?: () => void;
}) {
  return (
    <div className="wrap nfwrap" data-view={kind}>
      <div className="nf">
        <a className="back" href="/">{REPORT.back}</a>
        <h1>{title}</h1>
        <p role="alert">{message}</p>
        {kind === "failed" && onRetry && (
          <button className="btn" type="button" onClick={onRetry}>{REPORT.retry}</button>
        )}
        <AddressSearch idPrefix="nf" />
      </div>
    </div>
  );
}
