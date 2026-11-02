import { beforeAll, describe, expect, it } from "vitest";
import { expectPointer } from "./rule-pointer.js";

/**
 * DECISION-layer: the PHB classes, stage A7 (RULINGS *The PHB classes — A7*) — the cast riders (CAST_RIDERS: Wild
 * Magic Surge, Inspiring Smite). No Foundry stub on purpose.
 */
/** @type {typeof import("../scripts/decide/registry.js")} */
let reg;
/** @type {typeof import("../scripts/decide/cast-riders.js")} */
let cr;
beforeAll(async () => {
  reg = await import("../scripts/decide/registry.js");
  cr = await import("../scripts/decide/cast-riders.js");
});

describe("CAST_RIDERS", () => {
  it("two frozen rows: the surge on a Sorcerer slot cast, the smite's divided hand-out", () => {
    const surge = reg.CAST_RIDERS["Wild Magic Surge"];
    const smite = reg.CAST_RIDERS["Inspiring Smite"];
    expect(Object.isFrozen(surge) && Object.isFrozen(smite)).toBe(true);
    expect(surge).toMatchObject({ spellClass: "sorcerer", surgeOn: 20, tides: "Tides of Chaos" });
    expect(surge.table).toMatch(/RollTable\.phbWildMagicSurg$/);
    expect(smite).toMatchObject({
      after: "Divine Smite",
      handOut: true,
      activity: "Heal",
      reach: 30,
      self: true
    });
    expectPointer(surge.rule);
    expectPointer(smite.rule);
    expect(reg.castRiderEntries().map(e => e.kind)).toEqual([
      "wild magic surge",
      "inspiring smite",
      "smite of protection", // C1
      "hunter's rime" // Heroes of Faerûn
    ]);
  });
});

describe("whose spell, with a slot", () => {
  it("the item's own class first, then its sourceItem, then the caster's one class", () => {
    expect(cr.spellClassOf({ classIdentifier: "sorcerer", sourceItem: "class:wizard" })).toBe(
      "sorcerer"
    );
    expect(cr.spellClassOf({ sourceItem: "class:sorcerer" })).toBe("sorcerer");
    expect(cr.spellClassOf({ casterClasses: ["sorcerer"] })).toBe("sorcerer");
    expect(cr.spellClassOf({ casterClasses: ["sorcerer", "wizard"] })).toBeNull();
  });
  it("a slot cast: levelled, not innate or at will, a slot spent", () => {
    expect(cr.castWithSlot({ level: 1, method: "spell", spendsSlot: true })).toBe(true);
    expect(cr.castWithSlot({ level: 1, method: "pact", spendsSlot: true })).toBe(true);
    expect(cr.castWithSlot({ level: 0, method: "spell", spendsSlot: true })).toBe(false);
    expect(cr.castWithSlot({ level: 2, method: "innate", spendsSlot: true })).toBe(false);
    expect(cr.castWithSlot({ level: 2, method: "spell", spendsSlot: false })).toBe(false);
  });
});

describe("the surge", () => {
  it("Tides spent: the table at once, Tides back — even after this turn's roll", () => {
    expect(cr.surgeOutcome({ tidesSpent: true, used: true })).toMatchObject({
      roll: false,
      surged: true,
      tides: true
    });
  });
  it("once per turn: this turn's roll made, nothing", () => {
    expect(cr.surgeOutcome({ tidesSpent: false, used: true })).toMatchObject({
      roll: false,
      surged: false
    });
  });
  it("the d20: a 20 surges, anything else does not", () => {
    expect(cr.surgeOutcome({ tidesSpent: false, used: false, d20: 20 })).toMatchObject({
      roll: true,
      surged: true,
      tides: false
    });
    expect(cr.surgeOutcome({ tidesSpent: false, used: false, d20: 19 })).toMatchObject({
      roll: true,
      surged: false
    });
  });
  it("the line", () => {
    expect(cr.surgeLine({ feature: "Wild Magic Surge", d20: 14, surged: false })).toBe(
      "Wild Magic Surge — d20: 14, nothing"
    );
    expect(
      cr.surgeLine({ feature: "Wild Magic Surge", d20: 20, surged: true, result: "You turn blue" })
    ).toBe("Wild Magic Surge — d20: 20, a SURGE — You turn blue");
    expect(
      cr.surgeLine({ feature: "Wild Magic Surge", surged: true, tides: true, result: "Fog" })
    ).toBe(
      "Wild Magic Surge — Tides of Chaos spent: the surge rolls — Fog; Tides of Chaos regained"
    );
  });
});

