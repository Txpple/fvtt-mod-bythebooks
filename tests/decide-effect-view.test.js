import { describe, expect, it } from "vitest";
import {
  drawnAlways,
  drawsOnToken,
  allRows,
  changeSign,
  effectRows,
  everyRow,
  listed,
  marksHeldBy,
  panelGroups,
  rowAction,
  sheetRows,
  toneOf
} from "../scripts/decide/effect-view.js";

const fact = (over = {}) => ({
  id: "e1",
  name: "Bless",
  img: "icons/bless.svg",
  active: true,
  temporary: true,
  statuses: [],
  chipKey: null,
  clock: "9 Rounds",
  origin: null,
  worn: false,
  ...over
});

describe("the tone reads a marker status as no condition (2026-09-27, Aura of Protection's copy on an ally)", () => {
  it("an aura's member copy — bfEmanation, +2 to saves — is a buff; a real condition beside it is still red", () => {
    const copy = fact({
      statuses: ["bfEmanation"],
      changes: [{ key: "system.bonuses.abilities.save", mode: 2, value: 2 }]
    });
    expect(toneOf(copy)).toBe("buff");
    expect(toneOf({ ...copy, statuses: ["bfEmanation", "poisoned"] })).toBe("debuff");
    expect(
      toneOf(
        fact({
          statuses: ["bfEmanation"],
          changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: -2 }]
        })
      )
    ).toBe("debuff");
  });
});

