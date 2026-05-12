import type { SetuConfig } from "../../config/index.js";
import { getUrls, getKycHeaders } from "../../config/index.js";
import { type SetuResult, err } from "../../error/index.js";
import { jsonRequest } from "../../http/index.js";
import { requireId } from "../../validation/index.js";

export interface CreateEkycParams {
  webhookUrl?: string;
  redirectionUrl?: string;
}

/**
 * Initiates an eKYC request. Redirect the customer to the returned `kycURL`.
 *
 * Status lifecycle: `CREATED → KYC_REQUESTED → SUCCESS | ERROR`
 *
 * `POST /api/ekyc/`
 */
export async function create(
  cfg: SetuConfig,
  params: CreateEkycParams = {}
): Promise<SetuResult<unknown>> {
  const body: Record<string, unknown> = {};
  if (params.webhookUrl) body["webhook_url"] = params.webhookUrl;
  if (params.redirectionUrl) body["redirection_url"] = params.redirectionUrl;

  return jsonRequest(
    "POST",
    getUrls(cfg).dataGateway + "/api/ekyc/",
    getKycHeaders(cfg),
    body,
    cfg
  );
}

/**
 * Retrieves status and Aadhaar data. Poll until {@link isComplete} returns `true`.
 * `GET /api/ekyc/:id`
 */
export async function get(cfg: SetuConfig, id: string): Promise<SetuResult<unknown>> {
  const v = requireId(id, "id");
  if (!v.ok) return err(v.error);
  return jsonRequest(
    "GET",
    getUrls(cfg).dataGateway + `/api/ekyc/${id}`,
    getKycHeaders(cfg),
    undefined,
    cfg
  );
}

/** Returns `true` when the eKYC request has completed successfully. */
export function isComplete(response: Record<string, unknown>): boolean {
  return response["status"] === "SUCCESS";
}
