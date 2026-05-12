/** The runtime environment to target. */
export type Environment = "sandbox" | "production";

/** Resolved base URLs for a given environment. */
export interface BaseUrls {
  readonly accountService: string;
  readonly umapApi: string;
  readonly dataGateway: string;
  readonly fiu: string;
}

/** All configuration options for the Setu SDK. */
export interface SetuConfigOptions {
  /** Setu client ID (required). */
  clientId: string;
  /** Setu client secret (required). */
  clientSecret: string;
  /** Product instance ID (optional; required by some KYC/AA endpoints). */
  productInstanceId?: string;
  /** Target environment. Defaults to `"sandbox"`. */
  environment?: Environment;
  /** Request timeout in milliseconds. Defaults to `30_000`. */
  timeoutMs?: number;
  /** Maximum number of retry attempts. Defaults to `3`. */
  maxRetries?: number;
  /** Base delay for exponential backoff in milliseconds. Defaults to `500`. */
  retryBaseDelayMs?: number;
  /** Maximum backoff delay in milliseconds. Defaults to `10_000`. */
  retryMaxDelayMs?: number;
  /** Requests per second for client-side rate limiting. Defaults to `100`. */
  rateLimitRps?: number;
  /** Burst allowance above RPS. Defaults to `20`. */
  rateLimitBurst?: number;
}

/** Fully resolved, immutable configuration object. */
export interface SetuConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly productInstanceId: string | undefined;
  readonly environment: Environment;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly rateLimitRps: number;
  readonly rateLimitBurst: number;
}

const SANDBOX_URLS: BaseUrls = {
  accountService: "https://accountservice.setu.co",
  umapApi: "https://umap.setu.co/api",
  dataGateway: "https://dg-sandbox.setu.co",
  fiu: "https://fiu-sandbox.setu.co",
};

const PRODUCTION_URLS: BaseUrls = {
  accountService: "https://accountservice.setu.co",
  umapApi: "https://umap.setu.co/api",
  dataGateway: "https://dg.setu.co",
  fiu: "https://fiu.setu.co",
};

/**
 * Creates a validated, fully resolved {@link SetuConfig}.
 *
 * @throws {Error} When `clientId` or `clientSecret` is empty.
 *
 * @example
 * ```ts
 * const cfg = createConfig({
 *   clientId: process.env.SETU_CLIENT_ID!,
 *   clientSecret: process.env.SETU_CLIENT_SECRET!,
 *   environment: "sandbox",
 * });
 * ```
 */
export function createConfig(options: SetuConfigOptions): SetuConfig {
  if (!options.clientId) {
    throw new Error("SetuConfig: clientId is required");
  }
  if (!options.clientSecret) {
    throw new Error("SetuConfig: clientSecret is required");
  }

  return Object.freeze({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    productInstanceId: options.productInstanceId,
    environment: options.environment ?? "sandbox",
    timeoutMs: options.timeoutMs ?? 30_000,
    maxRetries: options.maxRetries ?? 3,
    retryBaseDelayMs: options.retryBaseDelayMs ?? 500,
    retryMaxDelayMs: options.retryMaxDelayMs ?? 10_000,
    rateLimitRps: options.rateLimitRps ?? 100,
    rateLimitBurst: options.rateLimitBurst ?? 20,
  });
}

/** Returns the resolved base URLs for the given config's environment. */
export function getUrls(cfg: SetuConfig): BaseUrls {
  return cfg.environment === "production" ? PRODUCTION_URLS : SANDBOX_URLS;
}

/**
 * Returns the KYC/AA credential headers derived from the config.
 * Includes `x-product-instance-id` only when set.
 */
export function getKycHeaders(cfg: SetuConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "x-client-id": cfg.clientId,
    "x-client-secret": cfg.clientSecret,
  };
  if (cfg.productInstanceId) {
    headers["x-product-instance-id"] = cfg.productInstanceId;
  }
  return headers;
}
