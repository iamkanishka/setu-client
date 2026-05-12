import type { SetuConfig } from "../../config/index.js";
import { getUrls, getKycHeaders } from "../../config/index.js";
import { validationError, type SetuResult, err } from "../../error/index.js";
import { jsonRequest } from "../../http/index.js";

export interface VerifyGstParams {
  gstin: string;
}

/**
 * Verifies a GSTIN.
 *
 * Sandbox test values:
 * - `27AAICB3918J1CT` — valid, no additional address
 * - `27AAICB3919J1CT` — valid, with additional place of business
 *
 * `POST /api/verify/gst`
 */
export async function verify(
  cfg: SetuConfig,
  params: VerifyGstParams
): Promise<SetuResult<unknown>> {
  const { gstin } = params;
  if (typeof gstin !== "string" || gstin.length !== 15) {
    return err(validationError("gstin", "GSTIN must be exactly 15 characters"));
  }
  return jsonRequest(
    "POST",
    getUrls(cfg).dataGateway + "/api/verify/gst",
    getKycHeaders(cfg),
    { gstin },
    cfg
  );
}

/** Returns `true` when the GST registration status is `"Active"`. */
export function isActive(response: Record<string, unknown>): boolean {
  const data = response["data"] as Record<string, unknown> | undefined;
  const company = data?.["company"] as Record<string, unknown> | undefined;
  return company?.["status"] === "Active";
}
