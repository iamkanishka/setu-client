import type { SetuConfig } from "../../config/index.js";
import { getUrls, getKycHeaders } from "../../config/index.js";
import { validationError, type SetuResult, err } from "../../error/index.js";
import { jsonRequest } from "../../http/index.js";
import { chain } from "../../validation/index.js";

export interface VerifyPanParams {
  pan: string;
  consent: string;
  reason: string;
}

/**
 * Verifies a PAN against NSDL.
 *
 * Sandbox test values:
 * - `ABCDE1234A` — valid PAN
 * - `ABCDE1234B` — invalid / blacklisted
 *
 * `POST /api/verify/pan`
 */
export async function verify(
  cfg: SetuConfig,
  params: VerifyPanParams
): Promise<SetuResult<unknown>> {
  const v = chain(
    validatePan(params.pan),
    validateConsent(params.consent),
    validateReason(params.reason)
  );
  if (!v.ok) return err(v.error);

  const url = getUrls(cfg).dataGateway + "/api/verify/pan";
  return jsonRequest(
    "POST",
    url,
    getKycHeaders(cfg),
    { pan: params.pan, consent: params.consent, reason: params.reason },
    cfg
  );
}

/** Returns `true` when the response indicates a valid PAN. */
export function isValid(response: Record<string, unknown>): boolean {
  return response["verification"] === "success" && response["message"] === "PAN is valid";
}

// ── Private validators ────────────────────────────────────────────────────────

import type { ValidationResult } from "../../validation/index.js";

function validatePan(pan: unknown): ValidationResult {
  return typeof pan === "string" && pan.length === 10
    ? { ok: true }
    : {
        ok: false,
        error: validationError("pan", "PAN must be exactly 10 characters"),
      };
}

function validateConsent(consent: unknown): ValidationResult {
  return consent === "Y" || consent === "y"
    ? { ok: true }
    : {
        ok: false,
        error: validationError("consent", 'consent must be "Y"'),
      };
}

function validateReason(reason: unknown): ValidationResult {
  return typeof reason === "string" && reason.length >= 20
    ? { ok: true }
    : {
        ok: false,
        error: validationError("reason", "reason must be at least 20 characters"),
      };
}
