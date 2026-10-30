import { describe, expect, it } from "vitest";
import { ceilingRegain, grantRegain } from "../scripts/decide/initiative-grants.js";
import { swapLanding } from "../scripts/decide/mastery-record.js";

/*
 * THE LANDING LEDGER on the grants (ARCHITECTURE §4 *The ledger*): an Initiative grant's uses, a Long Rest's mastery
 * list, a song's cost and a meal's dice are judged ONCE, before the first write, and kept on the ledger, so a re-drive
 * over a dead claim neither writes twice nor judges a sheet it already changed. The judgements are pure; the runner
 * is driven over a card whose claimant dies between any two writes.
 */

/** Foundry's flag merge as the card stores it: nested objects merged, `-=key` deleting. */
function merge(into, patch) {
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
const { landingSteps } = await import("../scripts/ledger.js");

/** A card holding one record under `rec`. */
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

const usesOf = u => ({ value: u.max - u.spent, max: u.max, spent: u.spent });

describe("decide — the grants judged once", () => {
  it("a ceiling row comes back to the ceiling, never past it; nothing when it stands there", () => {
    expect(ceilingRegain({ value: 1, max: 6 }, 4)).toEqual({ spent: 2, regained: 3 });
    expect(ceilingRegain({ value: 1, max: 3 }, 4)).toEqual({ spent: 0, regained: 2 });
    expect(ceilingRegain({ value: 4, max: 6 }, 4)).toBeNull();
    expect(ceilingRegain({ value: 0, max: 6 }, null)).toBeNull();
  });

  it("a plain row: every expended use back, the feature's own spent; `count` that many; `upTo` no spend", () => {
    const regain = { value: 1, max: 3, spent: 2 };
    expect(grantRegain({ regain, own: { max: 1, spent: 0 } })).toEqual({
      regainSpent: 0,
      ownSpent: 1,
      regained: 2,
      max: 3
    });
    expect(grantRegain({ regain, own: { max: 0, spent: 0 }, count: 1 })).toEqual({
      regainSpent: 1,
      ownSpent: null,
      regained: 1,
      max: 3
    });
    expect(
      grantRegain({ regain: { value: 3, max: 3, spent: 0 }, own: { max: 1, spent: 0 }, count: 1 })
    ).toMatchObject({ regainSpent: null, ownSpent: 1, regained: 0 });
    expect(grantRegain({ regain, own: { max: 1, spent: 0 }, upTo: 2 })).toEqual({
      regainSpent: 1,
      ownSpent: null,
      regained: 1,
      max: 3
    });
    expect(
      grantRegain({ regain: { value: 3, max: 3, spent: 0 }, own: { max: 1, spent: 0 }, upTo: 2 })
    ).toMatchObject({ regainSpent: null, regained: 0 });
  });

  it("the mastery list: changed, trimmed, kept or stale — and the list it wrote reads stale, so the plan is kept", () => {
    const chosen = ["longsword", "longbow"];
    const changed = swapLanding({ chosen, allowance: 2, out: "longbow", into: "greatsword" });
    expect(changed).toEqual({ list: ["longsword", "greatsword"], outcome: "changed" });
    expect(swapLanding({ chosen, allowance: 2 })).toEqual({ list: null, outcome: "kept" });
    expect(swapLanding({ chosen: [...chosen, "dagger"], allowance: 2, drop: ["dagger"] })).toEqual({
      list: chosen,
      outcome: "trimmed"
    });
    // a re-drive judging the sheet its dead claimant already wrote would call the change stale
    expect(
      swapLanding({ chosen: changed.list, allowance: 2, out: "longbow", into: "greatsword" })
    ).toEqual({ list: null, outcome: "stale" });
  });
});

/** An Initiative grant's plain row as landGrant lands it: the uses back, then the feature's own use spent. */
async function landGrant(message, sheet, { die = null } = {}) {
  const steps = landingSteps(message, "rec", "land");
  const begun = !!message.flags[MODULE_ID].rec.ledger?.land;
  const dead = at => {
    if (die === at) throw new Error(`the claimant died at ${at}`);
  };
  const own = usesOf(sheet.own);
  if (!begun && own.max > 0 && !(own.value > 0)) return { spentAlready: true };
  const g = await steps.step("regain", {
    plan: () => grantRegain({ regain: usesOf(sheet.regain), own }),
    witness: () => sheet.regain.spent,
    run: async p => {
      if (p.regainSpent !== null) sheet.regain.spent = p.regainSpent;
      dead("regain.write");
    }
  });
  dead("regain");
  if (g.plan.ownSpent !== null) {
    await steps.step("spend", {
      witness: () => sheet.own.spent,
      run: async () => {
        sheet.own.spent = g.plan.ownSpent;
        dead("spend.write");
      }
    });
  }
  return { regained: g.plan.regained, max: g.plan.max };
}

describe("an Initiative grant re-driven over a dead claim", () => {
  for (const die of ["regain.write", "regain", "spend.write"]) {
    it(`dead at ${die}: the uses back once, the feature's one use spent once, the card's count the first drive's`, async () => {
      const m = card();
      const sheet = { regain: { max: 3, spent: 2 }, own: { max: 1, spent: 0 } };
      await expect(landGrant(m, sheet, { die })).rejects.toThrow();
      // the feature's only use may already be spent: a begun run is past the gate
      expect(await landGrant(m, sheet)).toEqual({ regained: 2, max: 3 });
      expect(sheet).toEqual({ regain: { max: 3, spent: 0 }, own: { max: 1, spent: 1 } });
    });
  }

  it("a first drive with the use already gone says so and writes nothing", async () => {
    const m = card();
    const sheet = { regain: { max: 3, spent: 2 }, own: { max: 1, spent: 1 } };
    expect(await landGrant(m, sheet)).toEqual({ spentAlready: true });
    expect(sheet.regain.spent).toBe(2);
  });
});

describe("a song's cost and a meal's dice re-driven over a dead claim", () => {
  it("the cost's use is spent once, on the first drive's count", async () => {
    const m = card();
    const pool = { spent: 1 };
    const pay = async die => {
      const steps = landingSteps(m, "rec", "land");
      await steps.step("cost", {
        plan: () => ({ spent: pool.spent + 1 }),
        witness: () => pool.spent,
        run: async q => {
          pool.spent = q.spent;
          if (die) throw new Error("dead");
        }
      });
    };
    await expect(pay(true)).rejects.toThrow();
    await pay(false);
    expect(pool.spent).toBe(2);
  });

  it("an eater's dice are the first drive's: a re-drive rolls afresh and keeps the planned roll", async () => {
    const m = card();
    const eater = { hp: 10 };
    const eat = async (rolled, die) => {
      const steps = landingSteps(m, "rec", "land");
      const { plan } = await steps.step("eat-0", {
        plan: () => ({ standing: "spent", roll: { total: rolled } }),
        witness: () => eater.hp,
        run: async q => {
          if (die === "before") throw new Error("dead");
          eater.hp += q.roll.total;
          if (die === "after") throw new Error("dead");
        }
      });
      return plan.roll.total;
    };
    await expect(eat(5, "before")).rejects.toThrow();
    expect(await eat(2, null)).toBe(5);
    expect(eater.hp).toBe(15);

    const m2 = card("card2");
    const eater2 = { hp: 10 };
    const eat2 = async (rolled, die) => {
      const steps = landingSteps(m2, "rec", "land");
      const { plan, how } = await steps.step("eat-0", {
        plan: () => ({ roll: { total: rolled } }),
        witness: () => eater2.hp,
        run: async q => {
          eater2.hp += q.roll.total;
          if (die) throw new Error("dead");
        }
      });
      return { total: plan.roll.total, how };
    };
    await expect(eat2(4, true)).rejects.toThrow();
    expect(await eat2(6, false)).toEqual({ total: 4, how: "landed" });
    expect(eater2.hp).toBe(14);
  });
});
