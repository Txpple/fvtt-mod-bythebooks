import { beforeAll, describe, expect, it } from "vitest";
import { expectPointer } from "./rule-pointer.js";

/**
 * DECISION-layer hit menu (ARCHITECTURE.md §2). No Foundry stub on purpose. The flow is the
 * user's ruling (2026-09-04, the prototype *By the Books Hit Menu*, built as drawn): one popup per
 * hit, the rows grouped by the feature that pays, the row the name and its cost, one pick per
 * group, the pool the switch the rules give.
 */
/** @type {typeof import("../scripts/decide/hit-menu.js")} */
let h;
/** @type {typeof import("../scripts/decide/registry.js")} */
let reg;
beforeAll(async () => {
  h = await import("../scripts/decide/hit-menu.js");
  reg = await import("../scripts/decide/registry.js");
});

const ALL = () => Object.values(reg.HIT_OPTIONS).map(r => r.feature);
const menu = (features, extra = {}) =>
  h.hitMenu({
    groups: reg.HIT_GROUPS,
    options: reg.HIT_OPTIONS,
    listed: ALL(),
    features,
    pools: { "combat-superiority": { left: 4, die: "1d8" } },
    ...extra
  });

describe("the table", () => {
  it("names eight on-hit maneuvers paying from Combat Superiority and three Giant Ancestry boons, with a rule each", () => {
    const rows = Object.values(reg.HIT_OPTIONS);
    const by = g => rows.filter(r => r.group === g).map(r => r.feature);
    expect(by("combat-superiority")).toHaveLength(8);
    // Fire's Burn and Frost's Chill are clock riders (user, 2026-09-24: "yes you should switch").
    expect(by("giant-ancestry")).toEqual(["Hill's Tumble"]);
    // A2: the Monk's four options (Open Hand Technique's three share one item) and the Psi Warrior's.
    expect(by("monks-focus")).toEqual(["Stunning Strike", "Hand of Harm"]);
    expect(by("open-hand-technique")).toEqual([
      "Open Hand Technique",
      "Open Hand Technique",
      "Open Hand Technique"
    ]);
    expect(by("elemental-attunement")).toEqual(["Elemental Attunement"]);
    expect(by("psionic-power")).toEqual(["Psionic Power"]);
    // B3: the Brutal Strike group — two of the feature's own, two of Improved's riding the same die.
    expect(by("brutal-strike")).toEqual([
      "Brutal Strike",
      "Brutal Strike",
      "Improved Brutal Strike",
      "Improved Brutal Strike"
    ]);
    // the smite: the eight smite spells, each on a Melee weapon or an Unarmed Strike hit, its Bonus Action said
    expect(by("smite")).toEqual([
      "Divine Smite",
      "Searing Smite",
      "Thunderous Smite",
      "Wrathful Smite",
      "Shining Smite",
      "Blinding Smite",
      "Staggering Smite",
      "Banishing Smite"
    ]);
    for (const r of rows.filter(r => r.group === "smite")) {
      expect(r).toMatchObject({ spell: true, melee: true, weapons: "melee" });
    }
    // the Bonus Action said once, on the group (the compact smite)
    expect(reg.HIT_GROUPS.smite.note).toBe("Requires a Bonus Action — determined by the table");
    expect(rows).toHaveLength(36); // + Eldritch Smite (B4), Hurl Through Hell (C1), Arcana Unleashed's six Arcane Shot options, the eight smites
    for (const row of rows) {
      expect(reg.HIT_GROUPS[row.group]).toBeTruthy();
      expectPointer(row.rule, row.feature);
      expect(row.rule.item).toBe(row.feature);
    }
    for (const [key, g] of Object.entries(reg.HIT_GROUPS)) {
      expect(["feature", "option", "free", "pactSlot", "spell"], key).toContain(g.pool); // pactSlot: Eldritch Smite (B4); spell: the smite
      expect(g.eyebrow && g.heading && g.per && g.dieLabel, key).toBeTruthy();
    }
    expect(reg.HIT_OPTIONS["sweeping-attack"]).toMatchObject({ mode: "sweep", melee: true });
    expect(reg.HIT_OPTIONS["trip-attack"]).toMatchObject({ save: true, onFail: "prone" });
    expect(reg.HIT_OPTIONS["distracting-strike"]).toMatchObject({ effects: true });
  });

  it("keeps Precision Attack and Riposte out — they are folds", () => {
    expect(ALL()).not.toContain("Precision Attack");
    expect(ALL()).not.toContain("Riposte");
  });
});