describe("the effect view's rows (DESIGN §6, 2026-09-15: buffs and debuffs, never actions)", () => {
  it("lists the active effects that are clocked, a condition, or applied — never worn gear", () => {
    expect(listed(fact())).toBe(true);
    expect(listed(fact({ active: false }))).toBe(false);
    expect(listed(null)).toBe(false);
    // Death Armor: no clock, no status, applied by a cast — listed
    expect(listed(fact({ name: "Death Armor", temporary: false, clock: "None" }))).toBe(true);
    // Prone on Foundry 14: a bare status is not "temporary" — listed by its status
    expect(listed(fact({ name: "Prone", temporary: false, statuses: ["prone"] }))).toBe(true);
    // the Cloak of Protection: a worn item's transfer effect — a passive, not listed
    expect(listed(fact({ name: "Bonus AC/Saves: +1", temporary: false, worn: true }))).toBe(false);
    // worn gear WITH a clock or a status still lists (a cursed item's condition)
    expect(listed(fact({ temporary: false, worn: true, statuses: ["poisoned"] }))).toBe(true);
  });

  it('lists the bearer\'s own standing aura, worn as it is (user, 2026-09-15: "protected doesnt show on dorian tho, even tho he is")', () => {
    // Aura of Protection's "Protected" on the Paladin: the pack's transfer effect, no clock, no status
    const protectedOnPaladin = fact({
      name: "Protected",
      temporary: false,
      clock: "",
      worn: true,
      aura: true,
      changes: [{ key: "system.bonuses.abilities.save", mode: 2, value: "@abilities.cha.mod" }]
    });
    expect(listed(protectedOnPaladin)).toBe(true);
    // a buff, tagged no-icon (the token paints nothing for a passive), disable is its one write
    const [row] = effectRows([protectedOnPaladin]);
    expect(row.tone).toBe("buff");
    expect(row.noIcon).toBe(true);
    expect(rowAction(row, { owner: true })).toEqual({ action: "disable", label: "Disable" });
    // the same effect with the row struck from the list, or the switch off — a passive like the Cloak
    expect(listed(fact({ name: "Protected", temporary: false, worn: true, aura: false }))).toBe(
      false
    );
    expect(listed(fact({ name: "Protected", temporary: false, worn: true }))).toBe(false);
    // and never when the sheet has it off or the platform suppresses it
    expect(
      listed(fact({ name: "Protected", temporary: false, worn: true, aura: true, active: false }))
    ).toBe(false);
    // the full list still files it under Passive, as the sheet does
    expect(panelGroups([protectedOnPaladin]).map(g => g.label)).toEqual(["Passive"]);
  });

  it("tones concentration its own way, first of all (user, 2026-09-15: yellow)", () => {
    expect(toneOf(fact({ name: "Concentrating: Bane", statuses: ["concentrating"] }))).toBe(
      "concentration"
    );
    const rows = effectRows([
      fact({ id: "a", name: "Bless" }),
      fact({ id: "b", name: "Prone", statuses: ["prone"] }),
      fact({ id: "c", name: "Concentrating: Bane", statuses: ["concentrating"] })
    ]);
    expect(rows.map(r => r.name)).toEqual(["Concentrating: Bane", "Prone", "Bless"]);
  });

  it("tones a condition and a module mark as a debuff", () => {
    expect(toneOf(fact({ statuses: ["prone"] }))).toBe("debuff");
    expect(toneOf(fact({ name: "Sapped", chipKey: "sap" }))).toBe("debuff");
    expect(toneOf(fact({ name: "Cleave", chipKey: "cleave" }))).toBe("buff");
    expect(toneOf(fact())).toBe("buff");
  });

  it("reads a change's sign: a subtraction, a halving, a downgrade or disadvantage is a penalty; the mirror is a bonus", () => {
    expect(changeSign({ key: "system.attributes.ac.bonus", mode: 2, value: "-2" })).toBe("penalty");
    expect(changeSign({ key: "system.attributes.ac.bonus", mode: 2, value: "+2" })).toBe("bonus");
    expect(changeSign({ key: "system.attributes.movement.walk", mode: 1, value: "0.5" })).toBe(
      "penalty"
    );
    expect(changeSign({ key: "system.attributes.movement.walk", mode: 1, value: "2" })).toBe(
      "bonus"
    );
    expect(changeSign({ key: "system.attributes.ac.value", mode: 3, value: "10" })).toBe("penalty");
    expect(changeSign({ key: "system.attributes.ac.value", mode: 4, value: "16" })).toBe("bonus");
    expect(changeSign({ key: "flags.dnd5e.disadvantage.attack.all", mode: 5, value: "1" })).toBe(
      "penalty"
    );
    expect(changeSign({ key: "flags.dnd5e.advantage.save.all", mode: 5, value: "1" })).toBe(
      "bonus"
    );
    expect(
      changeSign({ key: "system.attributes.senses.darkvision", mode: 5, value: "60" })
    ).toBeNull();
    expect(
      changeSign({ key: "system.attributes.ac.bonus", mode: 2, value: "@abilities.str.mod" })
    ).toBeNull();
    expect(changeSign(null)).toBeNull();
  });

  it("THE PATTERN (user, 2026-09-15, the Miasma's Damaged: -2 AC): a penalty in the changes is a debuff, a penalty outranks a bonus", () => {
    expect(
      toneOf(
        fact({
          name: "Damaged: -2 AC",
          changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: "-2" }]
        })
      )
    ).toBe("debuff");
    expect(
      toneOf(
        fact({
          name: "Blessed",
          changes: [{ key: "system.bonuses.All-Attacks", mode: 2, value: "1d4" }]
        })
      )
    ).toBe("buff");
    expect(
      toneOf(
        fact({
          name: "Haste",
          changes: [
            { key: "system.attributes.ac.bonus", mode: 2, value: "2" },
            { key: "system.attributes.movement.walk", mode: 1, value: "2" }
          ]
        })
      )
    ).toBe("buff");
    expect(
      toneOf(
        fact({
          name: "Slow",
          changes: [
            { key: "system.attributes.movement.walk", mode: 1, value: "0.5" },
            { key: "system.attributes.ac.bonus", mode: 2, value: "-2" }
          ]
        })
      )
    ).toBe("debuff");
    expect(
      toneOf(
        fact({
          name: "Mixed",
          changes: [
            { key: "system.attributes.ac.bonus", mode: 2, value: "2" },
            { key: "system.attributes.hp.tempmax", mode: 2, value: "-5" }
          ]
        })
      )
    ).toBe("debuff");
  });

  it('with no readable change, the bend row decides before the side (user, 2026-10-29: Helped "is a debuff, not a buff")', () => {
    // Distracted (Help) on the enemy, placed by a friendly familiar the enemy's side can read as neutral
    expect(
      toneOf(
        fact({
          name: "Distracted (Help)",
          changes: [],
          bend: { attacker: null, target: "advantage" },
          hostileOrigin: null
        })
      )
    ).toBe("debuff");
    expect(
      toneOf(
        fact({
          name: "Mocked",
          changes: [],
          bend: { attacker: "disadvantage", target: null },
          hostileOrigin: false
        })
      )
    ).toBe("debuff");
    expect(
      toneOf(
        fact({
          name: "Blurred",
          changes: [],
          bend: { attacker: null, target: "disadvantage" },
          hostileOrigin: true
        })
      )
    ).toBe("buff");
    expect(toneOf(fact({ name: "Assisted", changes: [], bend: { checks: "advantage" } }))).toBe(
      "buff"
    );
    // both sides at once (Reckless) says nothing: the side decides
    expect(
      toneOf(
        fact({
          name: "Reckless",
          changes: [],
          bend: { attacker: "advantage", target: "advantage" },
          hostileOrigin: true
        })
      )
    ).toBe("debuff");
    expect(
      toneOf(
        fact({
          name: "Reckless",
          changes: [],
          bend: { attacker: "advantage", target: "advantage" }
        })
      )
    ).toBe("buff");
  });

  it("with no readable change, who put it there decides: an enemy's marker is a debuff, an ally's or your own a buff", () => {
    expect(toneOf(fact({ name: "Hunter's Mark", changes: [], hostileOrigin: true }))).toBe(
      "debuff"
    );
    expect(toneOf(fact({ name: "Hunter's Mark", changes: [], hostileOrigin: false }))).toBe("buff");
    expect(toneOf(fact({ name: "Death Armor", changes: [], hostileOrigin: null }))).toBe("buff");
    // a readable change outranks the side: an enemy's accidental buff stays a buff
    expect(
      toneOf(
        fact({
          changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: "1" }],
          hostileOrigin: true
        })
      )
    ).toBe("buff");
  });

  it("tags the rows the token cannot paint: clockless and status-less (measured 2026-09-15)", () => {
    const rows = effectRows([
      fact(),
      fact({ id: "e2", name: "Prone", temporary: false, statuses: ["prone"] }),
      fact({ id: "e3", name: "Death Armor", temporary: false, clock: "" })
    ]);
    expect(rows.find(r => r.name === "Bless").noIcon).toBe(false);
    expect(rows.find(r => r.name === "Prone").noIcon).toBe(false);
    expect(rows.find(r => r.name === "Death Armor").noIcon).toBe(true);
  });

  it("orders debuffs first, then buffs, each in sheet order", () => {
    const rows = effectRows([
      fact({ id: "a", name: "Bless" }),
      fact({ id: "b", name: "Prone", statuses: ["prone"] }),
      fact({ id: "c", name: "Death Armor" }),
      fact({ id: "d", name: "Sapped", chipKey: "sap" })
    ]);
    expect(rows.map(r => r.name)).toEqual(["Prone", "Sapped", "Bless", "Death Armor"]);
  });

  it("finds the marks a creature holds on others by origin, and names the bearer", () => {
    const held = marksHeldBy("Actor.dorian", [
      {
        bearer: "Goblin Boss",
        fact: fact({ id: "s", name: "Sapped", chipKey: "sap", origin: "Actor.dorian.Item.sword" })
      },
      {
        bearer: "Ogre",
        fact: fact({ id: "v", name: "Vexed", chipKey: "vex", origin: "Actor.aster.Item.axe" })
      },
      {
        bearer: "Ogre",
        fact: fact({
          id: "x",
          name: "Dead chip",
          chipKey: "sap",
          origin: "Actor.dorian",
          active: false
        })
      }
    ]);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ name: "Sapped", bearer: "Goblin Boss", tone: "debuff" });
    expect(marksHeldBy(null, [])).toEqual([]);
  });

  it("the sheet rows: temp HP and Heroic Inspiration are buffs read off the sheet, not effects (user, 2026-09-15)", () => {
    expect(sheetRows({ tempHp: 3, inspiration: false })).toMatchObject([
      {
        id: "sheet:tempHp",
        name: "Temporary HP",
        detail: "3",
        tone: "buff",
        clock: "",
        noIcon: false
      }
    ]);
    expect(sheetRows({ tempHp: 0, inspiration: true }).map(r => r.name)).toEqual([
      "Heroic Inspiration"
    ]);
    expect(sheetRows({ tempHp: 0, inspiration: false })).toEqual([]);
    expect(sheetRows({})).toEqual([]);
    expect(sheetRows({ tempHp: null, inspiration: "yes" })).toEqual([]);
  });

  it("allRows: the effects first (debuffs, then buffs), then the sheet's own buffs", () => {
    const rows = allRows([fact(), fact({ id: "p", name: "Prone", statuses: ["prone"] })], {
      tempHp: 5,
      inspiration: true
    });
    expect(rows.map(r => r.name)).toEqual(["Prone", "Bless", "Temporary HP", "Heroic Inspiration"]);
  });

  it("the bar's action per row: remove an actor's effect, disable an item's, clear a sheet row; nothing for a non-owner", () => {
    expect(rowAction({ id: "e1" }, { owner: true })).toEqual({ action: "remove", label: "Remove" });
    expect(rowAction({ id: "e2", onItem: true }, { owner: true })).toEqual({
      action: "disable",
      label: "Disable"
    });
    expect(rowAction({ id: "sheet:tempHp" }, { owner: true })).toEqual({
      action: "clear",
      label: "Clear"
    });
    expect(rowAction({ id: "e1" }, { owner: false })).toBeNull();
    expect(rowAction(null, { owner: true })).toBeNull();
  });

  it("a row remembers whether its effect lives on an item", () => {
    const rows = effectRows([
      fact({ id: "w", statuses: ["poisoned"], worn: true }),
      fact({ id: "a" })
    ]);
    expect(rows.find(r => r.id === "w").onItem).toBe(true);
    expect(rows.find(r => r.id === "a").onItem).toBe(false);
  });

  it("the panel's groups mirror the sheet: Temporary, Passive, Unavailable (user, 2026-09-15: show ALL, including passives)", () => {
    const groups = panelGroups(
      [
        fact({ id: "b", name: "Blessed" }),
        fact({ id: "p", name: "Prone", temporary: false, statuses: ["prone"] }),
        fact({ id: "k", name: "Concentrating: Bane", statuses: ["concentrating"] }),
        fact({ id: "t", name: "Tough", temporary: false, worn: true }),
        fact({ id: "d", name: "Death Armor", temporary: false }),
        fact({
          id: "l",
          name: "Lucky",
          temporary: false,
          worn: true,
          active: false,
          disabled: false
        }),
        fact({ id: "m", name: "Damaged: -2 AC", temporary: false, active: false, disabled: false }),
        fact({
          id: "w",
          name: "Wand of the War Mage +1",
          temporary: false,
          worn: true,
          active: false,
          disabled: true
        })
      ],
      { tempHp: 3 }
    );
    expect(groups.map(g => g.label)).toEqual(["Temporary", "Passive", "Unavailable"]);
    // concentration leads the group, then the debuffs, then the buffs (the sheet rows last)
    expect(groups[0].rows.map(r => r.name)).toEqual([
      "Concentrating: Bane",
      "Prone",
      "Blessed",
      "Temporary HP"
    ]);
    expect(groups[1].rows.map(r => r.name)).toEqual(["Tough", "Death Armor"]);
    expect(groups[2].rows.map(r => r.name)).toEqual(["Lucky", "Damaged: -2 AC"]);
    expect(groups[2].rows.every(r => r.unavailable === true)).toBe(true);
    expect(
      everyRow([fact({ id: "d", temporary: false, active: false, disabled: false })]).map(r => r.id)
    ).toEqual(["d"]);
    expect(panelGroups([])).toEqual([]);
  });
});

