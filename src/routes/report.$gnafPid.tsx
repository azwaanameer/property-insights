import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GeneratingState } from "../render/report/Generating";
import { ReportMessage, ReportView } from "../render/report/ReportView";
import { LOAD_FAILED, REPORT } from "../site/copy";
import { loadReport, type ReportLoad } from "../site/report-api";

/** The unit as the API accepts it: 1 to 8 letters and digits. Anything else is dropped. */
function validUnit(unit: string): string | undefined {
  return /^[0-9A-Za-z]{1,8}$/.test(unit) ? unit : undefined;
}

export const Route = createFileRoute("/report/$gnafPid")({
  // The unit the visitor typed rides along in the query so a building-level pid still opens the right flat.
  validateSearch: (search: Record<string, unknown>): { unit?: string } => ({
    unit: typeof search.unit === "string" || typeof search.unit === "number" ? validUnit(String(search.unit)) : undefined,
  }),
  // Address-specific pages stay out of search indexes.
  head: () => ({ meta: [{ title: "Property report | VicProp" }, { name: "robots", content: "noindex" }] }),
  component: ReportPage,
});

function ReportPage() {
  const { gnafPid } = Route.useParams();
  const { unit } = Route.useSearch();
  const [result, setResult] = useState<ReportLoad | null>(null);
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);

  // The report is fetched in the browser so the answer is always the one for this visitor's entitlement (AD-3).
  useEffect(() => {
    setResult(null);
    setProgress(0);
    const controller = new AbortController();
    loadReport(gnafPid, unit ?? null, undefined, controller.signal)
      .then((r) => {
        if (controller.signal.aborted) return;
        setResult(r);
        window.scrollTo(0, 0);
      })
      .catch((err: unknown) => {
        // Only an abort (a newer navigation) is ignored. Anything else is shown, never a screen that spins forever.
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setResult({ kind: "failed", title: LOAD_FAILED.title, message: LOAD_FAILED.text });
      });
    return () => controller.abort();
  }, [gnafPid, unit, attempt]);

  // While waiting, tick the steps along. The last step is never ticked until the report has arrived.
  useEffect(() => {
    if (result) return;
    const last = REPORT.generatingSteps.length - 1;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setProgress(last);
      return;
    }
    const t = setInterval(() => setProgress((p) => Math.min(p + 1, last)), 540);
    return () => clearInterval(t);
  }, [result]);

  if (!result) {
    return (
      <main id="main">
        <div className="wrap rwrap">
          <GeneratingState progress={progress} />
        </div>
      </main>
    );
  }
  return (
    <main id="main">
      {result.kind === "ok" ? <ReportView model={result.model} /> : <ReportMessage kind={result.kind} title={result.title} message={result.message} onRetry={result.kind === "failed" ? () => setAttempt((n) => n + 1) : undefined} />}
    </main>
  );
}
