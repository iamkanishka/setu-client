import type { SetuConfig } from "../../config/index.js";
import { getUrls, getKycHeaders } from "../../config/index.js";
import { validationError, type SetuResult, err } from "../../error/index.js";
import { jsonRequest } from "../../http/index.js";
import type { ValidationResult } from "../../validation/index.js";
import { chain } from "../../validation/index.js";

export interface MatchParams {
  name1: string;
  name2: string;
}

/**
 * Compares two names and returns optimistic / pessimistic match scores.
 *
 * | Score range | Match type             |
 * |-------------|------------------------|
 * | 99–100%     | `COMPLETE_MATCH`       |
 * | 85–99%      | `HIGH_PARTIAL_MATCH`   |
 * | 70–85%      | `MODERATE_PARTIAL_MATCH` |
 * | 45–70%      | `LOW_PARTIAL_MATCH`    |
 * | 0–45%       | `NO_MATCH`             |
 *
 * `POST /api/match/v1/name`
 */
export async function match(cfg: SetuConfig, params: MatchParams): Promise<SetuResult<unknown>> {
  const v = chain(validateName(params.name1, "name1"), validateName(params.name2, "name2"));
  if (!v.ok) return err(v.error);

  return jsonRequest(
    "POST",
    getUrls(cfg).dataGateway + "/api/match/v1/name",
    getKycHeaders(cfg),
    { name1: params.name1, name2: params.name2 },
    cfg
  );
}

/** Returns `true` when the optimistic match percentage is >= `threshold`. */
export function isMatch(response: Record<string, unknown>, threshold = 75.0): boolean {
  const out = response["optimistic_match_output"] as Record<string, unknown> | undefined;
  const pct = (out?.["match_percentage"] as number | undefined) ?? 0;
  return pct >= threshold;
}

/** Returns `true` when the pessimistic match percentage is >= `threshold`. */
export function isStrictMatch(response: Record<string, unknown>, threshold = 75.0): boolean {
  const out = response["pessimistic_match_output"] as Record<string, unknown> | undefined;
  const pct = (out?.["match_percentage"] as number | undefined) ?? 0;
  return pct >= threshold;
}

function validateName(name: unknown, field: string): ValidationResult {
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, error: validationError(field, `${field} is required`) };
  }
  if (name.length > 100) {
    return {
      ok: false,
      error: validationError(field, `${field} must not exceed 100 characters`),
    };
  }
  return { ok: true };
}
