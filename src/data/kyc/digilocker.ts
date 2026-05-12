import type { SetuConfig } from "../../config/index.js";
import { getUrls, getKycHeaders } from "../../config/index.js";
import { type SetuResult, err } from "../../error/index.js";
import { jsonRequest } from "../../http/index.js";
import { requireId, requireParam, chain } from "../../validation/index.js";

export interface CreateSessionParams {
  redirectUrl: string;
  webhookUrl?: string;
  purpose?: string;
}

/**
 * Initiates a DigiLocker consent session. Redirect to the returned `consentUrl`.
 * `POST /api/digilocker/session`
 */
export async function createSession(
  cfg: SetuConfig,
  params: CreateSessionParams
): Promise<SetuResult<unknown>> {
  const v = requireParam(params as unknown as Record<string, unknown>, "redirectUrl");
  if (!v.ok) return err(v.error);

  const body: Record<string, unknown> = { redirectUrl: params.redirectUrl };
  if (params.webhookUrl) body["webhookUrl"] = params.webhookUrl;
  if (params.purpose) body["purpose"] = params.purpose;

  return jsonRequest(
    "POST",
    getUrls(cfg).dataGateway + "/api/digilocker/session",
    getKycHeaders(cfg),
    body,
    cfg
  );
}

/** Retrieves the current state of a DigiLocker session. */
export async function getSession(cfg: SetuConfig, sessionId: string): Promise<SetuResult<unknown>> {
  const v = requireId(sessionId, "sessionId");
  if (!v.ok) return err(v.error);
  return jsonRequest(
    "GET",
    getUrls(cfg).dataGateway + `/api/digilocker/session/${sessionId}`,
    getKycHeaders(cfg),
    undefined,
    cfg
  );
}

/**
 * Fetches a specific document type from an authorised session.
 * Common types: `"ADHAR"`, `"DRVLC"`, `"MARKSH"`.
 *
 * `GET /api/digilocker/session/:id/documents/:type`
 */
export async function getDocument(
  cfg: SetuConfig,
  sessionId: string,
  documentType: string
): Promise<SetuResult<unknown>> {
  const v = chain(requireId(sessionId, "sessionId"), requireId(documentType, "documentType"));
  if (!v.ok) return err(v.error);
  return jsonRequest(
    "GET",
    getUrls(cfg).dataGateway + `/api/digilocker/session/${sessionId}/documents/${documentType}`,
    getKycHeaders(cfg),
    undefined,
    cfg
  );
}
