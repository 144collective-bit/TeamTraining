import { test } from "node:test";
import assert from "node:assert/strict";
import { contentHash, canonicalJson, hashSecret, verifySecret, sha256, sha256Bytes } from "../src/lib/crypto";

test("content hashing ignores key order", () => {
  // Postgres jsonb does not preserve key order, so anything hashed on write
  // and re-hashed after a read must agree. This is the bug that broke the
  // audit-trail verification once already.
  assert.equal(
    contentHash({ a: 1, b: { c: 2, d: 3 } }),
    contentHash({ b: { d: 3, c: 2 }, a: 1 }),
  );
});

test("content hashing respects array order", () => {
  assert.notEqual(contentHash({ steps: [1, 2] }), contentHash({ steps: [2, 1] }));
});

test("content hashing distinguishes real changes", () => {
  assert.notEqual(contentHash({ instruction: "Isolate" }), contentHash({ instruction: "isolate" }));
  assert.notEqual(contentHash({ a: 1 }), contentHash({ a: "1" }));
  assert.notEqual(contentHash({ a: null }), contentHash({}));
});

test("canonical JSON drops undefined but keeps null", () => {
  assert.equal(canonicalJson({ a: undefined, b: null }), '{"b":null}');
});

test("secrets round-trip and reject wrong values", async () => {
  const stored = await hashSecret("1234");
  assert.ok(await verifySecret("1234", stored));
  assert.ok(!(await verifySecret("1235", stored)));
  assert.ok(!(await verifySecret("", stored)));
});

test("verifying against a missing or malformed hash fails closed", async () => {
  assert.ok(!(await verifySecret("1234", null)));
  assert.ok(!(await verifySecret("1234", "garbage")));
  assert.ok(!(await verifySecret("1234", "onlysalt:")));
});

test("the same secret hashes differently each time (salted)", async () => {
  const a = await hashSecret("1234");
  const b = await hashSecret("1234");
  assert.notEqual(a, b);
  assert.ok(await verifySecret("1234", a));
  assert.ok(await verifySecret("1234", b));
});

test("sha256 is stable", () => {
  assert.equal(sha256("abc"), sha256("abc"));
  assert.notEqual(sha256("abc"), sha256("abd"));
});

test("binary content addressing is distinct from JSON content hashing", () => {
  // Using contentHash for a file would wrap the string in quotes before
  // hashing, so the same bytes would get two different addresses depending on
  // which helper the caller reached for — silently breaking de-duplication.
  const bytes = Buffer.from("some-image-bytes");
  assert.notEqual(sha256Bytes(bytes), contentHash(bytes.toString("base64")));
  assert.equal(sha256Bytes(bytes), sha256Bytes(Buffer.from("some-image-bytes")));
  assert.notEqual(sha256Bytes(bytes), sha256Bytes(Buffer.from("other-bytes")));
});
