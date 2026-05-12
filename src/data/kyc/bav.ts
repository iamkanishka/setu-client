import type { SetuConfig } from "../../config/index.js";
import { getUrls, getKycHeaders } from "../../config/index.js";
import { type SetuResult, err } from "../../error/index.js";
import { jsonRequest } from "../../http/index.js";
import { requireId, requireParam, chain } from "../../validation/index.js";

export interface BavParams {
  accountNumber: string;
  ifsc: string;
  name?: string;
}

function buildBody(params: BavParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    accountNumber: params.accountNumber,
    ifsc: params.ifsc,
  };
  if (params.name) body["name"] = params.name;
  return body;
}

import type { ValidationResult } from "../../validation/index.js";

function validateBav(params: BavParams): ValidationResult {
  const p = params as unknown as Record<string, unknown>;
  return chain(requireParam(p, "accountNumber"), requireParam(p, "ifsc"));
}

/**
 * Performs a synchronous penny-drop bank account verification.
 * `POST /api/verify/ban/sync`
 */
export async function verifySync(cfg: SetuConfig, params: BavParams): Promise<SetuResult<unknown>> {
  const v = validateBav(params);
  if (!v.ok) return err(v.error);
  return jsonRequest(
    "POST",
    getUrls(cfg).dataGateway + "/api/verify/ban/sync",
    getKycHeaders(cfg),
    buildBody(params),
    cfg
  );
}

/**
 * Initiates an async penny-drop. Poll {@link getAsyncStatus} for the result.
 * `POST /api/verify/ban/async`
 */
export async function verifyAsync(
  cfg: SetuConfig,
  params: BavParams
): Promise<SetuResult<unknown>> {
  const v = validateBav(params);
  if (!v.ok) return err(v.error);
  return jsonRequest(
    "POST",
    getUrls(cfg).dataGateway + "/api/verify/ban/async",
    getKycHeaders(cfg),
    buildBody(params),
    cfg
  );
}

/**
 * Retrieves the result of an async BAV request.
 * `GET /api/verify/ban/async/:id`
 */
export async function getAsyncStatus(cfg: SetuConfig, id: string): Promise<SetuResult<unknown>> {
  const v = requireId(id, "id");
  if (!v.ok) return err(v.error);
  return jsonRequest(
    "GET",
    getUrls(cfg).dataGateway + `/api/verify/ban/async/${id}`,
    getKycHeaders(cfg),
    undefined,
    cfg
  );
}
