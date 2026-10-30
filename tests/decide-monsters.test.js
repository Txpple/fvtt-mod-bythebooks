import { beforeAll, describe, expect, it } from "vitest";
import { expectPointer } from "./rule-pointer.js";

/**
 * DECISION-layer: the Monster Manual's waiting rows built (RULINGS *The Monster Manual — the waiting rows
 * built*; the drawing audits/drawings/monsters.md *The rows the scan gave no family*) — the repeating save on a
 * monster's own activity and its escalation, the turn-start damage the grappled take and the grappler deals.
 * No Foundry stub on purpose.
 */
/** @type {typeof import("../scripts/decide/registry.js")} */
let reg;
/** @type {typeof import("../scripts/decide/repeat-saves.js")} */
let rs;
/** @type {typeof import("../scripts/decide/turn-grants.js")} */
let tg;
/** @type {typeof import("../scripts/decide/drains.js")} */
let dn;
/** @type {typeof import("../scripts/decide/reminders.js")} */
let rm;
/** @type {typeof import("../scripts/decide/duplicates.js")} */
let dp;
/** @type {typeof import("../scripts/decide/geometry.js")} */
let ge;
beforeAll(async () => {
  rm = await import("../scripts/decide/reminders.js");
  dp = await import("../scripts/decide/duplicates.js");
  ge = await import("../scripts/decide/geometry.js");
  dn = await import("../scripts/decide/drains.js");
  reg = await import("../scripts/decide/registry.js");
  rs = await import("../scripts/decide/repeat-saves.js");
  tg = await import("../scripts/decide/turn-grants.js");
});

describe("REPEAT_SAVES — a monster's own activity", () => {
  it("the four plain rows: the pack's effect, the turn end, no count — keyed by the trait", () => {
    for (const [key, effect] of [
      ["Pacifying Spores", "Stunned"],
      ["Paralysis Gas", "Paralyzed"],
      ["Scare", "Frightened"],
      ["Spores", "Poisoned"]
    ]) {
      const row = reg.REPEAT_SAVES[key];
      expect(Object.isFrozen(row), key).toBe(true);
      expect(row, key).toMatchObject({ effect, on: ["turnEnd"] });
      expect(row.count, key).toBeUndefined();
      expect(row.item, key).toBeUndefined();
      expectPointer(row.rule);
    }
  });
  it("the escalation: Restrained repeats on the second save; the first failure presses Petrified INSTEAD (swap)", () => {
    for (const key of ["Petrifying Bite", "Petrifying Gaze"]) {
      expect(reg.REPEAT_SAVES[key], key).toMatchObject({
        effect: "Restrained",
        activity: "Second Save",
        on: ["turnEnd"],
        count: { saves: 1, fails: 1, press: "petrified", swap: true }
      });
    }
    const breath = reg.REPEAT_SAVES["Petrifying Breath"];
    expect(breath).toMatchObject({
      effect: "Restrained",
      on: ["turnEnd"],
      count: { saves: 1, fails: 1, press: "petrified", swap: true }
    });
    expect(breath.activity).toBeUndefined();
  });
  it("repeatVerdict with swap: the failure ENDS the effect and presses the status; a success ends it plainly", () => {
    const bite = reg.REPEAT_SAVES["Petrifying Bite"];
    let v = rs.repeatVerdict(bite, "failed", null);
    expect(v).toMatchObject({
      ends: true,
      locks: false,
      press: "petrified",
      tally: { saves: 0, fails: 1 }
    });
    expect(v.says).toBe("Restrained ended — the first failure: Petrified instead");
    v = rs.repeatVerdict(bite, "saved", null);
    expect(v).toMatchObject({
      ends: true,
      locks: false,
      press: null,
      tally: { saves: 1, fails: 0 }
    });
    expect(v.says).toBe("Restrained ended — the first success");
    // Without swap the press keeps the effect (Flesh to Stone) — unchanged.
    const stone = reg.REPEAT_SAVES["Flesh to Stone"];
    expect(rs.repeatVerdict(stone, "failed", { saves: 0, fails: 2 })).toMatchObject({
      ends: false,
      locks: true,
      press: "petrified"
    });
  });
  it("the row is found through the trait as the effect's origin — no spell gate", () => {
    const answers = (key, item) => item?.name === key;
    const row = rs.repeatRowFor({
      table: reg.REPEAT_SAVES,
      item: { name: "Pacifying Spores", type: "feat" },
      effectName: "stunned",
      answers
    });
    expect(row?.key).toBe("Pacifying Spores");
    expect(row?.effectName).toBe("Stunned");
    expect(
      rs.repeatRowFor({
        table: reg.REPEAT_SAVES,
        item: { name: "Claw", type: "feat" },
        effectName: "Stunned",
        answers
      })
    ).toBeNull();
  });
});

