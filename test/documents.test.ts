import { test } from "node:test";
import assert from "node:assert/strict";
import {
  riskScore, riskBand, readSop, readRa,
  sopBodySchema, raBodySchema,
} from "../src/lib/documents";

test("risk bands follow the 5x5 matrix", () => {
  assert.equal(riskBand(riskScore(1, 1)).label, "Low");
  assert.equal(riskBand(riskScore(2, 2)).label, "Low");
  assert.equal(riskBand(riskScore(1, 5)).label, "Medium");
  assert.equal(riskBand(riskScore(3, 3)).label, "Medium");
  assert.equal(riskBand(riskScore(2, 5)).label, "High");
  assert.equal(riskBand(riskScore(4, 4)).label, "Very high");
  assert.equal(riskBand(riskScore(5, 5)).label, "Very high");
});

test("risk band boundaries are where they are documented", () => {
  assert.equal(riskBand(4).label, "Low");
  assert.equal(riskBand(5).label, "Medium");
  assert.equal(riskBand(9).label, "Medium");
  assert.equal(riskBand(10).label, "High");
  assert.equal(riskBand(14).label, "High");
  assert.equal(riskBand(15).label, "Very high");
});

test("a SOP must have a purpose and at least one step", () => {
  assert.equal(sopBodySchema.safeParse({ purpose: "", steps: [] }).success, false);
  assert.equal(
    sopBodySchema.safeParse({
      purpose: "Safe operation.",
      steps: [{ instruction: "Do the thing." }],
    }).success,
    true,
  );
});

test("a step with no instruction is rejected", () => {
  const result = sopBodySchema.safeParse({
    purpose: "Safe operation.",
    steps: [{ instruction: "   " }],
  });
  assert.equal(result.success, false);
});

test("a risk assessment needs a scope and a hazard", () => {
  assert.equal(raBodySchema.safeParse({ scope: "", hazards: [] }).success, false);
  assert.equal(
    raBodySchema.safeParse({ scope: "Routine operation.", hazards: [{ hazard: "Crushing" }] }).success,
    true,
  );
});

test("scores outside 1-5 are rejected", () => {
  const bad = raBodySchema.safeParse({
    scope: "Routine operation.",
    hazards: [{ hazard: "Crushing", likelihood: 9, severity: 3 }],
  });
  assert.equal(bad.success, false);
});

test("reading tolerates the pre-photograph step shape", () => {
  // Published revisions predate the schema change; a controlled document must
  // still render rather than blanking.
  const legacy = {
    purpose: "Legacy procedure.",
    ppe: ["Safety footwear"],
    hazards: ["Crushing"],
    steps: [{ step: "Pre-start checks", keyPoints: ["Guarding intact"], reasons: ["Because"] }],
  };
  const parsed = readSop(legacy);
  assert.equal(parsed.steps[0].instruction, "Pre-start checks");
  assert.deepEqual(parsed.steps[0].keyPoints, ["Guarding intact"]);
  assert.equal(parsed.steps[0].imageId, null);
  assert.equal(parsed.purpose, "Legacy procedure.");
});

test("reading tolerates the pre-scoring hazard shape", () => {
  const legacy = {
    scope: "Legacy assessment.",
    hazards: [{ hazard: "Noise", whoAtRisk: "Operators", riskRating: "Medium" }],
  };
  const parsed = readRa(legacy);
  assert.equal(parsed.hazards[0].hazard, "Noise");
  assert.equal(parsed.hazards[0].likelihood, 3, "falls back to a mid score");
});

test("reading junk does not throw", () => {
  assert.deepEqual(readSop(null).steps, []);
  assert.deepEqual(readRa(undefined).hazards, []);
  assert.deepEqual(readSop({ steps: "not an array" }).steps, []);
});

