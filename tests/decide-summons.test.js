import { beforeAll, describe, expect, it } from "vitest";

/**
 * DECISION-layer summons (ARCHITECTURE.md §2; issue #1): the form rows off the profiles, the spell's
 * own choice, the record and the answer folded into it, the narrowed breath, the shared resistance,
 * the ownership grant. No Foundry stub on purpose.
 */
/** @type {typeof import("../scripts/decide/summons.js")} */
let s;
/** @type {typeof import("../scripts/decide/registry.js")} */
let reg;
beforeAll(async () => {
  s = await import("../scripts/decide/summons.js");
  reg = await import("../scripts/decide/registry.js");
});

const listed = () => new Set(Object.keys(reg.SUMMON_CHOICES).map(k => k.toLowerCase()));

// The PHB's Summon Fey, as the pack ships it: three profiles, one per form, no level band.
const fey = [
  {
    _id: "fum",
    name: "Fuming Fey Spirit",
    uuid: "Compendium.phb.actors.Actor.fum",
    count: "",
    level: { min: null, max: null },
    types: []
  },
  {
    _id: "mir",
    name: "Mirthful Fey Spirit",
    uuid: "Compendium.phb.actors.Actor.mir",
    count: "1",
    level: {},
    types: []
  },
  {
    _id: "tri",
    name: "Tricksy Fey Spirit",
    uuid: "Compendium.phb.actors.Actor.tri",
    level: {},
    types: []
  }
];
// Find Familiar: a CR 0 pool, no creature.
const familiar = [
  { _id: "fam", name: "", uuid: null, count: "1", cr: "0", level: {}, types: ["beast"] }
];
// Animate Objects' size rows, banded by nothing; a banded profile for the level test.
const banded = [
  { _id: "lo", name: "Low", uuid: "Actor.lo", level: { min: 1, max: 3 } },
  { _id: "hi", name: "High", uuid: "Actor.hi", level: { min: 4, max: null } }
];

describe("profileRows — the profiles a cast may summon", () => {
  it("every profile in the band, as rows; a blank count is 1; a cr-mode profile keeps its cap", () => {
    const rows = s.profileRows(fey, 3);
    expect(rows.map(r => r.id)).toEqual(["fum", "mir", "tri"]);
    expect(rows[0].count).toBe("1");
    expect(rows[0].cr).toBeNull();
    expect(s.profileRows(familiar, 1)[0]).toMatchObject({
      id: "fam",
      uuid: null,
      cr: "0",
      types: ["beast"]
    });
  });
  it("a level band is inclusive and open-ended on a null bound", () => {
    expect(s.profileRows(banded, 3).map(r => r.id)).toEqual(["lo"]);
    expect(s.profileRows(banded, 4).map(r => r.id)).toEqual(["hi"]);
    expect(s.profileRows(banded, 9).map(r => r.id)).toEqual(["hi"]);
    expect(s.profileRows([{ name: "no id" }], 1)).toEqual([]);
  });
});

describe("choiceRowKey and formNeeds — what the popup asks", () => {
  it("Summon Dragon answers to its row; Summon Fey to none; an unlisted row answers nothing", () => {
    expect(s.choiceRowKey(reg.SUMMON_CHOICES, "Summon Dragon", listed())).toBe("Summon Dragon");
    expect(s.choiceRowKey(reg.SUMMON_CHOICES, "summon dragon", listed())).toBe("Summon Dragon");
    expect(s.choiceRowKey(reg.SUMMON_CHOICES, "Summon Fey", listed())).toBeNull();
    expect(s.choiceRowKey(reg.SUMMON_CHOICES, "Summon Dragon", new Set())).toBeNull();
    expect(s.choiceRowKey(reg.SUMMON_CHOICES, null, listed())).toBeNull();
  });
  it("three forms ask the form; one form with a choice asks the choice; a pool asks the pool; one form and nothing else asks nothing", () => {
    expect(s.formNeeds({ profiles: s.profileRows(fey, 3), choice: null })).toMatchObject({
      profile: true,
      pool: false,
      choice: false,
      any: true
    });
    expect(
      s.formNeeds({ profiles: [{ uuid: "Actor.d", cr: null }], choice: "Summon Dragon" })
    ).toMatchObject({ profile: false, choice: true, any: true });
    expect(s.formNeeds({ profiles: s.profileRows(familiar, 1), choice: null })).toMatchObject({
      profile: false,
      pool: true,
      any: true
    });
    expect(s.formNeeds({ profiles: [{ uuid: "Actor.x", cr: null }], choice: null }).any).toBe(
      false
    );
  });
});

