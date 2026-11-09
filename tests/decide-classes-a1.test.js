import { beforeAll, describe, expect, it } from "vitest";
import { expectPointer } from "./rule-pointer.js";

/**
 * DECISION-layer: the PHB classes, stage A1 (RULINGS *The PHB classes — A1*; the plan
 * audits/plans/session-0-classes.md §3) — fourteen rows on tables that exist, the new facets and the
 * judges that read them. No Foundry stub on purpose.
 */
/** @type {typeof import("../scripts/decide/registry.js")} */
let reg;
/** @type {typeof import("../scripts/decide/clock.js")} */
let c;
/** @type {typeof import("../scripts/decide/heal-on-hit.js")} */
let h;
/** @type {typeof import("../scripts/decide/turn-grants.js")} */
let tg;
/** @type {typeof import("../scripts/decide/choices.js")} */
let ch;
/** @type {typeof import("../scripts/decide/reminders.js")} */
let r;
beforeAll(async () => {
  reg = await import("../scripts/decide/registry.js");
  c = await import("../scripts/decide/clock.js");
  h = await import("../scripts/decide/heal-on-hit.js");
  tg = await import("../scripts/decide/turn-grants.js");
  ch = await import("../scripts/decide/choices.js");
  r = await import("../scripts/decide/reminders.js");
});

describe("the rows land on the tables that exist — no new kind", () => {
  it("every A1 row is frozen and points at the book", () => {
    const rows = [
      reg.ADVANTAGE_BUYS["Tides of Chaos"],
      reg.SUPERIORITY_FOLDS["Commanding Presence"],
      reg.BONUS_SWINGS["War Priest"],
      reg.BONUS_SWINGS["Hunter's Prey"],
      reg.CLOCK_RIDERS.frenzy,
      reg.CLOCK_RIDERS["repelling-blast"],
      reg.CLOCK_RIDERS["combat-inspiration"],
      reg.CLOCK_RIDERS["hunters-prey-colossus-slayer"],
      reg.HEAL_ON_HIT["Dark One's Blessing"],
      reg.TOKEN_LIGHTS["Sacred Weapon"],
      reg.EFFECT_CHOICES["Starry Form"],
      reg.EFFECT_CHOICES["Rage of the Wilds"],
      reg.HEAL_REROLLS["Starry Form"],
      reg.EMANATIONS["Rage of the Wolf"],
      reg.EFFECT_BENDS["Rage of the Wolf"],
      reg.TURN_GRANTS.Rage,
      reg.INTERRUPT_ROLLS["Glorious Defense"],
      reg.INTERRUPT_ROLLS["Combat Inspiration"],
      reg.INTERRUPT_REDUCTIONS["Deflect Attacks"]
    ];
    for (const row of rows) {
      expect(Object.isFrozen(row)).toBe(true);
      expectPointer(row.rule);
    }
  });

  it("the kind lists carry the new members, and Glorious Defense moved from `ac` to `roll`", () => {
    expect(reg.D20_FOLDS).toContainEqual({ name: "Commanding Presence", kind: "tactical" });
    expect(reg.D20_FOLDS).toContainEqual({ name: "Tides of Chaos", kind: "advantage" });
    expect(reg.MANEUVER_FOLDS).toContainEqual({ name: "War Priest", kind: "hew" });
    expect(reg.MANEUVER_FOLDS).toContainEqual({ name: "Hunter's Prey", kind: "hew" });
    expect(reg.INTERRUPTS).toContainEqual({ name: "Glorious Defense", kind: "roll" });
    expect(reg.INTERRUPTS).not.toContainEqual({ name: "Glorious Defense", kind: "ac" });
    expect(reg.INTERRUPTS).toContainEqual({ name: "Combat Inspiration", kind: "roll" });
  });

  it("Commanding Presence's three skills; Tides of Chaos every D20 Test", () => {
    expect(reg.SUPERIORITY_FOLDS["Commanding Presence"].skills).toEqual(["itm", "prf", "per"]);
    expect(reg.ADVANTAGE_BUYS["Tides of Chaos"].tests).toEqual([
      "attack",
      "save",
      "check",
      "initiative"
    ]);
  });
});

