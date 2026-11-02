import { beforeAll, describe, expect, it } from "vitest";
import { expectPointer } from "./rule-pointer.js";

/**
 * DECISION-layer clock arithmetic (ARCHITECTURE.md §2). No Foundry stub on purpose. The ruling
 * (user, 2026-09-02): a clock rider is notified and added, never asked; what is decided here is
 * whether the rules say it applies on THIS hit, and why not otherwise.
 */
/** @type {typeof import("../scripts/decide/clock.js")} */
let c;
/** @type {typeof import("../scripts/decide/registry.js")} */
let reg;
/** @type {typeof import("../scripts/decide/chips.js")} */
let chips;
beforeAll(async () => {
  c = await import("../scripts/decide/clock.js");
  reg = await import("../scripts/decide/registry.js");
  chips = await import("../scripts/decide/chips.js");
});

describe("Celestial Revelation — a transformed rider (the Aasimar walk, 2026-09-25)", () => {
  const rev = () => reg.CLOCK_RIDERS["celestial-revelation"];
  const eff = (name, chip = null) => ({ name, active: true, chip });
  it("is due once per turn only while a form stands, and the why names the form", () => {
    expect(c.riderDue(rev(), { inCombat: true, form: null })).toEqual({
      due: false,
      why: "not transformed"
    });
    expect(c.riderDue(rev(), { inCombat: true, form: "Heavenly Wings" })).toEqual({
      due: true,
      why: "Heavenly Wings — once this turn"
    });
    expect(
      c.riderDue(rev(), { inCombat: true, form: "Inner Radiance", chitStands: true }).due
    ).toBe(false);
    expect(c.riderDue(rev(), { inCombat: false, form: "Necrotic Shroud" }).why).toMatch(
      /out of combat/
    );
  });
  it("standingForm reads the form's own effect by name, and Necrotic Shroud only by the module's chip", () => {
    expect(c.standingForm(rev(), [eff("Heavenly Wings")])?.type).toBe("radiant");
    expect(c.standingForm(rev(), [eff("Searing Radiance")])?.form).toBe("Inner Radiance");
    expect(
      c.standingForm(rev(), [eff("Celestial Revelation: Necrotic Shroud", "necrotic shroud")])?.type
    ).toBe("necrotic");
    // Frightened BY a Shroud — an effect of the same name, no chip — is not wearing one.
    expect(c.standingForm(rev(), [eff("Necrotic Shroud")])).toBeNull();
    expect(
      c.standingForm(rev(), [{ name: "Heavenly Wings", active: false, chip: null }])
    ).toBeNull();
    expect(c.standingForm(rev(), [])).toBeNull();
  });
});

describe("riderDue — the clock, read plain", () => {
  const dread = () => reg.CLOCK_RIDERS["dread-ambusher"];
  const assassinate = () => reg.CLOCK_RIDERS.assassinate;
  it("Dreadful Strike: once per turn, a use in hand, a weapon — due; the chit standing or the uses gone — not", () => {
    expect(c.riderDue(dread(), { inCombat: true, round: 3, usesLeft: 2, weapon: true })).toEqual({
      due: true,
      why: "once this turn"
    });
    expect(
      c.riderDue(dread(), { inCombat: true, chitStands: true, usesLeft: 2, weapon: true }).why
    ).toMatch(/used this turn/);
    expect(c.riderDue(dread(), { inCombat: true, usesLeft: 0, weapon: true }).why).toMatch(
      /no uses/
    );
    expect(c.riderDue(dread(), { inCombat: true, usesLeft: 2, weapon: false }).why).toMatch(
      /not a weapon/
    );
  });
  it("out of combat there is no turn to be once-per: every hit rides (the Cleave shape)", () => {
    expect(c.riderDue(dread(), { inCombat: false, usesLeft: 1, weapon: true })).toEqual({
      due: true,
      why: "out of combat — every hit"
    });
  });
  it("Assassinate: the first round, on an armed Sneak Attack, and never out of combat", () => {
    expect(
      c.riderDue(assassinate(), { inCombat: true, round: 1, sneakArmed: true, weapon: true }).due
    ).toBe(true);
    expect(
      c.riderDue(assassinate(), { inCombat: true, round: 2, sneakArmed: true, weapon: true }).why
    ).toMatch(/round 2/);
    expect(
      c.riderDue(assassinate(), { inCombat: true, round: 1, sneakArmed: false, weapon: true }).why
    ).toMatch(/Sneak Attack/);
    expect(
      c.riderDue(assassinate(), { inCombat: false, sneakArmed: true, weapon: true }).why
    ).toMatch(/no first round/);
  });
  it("Divine Fury needs the rage; an unknown clock is never due", () => {
    expect(
      c.riderDue(reg.CLOCK_RIDERS["divine-fury"], { inCombat: true, weapon: true, raging: false })
        .why
    ).toMatch(/not raging/);
    expect(
      c.riderDue(reg.CLOCK_RIDERS["divine-fury"], { inCombat: true, weapon: true, raging: true })
        .due
    ).toBe(true);
    expect(c.riderDue({ when: "someday" }, {}).due).toBe(false);
  });
});

