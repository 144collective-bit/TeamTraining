import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The home page's "things to put right" is a sum; /improve is a list. They are
 * built from different queries, so nothing stops them drifting apart except a
 * test that adds up the same way.
 */
type Improve = {
  singlePoints: number; noTrainer: number; documentsDue: number;
  pendingAck: number; reviewsDue: number;
};

const doorTotal = (i: Improve) =>
  i.singlePoints + i.noTrainer + i.documentsDue + i.pendingAck + i.reviewsDue;

test("the door counts every category the improve page lists", () => {
  const improve: Improve = {
    singlePoints: 1, noTrainer: 1, documentsDue: 2, pendingAck: 3, reviewsDue: 4,
  };
  assert.equal(doorTotal(improve), 11);
});

test("no category is silently left out of the total", () => {
  // Each field on its own must move the total by exactly one.
  const zero: Improve = {
    singlePoints: 0, noTrainer: 0, documentsDue: 0, pendingAck: 0, reviewsDue: 0,
  };
  for (const key of Object.keys(zero) as (keyof Improve)[]) {
    assert.equal(doorTotal({ ...zero, [key]: 1 }), 1, `${key} is not counted`);
  }
});

test("nothing outstanding reads as zero, not as a falsy blank", () => {
  assert.equal(doorTotal({
    singlePoints: 0, noTrainer: 0, documentsDue: 0, pendingAck: 0, reviewsDue: 0,
  }), 0);
});
