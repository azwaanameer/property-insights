import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AddressCandidate } from "../server/contracts/address";
import { getJson, pickCandidate, resolveSample, resolveText, type SearchOutcome } from "./address-api";
import { HERO, SAMPLES, SEARCH } from "./copy";
import { Icon } from "./Icon";
import { useOpenReport } from "./open-report";

/** Runs a sample address through the resolve endpoint. A miss is a plain message, never a guess. */
export function useSampleOpener() {
  const open = useOpenReport();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(text: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await resolveSample(text);
      if (r.kind === "open") open(r.pid, r.unit);
      else if (r.kind === "message") setMessage(r.message);
    } catch {
      setMessage(SEARCH.network);
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, run, clear: () => setMessage("") };
}

export function SampleButton({ text, className = "btn alt", children }: { text: string; className?: string; children: ReactNode }) {
  const { busy, message, run } = useSampleOpener();
  return (
    <>
      <button className={className} type="button" disabled={busy} onClick={() => void run(text)}>
        {children}
      </button>
      <span className="msg bad" role="status">{message}</span>
    </>
  );
}

/**
 * The address search: an accessible combobox over the suggest endpoint. Picking a row opens its report; submitting free text
 * asks the resolve endpoint (a unique match opens, several matches become the list, no match is a plain message).
 */
export function AddressSearch({ idPrefix, withSamples = false, autoFocus = false }: { idPrefix: string; withSamples?: boolean; autoFocus?: boolean }) {
  const open = useOpenReport();
  const uid = useId();
  const inputId = `${idPrefix}-${uid}`;
  const listId = `${inputId}-list`;
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<AddressCandidate[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const skipSuggest = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const sample = useSampleOpener();

  // Debounced suggest as the user types. A newer keystroke aborts the older request, so a late answer cannot overwrite newer state.
  useEffect(() => {
    if (skipSuggest.current) {
      skipSuggest.current = false;
      return;
    }
    if (q.replace(/\s/g, "").length < 3) {
      setOptions([]);
      setExpanded(false);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await getJson<{ candidates: AddressCandidate[] }>(`/api/v1/address/suggest?q=${encodeURIComponent(q)}`, controller.signal);
        if (r.ok && !controller.signal.aborted) {
          setOptions(r.data.candidates);
          setExpanded(r.data.candidates.length > 0);
          setActive(-1);
        }
      } catch {
        /* aborted */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  // Close the list when focus or a click leaves the form.
  useEffect(() => {
    function away(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) setExpanded(false);
    }
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, []);

  function apply(outcome: SearchOutcome) {
    if (outcome.kind === "open") {
      setMessage("");
      setExpanded(false);
      open(outcome.pid, outcome.unit);
    } else if (outcome.kind === "choose") {
      skipSuggest.current = false;
      setOptions(outcome.candidates);
      setExpanded(true);
      setActive(-1);
      setBad(false);
      setMessage(outcome.message);
    } else {
      setOptions([]);
      setExpanded(false);
      setBad(true);
      setMessage(outcome.message);
    }
  }

  function choose(c: AddressCandidate) {
    // Only skip the next suggest when the text really changes; otherwise no effect runs and the skip would eat a later keystroke.
    if (c.display_address !== q) skipSuggest.current = true;
    setQ(c.display_address);
    // The unit is read from what was typed before the row replaced it.
    apply(pickCandidate(c, q));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBad(false);
    if (!q.trim()) {
      setBad(true);
      setMessage(SEARCH.empty);
      return;
    }
    setBusy(true);
    setMessage(SEARCH.busy);
    try {
      apply(await resolveText(q));
    } catch {
      apply({ kind: "message", message: SEARCH.network });
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setExpanded(false);
      return;
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && options.length > 0 && !expanded) {
      // After Escape the list is closed but still loaded: an arrow key brings it back.
      e.preventDefault();
      setExpanded(true);
      setActive(e.key === "ArrowDown" ? 0 : options.length - 1);
      return;
    }
    if (!expanded || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(options[active]);
    }
  }

  const shown = expanded && options.length > 0;
  const status = message || sample.message;
  return (
    <form className="af" autoComplete="off" noValidate onSubmit={onSubmit} ref={formRef}>
      <label className="vh" htmlFor={inputId}>{SEARCH.label}</label>
      <div className="row">
        <div className="field">
          <Icon name="search" />
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={shown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
            placeholder={SEARCH.placeholder}
            value={q}
            autoFocus={autoFocus}
            onChange={(e) => {
              setQ(e.target.value);
              setMessage("");
              sample.clear();
            }}
            onKeyDown={onKeyDown}
          />
          <ul className="sugg" role="listbox" id={listId} aria-label="Address suggestions" hidden={!shown}>
            {shown &&
              options.map((c, i) => (
                <li
                  key={c.gnaf_pid}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(c);
                  }}
                >
                  <span>{c.display_address}</span>
                </li>
              ))}
          </ul>
        </div>
        <button className="btn" type="submit" disabled={busy}>{SEARCH.submit}</button>
      </div>
      <div className={bad || (!message && sample.message) ? "msg bad" : "msg"} role="status">{status}</div>
      {withSamples && (
        <div className="try">
          <span>{HERO.trySample}</span>
          <button type="button" disabled={sample.busy} onClick={() => void sample.run(SAMPLES.house.text)}>{SAMPLES.house.button}</button>
          <button type="button" disabled={sample.busy} onClick={() => void sample.run(SAMPLES.flat.text)}>{SAMPLES.flat.button}</button>
        </div>
      )}
    </form>
  );
}
