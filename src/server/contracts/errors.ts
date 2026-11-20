// Error envelope: { error: { code, message, request_id } } plus the HTTP status. Layer problems are LayerResult.status, not HTTP errors.
import { z } from "zod";
import { AddressCandidate } from "./address";

export const ErrorCode = z.enum([
  "bad_request",
  "address_not_found",
  "not_covered",
  "not_configured",
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