describe("riderPartFormula — the pack's part as a formula", () => {
  it("plain dice, a custom formula, a bonus, and Assassinate's bonus-only part", () => {
    expect(c.riderPartFormula({ number: 2, denomination: 6 })).toBe("2d6");
    expect(
      c.riderPartFormula({ custom: { enabled: true, formula: "@scale.gloom.dreadful-strike" } })
    ).toBe("@scale.gloom.dreadful-strike");
    expect(
      c.riderPartFormula({
        number: 1,
        denomination: 6,
        bonus: "(floor(@classes.barbarian.levels / 2))"
      })
    ).toBe("1d6 + (floor(@classes.barbarian.levels / 2))");
    expect(
      c.riderPartFormula({ number: null, denomination: null, bonus: "@classes.rogue.levels" })
    ).toBe("@classes.rogue.levels");
    expect(c.riderPartFormula({})).toBeNull();
  });
});

describe('Slice A (2026-09-24): `when: "any"`, uses on the item, effects on the rider', () => {
  it("`any` is due on every hit — in combat or out, a chit standing or not — while a use is left", () => {
    const row = { when: "any", uses: true };
    expect(c.riderDue(row, { usesLeft: 2 })).toMatchObject({ due: true });
    expect(
      c.riderDue(row, { usesLeft: 2, inCombat: true, round: 4, chitStands: true })
    ).toMatchObject({ due: true });
    expect(c.riderDue(row, { usesLeft: 0 })).toMatchObject({ due: false, why: "no uses left" });
    expect(c.riderDue(row, { usesLeft: null })).toMatchObject({ due: false });
  });
  it("Fire's Burn is not weapon-only: a spell attack's hit is due too", () => {
    expect(c.riderDue(reg.CLOCK_RIDERS["fires-burn"], { usesLeft: 3, weapon: false }).due).toBe(
      true
    );
  });
  it("the uses are the activity's when it carries them, else the item's — only for a `uses` row", () => {
    expect(
      c.riderUsesFrom({
        activity: { max: 3, value: 2, spent: 1 },
        item: { max: 5, value: 5, spent: 0 },
        uses: true
      })
    ).toEqual({ left: 2, max: 3, spent: 1, on: "activity" });
    expect(
      c.riderUsesFrom({
        activity: { max: "", value: null, spent: 0 },
        item: { max: 3, value: 3, spent: 0 },
        uses: true
      })
    ).toEqual({ left: 3, max: 3, spent: 0, on: "item" });
    expect(
      c.riderUsesFrom({ activity: { max: "" }, item: { max: 3, value: 3 }, uses: false })
    ).toBeNull();
    expect(c.riderUsesFrom({ activity: { max: "" }, item: { max: "" }, uses: true })).toBeNull();
    expect(c.riderUsesFrom({ activity: null, item: null, uses: true })).toBeNull();
  });
  it("the two rows: Fire's Burn and Frost's Chill ride on any hit from their item's uses; Frost's Chill lands its effect on the Slow clock", () => {
    expect(reg.CLOCK_RIDERS["fires-burn"]).toMatchObject({
      feature: "Fire's Burn",
      activity: "Burn",
      when: "any",
      uses: true
    });
    expect(reg.CLOCK_RIDERS["fires-burn"].weapon).toBeUndefined();
    expect(reg.CLOCK_RIDERS["frosts-chill"]).toMatchObject({
      feature: "Frost's Chill",
      activity: "Chill",
      when: "any",
      uses: true,
      effects: true,
      clock: "slow"
    });
    expect(
      new Set(Object.values(reg.HIT_OPTIONS).map(r => r.feature.toLowerCase())).has("fire's burn")
    ).toBe(false);
    expect(
      new Set(Object.values(reg.HIT_OPTIONS).map(r => r.feature.toLowerCase())).has("frost's chill")
    ).toBe(false);
    expect(
      new Set(Object.values(reg.HIT_OPTIONS).map(r => r.feature.toLowerCase())).has("hill's tumble")
    ).toBe(true);
  });
});

