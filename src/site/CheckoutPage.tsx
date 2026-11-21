import { useEffect, useState, type FormEvent } from "react";
import { ReportMessage } from "../render/report/ReportView";
import { loadCheckoutInfo, orderTotals, startPurchase, type CheckoutInfo, type InfoLoad, type PlanChoice } from "./checkout-api";
import { CHECKOUT, LOAD_FAILED, NOT_COVERED, NOT_FOUND } from "./copy";

export interface CheckoutViewProps {
  info: CheckoutInfo;
  plan: PlanChoice;
  email: string;
  busy: boolean;
  /** A plain message in place under the form, or "". */
  error: string;
  /** Set once a start attempt was refused for a reason the buyer cannot fix. */
  blocked: "not_configured" | "nothing_to_unlock" | null;
  onPlan: (plan: PlanChoice) => void;
  onEmail: (email: string) => void;
  onSubmit: () => void;
}

/** The checkout page body. Pure rendering: every price comes from the server's price sheet, nothing is worked out here but the total's text. */
export function CheckoutView(p: CheckoutViewProps) {
  const { info, plan } = p;
  const dev = info.provider === "dev";
  const notConfigured = info.provider === null || p.blocked === "not_configured";
  const nothing = !info.payable || p.blocked === "nothing_to_unlock";
  const cannotBuy = notConfigured || nothing;
  const totals = orderTotals(info, plan);
  const line = plan === "one" ? CHECKOUT.oneLine(info.display_address) : CHECKOUT.proLine;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!p.busy && !cannotBuy) p.onSubmit();
  }

  return (
    <div className="wrap ckwrap">
      <a className="back" href={`/report/${encodeURIComponent(info.gnaf_pid)}`}>{CHECKOUT.back}</a>
      <div className="kick">{CHECKOUT.kicker}</div>
      <h1 className="ckh">{CHECKOUT.title}</h1>
      <p className="sub">{info.display_address}</p>
      {dev && (
        <div className="devban" role="note">
          <b>{CHECKOUT.devBanner}</b>
          <span>{CHECKOUT.devBannerText}</span>
        </div>
      )}
      {notConfigured && <p className="means errmsg" role="alert">{CHECKOUT.notConfigured}</p>}
      {!notConfigured && nothing && <p className="means gapmsg" role="alert">{CHECKOUT.nothingToUnlock}</p>}
      <div className="ck-grid">
        <form className="ckform" onSubmit={submit} noValidate>
          <fieldset disabled={cannotBuy}>
            <legend>{CHECKOUT.planLegend}</legend>
            <label className={plan === "one" ? "opt on" : "opt"}>
              <input type="radio" name="plan" value="one" checked={plan === "one"} onChange={() => p.onPlan("one")} />
              <span>
                <b>{CHECKOUT.one.name}</b>
                <small>{CHECKOUT.one.detail(info.prices.one.days)}</small>
              </span>
              <em>{orderTotals(info, "one").total}</em>
            </label>
            <label className={plan === "pro" ? "opt on" : "opt"}>
              <input type="radio" name="plan" value="pro" checked={plan === "pro"} onChange={() => p.onPlan("pro")} />
              <span>
                <b>{CHECKOUT.pro.name}</b>
                <small>{CHECKOUT.pro.detail}</small>
              </span>
              <em>{orderTotals(info, "pro").total}</em>
            </label>
            <label className="ckfield">
              <span>{CHECKOUT.emailLabel}</span>
              <input type="email" name="email" autoComplete="email" inputMode="email" required maxLength={254} value={p.email} onChange={(e) => p.onEmail(e.target.value)} aria-describedby="ck-email-help" />
              <small id="ck-email-help">{CHECKOUT.emailHelp}</small>
            </label>
            <button className="btn" type="submit" disabled={p.busy || cannotBuy}>{p.busy ? CHECKOUT.busy : dev ? CHECKOUT.submitDev : CHECKOUT.submit}</button>
            <p className="msg bad" role="alert">{p.error}</p>
          </fieldset>
        </form>
        <aside className="sumry" aria-label={CHECKOUT.summaryTitle}>
          <h2>{CHECKOUT.summaryTitle}</h2>
          <div className="srow"><span>{line}</span><b>{totals.total}</b></div>
          <div className="srow tot"><span>{CHECKOUT.total} ({info.prices.currency})</span><b>{totals.total}</b></div>
          <p className="gst">{CHECKOUT.gstIncluded(totals.gst)}</p>
          <p className="refund">{CHECKOUT.refund}</p>
        </aside>
      </div>
    </div>
  );
}

/** Loads the order, then runs the form. A purchase starts only from the buyer pressing the button. */
export function CheckoutPage({ pid, unit, initialPlan }: { pid: string; unit?: string; initialPlan: PlanChoice }) {
  const [load, setLoad] = useState<InfoLoad | null>(null);
  const [plan, setPlan] = useState<PlanChoice>(initialPlan);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<CheckoutViewProps["blocked"]>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoad(null);
    const controller = new AbortController();
    loadCheckoutInfo(pid, unit ?? null, undefined, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setLoad(r);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setLoad({ kind: "failed", message: LOAD_FAILED.text });
      });
    return () => controller.abort();
  }, [pid, unit, attempt]);

  // Back from the provider's page restores this page from the browser's cache with busy still set: let the buyer try again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function submit() {
    setBusy(true);
    setError("");
    const out = await startPurchase({ pid, unit, email, plan });
    if (out.kind === "redirect") {
      // The page stays busy while the browser leaves: a second press cannot start a second purchase.
      window.location.assign(out.url);
      return;
    }
    setBusy(false);
    setError(out.message);
    if (out.blocked) setBlocked(out.blocked);
  }

  if (!load) {
    return (
      <main id="main">
        <div className="wrap ckwrap"><p className="msg" role="status">{CHECKOUT.loading}</p></div>
      </main>
    );
  }
  if (load.kind !== "ok") {
    const kind = load.kind === "not_covered" ? "not_covered" : load.kind === "not_found" ? "not_found" : "failed";
    const title = kind === "not_covered" ? NOT_COVERED.title : kind === "not_found" ? NOT_FOUND.title : LOAD_FAILED.title;
    return (
      <main id="main">
        <ReportMessage kind={kind} title={title} message={load.message} onRetry={kind === "failed" ? () => setAttempt((n) => n + 1) : undefined} />
      </main>
    );
  }
  return (
    <main id="main">
      <CheckoutView info={load.info} plan={plan} email={email} busy={busy} error={error} blocked={blocked} onPlan={setPlan} onEmail={setEmail} onSubmit={() => void submit()} />
    </main>
  );
}