describe("hitMenu — the rows, read off the sheet", () => {
  it("a Battle Master with three maneuvers: one group, three rows, the die as the cost", () => {
    const m = menu(["Combat Superiority", "Trip Attack", "Goading Attack", "Menacing Attack"]);
    expect(m.groups).toHaveLength(1);
    const g = m.groups[0];
    expect(g).toMatchObject({
      key: "combat-superiority",
      label: "Combat Superiority",
      max: 1,
      die: "1d8",
      left: 4
    });
    expect(g.rows.map(r => r.key)).toEqual(["trip-attack", "goading-attack", "menacing-attack"]);
    expect(g.rows[0]).toMatchObject({
      label: "Trip Attack",
      cost: "1d8 Superiority Die",
      affordable: true,
      caveat: null
    });
  });

  it("no Combat Superiority on the sheet, no group — a maneuver alone pays for nothing", () => {
    expect(menu(["Trip Attack"]).groups).toEqual([]);
  });

  it("the list is the switch: an unlisted maneuver is absent, an empty list offers nothing", () => {
    const m = menu(["Combat Superiority", "Trip Attack", "Goading Attack"], {
      listed: ["Goading Attack"]
    });
    expect(m.groups[0].rows.map(r => r.key)).toEqual(["goading-attack"]);
    expect(menu(["Combat Superiority", "Trip Attack"], { listed: [] }).groups).toEqual([]);
  });

  it("no dice left: the rows stay, greyed", () => {
    const m = menu(["Combat Superiority", "Trip Attack"], {
      pools: { "combat-superiority": { left: 0, die: "1d8" } }
    });
    expect(m.groups[0].left).toBe(0);
    expect(m.groups[0].rows[0].affordable).toBe(false);
  });

  it("a pool that could not be read is no group at all; a die that could not be read is unaffordable", () => {
    expect(menu(["Combat Superiority", "Trip Attack"], { pools: {} }).groups).toEqual([]);
    const m = menu(["Combat Superiority", "Trip Attack"], {
      pools: { "combat-superiority": { left: 4, die: null } }
    });
    expect(m.groups[0].rows[0].affordable).toBe(false);
  });

  it("Sweeping Attack is a melee maneuver: absent on a ranged attack", () => {
    const feats = ["Combat Superiority", "Sweeping Attack", "Trip Attack"];
    expect(menu(feats, { melee: true }).groups[0].rows.map(r => r.key)).toEqual([
      "trip-attack",
      "sweeping-attack"
    ]);
    expect(menu(feats, { melee: false }).groups[0].rows.map(r => r.key)).toEqual(["trip-attack"]);
  });
});

