import { REPORT } from "../../site/copy";
import { checkoutHref } from "./LockCard";

/** Sticky bar shown while any section is locked. Both buttons lead to the checkout page (step 2c). */
export function UnlockBar({ pid }: { pid: string }) {
  return (
    <div className="unlockbar" role="region" aria-label="Unlock the full report">
      <div className="in">
        <div>
          <b>{REPORT.unlockBarTitle}</b>
          <br />
          <span>{REPORT.unlockBarText}</span>
        </div>
        <div className="acts">
          <a className="btn" href={checkoutHref(pid)}>{REPORT.unlock}</a>
          <a className="btn alt" href={`${checkoutHref(pid)}?plan=pro`}>{REPORT.goPro}</a>
        </div>
      </div>
    </div>
  );
}
