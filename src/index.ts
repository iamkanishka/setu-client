/**
 * setu-node — Production-grade TypeScript SDK for the Setu API Platform.
 *
 * @example
 * ```ts
 * import { createConfig } from "setu-node";
 * import { createDqr } from "setu-node/payments/upi";
 *
 * const cfg = createConfig({
 *   clientId: process.env.SETU_CLIENT_ID!,
 *   clientSecret: process.env.SETU_CLIENT_SECRET!,
 *   environment: "sandbox",
 * });
 *
 * const result = await createDqr(cfg, merchantId, { merchantVpa: "shop@pineaxis", amount: 10_000 });
 * if (result.ok) console.log(result.data);
 * ```
 */

// Config
export {
  createConfig,
  getUrls,
  getKycHeaders,
  type SetuConfig,
  type SetuConfigOptions,
  type Environment,
  type BaseUrls,
} from "./config/index.js";

// Error
export {
  apiError,
  authError,
  rateLimitError,
  networkError,
  validationError,
  decodeError,
  formatError,
  isSetuError,
  ok,
  err,
  type SetuError,
  type ErrorType,
  type SetuResult,
} from "./error/index.js";

// Telemetry
export {
  telemetry,
  type SetuEvents,
  type RequestStartEvent,
  type RequestStopEvent,
  type RequestExceptionEvent,
  type TokenRefreshEvent,
  type RateLimitWaitEvent,
} from "./telemetry/index.js";

// Token
export { getToken, invalidateToken, clearTokenCache } from "./token/index.js";

// Rate limiter
export { acquireToken, resetBuckets } from "./ratelimit/index.js";

// Validation helpers
export {
  requireParam,
  requirePositive,
  requireId,
  requireMerchant,
  chain,
  type ValidationResult,
} from "./validation/index.js";

// HTTP (low-level; exposed for custom integrations)
export { request, jsonRequest, type HttpMethod, type RawResponse } from "./http/index.js";

// Payments
export * as UPI from "./payments/upi.js";
export * as BBPS from "./payments/bbps.js";

// Data
export * as AA from "./data/aa.js";
export * as ESign from "./data/esign.js";
export * as KYC from "./data/kyc/index.js";

// Webhook
export * as Webhook from "./webhook/index.js";