describe("Giant Ancestry — a group with no feature, paying per option (Slice A, 2026-09-24)", () => {
  const giant = (features, pools, extra = {}) =>
    h.hitMenu({
      groups: reg.HIT_GROUPS,
      options: reg.HIT_OPTIONS,
      listed: ALL(),
      features,
      pools,
      ...extra
    });

  // A die-carrying option-pool row: none ships since the boons moved to CLOCK_RIDERS (user,
  // 2026-09-24: "yes you should switch"), but the mechanism stands — a synthetic row proves it.
  const BOON = {
    "boon-x": {
      feature: "Boon X",
      group: "giant-ancestry",
      rule: "A synthetic boon that rides a die of its own type."
    }
  };

  it("the table: Hill's Tumble presses Prone up to Large, the group requires nothing and pays per option", () => {
    expect(reg.HIT_GROUPS["giant-ancestry"]).toMatchObject({
      feature: null,
      pool: "option",
      dieLabel: "use"
    });
    expect(reg.HIT_OPTIONS["hills-tumble"]).toMatchObject({ press: "prone", maxSize: "lg" });
  });

  it("a die-carrying option: its own group, its own uses, the option's die and damage type as the cost", () => {
    const m = giant(
      ["Boon X"],
      { "boon-x": { left: 3, die: "1d10", type: "fire" } },
      { options: BOON, listed: ["Boon X"] }
    );
    expect(m.groups).toHaveLength(1);
    expect(m.groups[0]).toMatchObject({
      key: "giant-ancestry",
      perOption: true,
      left: 3,
      die: null,
      heading: "Giant Ancestry",
      per: "one boon per hit",
      eyebrow: "Giant Ancestry"
    });
    expect(m.groups[0].rows[0]).toMatchObject({
      key: "boon-x",
      cost: "1d10 fire · 3 uses left",
      affordable: true
    });
  });

  it("an option without a readable pool is absent; no uses left greys it", () => {
    expect(giant(["Hill's Tumble"], {}).groups).toEqual([]);
    const m = giant(
      ["Hill's Tumble"],
      { "hills-tumble": { left: 0, die: null } },
      { fits: { "hills-tumble": true } }
    );
    expect(m.groups[0].left).toBe(0);
    expect(m.groups[0].rows[0].affordable).toBe(false);
  });

  it("a dieless PRESS row shows its uses left and is affordable on its uses alone", () => {
    const m = giant(
      ["Hill's Tumble"],
      { "hills-tumble": { left: 2, max: 3, die: null } },
      { fits: { "hills-tumble": true } }
    );
    expect(m.groups[0].rows[0]).toMatchObject({
      key: "hills-tumble",
      cost: "2 of 3 uses left",
      affordable: true,
      caveat: null
    });
  });

  it("the size judge: a target larger than Large greys Hill's Tumble with the fact as its tag; an unread size leaves it open", () => {
    const pools = { "hills-tumble": { left: 2, die: null } };
    const big = giant(["Hill's Tumble"], pools, { fits: { "hills-tumble": false } }).groups[0]
      .rows[0];
    expect(big).toMatchObject({
      cost: "too large",
      affordable: false,
      caveat: "the target is larger than Large"
    });
    const unread = giant(["Hill's Tumble"], pools, { fits: {} }).groups[0].rows[0];
    expect(unread.affordable).toBe(true);
    expect(unread.caveat).toMatch(/could not be read/);
  });

  it("a Goliath Battle Master sees both groups, and a pick in EACH rides the hit (2026-09-27)", () => {
    const m = giant(
      ["Combat Superiority", "Trip Attack", "Hill's Tumble"],
      { "combat-superiority": { left: 4, die: "1d8" }, "hills-tumble": { left: 3, die: null } },
      { fits: { "hills-tumble": true } }
    );
    expect(m.groups.map(g => g.key)).toEqual(["combat-superiority", "giant-ancestry"]);
    expect(h.hitPick({ menu: m, chosen: ["hills-tumble"] }).picks.map(p => p.row.key)).toEqual([
      "hills-tumble"
    ]);
    const both = h.hitPick({ menu: m, chosen: ["trip-attack", "hills-tumble"] });
    expect(both.picks.map(p => [p.group, p.row.key])).toEqual([
      ["combat-superiority", "trip-attack"],
      ["giant-ancestry", "hills-tumble"]
    ]);
    expect(both.dropped).toEqual([]);
  });
});

describe("hitPick — one per group, affordable", () => {
  const m = () => menu(["Combat Superiority", "Trip Attack", "Goading Attack"]);
  it("one pick is one pick", () => {
    const p = h.hitPick({ menu: m(), chosen: ["trip-attack"] });
    expect(p.picks.map(x => x.row.key)).toEqual(["trip-attack"]);
    expect(p.dropped).toEqual([]);
  });
  it("two in one group is illegal — both dropped, nothing rides", () => {
    const p = h.hitPick({ menu: m(), chosen: ["trip-attack", "goading-attack"] });
    expect(p.picks).toEqual([]);
    expect(p.dropped.sort()).toEqual(["goading-attack", "trip-attack"]);
  });
  it("an unaffordable row is dropped", () => {
    const empty = menu(["Combat Superiority", "Trip Attack"], {
      pools: { "combat-superiority": { left: 0, die: "1d8" } }
    });
    expect(h.hitPick({ menu: empty, chosen: ["trip-attack"] })).toEqual({
      picks: [],
      dropped: ["trip-attack"]
    });
  });
  it("nothing chosen is nothing", () => {
    expect(h.hitPick({ menu: m() })).toEqual({ picks: [], dropped: [] });
  });
});