describe("CLOCK_RIDERS — the new judges", () => {
  const frenzy = () => reg.CLOCK_RIDERS.frenzy;
  const colossus = () => reg.CLOCK_RIDERS["hunters-prey-colossus-slayer"];

  it("Sacred Weapon's Radiant: a melee weapon hit while the paladin wears it, offered unticked, no dice (2026-11-02)", () => {
    const row = reg.CLOCK_RIDERS["sacred-weapon"];
    expect(row).toMatchObject({
      retypes: "radiant",
      unticked: true,
      wearing: "Sacred Weapon",
      melee: true,
      weapon: true,
      activity: null
    });
    expect(c.riderDue(row, { weapon: true, melee: true, wearing: true }).due).toBe(true);
    expect(c.riderDue(row, { weapon: true, melee: true, wearing: false })).toEqual({
      due: false,
      why: "Sacred Weapon is not on you"
    });
    expect(c.riderDue(row, { weapon: true, melee: false, wearing: true }).due).toBe(false);
  });
  it("Frenzy: raging AND reckless, a weapon, once per turn", () => {
    expect(
      c.riderDue(frenzy(), { inCombat: true, weapon: true, raging: false, reckless: true })
    ).toEqual({ due: false, why: "not raging" });
    expect(
      c.riderDue(frenzy(), { inCombat: true, weapon: true, raging: true, reckless: false })
    ).toEqual({ due: false, why: "no Reckless Attack this turn" });
    expect(
      c.riderDue(frenzy(), { inCombat: true, weapon: true, raging: true, reckless: true })
    ).toEqual({ due: true, why: "raging and reckless — once this turn" });
    expect(
      c.riderDue(frenzy(), {
        inCombat: true,
        weapon: true,
        raging: true,
        reckless: true,
        chitStands: true
      }).due
    ).toBe(false);
  });

  it("Colossus Slayer: the target below its maximum; an unread HP is never damaged", () => {
    expect(c.riderDue(colossus(), { inCombat: true, weapon: true, targetDamaged: true })).toEqual({
      due: true,
      why: "the target is damaged — once this turn"
    });
    expect(c.riderDue(colossus(), { inCombat: true, weapon: true, targetDamaged: false }).why).toBe(
      "the target is at its Hit Point maximum"
    );
    expect(c.riderDue(colossus(), { inCombat: true, weapon: true, targetDamaged: null }).due).toBe(
      false
    );
    expect(colossus()).toMatchObject({
      option: "Colossus Slayer",
      options: ["Colossus Slayer", "Horde Breaker"]
    });
    expect(reg.BONUS_SWINGS["Hunter's Prey"]).toMatchObject({ option: "Horde Breaker", near: 5 });
  });

  it("Repelling Blast: the enchanted cantrip only, Large or smaller (an unread size counts)", () => {
    const row = reg.CLOCK_RIDERS["repelling-blast"];
    expect(c.riderDue(row, { enchanted: false })).toEqual({
      due: false,
      why: "not the cantrip it was chosen for"
    });
    expect(c.riderDue(row, { enchanted: true, fits: false }).due).toBe(false);
    expect(c.riderDue(row, { enchanted: true, fits: null })).toEqual({
      due: true,
      why: "every hit with the chosen cantrip"
    });
    expect(row.says).toMatch(/10 feet/);
  });

  it("Combat Inspiration's Offense: offered unticked, the die spent only by choice", () => {
    const row = reg.CLOCK_RIDERS["combat-inspiration"];
    expect(row).toMatchObject({ inspired: true, unticked: true, when: "any" });
    expect(c.riderDue(row, {}).due).toBe(true);
  });

  it("Combat Inspiration's Offense: ticked on a Critical Hit, as the smite is (the die doubles there)", () => {
    const row = reg.CLOCK_RIDERS["combat-inspiration"];
    expect(row.critTicks).toBe(true);
    expect(c.riderTicked(row, { critical: false })).toBe(false);
    expect(c.riderTicked(row, { critical: true })).toBe(true);
    expect(c.riderTicked(row)).toBe(false);
    // every other unticked row stays unticked on a crit; a plain row is ticked either way
    expect(c.riderTicked(reg.CLOCK_RIDERS["sacred-weapon"], { critical: true })).toBe(false);
    expect(c.riderTicked(reg.CLOCK_RIDERS.frenzy, { critical: false })).toBe(true);
  });
});

describe('HEAL_ON_HIT `on: "kill"` — Dark One\'s Blessing', () => {
  it("pays on an enemy dropped by the bearer, or within 10 ft of it; never on an ally or a neutral", () => {
    expect(h.killPays({ dealt: true, feet: 60, within: 10, sides: [1, -1] }).pays).toBe(true);
    expect(h.killPays({ dealt: false, feet: 10, within: 10, sides: [1, -1] })).toEqual({
      pays: true,
      why: "an enemy dropped to 0 Hit Points 10 ft from you"
    });
    expect(h.killPays({ dealt: false, feet: 15, within: 10, sides: [1, -1] }).pays).toBe(false);
    expect(h.killPays({ dealt: false, feet: null, within: 10, sides: [1, -1] }).pays).toBe(false);
    expect(h.killPays({ dealt: true, feet: 5, within: 10, sides: [1, 1] })).toEqual({
      pays: false,
      why: "not an enemy"
    });
    expect(h.killPays({ dealt: true, feet: 5, within: 10, sides: [1, 0] }).pays).toBe(false);
  });
});