describe("summonRecord and placedAnswer — the record and the answer folded in", () => {
  const record = () =>
    s.summonRecord({
      sourceUuid: "Actor.c",
      sourceName: "Corin",
      itemUuid: "Actor.c.Item.sd",
      itemName: "Summon Dragon",
      activityUuid: "Actor.c.Item.sd.Activity.a",
      level: 5,
      profiles: [
        {
          id: "drg",
          name: "Draconic Spirit",
          uuid: "Compendium.phb.actors.Actor.drg",
          count: "1",
          cr: null,
          types: []
        }
      ],
      choice: "Summon Dragon",
      concentrationId: "conc1",
      sceneId: "scene1"
    });
  const place = [{ x: 100, y: 200, elevation: 0, rotation: 0, level: null }];

  it("the record starts asked, carrying the caster, the cast, the level, the profiles, the choice and the scene", () => {
    const r = record();
    expect(r).toMatchObject({
      status: "asked",
      sourceUuid: "Actor.c",
      level: 5,
      choice: "Summon Dragon",
      concentrationId: "conc1",
      sceneId: "scene1"
    });
    expect(r.profiles).toHaveLength(1);
    expect(typeof r.askedAt).toBe("number");
  });
  it("one profile needs no profileId; the dragon's type must be one of the row's; the placements must be squares", () => {
    const r = record();
    const ok = s.placedAnswer(
      r,
      { profileId: null, choice: "fire", placements: place, count: 1, sceneId: "scene1" },
      reg.SUMMON_CHOICES
    );
    expect(ok).toMatchObject({
      status: "placed",
      profileId: "drg",
      summonUuid: "Compendium.phb.actors.Actor.drg",
      picked: "fire",
      count: 1,
      sceneId: "scene1"
    });
    expect(ok.placements).toEqual([{ x: 100, y: 200, elevation: 0, rotation: 0, level: null }]);
    expect(
      s.placedAnswer(
        r,
        { profileId: null, choice: "radiant", placements: place, count: 1 },
        reg.SUMMON_CHOICES
      )
    ).toBeNull();
    expect(
      s.placedAnswer(
        r,
        { profileId: null, choice: "fire", placements: [], count: 1 },
        reg.SUMMON_CHOICES
      )
    ).toBeNull();
    expect(
      s.placedAnswer(
        r,
        { profileId: null, choice: "fire", placements: [{ x: "a", y: 1 }], count: 1 },
        reg.SUMMON_CHOICES
      )
    ).toBeNull();
  });
  it("a familiar's type is asked of every form it lands, Pact of the Chain's Imp too", () => {
    const r = {
      ...record(),
      itemName: "Find Familiar",
      choice: null,
      mode: "cr",
      creatureTypes: ["celestial", "fey", "fiend"],
      profiles: [{ id: "cr0", name: "CR 0 Beast", uuid: null, count: "1", cr: "0", types: [] }]
    };
    const imp = { uuid: "Compendium.phb.actors.Actor.imp", name: "Imp" };
    expect(
      s.placedAnswer(
        r,
        { profileId: "cr0", pick: imp, placements: place, count: 1 },
        reg.SUMMON_CHOICES
      )
    ).toBeNull();
    expect(
      s.placedAnswer(
        r,
        { profileId: "cr0", pick: imp, creatureType: "fey", placements: place, count: 1 },
        reg.SUMMON_CHOICES
      )
    ).toMatchObject({ summonUuid: imp.uuid, summonName: "Imp", creatureType: "fey" });
  });
  it("several profiles need the one picked, and it must be one of the record's; a pool profile needs the pick", () => {
    const r = { ...record(), choice: null, profiles: s.profileRows(fey, 3) };
    expect(
      s.placedAnswer(r, { profileId: "mir", placements: place, count: 1 }, reg.SUMMON_CHOICES)
    ).toMatchObject({
      profileId: "mir",
      profileName: "Mirthful Fey Spirit",
      summonUuid: "Compendium.phb.actors.Actor.mir"
    });
    expect(
      s.placedAnswer(r, { profileId: "nope", placements: place, count: 1 }, reg.SUMMON_CHOICES)
    ).toBeNull();
    expect(
      s.placedAnswer(r, { profileId: null, placements: place, count: 1 }, reg.SUMMON_CHOICES)
    ).toBeNull();
    const pool = { ...record(), choice: null, profiles: s.profileRows(familiar, 1) };
    expect(
      s.placedAnswer(pool, { profileId: null, placements: place, count: 1 }, reg.SUMMON_CHOICES)
    ).toBeNull();
    expect(
      s.placedAnswer(
        pool,
        {
          profileId: null,
          pick: { uuid: "Compendium.mm.actors.Actor.owl", name: "Owl" },
          placements: place,
          count: 1
        },
        reg.SUMMON_CHOICES
      )
    ).toMatchObject({ summonUuid: "Compendium.mm.actors.Actor.owl", summonName: "Owl" });
  });
  it("a record not asked folds nothing", () => {
    expect(
      s.placedAnswer(
        { ...record(), status: "placed" },
        { profileId: null, choice: "fire", placements: place, count: 1 },
        reg.SUMMON_CHOICES
      )
    ).toBeNull();
  });
});

describe("narrowedActivities — the breath narrowed to one type", () => {
  // The Draconic Spirit's Breath Weapon as the pack ships it: one 2d6 part carrying all five types.
  const breath = {
    act1: {
      damage: {
        parts: [
          { number: 2, denomination: 6, types: ["acid", "cold", "fire", "lightning", "poison"] }
        ]
      }
    }
  };
  it("the part keeps only the chosen type, on the activity's path", () => {
    const out = s.narrowedActivities(breath, "fire");
    expect(Object.keys(out)).toEqual(["system.activities.act1.damage.parts"]);
    expect(out["system.activities.act1.damage.parts"][0]).toMatchObject({
      number: 2,
      denomination: 6,
      types: ["fire"]
    });
  });
  it("a part that never listed the type is left alone; nothing matching is null", () => {
    const two = {
      a: { damage: { parts: [{ types: ["fire", "cold"] }, { types: ["piercing"] }] } },
      b: { damage: { parts: [{ types: ["slashing"] }] } }
    };
    const out = s.narrowedActivities(two, "cold");
    expect(out["system.activities.a.damage.parts"]).toEqual([
      { types: ["cold"] },
      { types: ["piercing"] }
    ]);
    expect(out["system.activities.b.damage.parts"]).toBeUndefined();
    expect(s.narrowedActivities(two, "radiant")).toBeNull();
    expect(s.narrowedActivities(two, "")).toBeNull();
  });
});

