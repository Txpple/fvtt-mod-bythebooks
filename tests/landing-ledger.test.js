import { describe, expect, it } from "vitest";
import { canonical, ledgerStamp, stepAction, witnessMoved } from "../scripts/decide/ledger.js";

/*
 * THE LANDING LEDGER (issue #22; ARCHITECTURE §4 *The ledger*): a landing's writes as steps, each with its plan and
 * witness held on the record before it is made, so a re-drive over a dead claim repeats nothing that landed. The
 * judgement is pure (decide/ledger.js); the runner (ledger.js) is driven here over a card whose claimant dies
 * between any two of its writes.
 */

/** Foundry's dotted keys expanded, as an update expands them (`a.b` → `{ a: { b } }`). */
function expand(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    const keys = k.startsWith("-=") ? [k] : k.split(".");
    const last = keys.pop();
    const at = keys.reduce((o, p) => {
      o[p] ??= {};
      return o[p];
    }, out);
    at[last] = expand(v);
  }
  return out;
}

/** Foundry's flag merge as the card stores it: dotted keys expanded, nested objects merged, `-=key` deleting. */
function merge(into, raw) {
  const patch = expand(raw);
  for (const [k, v] of Object.entries(patch)) {
    if (k.startsWith("-=")) delete into[k.slice(2)];
    else if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      into[k] &&
      typeof into[k] === "object"
    )
      merge(into[k], v);
    else into[k] = structuredClone(v);
  }
  return into;
}

Object.assign(globalThis, {
  game: { ready: true, modules: { get: () => null }, user: { id: "me", isGM: true, flags: {} } },
  foundry: { utils: { deepClone: v => structuredClone(v) } },
  Hooks: { on: () => 1, once: () => 1, call: () => true, callAll: () => {} }
});

const { MODULE_ID } = await import("../scripts/core.js");
const { closeLedger, landingSteps, LEDGER_STAMP_FLAG } = await import("../scripts/ledger.js");

/** A card holding one record under `rec`; its flags as Foundry stores them. */
function card(id = "card1") {
  const message = {
    id,
    flags: { [MODULE_ID]: { rec: { status: "resolved" } } },
    getFlag: (scope, key) => message.flags[scope]?.[key],
    setFlag: async (scope, key, value) => {
      message.flags[scope] ??= {};
      message.flags[scope][key] ??= {};
      merge(message.flags[scope][key], value);
    }
  };
  return message;
}

/** A world of one creature: its Hit Points, and the documents a step makes. */
function world() {
  return { hp: 20, made: [] };
}

/** A landing of three writes: damage (an update), a document made, an increment. `die` kills it after a step. */
async function land(message, w, { die = null } = {}) {
  const steps = landingSteps(message, "rec", "land");
  const dead = name => {
    if (die === name) throw new Error(`the claimant died after ${name}`);
  };
  await steps.step("damage", {
    plan: () => ({ to: w.hp - 7 }),
    witness: () => w.hp,
    run: async p => {
      w.hp = p.to;
      dead("damage.write");
    }
  });
  dead("damage");
  await steps.step("chest", {
    witness: () => steps.made(w.made, "chest"),
    run: async () => {
      w.made.push({ id: `d${w.made.length}`, flags: steps.stamp("chest") });
      dead("chest.write");
    }
  });
  dead("chest");
  const r = await steps.step("spend", {
    plan: () => ({ spent: (w.spent ?? 0) + 1 }),
    witness: () => w.spent ?? 0,
    run: async p => {
      w.spent = p.spent;
      return { spent: p.spent };
    }
  });
  return r;
}