describe('a fighting style\'s face in the panel (user, 2026-09-26: "i only want one line")', () => {
  it("reads Fighting Style: <name> on one line, no suffix, the long line kept for the hover", () => {
    const face = fact({
      name: "Great Weapon Fighting",
      temporary: false,
      worn: true,
      clock: "",
      style: true,
      detail: "Greatsword, two hands"
    });
    const row = panelGroups([face]).flatMap(g => g.rows)[0];
    expect(row.name).toBe("Fighting Style: Great Weapon Fighting");
    expect(row.why).toBe("Greatsword, two hands");
    expect(row.detail).toBeUndefined();
  });
  it("titles a Fighting Style feat's own effect by the feat (Blind Fighting's senses)", () => {
    const senses = fact({
      name: "Blindsight",
      temporary: false,
      worn: true,
      clock: "",
      styleFeat: "Blind Fighting"
    });
    expect(panelGroups([senses]).flatMap(g => g.rows)[0].name).toBe(
      "Fighting Style: Blind Fighting"
    );
  });
});

describe("drawn on the token by Foundry's rule (2026-10-13, Continual Flame's stone said no icon)", () => {
  it("ALWAYS draws; CONDITIONAL draws only with a duration; NEVER never", () => {
    expect(drawsOnToken({ showIcon: 2, temporary: false })).toBe(true);
    expect(drawsOnToken({ showIcon: 1, temporary: true })).toBe(true);
    expect(drawsOnToken({ showIcon: 1, temporary: false, statuses: ["bfEmanation"] })).toBe(false);
    expect(drawsOnToken({ showIcon: 0, temporary: true })).toBe(false);
  });
  it("a fact with no showIcon reads the old way: temporary or a status", () => {
    expect(drawsOnToken({ temporary: false, statuses: ["prone"] })).toBe(true);
    expect(drawsOnToken({ temporary: false })).toBe(false);
  });
  it("the module's effects on a creature are drawn ALWAYS; a style's face, an item's transfer, a set showIcon are not", () => {
    expect(drawnAlways({ onActor: true, moduleFlags: { summonEffect: "m1" } })).toBe(true);
    expect(drawnAlways({ onActor: true, moduleFlags: { companion: "m1" } })).toBe(true);
    expect(drawnAlways({ onActor: true, moduleFlags: { fightingStyle: { key: "x" } } })).toBe(
      false
    );
    expect(drawnAlways({ onActor: true, transfer: true, moduleFlags: { gear: {} } })).toBe(false);
    expect(drawnAlways({ onActor: false, moduleFlags: { gear: {} } })).toBe(false);
    expect(drawnAlways({ onActor: true, showIconSet: true, moduleFlags: { gear: {} } })).toBe(
      false
    );
    expect(drawnAlways({ onActor: true, moduleFlags: null })).toBe(false);
  });
});
