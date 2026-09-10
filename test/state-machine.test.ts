import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition, nextStatus, TransitionError,
  missingSignatures, declarationFor, atLeast,
} from "../src/lib/state-machine";

test("the happy path runs start -> assessment -> competent", () => {
  assert.equal(nextStatus("NOT_TRAINED", "START_TRAINING"), "IN_TRAINING");
  assert.equal(nextStatus("IN_TRAINING", "READY_FOR_ASSESSMENT"), "ASSESSMENT");
  assert.equal(nextStatus("ASSESSMENT", "GRANT_COMPETENCE"), "COMPETENT");
});

test("competence cannot be granted without passing through assessment", () => {
  assert.throws(() => nextStatus("IN_TRAINING", "GRANT_COMPETENCE"), TransitionError);
  assert.throws(() => nextStatus("NOT_TRAINED", "GRANT_COMPETENCE"), TransitionError);
});

test("a failed assessment returns someone to training, not to competent", () => {
  assert.equal(nextStatus("ASSESSMENT", "ASSESSMENT_FAILED"), "IN_TRAINING");
});

test("suspended and lapsed staff must re-train, not jump back to competent", () => {
  assert.ok(canTransition("SUSPENDED", "START_TRAINING"));
  assert.ok(canTransition("REQUIRES_REVALIDATION", "START_TRAINING"));
  assert.throws(() => nextStatus("REQUIRES_REVALIDATION", "GRANT_COMPETENCE"), TransitionError);
});

test("only a suspension can be reinstated", () => {
  assert.equal(nextStatus("SUSPENDED", "REINSTATE"), "COMPETENT");
  assert.throws(() => nextStatus("REQUIRES_REVALIDATION", "REINSTATE"), TransitionError);
});

test("someone not yet trained cannot be suspended", () => {
  assert.throws(() => nextStatus("NOT_TRAINED", "SUSPEND"), TransitionError);
});

test("all three signatures are required", () => {
  assert.deepEqual(missingSignatures([]), ["TRAINEE", "TRAINER", "MANAGER"]);
  assert.deepEqual(missingSignatures(["TRAINEE", "TRAINER"]), ["MANAGER"]);
  assert.deepEqual(missingSignatures(["TRAINEE", "TRAINER", "MANAGER"]), []);
});

test("declarations name the person, machine and exact revision", () => {
  const ctx = { trainee: "Ryan McAllister", machine: "Press Brake 1", sopRef: "SOP-PB-01", revision: 3 };
  const trainee = declarationFor("TRAINEE", ctx);
  assert.ok(trainee.includes("SOP-PB-01"));
  assert.ok(trainee.includes("rev 3"));
  assert.ok(trainee.includes("Press Brake 1"));
  assert.ok(declarationFor("TRAINER", ctx).includes("Ryan McAllister"));
  assert.ok(declarationFor("MANAGER", ctx).includes("Ryan McAllister"));
});

test("role ranking is ordered and inclusive", () => {
  assert.ok(atLeast("ADMIN", "MANAGER"));
  assert.ok(atLeast("MANAGER", "MANAGER"));
  assert.ok(!atLeast("TRAINER", "MANAGER"));
  assert.ok(!atLeast("OPERATOR", "TRAINER"));
  assert.ok(atLeast("TRAINER", "OPERATOR"));
});