describe("EMANATIONS — the fire auras' pulse, the turn-start ring, the alerts", () => {
  it("the pulse rows: feature rings with no effect, the first damage activity at the bearer's turn end", () => {
    for (const [key, reach] of [
      ["Fire Aura", "harmful"],
      ["Flame Aura", "all"],
      ["Heat Aura", "all"]
    ]) {
      const row = reg.EMANATIONS[key];
      expect(row, key).toMatchObject({
        kind: "feature",
        reach,
        range: null,
        effect: null,
        pulse: { on: "sourceTurnEnd", activity: null }
      });
      expect(row.trigger, key).toBeUndefined();
      expectPointer(row.rule);
    }
  });
  it("Gibbering is Stench's row — a turnStart trigger, off while Incapacitated", () => {
    expect(reg.EMANATIONS.Gibbering).toMatchObject({
      kind: "feature",
      reach: "all",
      effect: null,
      incapacitated: true,
      trigger: { on: ["turnStart"], oncePerTurn: true }
    });
    expectPointer(reg.EMANATIONS.Gibbering.rule);
  });
  it("the alerts are Polearm Master's rows at the trigger's range — three on a move-in, Unnerving Gaze on a turn start", () => {
    for (const [key, range, reach] of [
      ["Pursuit", 120, "harmful"],
      ["Shriek", 30, "all"],
      ["Watery Rebuke", 5, "harmful"]
    ]) {
      expect(reg.EMANATIONS[key], key).toMatchObject({
        kind: "feature",
        reach,
        range,
        effect: null,
        incapacitated: true,
        quiet: true,
        alert: { on: "moveIn", label: key }
      });
      expect(reg.EMANATIONS[key].alert.swing, key).toMatch(/Reaction/);
      expectPointer(reg.EMANATIONS[key].rule);
    }
    expect(reg.EMANATIONS["Unnerving Gaze"]).toMatchObject({
      range: 30,
      reach: "harmful",
      alert: { on: "turnStart", label: "Unnerving Gaze" }
    });
  });
});

describe("CLOCK_RIDERS — the random condition on a hit", () => {
  it("the three Chaos weapons are self rows: the attack's own item, on any hit, a d4 picking one of its effects, no dice", () => {
    for (const key of ["chaos-blade", "chaos-claw", "chaos-staff"]) {
      const row = reg.CLOCK_RIDERS[key];
      expect(row, key).toMatchObject({
        self: true,
        when: "any",
        activity: null,
        random: { die: 4 }
      });
      expect(row.amount, key).toBeUndefined();
      expect(row.effects, key).toBeUndefined();
      expect(row.says, key).toMatch(/d4/);
      expectPointer(row.rule);
    }
    expect(reg.CLOCK_RIDERS["chaos-blade"].feature).toBe("Chaos Blade");
  });
});

