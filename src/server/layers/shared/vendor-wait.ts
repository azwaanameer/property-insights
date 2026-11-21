// A layer waits for a vendor adapter no longer than a stated time, and a failure or a hang is a value, never a thrown error: so a vendor problem can
// only make its own layer a quiet gap, never an `error` card (AD-9). The adapters already promise not to throw and to stop at their budget; this is
// the layer's own guarantee on top, for an adapter that misbehaves.
import type { VendorResult } from "../../vendors/types";

export const UNAVAILABLE: VendorResult<never> = { ok: false, reason: "unavailable" };

/** Runs `call` and gives its result, or `unavailable` when it throws or does not answer within `ms`. */
export async function vendorWithin<T>(ms: number, call: () => Promise<VendorResult<T>>): Promise<VendorResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<VendorResult<T>>((resolve) => {
    timer = setTimeout(() => resolve(UNAVAILABLE), ms);
  });
  const answer = (async () => {
    try {
      return await call();
    } catch {
      return UNAVAILABLE as VendorResult<T>;
    }
  })();
  try {
    return await Promise.race([answer, expired]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
