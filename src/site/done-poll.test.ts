// The confirmation page's polling loop with a fake scheduler: no timers, no network.
import { describe, expect, it } from "vitest";
import type { DoneView } from "./checkout-api";
import { MAX_CHECKS, startPolling } from "./done-poll";

const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(answers: (DoneView | Error)[], limit?: number) {
  const seen: { view: DoneView; tries: number; slow: boolean }[] = [];
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  let calls = 0;
  const stop = startPolling({
    check: async () => {
      const a = answers[Math.min(calls++, answers.length - 1)];
      if (a instanceof Error) throw a;
      return a;
    },
    schedule: (fn, ms) => {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return () => {
        t.cancelled = true;
      };
    },
    onView: (view, info) => seen.push({ view, ...info }),
    limit,
  });
  /** Runs the pending timer, if any, and waits for the check it starts. */
  const tick = async () => {
    await flush();
    const t = timers.find((x) => !x.cancelled && x.fn);
    if (!t) return false;
    timers.splice(timers.indexOf(t), 1);
    t.fn();
    await flush();
    return true;
  };
  return { seen, timers, stop, tick, calls: () => calls };
}

const paid: DoneView = { kind: "paid", plan: "one", gnaf_pid: "GAVIC1", expires_at: "2026-12-21T00:00:00Z" };

describe("confirmation polling", () => {
  it("keeps checking while the purchase is pending, then stops on paid", async () => {
    const h = harness([{ kind: "checking" }, { kind: "checking" }, paid]);
    await flush();
    expect(h.seen.map((s) => s.view.kind)).toEqual(["checking"]);
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0].ms).toBe(1500);
    await h.tick();
    await h.tick();
    expect(h.seen.map((s) => s.view.kind)).toEqual(["checking", "checking", "paid"]);
    expect(h.timers).toHaveLength(0); // nothing is scheduled after a settled answer
    expect(await h.tick()).toBe(false);
    expect(h.calls()).toBe(3);
  });
  it("retries through one failed check", async () => {
    const h = harness([{ kind: "error" }, { kind: "checking" }, paid]);
    await flush();
    expect(h.seen[0].view.kind).toBe("error");
    expect(h.timers).toHaveLength(1);
    await h.tick();
    await h.tick();
    expect(h.seen.map((s) => s.view.kind)).toEqual(["error", "checking", "paid"]);
  });
  it("a check that throws counts as an error and is retried", async () => {
    const h = harness([new Error("network"), paid]);
    await flush();
    expect(h.seen[0].view.kind).toBe("error");
    await h.tick();
    expect(h.seen[1].view.kind).toBe("paid");
  });
  it("stops at once on any settled answer", async () => {
    for (const kind of ["refunded", "expired", "failed", "unknown"] as const) {
      const h = harness([{ kind }]);
      await flush();
      expect(h.timers, kind).toHaveLength(0);
      expect(h.seen[0].slow).toBe(false);
    }
  });
  it("reports slow once the checks are used up, and schedules no more", async () => {
    const h = harness([{ kind: "checking" }], 3);
    await flush();
    await h.tick();
    expect(h.seen.map((s) => s.slow)).toEqual([false, false]);
    await h.tick();
    expect(h.seen.map((s) => [s.tries, s.slow])).toEqual([[1, false], [2, false], [3, true]]);
    expect(h.timers).toHaveLength(0);
    expect(h.calls()).toBe(3);
  });
  it("ends on an error view with slow set when every check failed", async () => {
    const h = harness([{ kind: "error" }], 2);
    await flush();
    await h.tick();
    expect(h.seen[1]).toMatchObject({ view: { kind: "error" }, tries: 2, slow: true });
  });
  it("the default limit is 20 checks", () => {
    expect(MAX_CHECKS).toBe(20);
  });
  it("the stop function cancels the pending check and ignores a late answer", async () => {
    const h = harness([{ kind: "checking" }, paid]);
    await flush();
    h.stop();
    expect(h.timers[0].cancelled).toBe(true);
    expect(h.seen).toHaveLength(1);
  });
});