describe("DRAINS — the fall on the damage that landed", () => {
  it("the three rows: two on the maximum (Proboscis the Necrotic alone), one on Strength by the text's die", () => {
    expect(reg.DRAINS["Life Drain"]).toMatchObject({ what: "max", type: null });
    expect(reg.DRAINS.Proboscis).toMatchObject({ what: "max", type: "necrotic" });
    expect(reg.DRAINS["Draining Swipe"]).toMatchObject({
      what: "ability",
      ability: "str",
      amount: "text"
    });
    for (const row of Object.values(reg.DRAINS)) {
      expect(Object.isFrozen(row)).toBe(true);
      expectPointer(row.rule);
    }
    expect(reg.drainEntries().map(e => e.kind)).toEqual([
      "life drain",
      "proboscis",
      "draining swipe"
    ]);
  });
  it("drainAmount: the whole of what landed, or the row's type's share of it; nothing when none of that type landed", () => {
    expect(
      dn.drainAmount(reg.DRAINS["Life Drain"], {
        taken: 7,
        parts: [{ value: 7, type: "necrotic" }]
      })
    ).toMatchObject({ drains: true, amount: 7 });
    expect(
      dn.drainAmount(reg.DRAINS.Proboscis, {
        taken: 10,
        parts: [
          { value: 6, type: "necrotic" },
          { value: 4, type: "piercing" }
        ]
      })
    ).toMatchObject({ drains: true, amount: 6 });
    expect(
      dn.drainAmount(reg.DRAINS.Proboscis, { taken: 4, parts: [{ value: 4, type: "piercing" }] })
    ).toMatchObject({ drains: false, amount: 0 });
    expect(dn.drainAmount(reg.DRAINS["Life Drain"], { taken: 0 })).toMatchObject({ drains: false });
  });
  it("drainDieFrom reads the first roll enricher off the text; the effect data lowers tempmax under a fixed id", () => {
    expect(
      dn.drainDieFrom("the target's Strength score decreases by [[/r 1d4]]. The target dies")
    ).toBe("1d4");
    expect(dn.drainDieFrom("no die here")).toBeNull();
    const data = dn.drainEffectData({ key: "Life Drain", amount: 9, moduleId: "bf" });
    expect(data._id).toBe(dn.drainEffectId("Life Drain"));
    expect(data._id).toHaveLength(16);
    expect(data.changes).toEqual([
      { key: "system.attributes.hp.tempmax", type: "add", value: "-9", priority: 20 }
    ]);
    expect(data.flags.bf.drain).toEqual({ key: "Life Drain", amount: 9 });
    expect(
      dn.drainTitle({ key: "Life Drain", target: "Aster", what: "max", amount: 4, total: 9 })
    ).toBe("Life Drain — Aster's Hit Point maximum falls by 4 (9 in all)");
    expect(
      dn.drainTitle({
        key: "Draining Swipe",
        target: "Aster",
        what: "ability",
        amount: 2,
        ability: "Strength"
      })
    ).toBe("Draining Swipe — Aster's Strength falls by 2");
  });
});

describe("the one-row facets — the vampire's drop, the curse on a rest, the defender's own shield, Fiendish Blood, Sun Sickness", () => {
  it("DROP_TO_ONE: Spiteful Escape is Death Ward's shape with no effect, outright too; Misty and Shadow Escape are died rows with a notice and no activity", () => {
    expect(reg.DROP_TO_ONE["Spiteful Escape"]).toMatchObject({ ask: false, outright: true });
    expect(reg.DROP_TO_ONE["Spiteful Escape"].effect).toBeUndefined();
    for (const key of ["Misty Escape", "Shadow Escape"]) {
      expect(reg.DROP_TO_ONE[key].on, key).toBe("died");
      expect(reg.DROP_TO_ONE[key].notice, key).toMatch(/resting place/);
      expect(reg.DROP_TO_ONE[key].activity, key).toBeUndefined();
      expectPointer(reg.DROP_TO_ONE[key].rule);
    }
    expect(reg.dropToOneEntries().map(e => e.kind)).toEqual([
      "death ward",
      "gift of the protectors", // B4
      "relentless endurance",
      "undead fortitude",
      "death throes",
      "spiteful escape",
      "misty escape",
      "shadow escape",
      // C1
      "relentless rage",
      "undying sentinel",
      "rage of the gods",
      "searing vengeance",
      "mechanical determination", // Heroes of Faerûn
      // Ravenloft
      "power of shadow",
      "ancient might"
    ]);
  });
  it("REST_GRANTS: the two block rows name the pack's Cursed and their rests, and grant nothing", () => {
    expect(reg.REST_GRANTS["Cursed Touch"]).toMatchObject({
      rests: ["short", "long"],
      block: true,
      effect: "Cursed"
    });
    expect(reg.REST_GRANTS["Restless Touch"]).toMatchObject({
      rests: ["short"],
      block: true,
      effect: "Cursed"
    });
    for (const key of ["Cursed Touch", "Restless Touch"]) {
      expect(reg.REST_GRANTS[key].grant, key).toBeUndefined();
      expectPointer(reg.REST_GRANTS[key].rule);
    }
  });
  it("DAMAGE_SHIELDS: Corrosive Form is a feature row — melee, 5 feet, the first damage activity", () => {
    expect(reg.DAMAGE_SHIELDS["Corrosive Form"]).toMatchObject({
      match: "feature",
      activity: null,
      melee: true,
      range: 5
    });
    expect(reg.DAMAGE_SHIELDS["Corrosive Form"].effect).toBeUndefined();
    expectPointer(reg.DAMAGE_SHIELDS["Corrosive Form"].rule);
  });
  it("REBUKES: Fiendish Blood is a typed self row on its Save; EFFECT_BENDS: Sun Sickness is Sunlight Weakness's row", () => {
    expect(reg.REBUKES["Fiendish Blood"]).toMatchObject({
      activity: "Save",
      self: true,
      types: ["piercing", "slashing"]
    });
    expectPointer(reg.REBUKES["Fiendish Blood"].rule);
    expect(reg.EFFECT_BENDS["Sun Sickness"]).toMatchObject({
      match: "feature",
      attacker: "disadvantage",
      target: null,
      scope: "any",
      counted: false
    });
    expectPointer(reg.EFFECT_BENDS["Sun Sickness"].rule);
  });
});

