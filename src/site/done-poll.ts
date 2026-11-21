// The confirmation page's polling loop, free of React and of real timers so it can be tested with a fake scheduler.
import type { DoneView } from "./checkout-api";

/** How long the page keeps asking while the provider's webhook has not arrived: 20 checks, 1.5 seconds apart. */
export const MAX_CHECKS = 20;
export const CHECK_EVERY_MS = 1500;

export interface PollDeps {
  /** One status check. A throw counts as an error view, like a failed answer. */
  check: () => Promise<DoneView>;
  /** Runs `fn` after `ms` and returns a function that cancels it. */
  schedule: (fn: () => void, ms: number) => () => void;
  /** Called after every check. `slow` is true once the last check has been used up and the purchase is still not settled. */
  onView: (view: DoneView, info: { tries: number; slow: boolean }) => void;
  limit?: number;
  everyMs?: number;
}

/**
 * Checks, and keeps checking while the purchase is still pending or a check failed, until it settles or `limit` checks are used.
 * Returns a function that stops it. A settled answer (paid, refunded, expired, failed, unknown) ends the loop.
 */
export function startPolling(deps: PollDeps): () => void {
  const limit = deps.limit ?? MAX_CHECKS;
  const every = deps.everyMs ?? CHECK_EVERY_MS;
  let stopped = false;
  let cancel: (() => void) | null = null;

  const run = async (n: number) => {
    let view: DoneView;
    try {
      view = await deps.check();
    } catch {
      view = { kind: "error" };
    }
    if (stopped) return;
    const unsettled = view.kind === "checking" || view.kind === "error";
    const last = n >= limit;
    deps.onView(view, { tries: n, slow: unsettled && last });
    if (unsettled && !last) cancel = deps.schedule(() => void run(n + 1), every);
  };

  void run(1);
  return () => {
    stopped = true;
    cancel?.();
  };
}