describe("the registry's clock-rider data", () => {
  it("every row names its feature, its activity, a known clock and its rule; the list default is the table", () => {
    for (const [key, row] of Object.entries(reg.CLOCK_RIDERS)) {
      expect(row.feature, key).toBeTruthy();
      // A row with no activity names its own `amount` (Celestial Revelation, 2026-09-25: no
      // activity carries the extra damage — the text's `@prof` does).
      // …or no damage at all: an effect-only row (the PHB feats, group 3) says what it does instead.
      // …or the die is the granting bard's (A1, Combat Inspiration: `inspired`).
      // THE DMG (2026-10-01): a weapon's own property names a flat amount (Mace of Smiting's 7) or says what it does;
      // a WORN item's (Arcana Unleashed's Blood Amulet) the same, its save the item's first.
      // …or one save per ability the feat may raise (Heroes of Faerûn's Fairy Trickster: `activities`), saying what it does.
      // …or a `spread` row with none named (Ravenloft's Wails from the Grave): the feature's first damage activity.
      if ((row.wields || row.worn || row.activities || row.spread) && row.activity === null)
        expect(row.amount || row.says || row.spread, key).toBeTruthy();
      else if (row.activity === null && !row.says && !row.inspired)
        expect(row.amount, key).toMatch(/^@/);
      else if (row.activity === null && !row.inspired)
        // …or the weapon's own damage retyped, no dice of its own (Sacred Weapon's Radiant: `retypes`).
        expect(
          row.lands?.name || row.bonusDice || row.random || row.enchant || row.retypes,
          key
        ).toBeTruthy();
      else if (!row.inspired) expect(row.activity, key).toBeTruthy();
      if ([].concat(row.judge ?? []).includes("transformed"))
        expect(row.forms?.length, key).toBeGreaterThan(0);
      // `any` (Slice A, 2026-09-24): every hit, uses permitting — the Goliath's boons.
      expect(["oncePerTurn", "firstRound", "any"], key).toContain(row.when);
      // …or a Critical Hit's own (the PHB feats, group 3: Slasher, Crusher, Piercer): the crit is the limit.
      // …or an Opportunity Attack's (the PHB feats, group 6: Sentinel's Halt) — the Reaction is the limit.
      // …or a bare landed effect that costs nothing and refreshes ONE copy (B2: Eldritch Strike's Struck).
      if (row.when === "any")
        expect(
          row.uses === true ||
            row.crit === true ||
            row.judge === "opportunity" ||
            row.self === true ||
            row.enchant === true ||
            // THE DMG: the weapon's own property — the item is the limit (a 20, a crit, or every hit with it).
            row.wields === true ||
            row.inspired === true ||
            // C1: a summon's rider on the summoner's mark (Bestial Fury, Create Thrall) — the mark is the limit.
            !!row.marked ||
            // RAVENLOFT: a status the target must wear (Ominous Strikes' Frightened) — the status is the limit.
            !!row.targetStatus ||
            // an effect the attacker must wear (Sacred Weapon's) — the effect's clock is the limit.
            !!row.wearing ||
            (!!row.lands?.name && !row.amount && !row.bonusDice),
          key
        ).toBe(true);
      // A landed effect with NO clock (C1, Power of the Wilds' Ram: Prone stands until the creature rises) rides the pack's own duration.
      if ((row.effects || row.lands) && row.clock !== undefined)
        expect(Object.keys(chips.CHIP_WINDOWS), key).toContain(row.clock);
      expectPointer(row.rule, key);
      expect(row.rule.item, key).toBe(row.feature);
    }
    expect(reg.clockRiderEntries().map(e => e.kind)).toContain("dread ambusher");
  });
  it("Assassinate's Advantage is an effect-table row with the clock as its judge", () => {
    expect(reg.EFFECT_BENDS.Assassinate).toMatchObject({
      match: "feature",
      attacker: "advantage",
      judge: "targetNotActed"
    });
  });
});

