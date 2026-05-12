# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog
and this project adheres to Semantic Versioning.

---

## [1.0.0] - 2026-05-12

### Added

#### Core SDK Infrastructure
- Immutable configuration management
- Environment-aware API endpoint resolution
- OAuth token lifecycle management
- In-memory token caching
- Automatic token refresh handling
- Singleflight token refresh deduplication

#### HTTP Layer
- Typed HTTP request abstraction
- Automatic retry support
- Full-jitter exponential backoff strategy
- Structured API error parsing
- Timeout handling
- Integrated telemetry support
- Integrated client-side rate limiting

#### Validation Utilities
- Required parameter validation
- Positive number validation
- Merchant ID validation helpers
- Validation chaining utilities

#### Telemetry
- Event-driven observability system
- Request lifecycle events
- Token refresh events
- Rate-limit wait events
- Exception instrumentation hooks

#### Webhook Framework
- Unified webhook dispatcher
- Payment event handling
- Mandate lifecycle handling
- Refund event handling
- Dispute event handling
- Account Aggregator webhook support
- BBPS settlement webhook support

#### Payments APIs
- UPI Dynamic QR support
- UPI payment link support
- UPI transaction retrieval
- UPI collect flow helpers
- BBPS payment integration
- BBPS settlement handling

#### Data APIs
- Account Aggregator consent workflows
- Financial Information session management
- eSign workflow integration
- Document signing support

#### KYC APIs
- PAN verification
- GST verification
- Bank account verification
- DigiLocker integration
- eKYC workflows
- Name matching utilities

#### Reliability Features
- Retryable network handling
- Retryable HTTP status handling
- Request throttling
- Burst protection
- Safe concurrency primitives

#### Developer Experience
- Strong TypeScript typings
- Functional error handling pattern
- Modular package structure
- Root-level export aggregation
- Production-ready SDK architecture

---

## Notes

Initial public release of the `setu-node` SDK.

This release establishes the foundational architecture for:
- Payments integrations
- KYC workflows
- Account Aggregator integrations
- BBPS services
- eSign workflows
- Production-grade API consumption