describe("Object Slam and Reflective Carapace — the last two rows", () => {
  it("Object Slam: the attack's own bend, judged on the map — the attack is the carrier, inside the space only", () => {
    const row = reg.EFFECT_BENDS["Object Slam"];
    expect(row).toMatchObject({
      attack: "Object Slam",
      attacker: "advantage",
      judge: "targetInSpace"
    });
    expectPointer(row.rule);
    const facts = {
      enabled: ["Object Slam"],
      table: { "Object Slam": row },
      attacker: { uuid: "a", effects: [], features: [] },
      pass: "target",
      attackerName: "The mimic",
      targetName: "Aster"
    };
    const inside = rm.effectSources({
      ...facts,
      target: { uuid: "t", effects: [], features: [], inSpace: true },
      scope: { item: "Object Slam" }
    });
    expect(inside).toHaveLength(1);
    expect(inside[0]).toMatchObject({ bend: "advantage" });
    expect(
      rm.effectSources({
        ...facts,
        target: { uuid: "t", effects: [], features: [], inSpace: false },
        scope: { item: "Object Slam" }
      })
    ).toHaveLength(0);
    expect(
      rm.effectSources({
        ...facts,
        target: { uuid: "t", effects: [], features: [], inSpace: true },
        scope: { item: "Claw" }
      })
    ).toHaveLength(0);
    expect(
      ge.rectsOverlap({ x: 0, y: 0, w: 200, h: 200 }, { x: 100, y: 100, w: 100, h: 100 })
    ).toBe(true);
    expect(ge.rectsOverlap({ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 0, w: 100, h: 100 })).toBe(
      false
    );
  });
  it("Reflective Carapace: a feature duplicate on ranged spell attacks alone, a d6 at 1 (always turned aside), a 6 reflecting; the words say so", () => {
    const row = reg.DUPLICATES["Reflective Carapace"];
    expect(row).toMatchObject({
      match: "feature",
      die: 6,
      at: 1,
      reflectAt: 6,
      only: "rangedSpellAttack"
    });
    expect(row.effect).toBeUndefined();
    expectPointer(row.rule);
    const outcome = dp.duplicateOutcome({ at: 1 }, [6]);
    expect(outcome).toMatchObject({ absorbed: true, winner: 0 });
    const words = dp.duplicateWords({ key: "Reflective Carapace", die: 6, at: 1 }, outcome, {
      took: null,
      left: 1,
      of: 1,
      feature: true,
      reflected: true
    });
    expect(words.title).toMatch(/REFLECTS/);
    expect(words.count).toMatch(/caster is the target/);
    expect(words.took).toBeNull();
    const plain = dp.duplicateWords(
      { key: "Reflective Carapace", die: 6, at: 1 },
      dp.duplicateOutcome({ at: 1 }, [3]),
      { took: null, left: 1, of: 1, feature: true, reflected: false }
    );
    expect(plain.title).toBe("Reflective Carapace turns the spell aside");
    expect(plain.count).toBe("Reflective Carapace stands");
  });
});

