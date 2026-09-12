import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * These guard the failure that cost a deployment: a value the driver cannot
 * parse silently becomes localhost:5432, and reports ECONNREFUSED from a host
 * that has no local database at all.
 */
async function urlErrorFor(value: string): Promise<string> {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = value;
  // Fresh module each time: the connection is cached on globalThis once made.
  const mod = await import(`../src/db/index.ts?case=${encodeURIComponent(value)}`);
  try {
    (mod.db as { execute: unknown }).execute;
    return "";
  } catch (e) {
    return (e as Error).message;
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    delete (globalThis as Record<string, unknown>).__ttApp;
  }
}

test("rejects a value that carries its own variable name", async () => {
  assert.match(
    await urlErrorFor("DATABASE_URL=postgresql://u:p@h.example:5432/db"),
    /contains its own name/,
  );
});

test("rejects a value wrapped in quotes", async () => {
  assert.match(await urlErrorFor('"postgresql://u:p@h.example:5432/db"'), /wrapped in quotes/);
});

test("rejects something that is not a URL", async () => {
  assert.match(await urlErrorFor("just some text"), /not a connection URL/);
});

test("rejects the wrong scheme", async () => {
  assert.match(await urlErrorFor("mysql://u:p@h.example:3306/db"), /must be postgres/);
});

test("accepts a real connection string", async () => {
  assert.equal(await urlErrorFor("postgresql://u:p@h.example:6543/db?sslmode=require"), "");
});
