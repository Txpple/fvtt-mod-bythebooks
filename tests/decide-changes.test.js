import { describe, expect, it } from "vitest";
import { changeCopy, changesSignature, changeType } from "../scripts/decide/changes.js";
import { changeSign } from "../scripts/decide/effect-view.js";
import { readModes } from "../tools/check-change-modes.mjs";

/*
 * AN EFFECT CHANGE's kind (issue #23): Foundry 14's string `type`, never its deprecated numeric `mode`, whose read
 * warns on every access. Both shapes are fed in: a 14 change with the mode shim, and raw pre-14 data.
 */

/** A Foundry 14 change: `type` its own field, `mode` the warning shim (a getter, not enumerable). */
function v14Change(fields, onRead = () => {}) {
  const change = { ...fields };
  Object.defineProperty(change, "mode", {
    get: () => {
      onRead();
      return 2;
    },
    enumerable: false,
    configurable: true
  });
  return change;
}

describe("changeType — a change's kind in 14's vocabulary, off either shape", () => {
  it("takes a 14 change's type and never touches its mode shim", () => {
    let reads = 0;
    expect(
      changeType(
        v14Change(
          { key: "system.attributes.ac.bonus", type: "subtract", value: "1" },
          () => reads++
        )
      )
    ).toBe("subtract");
    expect(reads).toBe(0);
  });
  it("maps raw pre-14 data's numbers as core migrates them, an unknown one to custom.<n>", () => {
    expect([0, 1, 2, 3, 4, 5].map(mode => changeType({ key: "k", mode, value: "1" }))).toEqual([
      "custom",
      "multiply",
      "add",
      "downgrade",
      "upgrade",
      "override"
    ]);
    expect(changeType({ key: "k", mode: "2", value: "1" })).toBe("add");
    expect(changeType({ key: "k", mode: 9, value: "1" })).toBe("custom.9");
  });
  it("keeps a system's own type (dnd5e 6's rule changes)", () => {
    expect(changeType({ key: "attack", type: "dnd5e.advantage", value: "+1" })).toBe(
      "dnd5e.advantage"
    );
  });
  it("says nothing for nothing", () => {
    expect(changeType(null)).toBeNull();
    expect(changeType({ key: "k", value: "1" })).toBeNull();
    expect(changeType({ key: "k", mode: null, value: "1" })).toBeNull();
  });
});

describe("changeCopy — a change as plain typed data for another effect", () => {
  it("keeps every field a 14 change carries, drops its id, and never reads the shim", () => {
    let reads = 0;
    const live = v14Change(
      {
        _id: "abc",
        key: "attack",
        type: "dnd5e.bonus",
        value: "1d4",
        phase: "initial",
        priority: 20,
        conditions: "{}",
        replacement: "origin"
      },
      () => reads++
    );
    expect(changeCopy(live)).toEqual({
      key: "attack",
      type: "dnd5e.bonus",
      value: "1d4",
      phase: "initial",
      priority: 20,
      conditions: "{}",
      replacement: "origin"
    });
    expect(reads).toBe(0);
  });
  it("turns raw pre-14 data's mode into its type", () => {
    expect(
      changeCopy({ key: "system.traits.dr.value", mode: 2, value: "fire", priority: null })
    ).toEqual({ key: "system.traits.dr.value", type: "add", value: "fire", priority: null });
  });
});

describe("changesSignature — the same changes compare equal in either shape", () => {
  it("a typed change equals its pre-14 twin; a different kind or value does not", () => {
    const typed = [
      v14Change({ key: "system.attributes.ac.calc", type: "override", value: "unarmoredMonk" })
    ];
    expect(changesSignature(typed)).toBe(
      changesSignature([{ key: "system.attributes.ac.calc", mode: 5, value: "unarmoredMonk" }])
    );
    expect(changesSignature(typed)).not.toBe(
      changesSignature([{ key: "system.attributes.ac.calc", type: "add", value: "unarmoredMonk" }])
    );
    expect(changesSignature(typed)).not.toBe(
      changesSignature([{ key: "system.attributes.ac.calc", type: "override", value: "draconic" }])
    );
  });
});

describe("changeSign — 14's own kinds and dnd5e 6's rule changes", () => {
  it("a subtraction is the mirror of an add", () => {
    expect(changeSign({ key: "system.attributes.ac.bonus", type: "subtract", value: "2" })).toBe(
      "penalty"
    );
    expect(changeSign({ key: "system.attributes.ac.bonus", type: "subtract", value: "-2" })).toBe(
      "bonus"
    );
  });
  it("dnd5e.advantage reads its value: +1, =+1 or >=0 is Advantage, -1, =-1 or <=0 Disadvantage", () => {
    for (const value of ["+1", "=+1", ">=0"])
      expect(changeSign({ key: "attack", type: "dnd5e.advantage", value })).toBe("bonus");
    for (const value of ["-1", "=-1", "<=0"])
      expect(changeSign({ key: "save", type: "dnd5e.advantage", value })).toBe("penalty");
  });
  it("dnd5e.bonus reads its formula's sign", () => {
    expect(changeSign({ key: "attack", type: "dnd5e.bonus", value: "1d4" })).toBe("bonus");
    expect(changeSign({ key: "damage", type: "dnd5e.bonus", value: "-2" })).toBe("penalty");
    expect(changeSign({ key: "damage", type: "dnd5e.bonus", value: "" })).toBeNull();
  });
  it("an empty value on an add is nothing, not a zero", () => {
    expect(changeSign({ key: "system.attributes.ac.bonus", type: "add", value: "" })).toBeNull();
  });
});

describe("check-change-modes — the gate holds the rule", () => {
  it("fails a read of a change's mode, a numeric write and the deprecated constant", () => {
    const hits = readModes(`
      const a = (effect.changes ?? []).map(c => ({ key: c.key, mode: c.mode, value: c.value }));
      for ( const ch of effect.system.changes ) if ( ch.mode === 2 ) n++;
      const b = effect.changes[0].mode;
      const d = change.mode;
      const e = { key: "k", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" };
    `);
    expect(hits.length).toBe(7);
  });
  it("passes another .mode (a roll's, a summon's) and the typed write", () => {
    expect(
      readModes(`
      const m = roll.mode; const s = activity.summon?.mode;
      const rows = picks.map(p => p.mode);
      const e = { key: "k", type: "add", value: "1" };
    `)
    ).toEqual([]);
  });
});
