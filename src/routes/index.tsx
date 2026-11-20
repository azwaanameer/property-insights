import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { AddressCandidate } from "../server/contracts/address";
import type { LayerResult } from "../server/contracts/layer";
import type { ReportModel } from "../server/contracts/report";

export const Route = createFileRoute("/")({ component: SearchPage });

interface ApiFailure {
  error: { code: string; message: string; candidates?: AddressCandidate[] };
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure["error"] }> {
  try {
    const res = await fetch(url, { signal });
    const body = await res.json();
    if (res.ok) return { ok: true, data: body as T };
    // A failure body without an `error` field (proxy page, platform error) still gets a usable message.
    const error = (body as Partial<ApiFailure> | null)?.error;
    return { ok: false, error: error ?? { code: "unknown", message: `The request failed (${res.status}).` } };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { ok: false, error: { code: "network", message: "Could not reach the server." } };
  }
}

/** The unit the user typed ("310/628 ..." or "Unit 5, 12 ..."), so it survives picking a candidate. */
function typedUnit(text: string): string | null {
  const m = text
    .trim()
    .match(/^(?:(?:unit|apt|apartment|suite|flat|shop|u)\s*([a-z]{0,2}\d+[a-z]?)\s*(?:\/|,|\s)|([a-z]{0,2}\d+[a-z]?)\s*\/)\s*\d/i);
  const unit = m?.[1] ?? m?.[2];
  return unit ? unit.toUpperCase() : null;
}

function SearchPage() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<AddressCandidate[]>([]);
  const [report, setReport] = useState<ReportModel | null>(null);
  const [error, setError] = useState<ApiFailure["error"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [unit, setUnit] = useState<string | null>(null);
  const skipSuggest = useRef(false);

  // Debounced suggest as the user types. A newer keystroke aborts the older request, so a late response cannot overwrite newer state.
  useEffect(() => {
    if (skipSuggest.current) {
      skipSuggest.current = false;
      return;
    }
    if (q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await getJson<{ candidates: AddressCandidate[] }>(`/api/v1/address/suggest?q=${encodeURIComponent(q)}`, controller.signal);
        if (r.ok && !controller.signal.aborted) setSuggestions(r.data.candidates);
      } catch {
        /* aborted */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  async function loadReport(pid: string, unit?: string | null) {
    setBusy(true);
    setError(null);
    const url = `/api/v1/property/${encodeURIComponent(pid)}/report${unit ? `?unit=${encodeURIComponent(unit)}` : ""}`;
    const r = await getJson<ReportModel>(url);
    setBusy(false);
    if (r.ok) {
      setReport(r.data);
      setSuggestions([]);
    } else {
      setReport(null);
      setError(r.error);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    const typed = typedUnit(q);
    setUnit(typed);
    const r = await getJson<{ gnaf_pid: string; unit_requested: string | null }>(`/api/v1/address/resolve?q=${encodeURIComponent(q)}`);
    if (r.ok) {
      await loadReport(r.data.gnaf_pid, r.data.unit_requested);
    } else {
      setBusy(false);
      setReport(null);
      setError(r.error);
      setSuggestions(r.error.candidates ?? []);
    }
  }

  return (
    <main>
      <h1>VicProp</h1>
      <p className="muted">Type a Victorian address, for example 310/628 Flinders St Docklands.</p>
      <form className="row" onSubmit={onSubmit}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Address" aria-label="Address" autoComplete="off" />
        <button type="submit" disabled={busy}>Find</button>
      </form>

      {suggestions.length > 0 && (
        <ul className="list">
          {suggestions.map((c) => (
            <li key={c.gnaf_pid}>
              <button
                type="button"
                onClick={() => {
                  skipSuggest.current = true;
                  setQ(c.display_address);
                  void loadReport(c.gnaf_pid, unit ?? typedUnit(q));
                }}
              >
                {c.display_address}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="err" role="alert">{error.message}</div>}

      {report && (
        <section aria-label="Report">
          <div className="card">
            <h2>{report.header.title}</h2>
            <div className="muted">{report.header.subtitle}</div>
            <div className="muted">Match: {report.address.match} - market tier {report.address.tier}</div>
            {report.header.match_note && <div className="note">{report.header.match_note}</div>}
          </div>
          {report.layers.map((layer) => (
            <LayerCard key={layer.layer_id} layer={layer} />
          ))}
        </section>
      )}
    </main>
  );
}

function LayerCard({ layer }: { layer: LayerResult }) {
  return (
    <div className="card">
      <h2>
        {layer.title} <span className="muted">({layer.tier})</span>
      </h2>
      {layer.status === "locked" && (
        <>
          <p>{layer.teaser}</p>
          {/* Placeholder shape only: nothing real was sent for this layer (AD-3). */}
          <div className="locked" aria-hidden="true">
            <dl><dt>-----</dt><dd>-------- ---</dd><dt>----</dt><dd>----------</dd></dl>
          </div>
        </>
      )}
      {(layer.status === "gap" || layer.status === "error" || layer.status === "not_covered") && (
        <p className="muted">{layer.message}</p>
      )}
      {layer.figures.length > 0 && (
        <dl>
          {layer.figures.map((f) => (
            <FigureRow key={f.key} f={f} />
          ))}
        </dl>
      )}
    </div>
  );
}

function FigureRow({ f }: { f: LayerResult["figures"][number] }) {
  return (
    <>
      <dt>{f.label}</dt>
      <dd>
        {f.value === null ? "Unknown" : String(f.value)}
        <span className={`chip ${f.chip}`}>{f.chip}</span>
        {f.note && <div className="muted">{f.note}</div>}
        <div className="muted">{f.source_ids.join(", ")}{f.as_of ? `, as of ${f.as_of}` : ""}</div>
      </dd>
    </>
  );
}
