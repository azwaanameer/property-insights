// Error envelope: { error: { code, message, request_id } } plus the HTTP status. Layer problems are LayerResult.status, not HTTP errors.
import { z } from "zod";
import { AddressCandidate } from "./address";

export const ErrorCode = z.enum([
  "bad_request",
  "address_not_found",
  "not_covered",
  "not_configured",
  /** 503: no payment provider is set up. */
  "payments_not_configured",
  /** 409: no paid layer is enabled and cleared for the address, so there is nothing to sell. */
  "nothing_to_unlock",
  /** 502: the payment provider refused or could not be reached. */
  "payment_failed",
  /** 409: the buyer already has access to this address (an active one-report purchase or an active Pro plan). */
  "already_entitled",
  /** 409: a webhook for a purchase we cannot find yet. Non-2xx so the provider sends it again. */
  "event_unmatched",
  "not_found",
  "internal_error",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    request_id: z.string(),
    /** Present on address_not_found: nearest matches the user can pick from. */
    candidates: z.array(AddressCandidate).optional(),
    /** Present on address_not_found: how far the text got. `street` = a street was recognised but no number. */
    match: z.enum(["street", "none"]).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly candidates?: z.infer<typeof AddressCandidate>[],
    readonly match?: "street" | "none",
  ) {
    super(message);
    this.name = "ApiError";
  }
}
