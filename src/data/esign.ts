import type { SetuConfig } from "../config/index.js";
import { getUrls, getKycHeaders } from "../config/index.js";
import { validationError, type SetuResult, err } from "../error/index.js";
import { jsonRequest } from "../http/index.js";
import { requireId, requireParam, chain } from "../validation/index.js";

function dgUrl(cfg: SetuConfig, path: string): string {
  return getUrls(cfg).dataGateway + path;
}

export interface SignaturePosition {
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface Signer {
  name: string;
  mobile: string;
  email?: string;
  signaturePosition?: SignaturePosition;
}

export interface CreateEsignParams {
  documentBase64: string;
  documentName: string;
  signers: Signer[];
  redirectUrl?: string;
  webhookUrl?: string;
  expiryMinutes?: number;
}

/**
 * Initiates an Aadhaar eSign workflow.
 *
 * `POST /api/esign/request`
 */
export async function createEsign(
  cfg: SetuConfig,
  params: CreateEsignParams
): Promise<SetuResult<unknown>> {
  const p = params as unknown as Record<string, unknown>;
  const v = chain(requireParam(p, "documentBase64"), requireParam(p, "documentName"));
  if (!v.ok) return err(v.error);

  const signerErr = validateSigners(params.signers);
  if (signerErr) return err(signerErr);

  const body: Record<string, unknown> = {
    documentBase64: params.documentBase64,
    documentName: params.documentName,
    signers: formatSigners(params.signers),
  };
  if (params.redirectUrl) body["redirectUrl"] = params.redirectUrl;
  if (params.webhookUrl) body["webhookUrl"] = params.webhookUrl;
  if (params.expiryMinutes !== undefined) body["expiryMinutes"] = params.expiryMinutes;

  return jsonRequest("POST", dgUrl(cfg, "/api/esign/request"), getKycHeaders(cfg), body, cfg);
}

/**
 * Retrieves the current status of an eSign request.
 * `GET /api/esign/request/:id`
 */
export async function getEsign(cfg: SetuConfig, id: string): Promise<SetuResult<unknown>> {
  const v = requireId(id, "id");
  if (!v.ok) return err(v.error);
  return jsonRequest(
    "GET",
    dgUrl(cfg, `/api/esign/request/${id}`),
    getKycHeaders(cfg),
    undefined,
    cfg
  );
}

/**
 * Downloads the signed PDF as a base64 string.
 * Call only after {@link esignComplete} returns `true`.
 *
 * `GET /api/esign/request/:id/download`
 */
export async function downloadEsign(cfg: SetuConfig, id: string): Promise<SetuResult<unknown>> {
  const v = requireId(id, "id");
  if (!v.ok) return err(v.error);
  return jsonRequest(
    "GET",
    dgUrl(cfg, `/api/esign/request/${id}/download`),
    getKycHeaders(cfg),
    undefined,
    cfg
  );
}

/** Returns `true` when all signers have completed signing (`status === "COMPLETED"`). */
export function esignComplete(response: Record<string, unknown>): boolean {
  return response["status"] === "COMPLETED";
}

// ── Private ───────────────────────────────────────────────────────────────────

import type { SetuError } from "../error/index.js";

function validateSigners(signers: Signer[] | undefined): SetuError | undefined {
  if (!signers || signers.length === 0) {
    return validationError("signers", "at least one signer is required");
  }
  if (signers.length > 6) {
    return validationError("signers", "maximum 6 signers are supported");
  }
  for (const [i, signer] of signers.entries()) {
    if (!signer.name) {
      return validationError(`signers[${String(i)}].name`, "signer name is required");
    }
    if (!signer.mobile) {
      return validationError(`signers[${String(i)}].mobile`, "signer mobile is required");
    }
  }
  return undefined;
}

function formatSigners(signers: Signer[]): Record<string, unknown>[] {
  return signers.map((s) => {
    const out: Record<string, unknown> = { name: s.name, mobile: s.mobile };
    if (s.email) out["email"] = s.email;
    if (s.signaturePosition) {
      const pos = s.signaturePosition;
      const posObj: Record<string, unknown> = {};
      if (pos.page !== undefined) posObj["page"] = pos.page;
      if (pos.x !== undefined) posObj["x"] = pos.x;
      if (pos.y !== undefined) posObj["y"] = pos.y;
      if (pos.width !== undefined) posObj["width"] = pos.width;
      if (pos.height !== undefined) posObj["height"] = pos.height;
      out["signaturePosition"] = posObj;
    }
    return out;
  });
}
