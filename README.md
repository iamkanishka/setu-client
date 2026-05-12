# setu-client

Production-grade TypeScript SDK for the Setu API platform.

This SDK provides:

* Typed configuration management
* Automatic OAuth token management with caching
* Retry + exponential backoff handling
* Built-in client-side rate limiting
* Structured error handling
* Telemetry hooks for observability
* Webhook dispatch utilities
* Validation helpers
* UPI, BBPS, KYC, AA, and eSign integrations

---

# Features

## Core Infrastructure

### Configuration

Located in `config/index.ts`

* Environment-aware URL resolution
* Immutable validated SDK configuration
* Sandbox and production support
* Request timeout and retry configuration
* Built-in rate limiting configuration

### Token Management

Located in `token/index.ts`

* Automatic access token fetching
* In-memory token caching
* Token refresh buffering
* Singleflight refresh deduplication
* Cache invalidation helpers

### HTTP Client

Located in `http/index.ts`

* Typed request wrappers
* Automatic retries
* Full-jitter exponential backoff
* Timeout handling
* Structured API error decoding
* Integrated telemetry and rate limiting

### Rate Limiting

Located in `ratelimit/index.ts`

* Token bucket implementation
* Per-client/environment buckets
* Configurable burst limits
* Request throttling with timeout support

### Telemetry

Located in `telemetry/index.ts`

Event-based observability layer using Node.js `EventEmitter`.

Supported events:

* `request:start`
* `request:stop`
* `request:exception`
* `token:refresh`
* `ratelimit:wait`

---

# Installation

```bash
npm install setu-client
```

---

# Quick Start

```ts
import { createConfig } from "setu-client";
import { createDqr } from "setu-client/payments/upi";

const cfg = createConfig({
  clientId: process.env.SETU_CLIENT_ID!,
  clientSecret: process.env.SETU_CLIENT_SECRET!,
  environment: "sandbox",
});

const result = await createDqr(cfg, "merchant-id", {
  merchantVpa: "shop@upi",
  amount: 10_000,
});

if (result.ok) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

---

# Project Structure

```text
setu-client/
├── config/
├── data/
│   ├── aa.ts
│   ├── esign.ts
│   └── kyc/
├── error/
├── http/
├── payments/
│   ├── bbps.ts
│   └── upi.ts
├── ratelimit/
├── telemetry/
├── token/
├── validation/
├── webhook/
└── index.ts
```

---

# Configuration

## Creating a Config

```ts
import { createConfig } from "setu-client";

const cfg = createConfig({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  environment: "sandbox",
});
```

## Configuration Options

| Option              | Description               | Default   |
| ------------------- | ------------------------- | --------- |
| `clientId`          | Setu client ID            | Required  |
| `clientSecret`      | Setu client secret        | Required  |
| `productInstanceId` | Product instance ID       | Optional  |
| `environment`       | `sandbox` or `production` | `sandbox` |
| `timeoutMs`         | Request timeout           | `30000`   |
| `maxRetries`        | Maximum retry attempts    | `3`       |
| `retryBaseDelayMs`  | Base retry delay          | `500`     |
| `retryMaxDelayMs`   | Max retry delay           | `10000`   |
| `rateLimitRps`      | Requests per second       | `100`     |
| `rateLimitBurst`    | Burst capacity            | `20`      |

---

# Error Handling

Located in `error/index.ts`

All SDK operations return:

```ts
type SetuResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SetuError };
```

## Error Types

| Type         | Description              |
| ------------ | ------------------------ |
| `api`        | Non-2xx API response     |
| `auth`       | Authentication failure   |
| `rate_limit` | HTTP 429 response        |
| `network`    | Network or timeout issue |
| `validation` | Local validation failure |
| `decode`     | JSON decoding failure    |

## Example

```ts
if (!result.ok) {
  console.error(result.error.type);
  console.error(result.error.message);
}
```

---

# Validation Utilities

Located in `validation/index.ts`

Available helpers:

* `requireParam()`
* `requirePositive()`
* `requireId()`
* `requireMerchant()`
* `chain()`

## Example

```ts
const validation = chain(
  requireMerchant(merchantId),
  requirePositive(amount, "amount")
);

if (!validation.ok) {
  return validation.error;
}
```

---

# Telemetry

Located in `telemetry/index.ts`

## Listening to Events

```ts
import { telemetry } from "setu-client";

