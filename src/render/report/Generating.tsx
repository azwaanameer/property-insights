import { REPORT } from "../../site/copy";

/**
 * Shown while the report request is in flight. `progress` is how many steps to mark done: the page ticks it up on a timer
 * while it waits and never marks the last step until the report has arrived.
 */
export function GeneratingState({ progress = 0 }: { progress?: number }) {
  const steps = REPORT.generatingSteps;
  return (
    <div className="gen" role="status" aria-live="polite">
      <div className="kick">{REPORT.generatingKicker}</div>
      <h2>{REPORT.generatingTitle}</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={s} className={i < progress ? "on" : undefined}>
            <i />
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
