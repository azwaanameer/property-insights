import { REPORT } from "../../site/copy";
import { Icon } from "../../site/Icon";

export function checkoutHref(pid: string): string {
  return `/checkout/${encodeURIComponent(pid)}`;
}

/**
 * A locked section: the hand-written teaser and a way to unlock. The blurred shape behind the card is the same fixed
 * placeholder every time and carries no layer data (AD-3). The model of a locked layer holds no figures to leak anyway.
 */
export function LockCard({ teaser, pid }: { teaser: string; pid: string }) {
  return (
    <div className="lockbox" data-locked="true">
      <div className="dummy" aria-hidden="true">
        <div className="g"><i /><i /><i /></div>
        <div className="l" style={{ width: "86%" }} />
        <div className="l" style={{ width: "72%" }} />
        <div className="l" style={{ width: "78%" }} />
        <div className="l" style={{ width: "48%" }} />
      </div>
      <div className="lockcard">
        <div>
          <Icon name="lock" />
          <h3>{REPORT.lockTitle}</h3>
          <p>{teaser}</p>
          <a className="btn" href={checkoutHref(pid)}>{REPORT.unlock}</a>
        </div>
      </div>
    </div>
  );
}
