import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

/** Hash a password or PIN. Returns "salt:hash" hex. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(secret, salt, KEY_LEN)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

/** Constant-time verification of a secret against a stored "salt:hash". */
export async function verifySecret(secret: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = (await scryptAsync(secret, salt, KEY_LEN)) as Buffer;
  const keyBuf = Buffer.from(key, "hex");
  if (keyBuf.length !== derived.length) return false;
  return timingSafeEqual(keyBuf, derived);
}

/**
 * Canonical SHA-256 of a JSON value. Object keys are sorted so that the same
 * logical content always hashes identically regardless of key order.
 */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalise(value)).digest("hex");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Stable JSON with sorted object keys. Postgres jsonb does not preserve key
 * order, so anything hashed on write and re-hashed after a read MUST be
 * canonicalised or the two will disagree.
 */
export function canonicalJson(value: unknown): string {
  return canonicalise(value);
}

function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`);
  return `{${entries.join(",")}}`;
}