describe('TURN_GRANTS `remind: "extend"` — the Rage\'s early end, the 2024 text', () => {
  it("an attack or a forced save at an enemy extends it; none does not; a card with no targets counts", () => {
    expect(tg.extendedThisTurn({ cards: [], side: 1 }).extended).toBe(false);
    expect(
      tg.extendedThisTurn({ cards: [{ kind: "attack", sides: [-1] }], side: 1 }).extended
    ).toBe(true);
    expect(tg.extendedThisTurn({ cards: [{ kind: "save", sides: [-1] }], side: 1 }).why).toBe(
      "an enemy's saving throw forced"
    );
    expect(tg.extendedThisTurn({ cards: [{ kind: "attack", sides: [1] }], side: 1 }).extended).toBe(
      false
    );
    expect(tg.extendedThisTurn({ cards: [{ kind: "attack", sides: [] }], side: 1 }).extended).toBe(
      true
    );
    expect(reg.TURN_GRANTS.Rage).toMatchObject({ effect: "Rage", on: "turnEnd", remind: "extend" });
  });
});

describe("EFFECT_CHOICES `picks` — Starry Form and Rage of the Wilds", () => {
  const names = ["Starry Form", "Dragon Form", "Dragon Form (Twinkling)"];
  it("Starry Form waits for the pick; Dragon keeps Dragon Form, Archer and Chalice drop it", () => {
    const row = reg.EFFECT_CHOICES["Starry Form"];
    expect(ch.effectsAfterPick(names, row, { chosen: null })).toBeNull();
    expect(ch.effectsAfterPick(names, row, { chosen: "Dragon" })).toEqual(names);
    expect(ch.effectsAfterPick(names, row, { chosen: "Chalice" })).toEqual(["Starry Form"]);
    expect(ch.effectsAfterPick(names, row, { chosen: "Archer" })).toEqual(["Starry Form"]);
    expect(ch.effectsAfterPick(names, row, { chosen: "Bear" })).toBeNull();
  });
  it("Rage of the Wilds is asked at the Rage, which never waits for it", () => {
    const row = reg.EFFECT_CHOICES["Rage of the Wilds"];
    expect(row).toMatchObject({ on: "Rage", use: true, picks: ["Bear", "Eagle", "Wolf"] });
    expect(ch.effectsAfterPick(["Rage"], row, { chosen: null })).toEqual(["Rage"]);
  });
});

describe("the Wolf's ring — EFFECT_BENDS `member`", () => {
  const table = () => ({ "Rage of the Wolf": reg.EFFECT_BENDS["Rage of the Wolf"] });
  const attack = target =>
    r.effectSources({
      attacker: { uuid: "Actor.ally", effects: [] },
      target,
      enabled: ["rage of the wolf"],
      table: table(),
      pass: "target"
    });
  it("a member copy grants Advantage; the barbarian's own effect never does", () => {
    expect(
      attack({
        uuid: "Actor.goblin",
        effects: [{ id: "e1", name: "Rage of the Wolf", sourceUuid: "Actor.barb", member: true }]
      })
    ).toHaveLength(1);
    expect(
      attack({
        uuid: "Actor.barb",
        effects: [{ id: "e2", name: "Rage of the Wolf", sourceUuid: "Actor.barb", member: false }]
      })
    ).toHaveLength(0);
  });
  it("the barbarian's own attacks are not its allies'", () => {
    const own = r.effectSources({
      attacker: { uuid: "Actor.barb", effects: [] },
      enabled: ["rage of the wolf"],
      table: table(),
      pass: "target",
      target: {
        uuid: "Actor.goblin",
        effects: [{ id: "e1", name: "Rage of the Wolf", sourceUuid: "Actor.barb", member: true }]
      }
    });
    expect(own).toHaveLength(0);
  });
  it("the ring stands while BOTH the Wolf and the Rage stand", () => {
    expect(reg.EMANATIONS["Rage of the Wolf"].while).toEqual(["Rage of the Wolf", "Rage"]);
  });
});

describe("the hold's A1 rows", () => {
  it("Glorious Defense: the paladin's Cha off the attack, 10 ft of the TARGET, the strike after a turned hit", () => {
    expect(reg.INTERRUPT_ROLLS["Glorious Defense"]).toMatchObject({
      reach: "target",
      bystander: 10,
      sign: -1,
      bonus: "max(1, @abilities.cha.mod)",
      turned: "strike",
      uses: true
    });
  });
  it("Combat Inspiration's Defense: the hit creature alone, paid by its Inspired die", () => {
    expect(reg.INTERRUPT_ROLLS["Combat Inspiration"]).toMatchObject({
      only: "self",
      inspired: true,
      reaction: true,
      sign: -1
    });
  });
  it("Deflect Attacks: rolled, B/P/S unless Deflect Energy, the Redirect offered at 0", () => {
    expect(reg.INTERRUPT_REDUCTIONS["Deflect Attacks"]).toMatchObject({
      activity: "Reduce",
      pool: false,
      types: ["bludgeoning", "piercing", "slashing"],
      anyType: "Deflect Energy",
      atZero: "Redirect"
    });
  });
});