telemetry.on("request:start", (event) => {
  console.log(event.method, event.url);
});
```

## Request Lifecycle Events

### request:start

```ts
{
  method: string;
  url: string;
  attempt: number;
  startTimeMs: number;
}
```

### request:stop

```ts
{
  method: string;
  url: string;
  attempt: number;
  durationMs: number;
  httpStatus?: number;
}
```

### request:exception

```ts
{
  method: string;
  url: string;
  attempt: number;
  durationMs: number;
  error: SetuError;
}
```

---

# Token Management

Located in `token/index.ts`

## Features

* Automatic token refresh
* Token caching
* Refresh buffering
* Concurrent request deduplication

## Helpers

```ts
import {
  getToken,
  invalidateToken,
  clearTokenCache,
} from "setu-client";
```

---

# Webhook Utilities

Located in `webhook/index.ts`

Unified webhook dispatcher for all Setu events.

## Supported Event Categories

### Payments

* `payment.initiated`
* `payment.pending`
* `payment.success`
* `payment.failed`

### Mandates

* `mandate.initiated`
* `mandate.live`
* `mandate.rejected`
* `mandate.paused`
* `mandate.revoked`
* Mandate operation lifecycle events

### Refunds

* `refund.pending`
* `refund.successful`

### Disputes

* `dispute_created`
* `dispute_open`
* `dispute_closed`
* `dispute_in_review`
* `dispute_won`
* `dispute_lost`

### Account Aggregator Events

* `CONSENT_STATUS_UPDATE`
* `SESSION_STATUS_UPDATE`

### BBPS Settlement Events

Automatically detected using payload structure.

## Example

```ts
import { dispatchRaw } from "setu-client/webhook";

await dispatchRaw(rawBody, {
  async handlePayment(event) {
    console.log("Payment event", event);
  },

  async handleConsent(event) {
    console.log("Consent update", event);
  },
});
```

## Helper Functions

* `eventType()`
* `consentId()`
* `sessionId()`
* `consentStatus()`
* `sessionStatus()`
* `isPaymentSuccessful()`
* `isConsentActive()`
* `isSessionCompleted()`

---

# Payments APIs

Located in `payments/`

## UPI Module

File: `payments/upi.ts`

Provides helpers for:

* Dynamic QR creation
* Payment link generation
* Transaction retrieval
* UPI collect flows
* Merchant transaction history

## BBPS Module

File: `payments/bbps.ts`

Provides helpers for:

* Bill payment flows
* Settlement history
* BBPS transaction management

---

# Data APIs

Located in `data/`

## Account Aggregator

File: `data/aa.ts`

Features:

* Consent creation
* Session handling
* Financial information retrieval
* Consent status tracking

## eSign

File: `data/esign.ts`

Features:

* Electronic signature workflows
* Document signing integration
* Status retrieval

---

# KYC APIs

Located in `data/kyc/`

Supported integrations:

| File            | Purpose                   |
| --------------- | ------------------------- |
| `bav.ts`        | Bank account verification |
| `digilocker.ts` | DigiLocker integration    |
| `ekyc.ts`       | Electronic KYC workflows  |
| `gst.ts`        | GST verification          |
| `namematch.ts`  | Name matching utilities   |
| `pan.ts`        | PAN verification          |

---

# HTTP Behavior

The SDK automatically handles:

* Retries for retryable status codes
* Retryable network errors
* Exponential backoff
* Rate limiting
* Request timeout handling
* Structured error decoding

Retryable HTTP statuses:

* `429`
* `500`
* `502`
* `503`
* `504`

---

# Design Principles

## Functional Error Handling

The SDK avoids throwing for expected operational errors.

Instead:

```ts
const result = await someSdkCall();

if (result.ok) {
  // success
} else {
  // handle error
}
```

## Immutable Configuration

`createConfig()` returns a frozen configuration object.

## Safe Concurrency

Token refresh requests are deduplicated to prevent token stampedes.

## Production Readiness

The SDK includes:

* Retry strategies
* Rate limiting
* Telemetry hooks
* Timeout handling
* Structured errors
* Validation helpers

---

# Environment URLs

## Sandbox

* Account Service: `https://accountservice.setu.co`
* UMAP API: `https://umap.setu.co/api`
* Data Gateway: `https://dg-sandbox.setu.co`
* FIU: `https://fiu-sandbox.setu.co`

## Production

* Account Service: `https://accountservice.setu.co`
* UMAP API: `https://umap.setu.co/api`
* Data Gateway: `https://dg.setu.co`
* FIU: `https://fiu.setu.co`

---

# Best Practices

* Reuse a single `SetuConfig` instance
* Attach telemetry listeners for monitoring
* Handle all `SetuResult` failures explicitly
* Use sandbox before production rollout
* Tune retry and rate-limit settings based on traffic

---

# Example Express Webhook Integration

```ts
import express from "express";
import { dispatchRaw } from "setu-client/webhook";

const app = express();

app.post(
  "/webhooks/setu",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const ok = await dispatchRaw(req.body.toString(), {
      async handlePayment(event) {
        console.log("payment", event);
      },
    });

    res.sendStatus(ok ? 200 : 400);
  }
);
```

---

# Exports

The root `index.ts` re-exports:

* Configuration helpers
* Error utilities
* Telemetry
* Token helpers
* Rate limiter helpers
* Validation helpers
* Webhook helpers
* Payments APIs
* KYC APIs
* AA APIs
* eSign APIs

---

# Summary

This SDK is structured as a production-ready foundation for integrating with the Setu ecosystem.

It provides:

* Strong TypeScript ergonomics
* Safe and predictable error handling
* Scalable networking primitives
* Observability support
* Modular API integrations
* Built-in resiliency patterns

Suitable for:

* Payment gateways
* Fintech backends
* KYC pipelines
* Account Aggregator integrations
* BBPS workflows
* Enterprise API platforms