describe("the on-hit riders' facts (the PHB feats, group 3, 2026-09-26)", () => {
  const row = k => reg.CLOCK_RIDERS[k];
  it("a `dealt` row wants its damage type on the hit", () => {
    expect(c.riderDue(row("slasher-hamstring"), { dealt: ["slashing"] }).due).toBe(true);
    expect(c.riderDue(row("slasher-hamstring"), { dealt: ["piercing"] })).toMatchObject({
      due: false,
      why: "no slashing damage"
    });
    expect(
      c.riderDue(row("slasher-hamstring"), {
        dealt: ["slashing"],
        chitStands: true,
        inCombat: true
      }).due
    ).toBe(false);
  });
  it("a `crit` row only on a Critical Hit", () => {
    expect(
      c.riderDue(row("crusher-critical"), { dealt: ["bludgeoning"], critical: true })
    ).toMatchObject({ due: true });
    expect(
      c.riderDue(row("crusher-critical"), { dealt: ["bludgeoning"], critical: false })
    ).toMatchObject({ due: false, why: "not a Critical Hit" });
    expect(c.riderDue(row("piercer-critical"), { dealt: ["slashing"], critical: true }).due).toBe(
      false
    );
  });
  it("Hamstring lands as Hamstrung (the pack's speed change); only the crit lands Slashed — the gate's Disadvantage", () => {
    expect(row("slasher-hamstring").lands).toMatchObject({ name: "Hamstrung", from: "Slashed" });
    expect(row("slasher-critical").lands).toMatchObject({ name: "Slashed" });
    expect(row("slasher-critical").lands.from).toBeUndefined();
    expect(reg.EFFECT_BENDS.Slashed.attacker).toBe("disadvantage");
    expect(reg.EFFECT_BENDS.Hamstrung).toBeUndefined();
  });
});

describe("Sentinel's Halt — an Opportunity Attack's rider (the PHB feats, group 6, 2026-09-27)", () => {
  const halt = () => reg.CLOCK_RIDERS["sentinel-halt"];
  it("due on an attack the module drove as an Opportunity Attack, and on a melee attack off the attacker's own turn", () => {
    expect(c.riderDue(halt(), { opportunity: "driven" })).toEqual({
      due: true,
      why: "an Opportunity Attack"
    });
    expect(c.riderDue(halt(), { opportunity: "offTurn" })).toEqual({
      due: true,
      why: "a melee attack off your turn"
    });
    expect(c.riderDue(halt(), { opportunity: null })).toEqual({
      due: false,
      why: "not an Opportunity Attack"
    });
  });
  it("lands the pack's own Halted, for the rest of the CURRENT turn (the halt clock, pinned to the turn), and says its caveat", () => {
    expect(halt().lands).toMatchObject({ name: "Halted", from: "Halted" });
    expect(halt().lands.id).toHaveLength(16);
    expect(halt()).toMatchObject({ clock: "halt", caveat: "only on an Opportunity Attack" });
    expect(chips.CHIP_WINDOWS.halt).toEqual({ value: 0, units: "turns", expiry: "turnEnd" });
    expect(chips.TURN_PINNED).toContain("halt");
    expect(chips.TURN_CHITS).toContain("halt"); // out of combat there is no turn — the pack's own duration stands
    expect(chips.chipClock("halt", null)).toBe(null);
  });
});

