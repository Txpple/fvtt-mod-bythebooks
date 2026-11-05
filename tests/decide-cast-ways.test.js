import { describe, expect, it } from "vitest";
import * as cw from "../scripts/decide/cast-ways.js";
import { payPillsHTML } from "../scripts/decide/present.js";

const slots = o =>
  Object.entries(o).map(([key, [value, max, level]]) => ({ key, value, max, level }));
const none = slots({ spell1: [0, 0, 1], spell2: [0, 0, 2], pact: [0, 0, 0] });

describe("cast ways — the free cast first, then the slots (Fiendish Legacy, Magic Initiate, Fey Touched, Paladin's Smite)", () => {
  const legacy = left => ({
    id: "legacy",
    method: "spell",
    slotted: true,
    free: { left, max: 1, forwardId: "fwd" },
    grant: "Fiendish Legacy"
  });
  const pactCopy = { id: "warlock", method: "pact", slotted: true, free: null };
  const keys = ways => ways.map(w => `${w.key}${w.off ? " off" : ""}`);

  it("every way in the module's order: the free casts, then each slot from the lowest, a Pact slot first on a tie", () => {
    const ways = cw.castWays({
      copies: [pactCopy, legacy(1)],
      slots: slots({ spell1: [0, 4, 1], spell2: [2, 3, 2], pact: [1, 1, 2], spell3: [0, 0, 3] }),
      level: 1
    });
    expect(keys(ways)).toEqual(["free:legacy", "slot:spell1 off", "slot:pact", "slot:spell2"]);
    expect(ways.find(w => w.key === "slot:pact")).toMatchObject({
      copyId: "warlock",
      slotLevel: 2,
      left: 1,
      max: 1
    });
    expect(ways.find(w => w.key === "slot:spell2")).toMatchObject({ copyId: "legacy" });
  });

  it("a slot below the spell's level, or whose max has fallen to 0, is no way, whatever its stale value", () => {
    expect(
      keys(
        cw.castWays({
          copies: [pactCopy],
          slots: slots({ spell1: [3, 4, 1], spell2: [2, 0, 2] }),
          level: 2
        })
      )
    ).toEqual([]);
  });

  it("a free cast left is the module's pick, on the copy that carries it", () => {
    expect(
      cw.chooseCastWay({
        copies: [pactCopy, legacy(1)],
        slots: slots({ pact: [2, 2, 2] }),
        level: 1
      })
    ).toMatchObject({
      kind: "free",
      key: "free:legacy",
      copyId: "legacy",
      forwardId: "fwd",
      left: 1,
      max: 1
    });
  });

  it("Lysandra: the free cast spent, the Pact slot pays, through the Pact Magic copy", () => {
    const way = cw.chooseCastWay({
      copies: [legacy(0), pactCopy],
      slots: slots({ spell1: [0, 0, 1], pact: [2, 2, 2] }),
      level: 1
    });
    expect(way).toMatchObject({
      kind: "slot",
      key: "slot:pact",
      copyId: "warlock",
      slot: "pact",
      slotLevel: 2
    });
  });

  it("the player's pick stands while it is left; a pick spent since falls to the module's", () => {
    const f = {
      copies: [legacy(1), pactCopy],
      slots: slots({ spell1: [1, 2, 1], pact: [2, 2, 2] }),
      level: 1
    };
    expect(cw.chooseCastWay({ ...f, pick: "slot:pact" })).toMatchObject({ key: "slot:pact" });
    expect(cw.chooseCastWay({ ...f, pick: "slot:spell1" })).toMatchObject({
      key: "slot:spell1",
      copyId: "legacy"
    });
    expect(
      cw.chooseCastWay({ ...f, copies: [legacy(0), pactCopy], pick: "free:legacy" })
    ).toMatchObject({ key: "slot:spell1" });
  });

  it("a Pact slot with only the granted copy: that copy casts with the Pact slot (no exclusive slots in dnd5e)", () => {
    expect(
      cw.chooseCastWay({ copies: [legacy(0)], slots: slots({ pact: [1, 2, 2] }), level: 1 })
    ).toMatchObject({ kind: "slot", copyId: "legacy", slot: "pact", slotLevel: 2 });
  });

  it("a numbered slot goes through the spell-method copy", () => {
    const wizard = { id: "wizard", method: "spell", slotted: true, free: null };
    expect(
      cw.chooseCastWay({
        copies: [pactCopy, wizard],
        slots: slots({ spell1: [1, 2, 1] }),
        level: 1
      })
    ).toMatchObject({ kind: "slot", copyId: "wizard", slot: "spell1", slotLevel: 1 });
  });

  it("nothing left: why", () => {
    expect(cw.chooseCastWay({ copies: [legacy(0)], slots: none, level: 1 })).toEqual({
      kind: "none",
      why: "no spell slot"
    });
    const innate = {
      id: "innate",
      method: "innate",
      slotted: false,
      free: { left: 0, max: 1, forwardId: null }
    };
    expect(
      cw.chooseCastWay({ copies: [innate], slots: slots({ spell1: [2, 2, 1] }), level: 1 })
    ).toEqual({ kind: "none", why: "no use left" });
  });

  it("the pills' words, and when they are asked: two ways or more, a spent one counted", () => {
    const ways = cw.castWays({
      copies: [legacy(0), pactCopy],
      slots: slots({ spell1: [3, 4, 1], pact: [2, 2, 2] }),
      level: 1
    });
    expect(ways.map(cw.wayPill)).toEqual([
      { label: "Free Casting (Fiendish Legacy)", count: "0/1" },
      { label: "Level 1 Slot", count: "3/4" },
      { label: "Pact Slot (Level 2)", count: "2/2" }
    ]);
    expect(cw.asksWay(ways)).toBe(true);
    expect(cw.asksWay(ways.slice(0, 1))).toBe(false);
  });

  it("the pills: the pick ticked, a spent way greyed and unpickable", () => {
    const html = payPillsHTML({
      name: "bf-pay",
      pick: "slot:pact",
      ways: [
        { key: "free:legacy", label: "Free Casting (Fiendish Legacy)", count: "0/1", off: true },
        { key: "slot:pact", label: "Pact Slot (Level 2)", count: "2/2", off: false }
      ]
    });
    expect(html).toMatch(/value="free:legacy"[^>]* disabled/);
    expect(html).toMatch(/value="slot:pact" checked/);
    expect(html).toContain("Free Casting (Fiendish Legacy)");
  });

  it("the button's cost names the way", () => {
    expect(
      cw.castWayCost({
        kind: "free",
        key: "free:a",
        copyId: "a",
        forwardId: "f",
        left: 1,
        max: 1,
        grant: "",
        off: false
      })
    ).toBe("a Reaction · the free cast (1 of 1 left)");
    expect(
      cw.castWayCost({
        kind: "slot",
        key: "slot:pact",
        copyId: "a",
        slot: "pact",
        slotLevel: 2,
        left: 2,
        max: 2,
        off: false
      })
    ).toBe("a Reaction, a Pact slot (level 2)");
    expect(
      cw.castWayCost(
        {
          kind: "slot",
          key: "slot:spell3",
          copyId: "a",
          slot: "spell3",
          slotLevel: 3,
          left: 1,
          max: 1,
          off: false
        },
        { reaction: false }
      )
    ).toBe("a level 3 slot");
  });
});

