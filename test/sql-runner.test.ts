import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareScript, quoteLiteral, quoteIdentifier } from "../scripts/sql-runner.mjs";

const vars = { app_role: "tt_app", app_password: "p'w" };

test("quotes literals and identifiers the way Postgres reads them", () => {
  assert.equal(quoteLiteral("plain"), "'plain'");
  assert.equal(quoteLiteral("it's"), "'it''s'");
  assert.equal(quoteIdentifier("tt_app"), '"tt_app"');
  assert.equal(quoteIdentifier('we"ird'), '"we""ird"');
});

test("substitutes string literals and identifiers", () => {
  assert.equal(
    prepareScript(`SET tt.app_role = :'app_role';`, vars),
    `SET tt.app_role = 'tt_app';`,
  );
  assert.equal(
    prepareScript(`GRANT USAGE ON SCHEMA public TO :"app_role";`, vars),
    `GRANT USAGE ON SCHEMA public TO "tt_app";`,
  );
});

test("a password containing a quote cannot end the literal", () => {
  const out = prepareScript(`SET tt.app_password = :'app_password';`, vars);
  assert.equal(out, `SET tt.app_password = 'p''w';`);
});

test("does not substitute inside a dollar-quoted body", () => {
  const body = `DO $$ BEGIN RAISE NOTICE ':''app_role'''; END $$;`;
  assert.equal(prepareScript(body, vars), body);
});

test("a nested tag does not end the outer dollar quote", () => {
  const body = `DO $$\nBEGIN\n  EXECUTE format($p$ SELECT :'app_role' $p$, t);\nEND $$;\nSELECT :'app_role';`;
  const out = prepareScript(body, vars);
  assert.ok(out.includes(`format($p$ SELECT :'app_role' $p$, t)`), "inner body untouched");
  assert.ok(out.endsWith(`SELECT 'tt_app';`), "substitution resumes after the block");
});

test("does not substitute inside a string or a comment", () => {
  assert.equal(prepareScript(`SELECT ':''app_role''';`, vars), `SELECT ':''app_role''';`);
  assert.equal(prepareScript(`-- :'app_role'\nSELECT 1;`, vars), `-- :'app_role'\nSELECT 1;`);
  assert.equal(prepareScript(`/* :'app_role' */ SELECT 1;`, vars), `/* :'app_role' */ SELECT 1;`);
});

test("leaves casts alone", () => {
  const s = `SELECT OLD.id::text, NULLIF(x, '')::uuid;`;
  assert.equal(prepareScript(s, vars), s);
});

test("drops guard and announce meta-commands", () => {
  const s = `\\if :{?app_role}\n\\else\n\\echo 'nope'\n\\quit 1\n\\endif\nSELECT :'app_role';`;
  assert.equal(prepareScript(s, vars), `SELECT 'tt_app';`);
});

test("refuses a meta-command that changes what the script does", () => {
  assert.throws(() => prepareScript(`SELECT 1\n\\gexec\n`, vars), /Unsupported psql meta-command/);
  assert.throws(() => prepareScript(`\\i other.sql\n`, vars), /Unsupported psql meta-command/);
});

test("refuses a missing variable rather than emitting it raw", () => {
  assert.throws(() => prepareScript(`SELECT :'nope';`, vars), /No value supplied/);
});

test("refuses an unterminated dollar quote", () => {
  assert.throws(() => prepareScript(`DO $$ BEGIN END;`, vars), /Unterminated dollar-quoted/);
});

test("the real files survive a round trip", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["drizzle/guards.sql", "drizzle/rls.sql"]) {
    const out = prepareScript(readFileSync(file, "utf8"), vars);
    assert.ok(!out.includes("\\"), `${file} still contains a meta-command`);
    assert.ok(!/:['"](app_role|app_password)['"]/.test(out), `${file} has unsubstituted variables`);
  }
  const rls = prepareScript(readFileSync("drizzle/rls.sql", "utf8"), vars);
  assert.ok(rls.includes(`'tt_app'`), "role name substituted as a literal");
  assert.ok(rls.includes(`"tt_app"`), "role name substituted as an identifier");
});