describe("sweepVerdict — would the original roll hit the second creature?", () => {
  it("the total against the AC; a critical always, a fumble never; no AC is unknown", () => {
    expect(h.sweepVerdict({ total: 18, ac: 15 })).toBe("hit");
    expect(h.sweepVerdict({ total: 14, ac: 15 })).toBe("miss");
    expect(h.sweepVerdict({ total: 15, ac: 15 })).toBe("hit");
    expect(h.sweepVerdict({ total: 3, isCritical: true, ac: 25 })).toBe("hit");
    expect(h.sweepVerdict({ total: 30, isFumble: true, ac: 10 })).toBe("miss");
    expect(h.sweepVerdict({ total: 18, ac: null })).toBe("unknown");
  });
});

describe("the smite", () => {
  const smite = () => ({ smite: reg.HIT_GROUPS.smite });
  const options = () => ({ "divine-smite": reg.HIT_OPTIONS["divine-smite"] });
  const listed = ["divine smite"];
  it("a spell group pays per option: the row's own words, affordable while a cast way stands", () => {
    const on = h.hitMenu({
      groups: smite(),
      options: options(),
      listed,
      features: ["Divine Smite"],
      melee: true,
      pools: {
        "divine-smite": { left: 1, max: 0, die: "2d8", type: "radiant", cost: "2d8 radiant" }
      }
    });
    expect(on.groups[0]).toMatchObject({ key: "smite", spell: true, perOption: true });
    expect(on.groups[0].rows[0]).toMatchObject({
      key: "divine-smite",
      cost: "2d8 radiant",
      affordable: true
    });
    const spent = h.hitMenu({
      groups: smite(),
      options: options(),
      listed,
      features: ["Divine Smite"],
      melee: true,
      pools: {
        "divine-smite": { left: 0, max: 0, die: "2d8", type: "radiant", cost: "2d8 radiant" }
      }
    });
    expect(spent.groups[0].rows[0].affordable).toBe(false);
  });
  it("no smite on a ranged hit, nor without the spell on the sheet", () => {
    const pools = {
      "divine-smite": { left: 1, max: 0, die: "2d8", type: "radiant", cost: "2d8 radiant" }
    };
    expect(
      h.hitMenu({
        groups: smite(),
        options: options(),
        listed,
        features: ["Divine Smite"],
        melee: false,
        pools
      }).groups
    ).toEqual([]);
    expect(
      h.hitMenu({ groups: smite(), options: options(), listed, features: [], melee: true, pools })
        .groups
    ).toEqual([]);
  });
  it("a Melee weapon or an Unarmed Strike reaches it", () => {
    const row = reg.HIT_OPTIONS["divine-smite"];
    const at = o =>
      h.optionReaches({
        row,
        unarmed: false,
        weapon: false,
        monkWeapon: false,
        own: false,
        flurry: null,
        ...o
      });
    expect(at({ weapon: true })).toBe(true);
    expect(at({ unarmed: true })).toBe(true);
    expect(at({})).toBe(false);
  });
  it("the dice at a higher slot: whole adds the step a level, half every second level", () => {
    expect(
      h.scaledDice({ number: 2, denomination: 8, scaling: { mode: "whole", number: 1 } }, 2)
    ).toMatchObject({ number: 4 });
    expect(
      h.scaledDice({ number: 2, denomination: 8, scaling: { mode: "whole", number: 1 } }, 0)
    ).toMatchObject({ number: 2 });
    expect(h.scaledDice({ number: 5, denomination: 10, scaling: { mode: "" } }, 3)).toMatchObject({
      number: 5
    });
    expect(
      h.scaledDice({ number: 1, denomination: 6, scaling: { mode: "half", number: 1 } }, 3)
    ).toMatchObject({ number: 2 });
  });
});