describe("cast ways — a feature's cast: at will, its own uses, another pool (Favored Enemy, Shadow Arts, War God's Blessing)", () => {
  const slots = o =>
    Object.entries(o).map(([key, [value, max, level]]) => ({ key, value, max, level }));
  const favored = left => ({
    id: "fe",
    method: "spell",
    slotted: true,
    cached: true,
    grant: "Favored Enemy",
    free: { left, max: 2, forwardId: null }
  });
  const ranger = { id: "ranger", method: "spell", slotted: true, free: null };

  it("Favored Enemy's free casts first, then the slots; a slot goes through the sheet's own copy when there is one", () => {
    const ways = cw.castWays({
      copies: [favored(2), ranger],
      slots: slots({ spell1: [3, 4, 1] }),
      level: 1
    });
    expect(ways.map(w => w.key)).toEqual(["free:fe", "slot:spell1"]);
    expect(ways[1]).toMatchObject({ copyId: "ranger" });
    expect(cw.wayPill(ways[0])).toEqual({ label: "Free Casting (Favored Enemy)", count: "2/2" });
  });

  it("the feature's copy alone: the slot goes through it (the module spends the slot by hand)", () => {
    const way = cw.chooseCastWay({
      copies: [favored(0)],
      slots: slots({ spell1: [3, 4, 1] }),
      level: 1
    });
    expect(way).toMatchObject({ kind: "slot", copyId: "fe", slot: "spell1" });
  });

  it("at will leads, never spent, no count", () => {
    const armor = {
      id: "aos",
      method: "spell",
      slotted: false,
      cached: true,
      grant: "Armor of Shadows",
      free: { left: 0, max: 0, forwardId: null, atWill: true }
    };
    const ways = cw.castWays({
      copies: [ranger, armor],
      slots: slots({ spell1: [1, 2, 1] }),
      level: 1
    });
    expect(ways.map(w => `${w.key}${w.off ? " off" : ""}`)).toEqual(["free:aos", "slot:spell1"]);
    expect(cw.wayPill(ways[0])).toEqual({ label: "At Will (Armor of Shadows)", count: "" });
    expect(cw.castWayCost(ways[0])).toBe("a Reaction · at will");
  });

  it("another pool comes after the slots, off below its cost", () => {
    const blessing = {
      id: "wgb",
      method: "spell",
      slotted: true,
      cached: true,
      grant: "War God's Blessing",
      free: null,
      pool: { left: 1, max: 2, cost: 1, name: "Channel Divinity" }
    };
    const shadow = {
      id: "sa",
      method: "spell",
      slotted: false,
      cached: true,
      grant: "Shadow Arts",
      free: null,
      pool: { left: 1, max: 5, cost: 2, name: "Monk's Focus" }
    };
    const ways = cw.castWays({
      copies: [blessing, shadow],
      slots: slots({ spell1: [2, 2, 1] }),
      level: 1
    });
    expect(ways.map(w => `${w.key}${w.off ? " off" : ""}`)).toEqual([
      "slot:spell1",
      "pool:wgb",
      "pool:sa off"
    ]);
    expect(ways.slice(1).map(cw.wayPill)).toEqual([
      { label: "Channel Divinity (War God's Blessing)", count: "1/2" },
      { label: "Monk's Focus ×2 (Shadow Arts)", count: "1/5" }
    ]);
    expect(cw.castWayCost(ways[1], { reaction: false })).toBe("1 Channel Divinity (1 left)");
    expect(cw.chooseCastWay({ copies: [shadow], slots: [], level: 2 })).toEqual({
      kind: "none",
      why: "no use left"
    });
  });
});
