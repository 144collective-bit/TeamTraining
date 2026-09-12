import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, daysAgo, today } from "../src/lib/dates";
import { formatDate, formatDateTime } from "../src/lib/competence";

test("addMonths advances within a year", () => {
  assert.equal(addMonths(3, "2026-01-15"), "2026-04-15");
});

test("addMonths rolls over the year boundary", () => {
  assert.equal(addMonths(14, "2026-01-15"), "2027-03-15");
});

test("addMonths clamps rather than overflowing into the next month", () => {
  // The bug this guards: 31 Jan + 1 month naively becomes 3 March, silently
  // moving a competence expiry a month later than intended.
  assert.equal(addMonths(1, "2026-01-31"), "2026-02-28");
  assert.equal(addMonths(1, "2024-01-31"), "2024-02-29", "leap year");
  assert.equal(addMonths(1, "2026-03-31"), "2026-04-30");
});

test("addMonths handles the common revalidation periods", () => {
  assert.equal(addMonths(12, "2026-09-10"), "2027-09-10");
  assert.equal(addMonths(24, "2026-09-10"), "2028-09-10");
});

test("addMonths going backwards stays valid", () => {
  assert.equal(addMonths(-1, "2026-01-15"), "2025-12-15");
  assert.equal(addMonths(-13, "2026-01-15"), "2024-12-15");
});

test("daysAgo and today are ISO day strings", () => {
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(daysAgo(400), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(daysAgo(1) < today());
});
test("formats a Postgres date column", () => {
  assert.equal(formatDate("2027-05-15"), "15 May 2027");
});

test("formats a Postgres timestamptz column, which arrives as a string", () => {
  // The shape a raw SQL fragment hands back. Used to render "Invalid Date".
  assert.equal(formatDate("2026-05-15 09:00:00+00"), "15 May 2026");
  assert.equal(formatDate("2026-05-15T09:00:00.000Z"), "15 May 2026");
});

test("a date column is read as UTC, so it cannot shift a day", () => {
  // Parsed locally, "2027-01-01" is 31 Dec anywhere west of Greenwich.
  assert.equal(formatDate("2027-01-01"), "01 Jan 2027");
});

test("formats a Date object", () => {
  assert.equal(formatDate(new Date("2026-05-15T09:00:00Z")), "15 May 2026");
});

test("nothing unparseable ever reaches a printed document", () => {
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate(""), "—");
  assert.equal(formatDate("not a date"), "—");
  assert.equal(formatDate(new Date("nonsense")), "—");
  assert.equal(formatDateTime(null), "—");
  assert.equal(formatDateTime("not a date"), "—");
});

test("formatDateTime takes both shapes", () => {
  assert.match(formatDateTime("2026-05-15 09:00:00+00"), /15 May 2026/);
  assert.match(formatDateTime(new Date("2026-05-15T09:00:00Z")), /15 May 2026/);
});