describe("THE DMG — the crit riders and the enchanted weapons (RULINGS, 2026-10-01)", () => {
  const rider = key => reg.CLOCK_RIDERS[key];
  it("every DMG weapon row is `wields` and `always` — the weapon's own enchantment, never a pick", () => {
    const keys = [
      "vorpal-sword",
      "sword-of-sharpness",
      "sword-of-life-stealing",
      "nine-lives-stealer",
      "hammer-of-thunderbolts",
      "mace-of-smiting",
      "mace-of-smiting-construct",
      "silvered-weapon",
      "sword-of-wounding"
    ];
    for (const k of keys) {
      expect(rider(k)).toMatchObject({ wields: true, always: true, when: "any" });
      expect(rider(k).rule.uuid).toMatch(
        /^Compendium\.dnd-dungeon-masters-guide\.equipment\.Item\./
      );
    }
    // "roll a 20" for all but Silvered (any Critical Hit) and Wounding (every hit)
    for (const k of keys.filter(k => !["silvered-weapon", "sword-of-wounding"].includes(k)))
      expect(rider(k).natural).toBe(true);
    expect(rider("silvered-weapon")).toMatchObject({
      crit: true,
      bonusDice: 1,
      targets: { shapeshifted: true }
    });
    expect(rider("sword-of-wounding")).toMatchObject({
      save: true,
      saveOnly: true,
      activity: "Sword of Wounding Save"
    });
    // Giants' Bane's own damage is how it slays: its save keeps it.
    expect(rider("hammer-of-thunderbolts").saveOnly).toBeUndefined();
    expect(rider("nine-lives-stealer")).toMatchObject({
      save: true,
      charges: true,
      targets: { notTypes: ["construct", "undead"], hpBelow: 100 }
    });
    expect(rider("hammer-of-thunderbolts")).toMatchObject({
      save: true,
      activity: "Giants' Bane (On Crit)",
      targets: { types: ["giant"] }
    });
    expect(rider("mace-of-smiting")).toMatchObject({
      amount: "7",
      type: "bludgeoning",
      targets: { notTypes: ["construct"] }
    });
    expect(rider("mace-of-smiting-construct")).toMatchObject({
      amount: "14",
      type: "bludgeoning",
      destroy: 25,
      targets: { types: ["construct"] }
    });
    expect(rider("sword-of-life-stealing")).toMatchObject({
      tempHp: 15,
      targets: { notTypes: ["construct", "undead"] }
    });
    expect(rider("sword-of-sharpness").exhaustion).toBe(1);
  });
  it("the other tables: Vorpal's ignored Slashing, Nine Lives' slaying press, Wounding's repeat and heal block, Luck Blade's reroll", () => {
    expect(reg.DAMAGE_RULES["Vorpal Sword"]).toMatchObject({
      wields: true,
      ignores: "resistance",
      types: ["slashing"]
    });
    expect(reg.SAVE_PRESSES["Nine Lives Stealer"]).toMatchObject({
      activity: "Life Stealing",
      status: "dead",
      onFail: true,
      slain: true,
      spend: true
    });
    expect(reg.REPEAT_SAVES["Sword of Wounding"]).toMatchObject({
      effect: "Wounded and Cannot Heal",
      on: ["turnEnd"],
      activity: "Sword of Wounding Save"
    });
    expect(reg.HEAL_BLOCKS["Sword of Wounding"].effect).toBe("Wounded and Cannot Heal");
    expect(reg.REROLLS["Luck Blade"]).toMatchObject({
      tests: ["attack", "save", "check"],
      wields: true,
      activity: "Luck",
      notIncapacitated: true,
      bonus: null
    });
  });
  it("`natural`: a 20 on the d20, not any Critical Hit", () => {
    const row = rider("vorpal-sword");
    expect(c.riderDue(row, { weapon: true, critical: true, natural: false })).toEqual({
      due: false,
      why: "not a 20 on the d20"
    });
    expect(c.riderDue(row, { weapon: true, critical: true, natural: true })).toEqual({
      due: true,
      why: "a 20 on the d20"
    });
  });
  it("`targets`: every hit creature must answer; an unread one is never guessed", () => {
    const row = rider("nine-lives-stealer");
    const typed = targets => c.targetsAnswer(row.targets, targets);
    expect(typed([{ name: "Ogre", type: "giant", hp: 59 }])).toEqual({ fits: true, why: "" });
    expect(typed([{ name: "Zombie", type: "undead", hp: 22 }]).fits).toBe(false);
    expect(typed([{ name: "Dragon", type: "dragon", hp: 200 }])).toEqual({
      fits: false,
      why: "Dragon has 100 Hit Points or more"
    });
    expect(typed([{ name: "Thing", type: null, hp: 5 }]).fits).toBe(null);
    expect(typed([{ name: "Ogre", type: "giant", hp: null }]).fits).toBe(null);
    expect(
      c.targetsAnswer({ shapeshifted: true }, [
        { name: "Werewolf", type: "monstrosity", shapeshifted: true }
      ]).fits
    ).toBe(true);
    expect(
      c.targetsAnswer({ shapeshifted: true }, [
        { name: "Goblin", type: "humanoid", shapeshifted: false }
      ]).fits
    ).toBe(false);
    expect(c.targetsAnswer({ types: ["giant"] }, []).fits).toBe(null);
    expect(
      c.riderDue(row, { natural: true, typed: { fits: false, why: "Zombie is a undead" } })
    ).toEqual({ due: false, why: "Zombie is a undead" });
    expect(
      c.riderDue(row, { natural: true, typed: { fits: true, why: "" }, chargesLeft: 0 })
    ).toEqual({ due: false, why: "no charges left" });
    expect(
      c.riderDue(row, { natural: true, typed: { fits: true, why: "" }, chargesLeft: null }).due
    ).toBe(true);
  });
  it("Wounding rides every hit; Silvered every Critical Hit on a shape-shifted creature", () => {
    expect(c.riderDue(rider("sword-of-wounding"), { weapon: true })).toEqual({
      due: true,
      why: "every hit with it"
    });
    const silvered = rider("silvered-weapon");
    expect(c.riderDue(silvered, { critical: false, typed: { fits: true, why: "" } }).due).toBe(
      false
    );
    expect(c.riderDue(silvered, { critical: true, typed: { fits: true, why: "" } })).toEqual({
      due: true,
      why: "a Critical Hit"
    });
  });
});