describe("TURN_GRANTS — the turn-start damage", () => {
  it("the grappled target's rows: the origin's damage activity at the bearer's turn start (the vine, Smother, Spores) or turn end (the swarm)", () => {
    expect(reg.TURN_GRANTS["Constricting Vine"]).toMatchObject({
      effect: "Grappled",
      activity: "Damage: Grappled",
      on: "turnStart",
      deals: true
    });
    expect(reg.TURN_GRANTS.Smother).toMatchObject({
      effect: "Grappled + Other Conditions",
      activity: "Grappled: Damage",
      on: "turnStart",
      deals: true
    });
    expect(reg.TURN_GRANTS["Swarm of Proboscises"]).toMatchObject({
      effect: "Grappled",
      activity: "Damage: Grappled",
      on: "turnEnd",
      deals: true
    });
    expect(reg.TURN_GRANTS.Spores).toMatchObject({
      effect: "Poisoned",
      activity: "Damage While Poisoned",
      on: "turnStart",
      deals: true
    });
    for (const key of ["Constricting Vine", "Smother", "Swarm of Proboscises", "Spores"])
      expectPointer(reg.TURN_GRANTS[key].rule);
  });
  it("the grappler's row: Barbed Hide is a feature row that DEALS to the creatures it grapples", () => {
    const row = reg.TURN_GRANTS["Barbed Hide"];
    expect(row).toMatchObject({
      match: "feature",
      effect: null,
      activity: null,
      on: "turnStart",
      deals: "grappled"
    });
    expect(row.while).toBeUndefined();
    expectPointer(row.rule);
    expect(
      reg
        .turnGrantEntries()
        .map(e => e.kind)
        .filter(
          k =>
            ![
              "rage",
              "vitality surge",
              "life-giving force",
              "heroic warrior",
              "guarded mind",
              "self-restoration",
              "physician's touch",
              "heroic rally",
              "elder champion"
            ].includes(k)
        ) // B4's rows filtered
    ).toEqual([
      "heroism",
      "regeneration",
      "constricting vine",
      "smother",
      "swarm of proboscises",
      "spores",
      "barbed hide",
      "festering blast", // Arcana Unleashed: Spores' shape on a spell
      "ravenous bites" // Ravenloft: Spores' shape on a swarm's bite
    ]);
  });
  it("grantRowFor honours `on`: a turnEnd row is not due at the turn start and the reverse", () => {
    const answers = (key, item) => item?.name === key;
    const vine = tg.grantRowFor({
      table: reg.TURN_GRANTS,
      item: { name: "Constricting Vine" },
      effectName: "Grappled",
      answers,
      on: "turnStart"
    });
    expect(vine?.key).toBe("Constricting Vine");
    expect(
      tg.grantRowFor({
        table: reg.TURN_GRANTS,
        item: { name: "Constricting Vine" },
        effectName: "Grappled",
        answers,
        on: "turnEnd"
      })
    ).toBeNull();
    const swarm = tg.grantRowFor({
      table: reg.TURN_GRANTS,
      item: { name: "Swarm of Proboscises" },
      effectName: "Grappled",
      answers,
      on: "turnEnd"
    });
    expect(swarm?.key).toBe("Swarm of Proboscises");
    // The default `on` is the turn start (Heroism's rows carry it).
    expect(
      tg.grantRowFor({
        table: reg.TURN_GRANTS,
        item: { name: "Heroism" },
        effectName: "Bravery",
        answers
      })?.key
    ).toBe("Heroism");
  });
  it("the card's title for a damage: takes, not regains", () => {
    expect(
      tg.grantTitle({
        spell: "Constricting Vine",
        bearer: "Aster",
        total: 5,
        type: "bludgeoning",
        deals: true
      })
    ).toBe("Constricting Vine — Aster takes 5 bludgeoning damage");
    expect(tg.grantTitle({ spell: "Heroism", bearer: "Aster", total: 5, type: "temphp" })).toBe(
      "Heroism — Aster gains 5 Temporary Hit Points"
    );
  });
});
