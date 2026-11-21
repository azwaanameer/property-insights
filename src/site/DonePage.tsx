import { useEffect, useState } from "react";
import { ONE_REPORT } from "../config/pricing";
import { checkPurchase, type DoneView } from "./checkout-api";
import { DONE } from "./copy";
import { startPolling } from "./done-poll";

function until(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" }) : "the end of this billing month";
}

/** The confirmation view for one state of the purchase. Pure rendering. */
export function DoneBody({ view, slow, onRetry }: { view: DoneView; slow: boolean; onRetry: () => void }) {
  let title: string;
  let text: string;
  let action: { label: string; href?: string; onClick?: () => void } | null = null;
  let keep = false;
  switch (view.kind) {
    case "paid":
      keep = true;
      if (view.plan === "pro") {
        title = DONE.paidPro.title;
        text = DONE.paidPro.text(until(view.expires_at));
        action = { label: DONE.paidPro.action, href: "/#try" };
      } else {
        title = DONE.paidOne.title;
        text = DONE.paidOne.text(ONE_REPORT.days);
        action = { label: DONE.paidOne.action, href: view.gnaf_pid ? `/report/${encodeURIComponent(view.gnaf_pid)}` : "/" };
      }
      break;
    case "checking":
      title = slow ? DONE.slow.title : DONE.checking.title;
      text = slow ? DONE.slow.text : DONE.checking.text;
      if (slow) action = { label: DONE.slow.action, onClick: onRetry };
      break;
    case "error":
      ({ title, text } = DONE.error);
      action = { label: DONE.error.action, onClick: onRetry };
      break;
    default:
      ({ title, text } = DONE[view.kind]);
      action = { label: DONE.home, href: "/" };
  }
  return (
    <div className="wrap nfwrap" data-view={view.kind}>
      <div className="nf">
        <h1>{title}</h1>
        <p role={view.kind === "checking" ? "status" : "alert"}>{text}</p>
        {keep && <p className="ckkeep">{DONE.keep}</p>}
        {action && (action.href ? <a className="btn" href={action.href}>{action.label}</a> : <button className="btn" type="button" onClick={action.onClick}>{action.label}</button>)}
      </div>
    </div>
  );
}

/** Asks the status endpoint until the purchase settles (the webhook may land a moment after the buyer returns). */
export function DonePage({ purchaseId }: { purchaseId?: string }) {
  const [view, setView] = useState<DoneView>(purchaseId ? { kind: "checking" } : { kind: "missing" });
  const [slow, setSlow] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!purchaseId) return;
    const controller = new AbortController();
    const stop = startPolling({
      check: () => checkPurchase(purchaseId, undefined, controller.signal),
      schedule: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      onView: (v, info) => {
        setView(v);
        setSlow(info.slow);
      },
    });
    return () => {
      stop();
      controller.abort();
    };
  }, [purchaseId, round]);

  return (
    <main id="main">
      <DoneBody
        view={view}
        slow={slow && view.kind === "checking"}
        onRetry={() => {
          setView({ kind: "checking" });
          setSlow(false);
          setRound((r) => r + 1);
        }}
      />
    </main>
  );
}
