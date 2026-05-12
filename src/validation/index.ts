import { validationError, type SetuError } from "../error/index.js";

export type ValidationResult = { ok: true } | { ok: false; error: SetuError };

const valOk: ValidationResult = { ok: true };
const valErr = (error: SetuError): ValidationResult => ({ ok: false, error });

/** Returns ok when `params[key]` is a non-empty string. */
export function requireParam(params: Record<string, unknown>, key: string): ValidationResult {
  const val = params[key];
  return typeof val === "string" && val.length > 0
    ? valOk
    : valErr(validationError(key, `${key} is required`));
}

/** Returns ok when `val` is a positive integer (amounts in paise). */
export function requirePositive(val: unknown, field: string): ValidationResult {
  return typeof val === "number" && Number.isInteger(val) && val > 0
    ? valOk
    : valErr(validationError(field, `${field} must be a positive integer (in paise)`));
}

/** Returns ok when `id` is a non-empty string. */
export function requireId(val: unknown, field: string): ValidationResult {
  return typeof val === "string" && val.length > 0
    ? valOk
    : valErr(validationError(field, `${field} is required`));
}

/** Returns ok when `id` is a non-empty string (merchant_id alias). */
export function requireMerchant(val: unknown): ValidationResult {
  return typeof val === "string" && val.length > 0
    ? valOk
    : valErr(validationError("merchant_id", "merchant_id is required"));
}

/** Runs a pipeline of validations, stopping at the first failure. */
export function chain(...checks: ValidationResult[]): ValidationResult {
  for (const check of checks) {
    if (!check.ok) return check;
  }
  return valOk;
}