describe("resistanceEffectData and ownershipGrant — what lands on the caster and who owns the creature", () => {
  it("the resistance is one ADD on the damage-resistance trait, never transferred", () => {
    const e = s.resistanceEffectData({
      type: "Fire",
      name: "Shared Resistance (Fire)",
      origin: "Actor.c.Item.sd"
    });
    expect(e).toMatchObject({
      name: "Shared Resistance (Fire)",
      transfer: false,
      disabled: false,
      origin: "Actor.c.Item.sd"
    });
    expect(e.changes).toEqual([
      { key: "system.traits.dr.value", mode: 2, value: "fire", priority: null }
    ]);
  });
  it("every owner of the caster who does not yet own the creature is granted; the default is never copied", () => {
    expect(s.ownershipGrant({ default: 0, p1: 3, p2: 1, gm: 3 }, { default: 0, gm: 3 })).toEqual({
      p1: 3
    });
    expect(s.ownershipGrant({ default: 3, p1: 3 }, { p1: 3 })).toBeNull();
    expect(s.ownershipGrant({}, {})).toBeNull();
  });
});

describe("seatInitiative — the creature right after the caster", () => {
  it("a hair below the caster's Initiative; none without one", () => {
    expect(s.seatInitiative(17)).toBe(16.99);
    expect(s.seatInitiative(17.5)).toBe(17.49);
    expect(s.seatInitiative(null)).toBeNull();
    expect(s.seatInitiative(undefined)).toBeNull();
  });
});

// The PHB's Find Familiar, as the pack ships it (2026-10-12): one cr-mode profile with the Bat's uuid
// beside its cap, and Celestial, Fey or Fiend offered as the creature type.
const phbFamiliar = {
  status: "asked",
  mode: "cr",
  choice: null,
  sceneId: "sc1",
  creatureSizes: [],
  creatureTypes: ["celestial", "fey", "fiend"],
  profiles: [
    {
      id: "p0",
      name: "CR 0 Beast",
      uuid: "Compendium.dnd-players-handbook.actors.Actor.phbmobBat0000000",
      count: "1",
      cr: "0",
      types: ["beast"]
    }
  ]
};
const square = [{ x: 100, y: 200 }];

describe("Find Familiar — the pool and the creature type the spell asks", () => {
  it("a cr-mode profile asks the pool even with a default creature; the creature type is asked when several are offered", () => {
    const needs = s.formNeeds({
      profiles: phbFamiliar.profiles,
      choice: null,
      mode: "cr",
      creatureTypes: phbFamiliar.creatureTypes,
      creatureSizes: []
    });
    expect(needs).toMatchObject({ profile: false, pool: true, type: true, size: false, any: true });
    // a record from before the mode was stamped: a uuid still means "this creature"
    expect(s.formNeeds({ profiles: phbFamiliar.profiles, choice: null }).pool).toBe(false);
    expect(s.poolPicks({ uuid: null, cr: "0" }, null)).toBe(true);
    expect(s.poolPicks({ uuid: "x", cr: null }, "cr")).toBe(false);
  });
  it("the answer needs the pick and one of the offered types; the pick is what lands, never the profile's default", () => {
    const pick = {
      uuid: "Compendium.dnd-monster-manual.actors.Actor.mmOwl00000000000",
      name: "Owl"
    };
    expect(
      s.placedAnswer(
        phbFamiliar,
        { profileId: "p0", placements: square, count: 1, creatureType: "fey" },
        {}
      )
    ).toBeNull();
    expect(
      s.placedAnswer(phbFamiliar, { profileId: "p0", pick, placements: square, count: 1 }, {})
    ).toBeNull();
    expect(
      s.placedAnswer(
        phbFamiliar,
        { profileId: "p0", pick, placements: square, count: 1, creatureType: "undead" },
        {}
      )
    ).toBeNull();
    const patch = s.placedAnswer(
      phbFamiliar,
      { profileId: "p0", pick, placements: square, count: 1, creatureType: "fiend" },
      {}
    );
    expect(patch).toMatchObject({
      status: "placed",
      summonUuid: pick.uuid,
      summonName: "Owl",
      creatureType: "fiend",
      creatureSize: null
    });
  });
  it("one offered type is taken without asking; none is null", () => {
    expect(s.listAnswer(["fey"], null)).toEqual({ ok: true, value: "fey" });
    expect(s.listAnswer([], "fey")).toEqual({ ok: true, value: null });
    expect(s.listAnswer(["sm", "med"], null)).toEqual({ ok: false, value: null });
  });
  it("the record carries the mode, the offered lists and the range", () => {
    const r = s.summonRecord({
      sourceUuid: "a",
      sourceName: "A",
      itemUuid: "i",
      itemName: "Find Familiar",
      activityUuid: "x",
      level: 1,
      profiles: phbFamiliar.profiles,
      choice: null,
      concentrationId: null,
      sceneId: "sc1",
      mode: "cr",
      creatureTypes: ["celestial", "fey", "fiend"],
      rangeFt: 10
    });
    expect(r).toMatchObject({
      mode: "cr",
      creatureTypes: ["celestial", "fey", "fiend"],
      creatureSizes: [],
      rangeFt: 10
    });
    expect(
      s.summonRecord({
        sourceUuid: "a",
        sourceName: "A",
        itemUuid: "i",
        itemName: "n",
        activityUuid: "x",
        level: 1,
        profiles: [],
        choice: null,
        concentrationId: null,
        sceneId: null
      }).rangeFt
    ).toBeNull();
  });
});