describe("decide/ledger — the judgement", () => {
  it("canonical JSON ignores key order and undefined fields", () => {
    expect(canonical({ b: 1, a: { d: [1, 2], c: undefined } })).toBe(
      canonical({ a: { d: [1, 2] }, b: 1 })
    );
    expect(canonical(undefined)).toBe("null");
  });
  it("a step with no entry runs; done is skipped; a moved witness landed; a still one runs again", () => {
    expect(stepAction(null, 5)).toBe("run");
    expect(stepAction({ state: "done", before: 1 }, 99)).toBe("done");
    expect(stepAction({ state: "begun", before: { hp: 20 } }, { hp: 13 })).toBe("landed");
    expect(stepAction({ state: "begun", before: { hp: 20 } }, { hp: 20 })).toBe("again");
    expect(witnessMoved([], ["a"])).toBe(true);
  });
  it("a stamp names the card, the record, the run and the step", () => {
    expect(ledgerStamp("m1", "summon", "dismiss", "drop.chest")).toBe(
      "m1.summon.dismiss.drop.chest"
    );
  });
});

describe("landingSteps — a re-drive over a claimant dead between any two writes lands each write once", () => {
  for (const die of ["damage.write", "damage", "chest.write", "chest"]) {
    it(`dead at ${die}: one damage, one document, one die spent`, async () => {
      const m = card();
      const w = world();
      await expect(land(m, w, { die })).rejects.toThrow();
      await land(m, w);
      expect(w.hp).toBe(13);
      expect(w.made).toHaveLength(1);
      expect(w.spent).toBe(1);
    });
  }

  it("a first drive runs every step and records each done, its plan and result kept", async () => {
    const m = card();
    const r = await land(m, world());
    expect(r).toMatchObject({ how: "ran", result: { spent: 1 } });
    const ledger = m.flags[MODULE_ID].rec.ledger.land;
    expect(Object.values(ledger).map(e => e.state)).toEqual(["done", "done", "done"]);
    expect(ledger.damage.plan).toEqual({ to: 13 });
  });

  it("a re-drive replays the dead claimant's plan, never one recomputed off the world it changed", async () => {
    const m = card();
    const w = world();
    await expect(land(m, w, { die: "damage.write" })).rejects.toThrow();
    // the witness moved (20 → 13): landed, and the plan is the first drive's
    const steps = landingSteps(m, "rec", "land");
    const r = await steps.step("damage", {
      plan: () => ({ to: -1 }),
      witness: () => w.hp,
      run: async () => {
        throw new Error("ran twice");
      }
    });
    expect(r).toMatchObject({ how: "landed", plan: { to: 13 }, now: 13 });
  });

  it("a made document carries the step's stamp, and `made` finds only that step's", async () => {
    const m = card("m9");
    const steps = landingSteps(m, "rec", "land");
    const docs = [
      { id: "a", flags: steps.stamp("chest") },
      { id: "b", flags: steps.stamp("other") },
      { id: "c", flags: {} }
    ];
    expect(docs[0].flags[MODULE_ID][LEDGER_STAMP_FLAG]).toBe("m9.rec.land.chest");
    expect(steps.made(docs, "chest")).toEqual(["a"]);
  });

  it("a dotted step or run name is stored and found again (Foundry expands dotted keys in an update)", async () => {
    const m = card();
    let runs = 0;
    const spec = {
      witness: () => 0,
      run: async () => {
        runs++;
      }
    };
    await landingSteps(m, "rec", "errand.away").step("drop.chest", spec);
    const again = await landingSteps(m, "rec", "errand.away").step("drop.chest", spec);
    expect(again.how).toBe("done");
    expect(runs).toBe(1);
    expect(Object.keys(m.flags[MODULE_ID].rec.ledger)).toEqual(["errand-away"]);
    const current = structuredClone(m.flags[MODULE_ID].rec);
    closeLedger(current, "errand.away");
    expect(current.ledger).toBeUndefined();
  });

  it("closeLedger drops the run's ledger, and the whole ledger with its last run", () => {
    const current = { ledger: { land: { a: {} }, dismiss: { b: {} } } };
    closeLedger(current, "land");
    expect(current.ledger).toEqual({ dismiss: { b: {} } });
    closeLedger(current, "dismiss");
    expect(current.ledger).toBeUndefined();
  });
});