describe("a hand-out split evenly", () => {
  it("the total divided by the picks, the remainder one each down the list, strangers and repeats dropped", () => {
    const allowed = new Set(["a", "b", "c"]);
    expect(cr.evenSplit({ total: 13, picks: ["a", "b", "c", "x", "a"], allowed })).toEqual([
      { uuid: "a", n: 5 },
      { uuid: "b", n: 4 },
      { uuid: "c", n: 4 }
    ]);
    expect(cr.evenSplit({ total: 12, picks: ["a"] })).toEqual([{ uuid: "a", n: 12 }]);
    expect(cr.evenSplit({ total: 12, picks: [] })).toEqual([]);
  });
  it("a share of 0 is no pick; the split reads its own output back the same", () => {
    const once = cr.evenSplit({ total: 2, picks: ["a", "b", "c"] });
    expect(once).toEqual([
      { uuid: "a", n: 1 },
      { uuid: "b", n: 1 }
    ]);
    expect(cr.evenSplit({ total: 2, picks: once })).toEqual(once);
    expect(
      cr.evenSplit({ total: 13, picks: cr.evenSplit({ total: 13, picks: ["a", "b", "c"] }) })
    ).toEqual([
      { uuid: "a", n: 5 },
      { uuid: "b", n: 4 },
      { uuid: "c", n: 4 }
    ]);
  });
});

describe("STORED_DICE and the Portent bystander row (A7b)", () => {
  /** @type {typeof import("../scripts/decide/stored-dice.js")} */
  let sd;
  beforeAll(async () => {
    sd = await import("../scripts/decide/stored-dice.js");
  });
  it("the table row: two d20s at a Long Rest, own attacks, saves and checks, once per turn", () => {
    const row = reg.STORED_DICE.Portent;
    expect(Object.isFrozen(row)).toBe(true);
    expect(row).toMatchObject({
      dice: 2,
      rests: ["long"],
      tests: ["attack", "save", "check"],
      oncePerTurn: true
    });
    expectPointer(row.rule);
    expect(reg.storedDiceEntries().map(e => e.kind)).toEqual(["portent", "cosmic omen"]); // Cosmic Omen joined in B4
  });
  it("the bystander row: a stored face, the scene the reach, attacks, saves and checks (a check only with a DC on its roll), asked on every roll a face turns", () => {
    expect(reg.INTERRUPT_ROLLS.Portent).toMatchObject({
      reaction: false,
      uses: false,
      stored: "Portent",
      bystander: "sight",
      tests: ["attack", "save", "check"],
      bend: "set",
      on: "both"
    });
    expect(reg.INTERRUPT_ROLLS.Portent.ask).toBeUndefined(); // the crit-only switch went 2026-10-14 (RULINGS *The asks widened*)
    expect(reg.INTERRUPTS.some(r => r.name === "Portent" && r.kind === "roll")).toBe(true);
  });
  it("a face replaces the d20: the modifiers stand, the face's own crit and fumble", () => {
    expect(sd.setOutcome({ kept: 20, total: 25, face: 2 })).toMatchObject({
      how: "set",
      stood: 2,
      total: 7,
      isCritical: false,
      wasCritical: true,
      changed: true
    });
    expect(sd.setOutcome({ kept: 4, total: 9, face: 20 })).toMatchObject({
      total: 25,
      isCritical: true
    });
    expect(sd.setOutcome({ kept: 4, total: 9, face: 20, critAt: 99 }).isCritical).toBe(false);
  });
  it("only the faces that turn the verdict the way it is wanted", () => {
    // a foe's hit (18 + 5 = 23 vs AC 15) — a 3 or a 9 turns it, a 17 does not
    expect(
      sd.facesThatTurn({ faces: [17, 3, 9], kept: 18, total: 23, target: 15, want: "miss" })
    ).toEqual([3, 9]);
    // a friend's failed save (1 + 3 = 4 vs DC 10) — the 18 turns it, the 2 does not
    expect(
      sd.facesThatTurn({ faces: [18, 2], kept: 1, total: 4, target: 10, want: "pass" })
    ).toEqual([18]);
    // a crit on an attack stands against any AC: any non-20 face whose total misses turns it
    expect(
      sd.facesThatTurn({
        faces: [2, 19],
        kept: 20,
        total: 25,
        target: 15,
        want: "miss",
        critAt: 20,
        fumbleAt: 1
      })
    ).toEqual([2]);
    expect(
      sd.facesThatTurn({ faces: [2], kept: 5, total: 10, target: null, want: "miss" })
    ).toEqual([]);
  });
  it("the chip's name and a face spent", () => {
    expect(sd.storedChipName("Portent", [17, 3])).toBe("Portent — 17 · 3");
    expect(sd.storedChipName("Portent", [])).toBeNull();
    expect(sd.withoutFace([17, 3, 3], 3)).toEqual([17, 3]);
    expect(sd.withoutFace([17], 5)).toEqual([17]);
  });
});