describe("the spot picker's judgement — range, sight, an empty space", () => {
  it("rangeFeet: feet as they are, touch as 5, miles and metres in feet, self or any as no ring", () => {
    expect(s.rangeFeet({ value: 10, units: "ft" })).toBe(10);
    expect(s.rangeFeet({ value: null, units: "touch" })).toBe(5);
    expect(s.rangeFeet({ value: 1, units: "mi" })).toBe(5280);
    expect(s.rangeFeet({ value: 3, units: "m" })).toBe(10);
    expect(s.rangeFeet({ value: null, units: "self" })).toBeNull();
    expect(s.rangeFeet({ value: "", units: "any" })).toBeNull();
    expect(s.rangeFeet(null)).toBeNull();
  });
  it("spotVerdict: range first, then the wall, then the occupant; no range is no range check", () => {
    expect(
      s.spotVerdict({ distanceFt: 15, rangeFt: 10, blocked: true, occupied: true }).why
    ).toMatch(/range/);
    expect(
      s.spotVerdict({ distanceFt: 10, rangeFt: 10, blocked: true, occupied: true }).why
    ).toMatch(/wall/);
    expect(
      s.spotVerdict({ distanceFt: 10, rangeFt: 10, blocked: false, occupied: true }).why
    ).toMatch(/occupied/);
    expect(
      s.spotVerdict({ distanceFt: 500, rangeFt: null, blocked: false, occupied: false })
    ).toEqual({ ok: true, why: null });
  });
  it("footprintsOverlap: a shared interior overlaps, edge to edge does not", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(s.footprintsOverlap(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
    expect(s.footprintsOverlap(a, { x: 100, y: 0, w: 100, h: 100 })).toBe(false);
    expect(s.footprintsOverlap(a, { x: 25, y: 25, w: 50, h: 50 })).toBe(true);
  });
});

describe("replacedSummons — one familiar at a time", () => {
  const singles = new Set(["find familiar"]);
  const landed = (sourceUuid, itemName, extra = {}) => ({
    applied: true,
    outcome: "landed",
    sourceUuid,
    itemName,
    ...extra
  });
  it("the caster's earlier standing familiar goes; another caster's, a dismissed one, a failed one and the new one stay", () => {
    const records = [
      { id: "old", flag: landed("A", "Find Familiar") },
      { id: "theirs", flag: landed("B", "Find Familiar") },
      { id: "gone", flag: landed("A", "Find Familiar", { dismissed: true }) },
      { id: "asked", flag: landed("A", "Find Familiar", { dismissAsked: true }) },
      { id: "failed", flag: landed("A", "Find Familiar", { outcome: "failed" }) },
      { id: "beast", flag: landed("A", "Summon Beast") },
      { id: "none", flag: null },
      { id: "new", flag: landed("A", "Find Familiar") }
    ];
    expect(
      s.replacedSummons(records, { id: "new", sourceUuid: "A", itemName: "Find Familiar" }, singles)
    ).toEqual(["old"]);
  });
  it("a spell that is not a single replaces nothing", () => {
    const records = [{ id: "old", flag: landed("A", "Summon Beast") }];
    expect(
      s.replacedSummons(records, { id: "new", sourceUuid: "A", itemName: "Summon Beast" }, singles)
    ).toEqual([]);
  });
});

describe("companions — the familiar that stays", () => {
  const rec = (sourceUuid, extra = {}) => ({
    applied: true,
    outcome: "landed",
    sourceUuid,
    itemName: "Find Familiar",
    companion: { state: "present" },
    ...extra
  });
  it("the effect names it and where it waits", () => {
    expect(s.companionEffectName({ noun: "Familiar", name: "Owl", type: "Fey" })).toBe(
      "Familiar: Owl (Fey)"
    );
    expect(
      s.companionEffectName({ noun: "Familiar", name: "Owl", type: "Fey", pocket: true })
    ).toBe("Familiar: Owl (Fey) · in the pocket");
    expect(s.companionEffectName({ noun: "Familiar", name: "Cat" })).toBe("Familiar: Cat");
  });
  it("the standing companion is the owner's latest one on the table or in the pocket; a gone, dismissed or other one is not", () => {
    const records = [
      { id: "old", flag: rec("A", { placedAt: 1 }) },
      { id: "new", flag: rec("A", { placedAt: 2, companion: { state: "pocket" } }) },
      { id: "gone", flag: rec("A", { placedAt: 3, companion: { state: "gone" } }) },
      { id: "asked", flag: rec("A", { placedAt: 4, dismissAsked: true }) },
      { id: "theirs", flag: rec("B", { placedAt: 5 }) },
      { id: "plain", flag: rec("A", { placedAt: 6, companion: undefined }) }
    ];
    expect(s.currentCompanion(records, "A", "Find Familiar")).toBe("new");
    expect(s.currentCompanion(records, "C", "Find Familiar")).toBeNull();
  });
  it("the menu by its state: away or back, dismiss forever, summon", () => {
    expect(s.companionMenu("present")).toEqual(["away", "dismiss", "summon"]);
    expect(s.companionMenu("pocket")).toEqual(["recall", "dismiss", "summon"]);
    expect(s.companionMenu("present", { pocket: false })).toEqual(["dismiss", "summon"]);
  });
  it("an ask must fit the state; a recall needs a square on a scene; one ask at a time", () => {
    expect(s.companionAsk({ state: "present" }, { kind: "away" })?.ask.kind).toBe("away");
    expect(s.companionAsk({ state: "pocket" }, { kind: "away" })).toBeNull();
    expect(
      s.companionAsk(
        { state: "present" },
        { kind: "recall", placement: { x: 1, y: 2, sceneId: "s" } }
      )
    ).toBeNull();
    expect(
      s.companionAsk(
        { state: "pocket" },
        { kind: "recall", placement: { x: 1, y: 2, sceneId: null } }
      )
    ).toBeNull();
    expect(
      s.companionAsk(
        { state: "pocket" },
        { kind: "recall", placement: { x: 1, y: 2, sceneId: "s" } }
      )?.ask.placement
    ).toEqual({ x: 1, y: 2, elevation: 0, sceneId: "s" });
    expect(
      s.companionAsk({ state: "present", ask: { kind: "away" } }, { kind: "away" })
    ).toBeNull();
  });
  it("what it carried is what it did not land with, and only gear", () => {
    const items = [
      { id: "bite", type: "weapon" },
      { id: "keen", type: "feat" },
      { id: "ring", type: "equipment" },
      { id: "potion", type: "consumable" },
      { id: "note", type: "feat" }
    ];
    expect(s.carriedItemIds(items, ["bite", "keen"])).toEqual(["ring", "potion"]);
  });
  it("a cast into the pocket is carried on the answer", () => {
    const rec1 = {
      status: "asked",
      mode: null,
      choice: null,
      creatureTypes: [],
      creatureSizes: [],
      profiles: [{ id: "p", uuid: "u", cr: null }]
    };
    expect(
      s.placedAnswer(
        rec1,
        { profileId: "p", placements: [{ x: 0, y: 0 }], count: 1, intoPocket: true },
        {}
      )?.intoPocket
    ).toBe(true);
  });
});

describe("the menu before the cast — the sizes, the slot, the standing effect, the light", () => {
  const ORDER = ["tiny", "sm", "med", "lg", "huge", "grg"];
  it("sizes read smallest first, whatever order the pack ships (the Light object: sm, med, lg, tiny)", () => {
    expect(s.sizesInOrder(["sm", "med", "lg", "tiny"], ORDER)).toEqual(["tiny", "sm", "med", "lg"]);
    expect(s.sizesInOrder(["huge", "odd", "tiny"], ORDER)).toEqual(["tiny", "huge", "odd"]);
    expect(s.sizesInOrder(null, ORDER)).toEqual([]);
  });
  it("the standing effect is the spell's name, the creature's added when it says more", () => {
    expect(s.summonEffectName({ itemName: "Mage Hand", creatureName: "Mage Hand" })).toBe(
      "Mage Hand"
    );
    expect(s.summonEffectName({ itemName: "Unseen Servant" })).toBe("Unseen Servant");
    expect(
      s.summonEffectName({ itemName: "Minor Illusion", creatureName: "Illusory Object" })
    ).toBe("Minor Illusion: Illusory Object");
    expect(s.summonEffectName({ itemName: "Light", creatureName: "Glowing Stone" })).toBe(
      "Light: Glowing Stone"
    );
  });
  it("a token light from a row: the outer dim radius, the look's fields where it has them", () => {
    expect(s.tokenLight({ bright: 20, dim: 40, look: reg.SPELL_LOOKS.continualFlame })).toEqual({
      bright: 20,
      dim: 40,
      color: "#ff9a3c",
      alpha: 0.4,
      luminosity: 0.45,
      attenuation: 0.8,
      animation: { type: "torch", speed: 3, intensity: 4 }
    });
    expect(s.tokenLight({ bright: 10, dim: 5 })).toEqual({ bright: 10, dim: 10 });
  });
  it("the light spells ask where the light goes; the summoned lights shed what the text says", () => {
    expect(Object.keys(reg.SUMMON_LIGHTS)).toEqual(["Light", "Continual Flame"]);
    expect(reg.SUMMON_LOOKS["Flaming Sphere"].light).toMatchObject({ bright: 20, dim: 40 });
    expect(reg.SUMMON_LOOKS["Unseen Servant"].alpha).toBe(0.5);
  });
  it("Mage Hand, Minor Illusion and Light end when cast again (SUMMON_SINGLES)", () => {
    const singles = new Set(Object.keys(reg.SUMMON_SINGLES).map(k => k.toLowerCase()));
    const records = [
      { id: "a", flag: { applied: true, sourceUuid: "Actor.m", itemName: "Mage Hand" } }
    ];
    expect(
      s.replacedSummons(records, { id: "b", sourceUuid: "Actor.m", itemName: "Mage Hand" }, singles)
    ).toEqual(["a"]);
    expect(singles.has("minor illusion") && singles.has("light")).toBe(true);
  });
});

describe("formName — a Summon spell's form, then its type", () => {
  it("two words where the form is one word", () => {
    expect(s.formName("Summon Fey", "Tricksy Fey Spirit")).toBe("Tricksy Fey");
    expect(s.formName("Summon Undead", "Putrid Spirit")).toBe("Putrid Undead");
    expect(s.formName("Summon Beast", "Bestial Air Spirit")).toBe("Air Beast");
    expect(s.formName("Summon Construct", "Clay Construct Spirit")).toBe("Clay Construct");
    expect(s.formName("Summon Dinosaur", "Spirit Ankylosaur")).toBe("Ankylosaur Dinosaur");
    expect(s.formName("Summon Aberration", "Mind Flayer Spirit")).toBe("Mind Flayer Aberration");
  });
  it("the dragon by its picked type; any other spell, or no form left, is null", () => {
    expect(s.formName("Summon Dragon", "Draconic Spirit", "Fire")).toBe("Fire Dragon");
    expect(s.formName("Summon Dragon", "Draconic Spirit")).toBeNull();
    expect(s.formName("Find Familiar", "Owl")).toBeNull();
  });
});

describe("tokenLight — a steady look puts the creature's own flicker out", () => {
  it("Light's look has no animation: the token's is set to none", () => {
    expect(s.tokenLight({ bright: 20, dim: 40, look: reg.SPELL_LOOKS.light }).animation).toEqual({
      type: null
    });
  });
});

describe("guises — Spiritual Weapon's weapon (2026-10-13)", () => {
  const base = {
    sourceUuid: "A",
    sourceName: "Cleric",
    itemUuid: "I",
    itemName: "Spiritual Weapon",
    activityUuid: "X",
    level: 2,
    profiles: [{ id: "p1", uuid: "Compendium.x.y.Actor.sw", label: "Spiritual Weapon" }],
    choice: null,
    sceneId: "S"
  };
  const placements = [{ x: 100, y: 200 }];
  it("the table's four guises, each named Spiritual ⟨guise⟩", () => {
    expect(s.guisesOf(reg.SUMMON_GUISES["Spiritual Weapon"]).map(g => g.name)).toEqual([
      "Spiritual Mace",
      "Spiritual Maul",
      "Spiritual Sword",
      "Spiritual Scythe"
    ]);
    expect(s.guisesOf(null)).toEqual([]);
  });
  it("the answer must pick one of the record's guises, and the creature is named for it", () => {
    const record = s.summonRecord({
      ...base,
      guises: s.guisesOf(reg.SUMMON_GUISES["Spiritual Weapon"])
    });
    expect(s.placedAnswer(record, { guise: "Scythe", placements })).toMatchObject({
      guise: "Scythe",
      summonName: "Spiritual Scythe"
    });
    expect(s.placedAnswer(record, { guise: "Spear", placements })).toBeNull();
    expect(s.placedAnswer(record, { placements })).toBeNull();
  });
  it("a spell with no guises keeps its record and its name", () => {
    const record = s.summonRecord(base);
    expect(record.guises).toBeNull();
    expect(s.placedAnswer(record, { placements })).toMatchObject({
      guise: null,
      summonName: "Spiritual Weapon"
    });
  });
});

describe("the boons — a feature on the caster the pack could not land (SUMMON_BOONS, Familiar Friend)", () => {
  const effects = [
    {
      disabled: false,
      changes: [{ key: "activities[summon].bonuses.hp", value: "2 * @details.level" }]
    }
  ];
  it("the formula is the feature's own enchantment change, read by its key; a disabled effect or another key gives none", () => {
    expect(s.boonFormula(effects, "activities[summon].bonuses.hp")).toBe("2 * @details.level");
    expect(s.boonFormula(effects, "activities[summon].bonuses.ac")).toBeNull();
    expect(
      s.boonFormula([{ ...effects[0], disabled: true }], "activities[summon].bonuses.hp")
    ).toBeNull();
    expect(
      s.boonFormula(
        [{ disabled: false, changes: [{ key: "activities[summon].bonuses.hp", value: "  " }] }],
        "activities[summon].bonuses.hp"
      )
    ).toBeNull();
    expect(s.boonFormula([], "activities[summon].bonuses.hp")).toBeNull();
  });
  it("the Hit Points land dnd5e's three ways: an unlinked creature takes them on its maximum and its current, on top of what stands", () => {
    expect(
      s.boonHpPlan({
        total: 2,
        hasClasses: false,
        hardMax: true,
        linked: false,
        hp: { max: 1, value: 1 }
      })
    ).toEqual({
      effect: null,
      updates: { "system.attributes.hp.max": 3, "system.attributes.hp.value": 3 }
    });
    expect(
      s.boonHpPlan({
        total: 10,
        hasClasses: false,
        hardMax: true,
        linked: true,
        hp: { max: 1, value: 1 }
      })
    ).toEqual({
      effect: { key: "system.attributes.hp.max" },
      updates: {}
    });
    expect(
      s.boonHpPlan({
        total: 10,
        hasClasses: true,
        hardMax: false,
        linked: true,
        hp: { max: 20, value: 20 }
      })
    ).toEqual({
      effect: { key: "system.attributes.hp.bonuses.overall" },
      updates: {}
    });
    expect(
      s.boonHpPlan({
        total: 0,
        hasClasses: false,
        hardMax: true,
        linked: false,
        hp: { max: 1, value: 1 }
      })
    ).toEqual({
      effect: null,
      updates: {}
    });
  });
  it("the row names the spell, the feature's change and where it lands, with its pointer", () => {
    expect(reg.SUMMON_BOONS["Familiar Friend"]).toMatchObject({
      spell: "Find Familiar",
      benefit: "Fortified Familiar",
      change: "activities[summon].bonuses.hp",
      lands: "hp"
    });
    expect(Object.isFrozen(reg.SUMMON_BOONS["Familiar Friend"])).toBe(true);
  });
});

describe("the replay's usage — what the dialog answered rides the cast again, the cause included (call 45)", () => {
  it("the slot, the spend ticks, the Concentration and a forward's cause ride; an absent one is not written", () => {
    const base = {
      create: { summons: false },
      "fvtt-mod-bythebooks": { concentrationAsked: true, lightOn: null }
    };
    expect(
      s.castUsage(
        {
          spell: { slot: "spell1" },
          consume: { spellSlot: false, resources: false },
          cause: { activity: ".Activity.abc" }
        },
        base
      )
    ).toEqual({
      ...base,
      spell: { slot: "spell1" },
      consume: { spellSlot: false, resources: false },
      cause: { activity: ".Activity.abc" }
    });
    const bare = s.castUsage({}, base);
    expect(bare).toEqual(base);
    expect("cause" in bare).toBe(false);
    expect(s.castUsage(null, base)).toEqual(base);
  });
});

describe("Battle Familiar: the rows, a standing summon that falls, the last form, the empower route", () => {
  const listedFalls = () => reg.listedNames(reg.summonFallEntries());
  const standing = (id, extra = {}) => ({
    id,
    flag: {
      applied: true,
      itemName: "Battle Familiar",
      sourceUuid: "Actor.c",
      standing: { effectId: "e1" },
      landed: [{ tokenUuid: `Scene.s.Token.${id}`, tokenId: id, sceneId: "s" }],
      ...extra
    }
  });
  const companion = (id, state, extra = {}) => ({
    id,
    flag: {
      applied: true,
      itemName: "Find Familiar",
      sourceUuid: "Actor.c",
      placedAt: 1,
      companion: { state, name: "Owl" },
      summonName: "Owl",
      landed: [{ tokenUuid: `Scene.s.Token.${id}`, tokenId: id, sceneId: "s" }],
      ...extra
    }
  });

  it("Battle Familiar is one at a time and rolls its own Initiative; it falls at 0 HP and at its caster's death, dropping its gear; it empowers a Find Familiar", () => {
    expect(reg.listedNames(reg.summonSingleEntries()).has("battle familiar")).toBe(true);
    expect(reg.listedNames(reg.summonOwnInitiativeEntries()).has("battle familiar")).toBe(true);
    expect(reg.SUMMON_FALLS["Battle Familiar"]).toMatchObject({
      atZero: true,
      casterDeath: true,
      drops: true
    });
    expect(reg.SUMMON_EMPOWERS["Battle Familiar"]).toMatchObject({
      companion: "Find Familiar",
      transform: "Battle Familiar"
    });
    expect(reg.TRANSFORMS["Battle Familiar"]).toBeTruthy();
  });

  it("fallenSummon: a companion on the table, or a standing summon of a falls row — never one in the pocket, dismissed, or of a spell with no row", () => {
    const falls = reg.SUMMON_FALLS;
    expect(
      s.fallenSummon([companion("m1", "present")], "Scene.s.Token.m1", falls, listedFalls())
    ).toBe("m1");
    expect(
      s.fallenSummon([companion("m1", "pocket")], "Scene.s.Token.m1", falls, listedFalls())
    ).toBe(null);
    expect(s.fallenSummon([standing("m2")], "Scene.s.Token.m2", falls, listedFalls())).toBe("m2");
    expect(
      s.fallenSummon(
        [standing("m2", { dismissAsked: true })],
        "Scene.s.Token.m2",
        falls,
        listedFalls()
      )
    ).toBe(null);
    expect(
      s.fallenSummon(
        [standing("m3", { itemName: "Mage Hand" })],
        "Scene.s.Token.m3",
        falls,
        listedFalls()
      )
    ).toBe(null);
    expect(s.fallenSummon([standing("m2")], "Scene.s.Token.other", falls, listedFalls())).toBe(
      null
    );
    expect(s.fallenSummon([standing("m2")], null, falls, listedFalls())).toBe(null);
  });

  it("casterDeathSummons: the caster's standing summons whose row says they go with it", () => {
    const falls = reg.SUMMON_FALLS;
    const records = [
      standing("m1"),
      standing("m2", { sourceUuid: "Actor.other" }),
      standing("m3", { itemName: "Mage Hand" }),
      standing("m4", { dismissed: true }),
      companion("m5", "present")
    ];
    expect(s.casterDeathSummons(records, "Actor.c", falls, listedFalls())).toEqual(["m1"]);
    expect(s.casterDeathSummons([], "Actor.c", falls, listedFalls())).toEqual([]);
  });

  it("lastFormRows: the form last taken pre-picked and tagged, else the first; a last form the rows no longer carry is ignored", () => {
    const rows = [
      { id: "a", name: "Brute" },
      { id: "b", name: "Flyer" },
      { id: "c", name: "Stalker", tags: ["x"] }
    ];
    expect(s.lastFormRows(rows, "c").map(r => [r.checked, r.tags])).toEqual([
      [false, []],
      [false, []],
      [true, ["x", "last time"]]
    ]);
    expect(s.lastFormRows(rows, null).map(r => r.checked)).toEqual([true, false, false]);
    expect(s.lastFormRows(rows, "gone").map(r => r.checked)).toEqual([true, false, false]);
    expect(s.lastFormRows(null, "a")).toEqual([]);
  });

  it("empowerRoute: no companion is the summon road, one in the pocket is refused, one on the table is the question", () => {
    expect(s.empowerRoute([], "Actor.c", "find familiar")).toEqual({
      route: "summon",
      messageId: null,
      name: null
    });
    expect(s.empowerRoute([companion("m1", "pocket")], "Actor.c", "find familiar")).toEqual({
      route: "refuse",
      messageId: "m1",
      name: "Owl"
    });
    expect(s.empowerRoute([companion("m1", "present")], "Actor.c", "find familiar")).toEqual({
      route: "ask",
      messageId: "m1",
      name: "Owl"
    });
    expect(s.empowerRoute([companion("m1", "present")], "Actor.other", "find familiar").route).toBe(
      "summon"
    );
  });

  it("staleCompanionEffect: a card gone, a record never landed, dismissed, failed or gone, or a stray copy — never a dismissal in flight or the record's own effect", () => {
    const own = { applied: true, companion: { state: "pocket", effectId: "e1" } };
    expect(s.staleCompanionEffect("e1", null)).toBe(true);
    expect(s.staleCompanionEffect("e1", { applied: false })).toBe(true);
    expect(
      s.staleCompanionEffect("e1", {
        applied: true,
        dismissed: true,
        companion: { effectId: "e1" }
      })
    ).toBe(true);
    expect(s.staleCompanionEffect("e1", { applied: true, outcome: "failed" })).toBe(true);
    expect(
      s.staleCompanionEffect("e1", { applied: true, companion: { state: "gone", effectId: "e1" } })
    ).toBe(true);
    expect(s.staleCompanionEffect("e2", own)).toBe(true);
    expect(s.staleCompanionEffect("e1", own)).toBe(false);
    expect(
      s.staleCompanionEffect("e1", {
        applied: true,
        dismissAsked: true,
        companion: { state: "present", effectId: "e1" }
      })
    ).toBe(false);
    expect(s.staleCompanionEffect("e1", { applied: true, companion: { state: "present" } })).toBe(
      false
    );
  });

  it("an empowered companion cannot be put away, and its menu offers no pocket", () => {
    expect(
      s.companionAsk({ state: "present", empower: { messageId: "t1" } }, { kind: "away" })
    ).toBe(null);
    expect(s.companionAsk({ state: "present" }, { kind: "away" })).toMatchObject({
      ask: { kind: "away" }
    });
    expect(s.companionMenu("present", { pocket: true }, { empowered: true })).toEqual([
      "dismiss",
      "summon"
    ]);
    expect(s.companionMenu("present", { pocket: true })).toEqual(["away", "dismiss", "summon"]);
  });
});

describe("a summoned token's eyes — a creature sees, a thing does not (call 60)", () => {
  it("a creature type of the book's own sees, senses or none: the Raven and the Hawk have no darkvision", () => {
    expect(s.summonSees({ type: "beast", senses: { darkvision: 120 } })).toBe(true);
    expect(s.summonSees({ type: "beast", senses: { darkvision: null, blindsight: null } })).toBe(
      true
    );
    expect(s.summonSees({ type: "celestial", senses: {} })).toBe(true);
    expect(s.summonSees({ type: "Undead" })).toBe(true);
  });
  it("a custom or typeless stat block sees only with a sense: the Arcane Eye and the Faithful Hound do, Mage Hand does not", () => {
    expect(s.summonSees({ type: "custom", senses: { darkvision: 30 } })).toBe(true);
    expect(
      s.summonSees({ type: "custom", senses: { truesight: 30, units: "ft", special: "" } })
    ).toBe(true);
    expect(s.summonSees({ type: "custom", senses: { darkvision: null, units: "ft" } })).toBe(false);
    expect(s.summonSees({ type: null, senses: null })).toBe(false);
    expect(s.summonSees({ type: "", senses: { darkvision: 0 } })).toBe(false);
  });
  it("a light's object never sees, whatever its stat block says", () => {
    expect(s.summonSees({ type: "beast", senses: { darkvision: 60 }, thing: true })).toBe(false);
  });
  it("a thing its row says the caster sees through sees: Clairvoyance's and Scrying's sensor (call 62)", () => {
    const sensor = reg.SUMMON_LOOKS["Invisible Sensor"];
    expect(sensor?.sees).toBe(true);
    expect(
      s.summonSees({ type: "custom", senses: { darkvision: null }, sees: !!sensor?.sees })
    ).toBe(true);
    // the row's word is the only way a thing sees: no other look carries it
    expect(
      Object.entries(reg.SUMMON_LOOKS)
        .filter(([, row]) => row.sees)
        .map(([k]) => k)
    ).toEqual(["Invisible Sensor"]);
    // a light's object stays blind even so
    expect(s.summonSees({ type: "custom", sees: true, thing: true })).toBe(false);
  });
});

describe("a familiar's name — asked every time, remembered per caster (call 61)", () => {
  const rec = () => ({
    status: "asked",
    mode: "cr",
    choice: null,
    creatureTypes: ["celestial", "fey", "fiend"],
    creatureSizes: [],
    profiles: [{ id: "p", uuid: "Compendium.phb.actors.Actor.bat", cr: "0", types: ["beast"] }]
  });
  const answer = petName => ({
    profileId: "p",
    pick: { uuid: "Compendium.mm.actors.Actor.owl", name: "Owl" },
    creatureType: "fey",
    placements: [{ x: 100, y: 100 }],
    count: 1,
    ...(petName === undefined ? {} : { petName })
  });

  it("the menu's field rides the answer, cleaned; a blank field is the creature's own name; no field, no key", () => {
    expect(s.placedAnswer(rec(), answer("  Pip   the\tWise "), {})).toMatchObject({
      petName: "Pip the Wise",
      summonName: "Owl"
    });
    expect(s.placedAnswer(rec(), answer(""), {})?.petName).toBe(null);
    expect(s.placedAnswer(rec(), answer("   "), {})?.petName).toBe(null);
    expect(Object.hasOwn(s.placedAnswer(rec(), answer(undefined), {}) ?? {}, "petName")).toBe(
      false
    );
  });

  it("a name is cut to its longest and loses control characters", () => {
    expect(s.petNameOf("a".repeat(s.PET_NAME_MAX + 20))).toHaveLength(s.PET_NAME_MAX);
    expect(s.petNameOf("Hoot\u0000s\nworth")).toBe("Hoot s worth");
    expect(s.petNameOf(null)).toBe(null);
  });

  it("remembered per caster by the spell the tables know, whatever the form; a cleared field forgets", () => {
    const one = s.rememberName([], "Find Familiar", "Pip");
    expect(one).toEqual([{ spell: "find familiar", name: "Pip" }]);
    expect(s.rememberedName(one, "Find Familiar")).toBe("Pip");
    expect(s.rememberedName(one, "find familiar")).toBe("Pip");
    expect(s.rememberedName(one, "Vestige Companion")).toBe(null);
    // the same name again changes nothing (no write)
    expect(s.rememberName(one, "Find Familiar", " Pip ")).toBe(null);
    // a new name replaces the old; another spell's entry stays
    const two = s.rememberName(
      [...(one ?? []), { spell: "vestige companion", name: "Ash" }],
      "Find Familiar",
      "Hoot"
    );
    expect(two).toEqual([
      { spell: "vestige companion", name: "Ash" },
      { spell: "find familiar", name: "Hoot" }
    ]);
    // a cleared field forgets the spell's name; nothing to forget is no write
    expect(s.rememberName(two, "Find Familiar", null)).toEqual([
      { spell: "vestige companion", name: "Ash" }
    ]);
    expect(s.rememberName([], "Find Familiar", "")).toBe(null);
    expect(s.rememberedName(null, "Find Familiar")).toBe(null);
  });

  it("the familiar and the Vestige are named companions (call 62), each remembered on its own", () => {
    expect(reg.COMPANIONS["Find Familiar"]?.names).toBe(true);
    expect(reg.COMPANIONS["Vestige Companion"]?.names).toBe(true);
    const both = s.rememberName(
      s.rememberName([], "Find Familiar", "Pip"),
      "Vestige Companion",
      "Ash"
    );
    expect(s.rememberedName(both, "Find Familiar")).toBe("Pip");
    expect(s.rememberedName(both, "Vestige Companion")).toBe("Ash");
    // forgetting the Vestige's leaves the familiar's
    expect(s.rememberedName(s.rememberName(both, "Vestige Companion", ""), "Find Familiar")).toBe(
      "Pip"
    );
  });
});
