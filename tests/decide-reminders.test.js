import { beforeAll, describe, expect, it } from "vitest";
import { expectPointer } from "./rule-pointer.js";

/**
 * DECISION-layer reminder arithmetic (ARCHITECTURE.md §2). No Foundry stub on purpose.
 *
 * ⚠ The net rule is a USER RULING (2026-09-01), quoted in the module's own words below; the
 * three examples in the first block are the user's own. A change here changes what the popup
 * tells the table the roll nets to.
 */
/** @type {typeof import("../scripts/decide/reminders.js")} */
let r;
/** @type {typeof import("../scripts/decide/registry.js")} */
let reg;
beforeAll(async () => {
  r = await import("../scripts/decide/reminders.js");
  reg = await import("../scripts/decide/registry.js");
});

const adv = label => r.reminderSource("vex", "advantage", label ?? "adv");
const dis = label => r.reminderSource("sap", "disadvantage", label ?? "dis");
const unk = () => r.reminderSource("prone", null, "prone, distance unknown");

describe("netMode — the user's three examples, and the rest of the table", () => {
  it("adv/adv == adv", () => {
    expect(r.netMode([adv(), adv()])).toBe("advantage");
  });
  it("adv/disadv == regular", () => {
    expect(r.netMode([adv(), dis()])).toBe("normal");
  });
  it("adv/disadv/disadv == regular — never a majority vote", () => {
    expect(r.netMode([adv(), dis(), dis()])).toBe("normal");
    expect(r.netMode([adv(), adv(), adv(), dis()])).toBe("normal");
  });
  it("one side alone is that side; nothing is normal", () => {
    expect(r.netMode([adv()])).toBe("advantage");
    expect(r.netMode([dis(), dis()])).toBe("disadvantage");
    expect(r.netMode([])).toBe("normal");
  });
  it("an unjudged source is listed, not counted", () => {
    expect(r.netMode([unk()])).toBe("normal");
    expect(r.netMode([adv(), unk()])).toBe("advantage");
    expect(r.netMode([dis(), unk()])).toBe("disadvantage");
  });
});

describe("resolutionLine — says why", () => {
  it("cancelling names both counts and the rule", () => {
    expect(r.resolutionLine([adv(), dis(), dis()])).toBe(
      "Advantage (1) and Disadvantage (2) cancel — a normal roll, however many of each."
    );
  });
  it("several of one side is still one", () => {
    expect(r.resolutionLine([adv(), adv()])).toBe("2 sources of Advantage — still one Advantage.");
    expect(r.resolutionLine([dis()])).toBe("One source of Disadvantage.");
  });
  it("an unjudged source is flagged for the table", () => {
    expect(r.resolutionLine([adv(), unk()])).toBe(
      "One source of Advantage. One source could not be judged from here — see below."
    );
    expect(r.resolutionLine([unk()])).toBe(
      "Nothing counted. One source could not be judged from here — see below."
    );
  });
  it("nothing at all is said plainly", () => {
    expect(r.resolutionLine([])).toBe("Nothing bends this roll.");
  });
});

describe("modeTitle / rolledWith — two readings of one mode, one vocabulary each", () => {
  it("titles", () => {
    expect(r.modeTitle("advantage")).toBe("Advantage");
    expect(r.modeTitle("disadvantage")).toBe("Disadvantage");
    expect(r.modeTitle("normal")).toBe("Normal roll");
  });
  it("how a roll went out — the reminder line and the spend line share it", () => {
    expect(r.rolledWith("advantage")).toBe("with Advantage");
    expect(r.rolledWith("disadvantage")).toBe("with Disadvantage");
    expect(r.rolledWith("normal")).toBe("flat");
    expect(r.rolledWith(null)).toBe("flat");
  });
});

describe("proneSources — both roles, from plain facts", () => {
  it("a prone attacker is Disadvantage", () => {
    const [s] = r.proneSources({ attackerProne: true, attackerName: "Gruk" });
    expect(s).toMatchObject({ kind: "prone", bend: "disadvantage", label: "Gruk — Prone" });
  });
  it("a prone target within 5 feet is Advantage; beyond is Disadvantage", () => {
    expect(
      r.proneSources({ targetProne: true, distanceFeet: 5, targetName: "Hobgoblin" })[0]
    ).toMatchObject({ bend: "advantage", label: "Hobgoblin is Prone — within 5 feet" });
    expect(
      r.proneSources({ targetProne: true, distanceFeet: 30, targetName: "Hobgoblin" })[0]
    ).toMatchObject({ bend: "disadvantage", label: "Hobgoblin is Prone — 30 feet away" });
  });
  it("a prone target at an unknown distance is listed, not counted", () => {
    const [s] = r.proneSources({ targetProne: true, distanceFeet: null, targetName: "Hobgoblin" });
    expect(s.bend).toBeNull();
    expect(s.label).toBe("Hobgoblin is Prone — distance unknown");
    expect(r.proneSources({ targetProne: true, distanceFeet: Number.NaN })[0].bend).toBeNull();
  });
  it("both roles at once are two sources — and they cancel", () => {
    const sources = r.proneSources({ attackerProne: true, targetProne: true, distanceFeet: 5 });
    expect(sources).toHaveLength(2);
    expect(r.netMode(sources)).toBe("normal");
  });
  it("nothing prone is nothing", () => {
    expect(
      r.proneSources({
        targetProne: true,
        distanceFeet: 30,
        targetName: "Bramm",
        targetProneBy: "Cunning Strike: Tripped"
      })[0].label
    ).toBe("Bramm is Prone (Cunning Strike: Tripped) — 30 feet away");
    expect(
      r.proneSources({
        targetProne: true,
        distanceFeet: 5,
        targetName: "Bramm",
        targetProneBy: "Prone"
      })[0].label
    ).toBe("Bramm is Prone — within 5 feet");
    expect(r.proneSources({})).toEqual([]);
    expect(r.proneSources()).toEqual([]);
  });
});

describe("conditionSources — the registry's table, read one row at a time", () => {
  const all = () => ({ table: reg.CONDITION_BENDS, enabled: reg.CONDITION_KEYS });
  it("who sees the unseen (2026-09-26): Invisible is listed, not counted, against a creature that sees it", () => {
    const blind = r.sightOf({ blindsight: 10 }, 5);
    expect(blind).toEqual({ sense: "Blindsight", range: 10, sees: ["invisible", "hiding"] });
    expect(r.sightOf({ blindsight: 10 }, 15)).toBeNull();
    expect(r.sightOf({ truesight: 120 }, 30)?.sees).toEqual(["invisible"]);
    const [t] = r.conditionSources({
      ...all(),
      targetStatuses: ["invisible"],
      targetName: "Goblin",
      attackerName: "Rowan",
      targetSeenBy: blind
    });
    expect(t).toMatchObject({
      bend: null,
      label: "Goblin is Invisible — Rowan sees it (Blindsight 10 ft)"
    });
    const [a] = r.conditionSources({
      ...all(),
      attackerStatuses: ["invisible"],
      attackerName: "Goblin",
      targetName: "Rowan",
      attackerSeenBy: blind
    });
    expect(a).toMatchObject({
      bend: null,
      label: "Goblin — Invisible: Rowan sees you (Blindsight 10 ft)"
    });
    // Truesight does not find the hidden
    const [h] = r.conditionSources({
      ...all(),
      targetStatuses: ["hiding"],
      targetSeenBy: r.sightOf({ truesight: 60 }, 5)
    });
    expect(h.bend).toBe("disadvantage");
  });
  it("a poisoned attacker is Disadvantage; a blinded target is Advantage", () => {
    expect(
      r.conditionSources({ ...all(), attackerStatuses: ["poisoned"], attackerName: "Gruk" })[0]
    ).toMatchObject({ kind: "condition", bend: "disadvantage", label: "Gruk — Poisoned" });
    expect(
      r.conditionSources({ ...all(), targetStatuses: ["blinded"], targetName: "Hobgoblin" })[0]
    ).toMatchObject({ kind: "condition", bend: "advantage", label: "Hobgoblin is Blinded" });
  });
  it("both roles of one condition are two sources — restrained attacker vs restrained target cancel", () => {
    const sources = r.conditionSources({
      ...all(),
      attackerStatuses: ["restrained"],
      targetStatuses: ["restrained"]
    });
    expect(sources.map(s => s.bend)).toEqual(["disadvantage", "advantage"]);
    expect(r.netMode(sources)).toBe("normal");
  });
  it("a side with no bend yields nothing; a note is listed, not counted", () => {
    expect(r.conditionSources({ ...all(), targetStatuses: ["poisoned"] })).toEqual([]);
    const [s] = r.conditionSources({
      ...all(),
      attackerStatuses: ["incapacitated"],
      attackerName: "Gruk"
    });
    expect(s.bend).toBeNull();
    expect(s.label).toMatch(/^Gruk — Incapacitated: /);
    expect(r.conditionSources({ ...all(), targetStatuses: ["incapacitated"] })).toEqual([]);
  });
  it("conditional rows say so in their label", () => {
    const [s] = r.conditionSources({
      ...all(),
      attackerStatuses: ["frightened"],
      attackerName: "Gruk"
    });
    expect(s.bend).toBe("disadvantage");
    expect(s.label).toBe("Gruk — Frightened"); // the counted caveat stays off the label (user, 2026-09-02)
  });
  it("the enabled list is the switch, and unknown statuses are ignored", () => {
    expect(
      r.conditionSources({
        table: reg.CONDITION_BENDS,
        enabled: ["blinded"],
        attackerStatuses: ["poisoned"]
      })
    ).toEqual([]);
    expect(r.conditionSources({ ...all(), attackerStatuses: ["bleeding", "surprised"] })).toEqual(
      []
    );
    expect(
      r.conditionSources({
        table: reg.CONDITION_BENDS,
        enabled: [],
        attackerStatuses: ["poisoned"]
      })
    ).toEqual([]);
  });
  it("⚠ nothing is required to be passed for nothing to be read — there is no default list and no default table", () => {
    expect(r.conditionSources({ attackerStatuses: ["poisoned"] })).toEqual([]);
    expect(
      r.conditionSources({ table: reg.CONDITION_BENDS, attackerStatuses: ["poisoned"] })
    ).toEqual([]);
    expect(r.conditionSources({ enabled: ["poisoned"], attackerStatuses: ["poisoned"] })).toEqual(
      []
    );
  });
  it("accepts a Set of statuses, as the system hands them over", () => {
    expect(r.conditionSources({ ...all(), targetStatuses: new Set(["stunned"]) })[0].bend).toBe(
      "advantage"
    );
  });
  it("reads rows in the table's order, whatever the list's", () => {
    const sources = r.conditionSources({
      table: reg.CONDITION_BENDS,
      enabled: ["poisoned", "blinded"],
      attackerStatuses: ["poisoned", "blinded"],
      attackerName: "Gruk"
    });
    expect(sources.map(s => s.label)).toEqual(["Gruk — Blinded", "Gruk — Poisoned"]);
  });
});

describe("rangeSources — a ranged attack's own geometry, both glossary rules", () => {
  const rules = () => reg.RANGE_RULES;
  const at = (d, extra = {}) =>
    r.rangeSources({
      ranged: true,
      distanceFeet: d,
      normalFeet: 20,
      longFeet: 60,
      targetName: "Hobgoblin",
      rules: rules(),
      ...extra
    });
  it("within normal range is nothing; beyond normal is Disadvantage with the glossary sentence", () => {
    expect(at(20)).toEqual([]);
    expect(at(25)).toMatchObject([
      {
        kind: "range",
        bend: "disadvantage",
        label: "Hobgoblin is beyond normal range — 25 feet (20/60)",
        detail: reg.RANGE_RULES.long
      }
    ]);
    expect(at(60)[0].bend).toBe("disadvantage");
  });
  it("beyond long range cannot be made — listed, not counted", () => {
    const [s] = at(65);
    expect(s.bend).toBeNull();
    expect(s.label).toBe(
      "Hobgoblin is beyond long range — 65 feet, long range 60: this attack cannot be made"
    );
    expect(r.netMode([s])).toBe("normal");
  });
  it("a single range (a spell) has no Disadvantage band — beyond it cannot be made", () => {
    expect(at(25, { normalFeet: 30, longFeet: null })).toEqual([]);
    const [s] = at(35, { normalFeet: 30, longFeet: null });
    expect(s.bend).toBeNull();
    expect(s.label).toBe(
      "Hobgoblin is beyond range — 35 feet, range 30: this attack cannot be made"
    );
    expect(s.detail).toBe(reg.RANGE_RULES.single);
  });
  it("an enemy within 5 feet is Disadvantage, carrying the caveat the module cannot judge", () => {
    const [s] = r.rangeSources({
      ranged: true,
      closeEnemies: ["Goblin", "Wolf"],
      attackerName: "Gruk",
      rules: rules()
    });
    expect(s).toMatchObject({ kind: "range", bend: "disadvantage", detail: reg.RANGE_RULES.close });
    expect(s.label).toBe("Ranged attack within 5 feet of Goblin, Wolf");
  });
  it("a melee attack yields nothing, whatever the distance; an unmeasured ranged attack yields nothing on the range side", () => {
    expect(
      r.rangeSources({
        ranged: false,
        distanceFeet: 100,
        normalFeet: 20,
        longFeet: 60,
        closeEnemies: ["Goblin"],
        rules: rules()
      })
    ).toEqual([]);
    expect(at(null)).toEqual([]);
    expect(at(Number.NaN)).toEqual([]);
    expect(r.rangeSources({ ranged: true, distanceFeet: 30, rules: rules() })).toEqual([]);
  });
  it("close combat and long range together are two sources of Disadvantage — still one", () => {
    const sources = at(30, { closeEnemies: ["Goblin"], attackerName: "Gruk" });
    expect(sources.map(s => s.bend)).toEqual(["disadvantage", "disadvantage"]);
    expect(r.netMode(sources)).toBe("disadvantage");
  });
  it("the glossary rules point at dnd5e's range pages, and no rules means no boxes", () => {
    expect(reg.RANGE_RULES.long).toEqual({ page: "rule", key: "range" });
    expect(reg.RANGE_RULES.single).toEqual({ page: "rule", key: "range" });
    expect(reg.RANGE_RULES.close).toEqual({ page: "rule", key: "rangedattacksinclosecombat" });
    expect(
      r.rangeSources({ ranged: true, distanceFeet: 99, normalFeet: 20, longFeet: 60 })
    ).toEqual([]);
  });
});

describe("reminderView — the header line and the boxes the section draws", () => {
  it("one box per source: the fact, the bend as a badge, the rule; the net line only when sources contend", () => {
    const sources = [
      r.reminderSource("sap", "disadvantage", "Gruk — Sapped by Tavin", "sap rule"),
      r.reminderSource("vex", "advantage", "Gruk Vexed Tavin", "vex rule")
    ];
    expect(r.reminderView(sources, "normal")).toEqual({
      head: {
        title: "2 Modifiers — Net",
        net: "normal",
        why: "Advantage (1) and Disadvantage (1) cancel — a normal roll, however many of each."
      },
      boxes: [
        { label: "Gruk — Sapped by Tavin", bend: "disadvantage", rule: "sap rule" },
        { label: "Gruk Vexed Tavin", bend: "advantage", rule: "vex rule" }
      ]
    });
  });
  it("one source is one Modifier, a row the module cannot judge keeps a null bend, and there is NO net block (user, 2026-09-02)", () => {
    const view = r.reminderView([unk()], "normal");
    expect(view.head).toEqual({
      title: "1 Modifier — Net",
      net: "normal",
      why: "Nothing counted. One source could not be judged from here — see below."
    });
    expect(view.boxes).toEqual([{ label: "prone, distance unknown", bend: null, rule: "" }]);
    expect(view).not.toHaveProperty("net");
    expect(r.reminderView([dis()], "disadvantage").head.net).toBe("disadvantage");
    expect(r.reminderView([adv(), adv()], "advantage").head.title).toBe("2 Modifiers — Net");
  });
});

describe("effectSources — the sixth kind: an ability on either sheet, by name (user, 2026-09-02)", () => {
  const T = () => reg.EFFECT_BENDS;
  const all = () => reg.EFFECT_KEYS;
  it("Innate Sorcery is spell attacks only — fires on a spell, not on a dagger; case-insensitive on both sides", () => {
    const me = { effects: [{ id: "e1", name: "innate sorcery" }] };
    const spell = r.effectSources({
      attacker: me,
      enabled: ["INNATE SORCERY"],
      table: T(),
      scope: { classification: "spell", type: "ranged" },
      attackerName: "Ilyra"
    });
    expect(spell).toHaveLength(1);
    expect(spell[0]).toMatchObject({
      kind: "effect",
      bend: "advantage",
      label: "Ilyra — Innate Sorcery",
      effectId: "e1"
    });
    expect(spell[0].detail).toBe(T()["Innate Sorcery"].rule);
    expect(spell[0].detail).toMatchObject({ item: "Innate Sorcery" });
    expect(
      r.effectSources({
        attacker: me,
        enabled: all(),
        table: T(),
        scope: { classification: "weapon", type: "melee" }
      })
    ).toEqual([]);
    expect(
      r.effectSources({ attacker: me, enabled: [], table: T(), scope: { classification: "spell" } })
    ).toEqual([]);
  });
  it("Reckless bends both sides: the bearer's own weapon attacks, and attacks against the bearer", () => {
    const reckless = { effects: [{ id: "e2", name: "Reckless" }] };
    const mine = r.effectSources({
      attacker: reckless,
      enabled: all(),
      table: T(),
      scope: { classification: "weapon", type: "melee" },
      attackerName: "Brann"
    });
    expect(mine.map(s => [s.bend, s.label])).toEqual([["advantage", "Brann — Reckless"]]);
    const theirs = r.effectSources({
      target: reckless,
      enabled: all(),
      table: T(),
      scope: { classification: "weapon", type: "melee" },
      targetName: "Brann"
    });
    expect(theirs.map(s => [s.bend, s.label])).toEqual([["advantage", "Brann is — Reckless"]]);
  });
  it("a row with counted:false is LISTED — bend null, the caveat on the label", () => {
    const out = r.effectSources({
      attacker: { effects: [{ id: "e3", name: "Demon Armor" }] },
      enabled: all(),
      table: T(),
      scope: {},
      attackerName: "Aster"
    });
    expect(out).toHaveLength(1);
    expect(out[0].bend).toBeNull();
    expect(out[0].label).toBe("Aster — Demon Armor (listed — Disadvantage only against demons)");
  });
  it("a feature row matches an Item's name, never an effect; a counted caveat stays OFF the label", () => {
    const out = r.effectSources({
      attacker: { features: ["Pack Tactics"] },
      enabled: all(),
      table: T(),
      scope: {},
      attackerName: "Wolf"
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      bend: "advantage",
      label: "Wolf — Pack Tactics"
    });
    expect(out[0]).not.toHaveProperty("effectId");
    expect(
      r.effectSources({
        attacker: { effects: [{ id: "x", name: "Pack Tactics" }] },
        enabled: all(),
        table: T(),
        scope: {}
      })
    ).toEqual([]);
  });
  it("Pack Tactics is judged on the map (2026-09-22): an ally near the target fires, none skips, an unreadable side counts", () => {
    const wolf = { features: ["Pack Tactics"] };
    const at = allyNear =>
      r.effectSources({
        attacker: wolf,
        target: { allyNear },
        enabled: all(),
        table: T(),
        scope: {},
        attackerName: "Wolf",
        pass: "target"
      });
    expect(at(true).map(s => [s.bend, s.label])).toEqual([["advantage", "Wolf — Pack Tactics"]]);
    expect(at(false)).toEqual([]);
    expect(at(null)).toHaveLength(1);
    // …and it hinges on the TARGET: the attacker's own pass never carries it.
    expect(
      r.effectSources({
        attacker: wolf,
        enabled: all(),
        table: T(),
        scope: {},
        attackerName: "Wolf",
        pass: "attacker"
      })
    ).toEqual([]);
  });
  it("a judged row fires only when the fact is true — Bloodied Fury on the bearer's HP, Blood Frenzy on the target's", () => {
    const fury = { features: ["Bloodied Fury"] };
    expect(
      r.effectSources({
        attacker: { ...fury, bloodied: false },
        enabled: all(),
        table: T(),
        scope: {}
      })
    ).toEqual([]);
    expect(
      r.effectSources({
        attacker: { ...fury, bloodied: true },
        enabled: all(),
        table: T(),
        scope: {}
      })
    ).toHaveLength(1);
    const frenzy = { features: ["Blood Frenzy"] };
    expect(
      r.effectSources({
        attacker: frenzy,
        target: { damaged: false },
        enabled: all(),
        table: T(),
        scope: {}
      })
    ).toEqual([]);
    expect(
      r.effectSources({
        attacker: frenzy,
        target: { damaged: true },
        enabled: all(),
        table: T(),
        scope: {}
      })
    ).toHaveLength(1);
  });
  it("the passes: attacker-side rows judged on the TARGET belong to the target pass, the rest to the attacker's; target rows never in the attacker pass", () => {
    const me = { effects: [{ id: "a", name: "Innate Sorcery" }], features: ["Blood Frenzy"] };
    const them = { effects: [{ id: "b", name: "Blurred" }], damaged: true };
    const scope = { classification: "spell", type: "ranged" };
    expect(
      r
        .effectSources({
          attacker: me,
          target: them,
          enabled: all(),
          table: T(),
          scope,
          pass: "attacker"
        })
        .map(s => s.label)
    ).toEqual(["You — Innate Sorcery"]);
    expect(
      r
        .effectSources({
          attacker: me,
          target: them,
          enabled: all(),
          table: T(),
          scope,
          pass: "target"
        })
        .map(s => s.label)
        .sort()
    ).toEqual(["You — Blood Frenzy", "the target is — Blurred"]);
  });
  it("a spend row carries the effect's id and the spend, so the roll can use it up", () => {
    const out = r.effectSources({
      target: { effects: [{ id: "gb", name: "Guiding Bolt" }] },
      enabled: all(),
      table: T(),
      scope: {},
      targetName: "Hobgoblin"
    });
    expect(out[0]).toMatchObject({ bend: "advantage", spend: "attack", effectId: "gb" });
  });
  it("the table is data with one shape: every row names a side, a scope, a rule and where it is from; feature rows never share a name with an effect", () => {
    for (const [key, row] of Object.entries(T())) {
      // A row bends an attack side, or a check, or a save (the `saves` facet, 2026-09-05), or adds a flat `plus` (B3).
      // …or cancels Advantage against the bearer (C1, Trance of Order: `cancel`).
      expect(
        row.attacker || row.target || row.checks || row.saves || row.plus || row.cancel,
        key
      ).toBeTruthy();
      expect(["any", "spell", "weapon", "melee", "ranged"], key).toContain(row.scope);
      // A row whose content the packs do not carry points at nothing.
      if (row.rule === null) expect(key).toBe("Cursed (Path to the Grave)");
      else expectPointer(row.rule, key);
      expect(row.from, key).toBeTruthy();
      if (row.counted === false) expect(row.caveat, key).toMatch(/^listed — /);
      if (row.caveat && row.counted !== false) expect(row.caveat, key).toMatch(/^counted — /);
    }
    expect(reg.EFFECT_KEYS).toContain("Innate Sorcery");
  });
});

describe("autoCritSources — the 5-foot Critical Hit on Paralyzed and Unconscious (user, 2026-09-02)", () => {
  it("a hit within 5 feet of a Paralyzed target is a Critical Hit, pointing at the glossary entry", () => {
    const out = r.autoCritSources({
      targetStatuses: ["paralyzed"],
      distanceFeet: 5,
      targetName: "Hobgoblin",
      table: reg.CONDITION_BENDS
    });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("paralyzed");
    expect(out[0].label).toBe("Hobgoblin is Paralyzed — within 5 feet, a hit is a Critical Hit");
    expect(out[0].rule).toBe(reg.CONDITION_BENDS.paralyzed.rule);
    expect(out[0].rule).toEqual({
      page: "condition",
      key: "paralyzed",
      benefit: "Automatic Critical Hits"
    });
  });
  it("Unconscious too, both when both; nothing from 10 feet, nothing at an unknown distance, nothing for Stunned", () => {
    expect(
      r.autoCritSources({
        targetStatuses: ["unconscious"],
        distanceFeet: 4.9,
        table: reg.CONDITION_BENDS
      })
    ).toHaveLength(1);
    expect(
      r.autoCritSources({
        targetStatuses: ["paralyzed", "unconscious"],
        distanceFeet: 0,
        table: reg.CONDITION_BENDS
      })
    ).toHaveLength(2);
    expect(
      r.autoCritSources({
        targetStatuses: ["paralyzed"],
        distanceFeet: 10,
        table: reg.CONDITION_BENDS
      })
    ).toEqual([]);
    expect(
      r.autoCritSources({
        targetStatuses: ["paralyzed"],
        distanceFeet: null,
        table: reg.CONDITION_BENDS
      })
    ).toEqual([]);
    expect(
      r.autoCritSources({
        targetStatuses: ["stunned", "prone"],
        distanceFeet: 5,
        table: reg.CONDITION_BENDS
      })
    ).toEqual([]);
  });
  it("is data on the table: exactly Paralyzed and Unconscious carry critWithinFeet, and it is 5", () => {
    const rows = Object.entries(reg.CONDITION_BENDS)
      .filter(([, row]) => row.critWithinFeet)
      .map(([k, row]) => [k, row.critWithinFeet]);
    expect(rows).toEqual([
      ["paralyzed", 5],
      ["unconscious", 5]
    ]);
  });
});

describe("reminderRecord — what the card remembers", () => {
  it("keeps the sources' facts, the net, the press, and whether they agreed", () => {
    const rec = r.reminderRecord({
      sources: [adv("You Vexed Hobgoblin"), dis("Gruk is Sapped")],
      net: "normal",
      mode: "normal",
      answeredAt: 1234
    });
    expect(rec).toEqual({
      sources: [
        { kind: "vex", bend: "advantage", label: "You Vexed Hobgoblin" },
        { kind: "sap", bend: "disadvantage", label: "Gruk is Sapped" }
      ],
      net: "normal",
      mode: "normal",
      honoured: true,
      answeredAt: 1234
    });
  });
  it("a press against the net is not honoured, and an unjudged bend is null", () => {
    const rec = r.reminderRecord({
      sources: [adv(), unk()],
      net: "advantage",
      mode: "normal",
      answeredAt: 1
    });
    expect(rec.honoured).toBe(false);
    expect(rec.sources[1].bend).toBeNull();
  });
});

describe("saveSources + saveGate — the save gate's table (option E, 2026-09-02)", () => {
  const all = () => Object.keys(reg.SAVE_BENDS);
  it("Restrained is Disadvantage on Dexterity saves, and nothing on the others", () => {
    const dex = r.saveSources({
      statuses: ["restrained"],
      ability: "dex",
      enabled: all(),
      table: reg.SAVE_BENDS,
      name: "Gob"
    });
    expect(dex).toHaveLength(1);
    expect(dex[0].bend).toBe("disadvantage");
    expect(dex[0].status).toBe("restrained");
    expect(dex[0].label).toBe("Gob — Restrained");
    expect(
      r.saveSources({
        statuses: ["restrained"],
        ability: "con",
        enabled: all(),
        table: reg.SAVE_BENDS
      })
    ).toHaveLength(0);
  });
  it("Dodging is Advantage on Dexterity saves, counted, the caveat left to the rule", () => {
    const [s] = r.saveSources({
      statuses: ["dodging"],
      ability: "dex",
      enabled: all(),
      table: reg.SAVE_BENDS
    });
    expect(s.bend).toBe("advantage");
    expect(s.label).not.toMatch(/press Normal/);
  });
  it("Paralyzed, Stunned, Unconscious and Petrified cannot succeed on Strength or Dexterity — listed, not counted, marked", () => {
    for (const status of ["paralyzed", "stunned", "unconscious", "petrified"]) {
      for (const ability of ["str", "dex"]) {
        const [s] = r.saveSources({
          statuses: [status],
          ability,
          enabled: all(),
          table: reg.SAVE_BENDS
        });
        expect(s.bend, `${status}/${ability}`).toBeNull();
        expect(s.autoFail).toBe(true);
        expect(s.label).toMatch(/cannot succeed/);
      }
      expect(
        r.saveSources({ statuses: [status], ability: "con", enabled: all(), table: reg.SAVE_BENDS })
      ).toHaveLength(0);
    }
  });
  it("the Condition Sources list is the switch — a row off the list is not read", () => {
    expect(
      r.saveSources({
        statuses: ["paralyzed"],
        ability: "dex",
        enabled: ["restrained"],
        table: reg.SAVE_BENDS
      })
    ).toHaveLength(0);
  });
  it("the gate nets as the attack gate nets, and 'fails' outranks every bend", () => {
    const dodge = r.saveSources({
      statuses: ["dodging", "restrained"],
      ability: "dex",
      enabled: all(),
      table: reg.SAVE_BENDS
    });
    expect(r.saveGate(dodge).net).toBe("normal");
    const para = r.saveSources({
      statuses: ["paralyzed", "dodging"],
      ability: "dex",
      enabled: all(),
      table: reg.SAVE_BENDS
    });
    const gate = r.saveGate(para);
    expect(gate.autoFail).toBe(true);
    expect(gate.net).toBe("fails");
    expect(gate.view.head.net).toBe("fails");
    expect(gate.view.head.why).toMatch(/cannot succeed/);
    expect(r.saveGate([]).net).toBe("normal");
  });
  it("modeTitle names the fourth answer", () => {
    expect(r.modeTitle("fails")).toBe("Fails");
  });
});

describe('effectSources — `only: "source"` (Feinting Attack, 2026-09-05): the bend is the source\'s alone', () => {
  const facts = () => ({
    enabled: ["Feinting Attack"],
    table: reg.EFFECT_BENDS,
    attackerName: "Bramm",
    targetName: "the goblin"
  });
  it("the feinting fighter attacking the marked target gets Advantage; anyone else attacking it gets nothing", () => {
    const marked = {
      uuid: "Actor.gob",
      effects: [{ id: "f1", name: "Feinting Attack", sourceUuid: "Actor.bramm" }]
    };
    const mine = r.effectSources({
      ...facts(),
      attacker: { uuid: "Actor.bramm" },
      target: marked,
      pass: "target"
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ bend: "advantage", effectId: "f1", spend: "attack" });
    expect(mine[0].label).toMatch(/the goblin is — Feinting Attack/);
    const theirs = r.effectSources({
      ...facts(),
      attacker: { uuid: "Actor.ranger" },
      target: marked,
      pass: "target"
    });
    expect(theirs).toHaveLength(0);
    // A marker with no recorded source is nobody's — never a guessed Advantage.
    const unsourced = { uuid: "Actor.gob", effects: [{ id: "f2", name: "Feinting Attack" }] };
    expect(
      r.effectSources({
        ...facts(),
        attacker: { uuid: "Actor.bramm" },
        target: unsourced,
        pass: "target"
      })
    ).toHaveLength(0);
  });
  it("a row that admits only its source hinges on the target: the attacker pass leaves it alone", () => {
    const marked = {
      uuid: "Actor.gob",
      effects: [{ id: "f1", name: "Feinting Attack", sourceUuid: "Actor.bramm" }]
    };
    expect(
      r.effectSources({
        ...facts(),
        attacker: { uuid: "Actor.bramm" },
        target: marked,
        pass: "attacker"
      })
    ).toHaveLength(0);
  });
});

describe('effectSources — the marker sits on the OTHER creature (2026-09-21: "vow of enmity is not giving dorian advantage reminder when he swings")', () => {
  // The 2024 packs put every one of these effects on the creature the feature is used ON, with
  // the user as its source — the paladin's sheet never carries a Vow. Read where the pack puts
  // it, judged by the source facet, on the target pass.
  const T = () => reg.EFFECT_BENDS;
  it("Vow of Enmity: the sworn creature wears the marker; the paladin swinging at it gets Advantage, nobody else does, and the paladin gets nothing elsewhere", () => {
    const sworn = {
      uuid: "Scene.s.Token.t.Actor.dummy",
      effects: [{ id: "v1", name: "Vow of Enmity", sourceUuid: "Actor.dorian" }]
    };
    const facts = {
      enabled: ["Vow of Enmity"],
      table: T(),
      scope: {},
      attackerName: "Dorian",
      targetName: "the dummy"
    };
    const mine = r.effectSources({
      ...facts,
      attacker: { uuid: "Actor.dorian", effects: [] },
      target: sworn,
      pass: "target"
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: "effect", bend: "advantage", effectId: "v1" });
    expect(mine[0].label).toBe("the dummy is — Vow of Enmity");
    expect(mine[0].spend).toBeUndefined();
    // another attacker at the sworn creature: the vow is not theirs
    expect(
      r.effectSources({
        ...facts,
        attacker: { uuid: "Actor.bramm", effects: [] },
        target: sworn,
        pass: "target"
      })
    ).toEqual([]);
    // the paladin at an unsworn creature: nothing — and the attacker pass never fires it
    expect(
      r.effectSources({
        ...facts,
        attacker: { uuid: "Actor.dorian", effects: [] },
        target: { uuid: "Actor.other", effects: [] },
        pass: "target"
      })
    ).toEqual([]);
    expect(
      r.effectSources({
        ...facts,
        attacker: { uuid: "Actor.dorian", effects: [] },
        target: sworn,
        pass: "attacker"
      })
    ).toEqual([]);
    // the old shape — the marker on the paladin's own sheet — is no longer read at all
    expect(
      r.effectSources({
        ...facts,
        attacker: { uuid: "Actor.dorian", effects: [{ id: "v0", name: "Vow of Enmity" }] },
        target: { uuid: "Actor.other", effects: [] },
        pass: "both"
      })
    ).toEqual([]);
  });
  it("Clairvoyant Combatant: both bends are the seer's — the bonded creature's Disadvantage is against the seer alone, the seer's Advantage is at the bonded creature alone", () => {
    const bonded = {
      uuid: "Actor.gob",
      effects: [{ id: "c1", name: "Clairvoyant Combatant", sourceUuid: "Actor.hazel" }]
    };
    const facts = { enabled: ["Clairvoyant Combatant"], table: T(), scope: {}, pass: "target" };
    // the bonded creature attacks the seer: Disadvantage; attacks anyone else: nothing
    const atSeer = r.effectSources({
      ...facts,
      attacker: bonded,
      target: { uuid: "Actor.hazel", effects: [] },
      attackerName: "the goblin",
      targetName: "Hazel"
    });
    expect(atSeer).toHaveLength(1);
    expect(atSeer[0]).toMatchObject({ bend: "disadvantage", effectId: "c1" });
    expect(
      r.effectSources({ ...facts, attacker: bonded, target: { uuid: "Actor.elra", effects: [] } })
    ).toEqual([]);
    // the seer attacks the bonded creature: Advantage; anyone else attacking it: nothing
    const seerAt = r.effectSources({
      ...facts,
      attacker: { uuid: "Actor.hazel", effects: [] },
      target: bonded,
      attackerName: "Hazel",
      targetName: "the goblin"
    });
    expect(seerAt).toHaveLength(1);
    expect(seerAt[0]).toMatchObject({ bend: "advantage", effectId: "c1" });
    expect(
      r.effectSources({ ...facts, attacker: { uuid: "Actor.elra", effects: [] }, target: bonded })
    ).toEqual([]);
  });
  it("Compelled and Taunted: Disadvantage against everyone but the one who caused it — judged, no caveat left on the label", () => {
    for (const name of ["Compelled", "Taunted"]) {
      const me = { uuid: "Actor.gob", effects: [{ id: "x1", name, sourceUuid: "Actor.dorian" }] };
      const facts = {
        attacker: me,
        enabled: [name],
        table: T(),
        scope: {},
        attackerName: "the goblin",
        pass: "target"
      };
      const atOther = r.effectSources({
        ...facts,
        target: { uuid: "Actor.elra", effects: [] },
        targetName: "Elra"
      });
      expect(atOther).toHaveLength(1);
      expect(atOther[0]).toMatchObject({
        bend: "disadvantage",
        effectId: "x1",
        label: `the goblin — ${name}`
      });
      expect(
        r.effectSources({
          ...facts,
          target: { uuid: "Actor.dorian", effects: [] },
          targetName: "Dorian"
        })
      ).toEqual([]);
    }
  });
  it("the rows that stay caveated are the ones whose fact the module cannot read", () => {
    expect(T()["Prey: Attack Advantage"]).toMatchObject({ attacker: "advantage", target: null });
    expect(T()["Prey: Attack Advantage"].caveat).toMatch(/press Normal/);
    expect(T()["Strike Fear: Terrify"]).toMatchObject({
      attacker: null,
      target: "advantage",
      only: "source"
    });
    expect(T()["Strike Fear: Terrify"].caveat).toMatch(/no longer Frightened/);
    for (const name of [
      "Vow of Enmity",
      "Clairvoyant Combatant",
      "Compelled",
      "Taunted",
      "Feinting Attack"
    ]) {
      expect(T()[name].caveat, name).toBeUndefined();
    }
  });
});

describe("effectCheckSources — an effect that bends ability checks by its text (Heat Metal, 2026-09-04)", () => {
  it("Heated Metal on the roller's sheet is Disadvantage on a check; off the list, or absent, nothing", () => {
    const facts = { table: reg.EFFECT_BENDS, name: "Elra" };
    const on = r.effectCheckSources({
      ...facts,
      effects: [{ id: "h1", name: "heated metal" }],
      enabled: ["Heated Metal"]
    });
    expect(on).toHaveLength(1);
    expect(on[0]).toMatchObject({
      kind: "effect",
      bend: "disadvantage",
      label: "Elra — Heated Metal",
      effectId: "h1"
    });
    expect(on[0].detail).toBe(reg.EFFECT_BENDS["Heated Metal"].rule);
    expect(on[0].detail).toMatchObject({ item: "Heat Metal" });
    expect(
      r.effectCheckSources({ ...facts, effects: [{ id: "h1", name: "Heated Metal" }], enabled: [] })
    ).toHaveLength(0);
    expect(
      r.effectCheckSources({
        ...facts,
        effects: [{ id: "g1", name: "Goaded" }],
        enabled: reg.EFFECT_KEYS
      })
    ).toHaveLength(0);
  });
  it("only rows with a `checks` facet bend a check — an attack-only row (Innate Sorcery) does not", () => {
    const out = r.effectCheckSources({
      table: reg.EFFECT_BENDS,
      effects: [{ id: "e", name: "Innate Sorcery" }],
      enabled: reg.EFFECT_KEYS
    });
    expect(out).toHaveLength(0);
    const facets = Object.entries(reg.EFFECT_BENDS)
      .filter(([, row]) => row.checks)
      .map(([k]) => k);
    expect(facets).toEqual([
      "Heated Metal",
      "Averse",
      "Assisted",
      "Powerful Build",
      "Team Tactics"
    ]); // Team Tactics: Heroes of Faerûn; Assisted: the Help action
  });
  it("Assisted (the Help action): Advantage on the check with the skill or tool the effect lends, spent by it; another check never", () => {
    const facts = { table: reg.EFFECT_BENDS, name: "Tycon", enabled: reg.EFFECT_KEYS };
    const lent = { id: "a1", name: "Assisted — Stealth", lends: "skill:ste" };
    const on = r.effectCheckSources({ ...facts, effects: [lent], skill: "ste" });
    expect(on).toHaveLength(1);
    expect(on[0]).toMatchObject({
      kind: "effect",
      bend: "advantage",
      label: "Tycon — Assisted — Stealth",
      effectId: "a1",
      spend: "check"
    });
    expect(on[0].detail).toEqual({ page: "rule", key: "help", benefit: "Assist an Ability Check" });
    expect(r.effectCheckSources({ ...facts, effects: [lent], skill: "prc" })).toHaveLength(0);
    expect(r.effectCheckSources({ ...facts, effects: [lent], skill: null })).toHaveLength(0);
    const tool = {
      id: "a2",
      name: "Assisted — Thieves' Tools",
      lends: "tool:thief"
    };
    expect(r.effectCheckSources({ ...facts, effects: [tool], tool: "thief" })).toHaveLength(1);
    expect(r.effectCheckSources({ ...facts, effects: [tool], skill: "ste" })).toHaveLength(0);
    // an Assisted with nothing lent (a hand-made effect) answers no check
    expect(
      r.effectCheckSources({ ...facts, effects: [{ id: "a3", name: "Assisted" }], skill: "ste" })
    ).toHaveLength(0);
  });
  it("Powerful Build (the Goliath walk, 2026-09-25): Advantage on Athletics or Acrobatics while Grappled, and nowhere else", () => {
    const facts = {
      table: reg.EFFECT_BENDS,
      features: ["Powerful Build"],
      enabled: ["Powerful Build"],
      name: "Goliath"
    };
    const grappledAth = r.effectCheckSources({ ...facts, statuses: ["grappled"], skill: "ath" });
    expect(grappledAth).toHaveLength(1);
    expect(grappledAth[0]).toMatchObject({
      kind: "effect",
      bend: "advantage",
      label: "Goliath — Powerful Build"
    });
    expect(r.effectCheckSources({ ...facts, statuses: ["grappled"], skill: "acr" })).toHaveLength(
      1
    );
    expect(r.effectCheckSources({ ...facts, statuses: ["grappled"], skill: "prc" })).toHaveLength(
      0
    );
    expect(r.effectCheckSources({ ...facts, statuses: ["grappled"], skill: null })).toHaveLength(0);
    expect(r.effectCheckSources({ ...facts, statuses: [], skill: "ath" })).toHaveLength(0);
    expect(
      r.effectCheckSources({ ...facts, features: [], statuses: ["grappled"], skill: "ath" })
    ).toHaveLength(0);
  });
});

describe("effectSources — the combat clock as a judge (Assassinate, 2026-09-02)", () => {
  it("fires on the target pass when the target has not acted in round one, and never otherwise", () => {
    const facts = {
      enabled: ["Assassinate"],
      table: reg.EFFECT_BENDS,
      attacker: { features: ["Assassinate"] },
      attackerName: "Vessa",
      targetName: "the captain"
    };
    const fired = r.effectSources({ ...facts, target: { notActed: true }, pass: "target" });
    expect(fired).toHaveLength(1);
    expect(fired[0].bend).toBe("advantage");
    expect(fired[0].label).toMatch(/Assassinate/);
    expect(r.effectSources({ ...facts, target: { notActed: false }, pass: "target" })).toHaveLength(
      0
    );
    // The row hinges on the TARGET, so the attacker pass leaves it alone — no double count.
    expect(
      r.effectSources({ ...facts, target: { notActed: true }, pass: "attacker" })
    ).toHaveLength(0);
  });
});

describe("checkSources + checkGate — the check gate's table (user go 2026-09-03)", () => {
  const all = () => Object.keys(reg.CHECK_BENDS);
  it("Poisoned is Disadvantage on a check, the label the fact alone, the rule the book's", () => {
    const out = r.checkSources({
      statuses: ["poisoned"],
      enabled: all(),
      table: reg.CHECK_BENDS,
      name: "Gob"
    });
    expect(out).toHaveLength(1);
    expect(out[0].bend).toBe("disadvantage");
    expect(out[0].status).toBe("poisoned");
    expect(out[0].label).toBe("Gob — Poisoned");
    expect(out[0].detail).toBe(reg.CHECK_BENDS.poisoned.rule);
    expect(out[0].detail).toMatchObject({ page: "condition", key: "poisoned" });
    expect(out[0].label).not.toMatch(/press Normal/);
  });
  it("Frightened is Disadvantage too; the line-of-sight caveat lives in the book's rule, not the label", () => {
    const [s] = r.checkSources({
      statuses: ["frightened"],
      enabled: all(),
      table: reg.CHECK_BENDS
    });
    expect(s.bend).toBe("disadvantage");
    expect(s.label).toBe("You — Frightened");
    expect(s.detail).toBe(reg.CHECK_BENDS.frightened.rule);
    expect(s.detail).toMatchObject({ page: "condition", key: "frightened" });
  });
  it("a status with no check clause is not a source — Restrained and Prone bend no check", () => {
    expect(
      r.checkSources({
        statuses: ["restrained", "prone", "blinded"],
        enabled: all(),
        table: reg.CHECK_BENDS
      })
    ).toHaveLength(0);
  });
  it("the Condition Sources list is the switch — a row off the list is not read", () => {
    expect(
      r.checkSources({ statuses: ["poisoned"], enabled: ["frightened"], table: reg.CHECK_BENDS })
    ).toHaveLength(0);
  });
  it("the gate nets as the attack gate nets, and never 'fails'", () => {
    const both = r.checkSources({
      statuses: ["poisoned", "frightened"],
      enabled: all(),
      table: reg.CHECK_BENDS
    });
    const gate = r.checkGate(both);
    expect(gate.net).toBe("disadvantage");
    expect(gate.autoFail).toBeUndefined();
    expect(gate.view.head.title).toBe("2 Modifiers — Net");
    expect(r.checkGate([]).net).toBe("normal");
  });
});

describe('effectSources — `except: "source"`: the bend stands against everyone but the one who caused it (2026-09-04)', () => {
  const T = () => reg.EFFECT_BENDS;
  it("Goaded: Disadvantage against anyone but the goader — judged on the target pass, per target", () => {
    const me = {
      uuid: "Actor.elra",
      effects: [{ id: "g1", name: "Goaded", sourceUuid: "Actor.bramm" }]
    };
    const facts = {
      attacker: me,
      enabled: ["Goaded"],
      table: T(),
      scope: {},
      attackerName: "Elra"
    };
    // The attacker pass leaves it alone: the row hinges on WHICH target.
    expect(r.effectSources({ ...facts, pass: "attacker" })).toEqual([]);
    const dummy = r.effectSources({
      ...facts,
      target: { uuid: "Actor.dummy" },
      targetName: "the dummy",
      pass: "target"
    });
    expect(dummy).toHaveLength(1);
    expect(dummy[0]).toMatchObject({ bend: "disadvantage", effectId: "g1" });
    expect(
      r.effectSources({
        ...facts,
        target: { uuid: "Actor.bramm" },
        targetName: "Bramm",
        pass: "target"
      })
    ).toEqual([]);
  });
  it("Distracted: Advantage for any attacker but the distracter", () => {
    const target = {
      uuid: "Actor.elra",
      effects: [{ id: "d1", name: "Distracted", sourceUuid: "Actor.bramm" }]
    };
    const facts = {
      target,
      enabled: ["Distracted"],
      table: T(),
      scope: {},
      targetName: "Elra",
      pass: "target"
    };
    expect(
      r.effectSources({ ...facts, attacker: { uuid: "Actor.thomas" }, attackerName: "Tavin" })
    ).toHaveLength(1);
    expect(
      r.effectSources({ ...facts, attacker: { uuid: "Actor.bramm" }, attackerName: "Bramm" })
    ).toEqual([]);
  });
  it("an effect with no known source is counted — the gate never guesses an exemption", () => {
    const me = { uuid: "Actor.elra", effects: [{ id: "g1", name: "Goaded" }] };
    expect(
      r.effectSources({
        attacker: me,
        enabled: ["Goaded"],
        table: T(),
        scope: {},
        target: { uuid: "Actor.bramm" },
        pass: "target"
      })
    ).toHaveLength(1);
  });
});

describe('modeSources — the platform\'s own roll mode, read off the effect CHANGES (user, 2026-09-04: "see the calculus for why there is advantage")', () => {
  const amulet = {
    id: "e1",
    name: "The Amulet",
    item: "The Amulet",
    changes: [{ key: "system.abilities.wis.save.roll.mode", value: "1" }]
  };
  const robe = {
    id: "e2",
    name: "Bonus AC/Saves: +1",
    item: "Robe of Protection",
    changes: [
      { key: "system.attributes.ac.bonus", value: "1" },
      { key: "system.bonuses.abilities.save", value: "1" }
    ]
  };
  it("Harrow Vane's Wisdom save: The Amulet is one Advantage box, the Robe (a bonus, not a mode) none", () => {
    const out = r.modeSources({
      effects: [amulet, robe],
      roll: { kind: "save", ability: "wis" },
      rollLabel: "Wisdom saving throws",
      name: "Harrow Vane"
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("effect");
    expect(out[0].bend).toBe("advantage");
    expect(out[0].label).toBe("Harrow Vane — The Amulet");
    expect(out[0].detail).toBe(
      "An effect on the sheet sets Wisdom saving throws to roll with Advantage."
    );
    expect(out[0].effectId).toBe("e1");
  });
  it("the same effect says nothing on a Dexterity save — the key names the ability", () => {
    expect(
      r.modeSources({ effects: [amulet], roll: { kind: "save", ability: "dex" } })
    ).toHaveLength(0);
  });
  it("−1 is Disadvantage; an effect whose name differs from its item names both", () => {
    const [s] = r.modeSources({
      effects: [
        {
          name: "Cursed",
          item: "Ring of Woe",
          changes: [{ key: "system.abilities.con.save.roll.mode", value: -1 }]
        }
      ],
      roll: { kind: "save", ability: "con" },
      rollLabel: "Constitution saving throws"
    });
    expect(s.bend).toBe("disadvantage");
    expect(s.label).toBe("You — Ring of Woe (Cursed)");
    expect(s.detail).toMatch(/Disadvantage\.$/);
  });
  it("an effect with no item (a bare actor effect) is named by itself; a zero or non-numeric value is nothing", () => {
    const out = r.modeSources({
      effects: [
        {
          name: "Blessed Focus",
          changes: [{ key: "system.abilities.wis.save.roll.mode", value: "1" }]
        },
        { name: "Nothing", changes: [{ key: "system.abilities.wis.save.roll.mode", value: "0" }] },
        { name: "Garbage", changes: [{ key: "system.abilities.wis.save.roll.mode", value: "adv" }] }
      ],
      roll: { kind: "save", ability: "wis" }
    });
    expect(out.map(s => s.label)).toEqual(["You — Blessed Focus"]);
  });
  it("nets with the status sources as the attack gate nets: The Amulet against a Disadvantage row is Normal", () => {
    const status = r.reminderSource("condition", "disadvantage", "Harrow Vane — Restrained");
    const [mode] = r.modeSources({ effects: [amulet], roll: { kind: "save", ability: "wis" } });
    expect(r.saveGate([status, mode]).net).toBe("normal");
    expect(r.saveGate([mode]).net).toBe("advantage");
    expect(r.saveGate([mode]).view.head.title).toBe("1 Modifier — Net");
  });
  it("the check keys: the ability's check, the skill, the tool — and a save key is not a check key", () => {
    expect(r.modeKeys({ kind: "check", ability: "dex", skill: "ste" })).toEqual([
      "system.abilities.dex.check.roll.mode",
      "system.skills.ste.roll.mode"
    ]);
    expect(r.modeKeys({ kind: "check", tool: "thief" })).toEqual(["system.tools.thief.roll.mode"]);
    expect(r.modeKeys({ kind: "save" })).toEqual([]);
    expect(r.modeKeys({ kind: "initiative", ability: "dex" })).toEqual([]);
    // A save to keep Concentration also reads its own field — War Caster's Advantage (2026-09-27,
    // the PHB feats group 4: Mage Slayer's Disadvantage nets against it).
    expect(r.modeKeys({ kind: "save", ability: "con", concentration: true })).toEqual([
      "system.abilities.con.save.roll.mode",
      "system.attributes.concentration.roll.mode"
    ]);
    expect(r.modeKeys({ kind: "save", ability: "con" })).toEqual([
      "system.abilities.con.save.roll.mode"
    ]);
    const [wc] = r.modeSources({
      effects: [
        {
          name: "War Caster",
          item: "War Caster",
          changes: [{ key: "system.attributes.concentration.roll.mode", value: "1" }]
        }
      ],
      roll: { kind: "save", ability: "con", concentration: true },
      rollLabel: "saving throws to maintain Concentration"
    });
    expect(wc).toMatchObject({ bend: "advantage", label: "You — War Caster" });
    expect(
      r.modeSources({
        effects: [
          {
            name: "War Caster",
            item: "War Caster",
            changes: [{ key: "system.attributes.concentration.roll.mode", value: "1" }]
          }
        ],
        roll: { kind: "save", ability: "con" }
      })
    ).toEqual([]);
    const [s] = r.modeSources({
      effects: [
        {
          name: "Heavy Armor",
          item: "Plate Armor",
          changes: [{ key: "system.skills.ste.roll.mode", value: "-1" }]
        }
      ],
      roll: { kind: "check", ability: "dex", skill: "ste" },
      rollLabel: "Stealth checks"
    });
    expect(s.bend).toBe("disadvantage");
    expect(s.label).toBe("You — Plate Armor (Heavy Armor)");
  });
});

describe('effectSaveSources — `spells: "cast"` (the DMG: the Mantle and the Ring against a spell CAST alone)', () => {
  const facts = () => ({
    enabled: ["Mantle of Spell Resistance", "Magic Resistance"],
    table: reg.EFFECT_BENDS,
    features: ["Mantle of Spell Resistance", "Magic Resistance"],
    name: "Aster"
  });
  it("a spell cast: both list Advantage; the Mantle says 'against a spell'", () => {
    const out = r.effectSaveSources({
      ...facts(),
      demand: { spell: true, cast: true, statuses: [] }
    });
    expect(out.map(s => s.label).sort()).toEqual([
      "Aster — Magic Resistance — against a spell",
      "Aster — Mantle of Spell Resistance — against a spell"
    ]);
  });
  it("a magic item's effect (a Wand, a Necklace of Fireballs): Magic Resistance alone — the Mantle wants a spell", () => {
    const out = r.effectSaveSources({
      ...facts(),
      demand: { spell: true, cast: false, statuses: [] }
    });
    expect(out.map(s => s.label)).toEqual(["Aster — Magic Resistance — against a spell"]);
  });
  it("the registry: the Mantle and the Ring are `cast`; the Robe, the Scarab and Magic Resistance stay `true`", () => {
    expect(reg.EFFECT_BENDS["Mantle of Spell Resistance"].saves.spells).toBe("cast");
    expect(reg.EFFECT_BENDS["Ring of Spell Turning"].saves.spells).toBe("cast");
    for (const k of ["Robe of the Archmagi", "Scarab of Protection", "Magic Resistance"])
      expect(reg.EFFECT_BENDS[k].saves.spells).toBe(true);
  });
});

describe("effectSaveSources — the `saves` facet (user, 2026-09-05: Aura of Purity, Circle of Power)", () => {
  const facts = () => ({
    enabled: ["Aura of Purity", "Circle's Power"],
    table: reg.EFFECT_BENDS,
    name: "Aster"
  });
  const purity = { id: "p1", name: "Aura of Purity" };
  const circle = { id: "c1", name: "Circle's Power" };

  it("Aura of Purity counts Advantage against a demand whose failed effect imposes one of its seven conditions, and names it", () => {
    const out = r.effectSaveSources({
      ...facts(),
      effects: [purity],
      demand: { spell: true, statuses: ["paralyzed"] }
    });
    expect(out).toHaveLength(1);
    expect(out[0].bend).toBe("advantage");
    expect(out[0].label).toBe("Aster — Aura of Purity — against Paralyzed");
    expect(out[0].effectId).toBe("p1");
  });

  it("…and says nothing against a demand that imposes none of them (a Fireball)", () => {
    expect(
      r.effectSaveSources({ ...facts(), effects: [purity], demand: { spell: true, statuses: [] } })
    ).toEqual([]);
  });

  it("Circle's Power counts Advantage against any spell's demand and nothing against a monster's breath", () => {
    const spell = r.effectSaveSources({
      ...facts(),
      effects: [circle],
      demand: { spell: true, statuses: [] }
    });
    expect(spell.map(s => [s.bend, s.label])).toEqual([
      ["advantage", "Aster — Circle's Power — against a spell"]
    ]);
    expect(
      r.effectSaveSources({
        ...facts(),
        effects: [circle],
        demand: { spell: false, statuses: ["poisoned"] }
      })
    ).toEqual([]);
  });

  it("an UNKNOWN demand (a bare sheet roll) lists the effect uncounted, with its scope and the button to press", () => {
    const out = r.effectSaveSources({ ...facts(), effects: [purity, circle], demand: null });
    expect(out.map(s => s.bend)).toEqual([null, null]);
    expect(out[0].label).toMatch(
      /^Aster — Aura of Purity \(listed — a save against Blinded, Charmed/
    );
    expect(out[0].label).toMatch(/press Advantage if this is one\)$/);
    expect(out[1].label).toMatch(/a save against a spell or other magical effect/);
  });

  it("the list is the switch, and an effect not on the sheet is nothing", () => {
    expect(
      r.effectSaveSources({
        ...facts(),
        enabled: [],
        effects: [purity],
        demand: { spell: true, statuses: ["charmed"] }
      })
    ).toEqual([]);
    expect(
      r.effectSaveSources({
        ...facts(),
        effects: [],
        demand: { spell: true, statuses: ["charmed"] }
      })
    ).toEqual([]);
  });

  it("saveNoneOnSuccess names Circle's Power against a spell, and nothing otherwise", () => {
    expect(r.saveNoneOnSuccess({ ...facts(), effects: [circle], demand: { spell: true } })).toBe(
      "Circle's Power"
    );
    expect(
      r.saveNoneOnSuccess({ ...facts(), effects: [circle], demand: { spell: false } })
    ).toBeNull();
    expect(
      r.saveNoneOnSuccess({ ...facts(), effects: [purity], demand: { spell: true } })
    ).toBeNull();
  });
});

describe("effectSaveSources — FEATURE rows (Slice A, 2026-09-24: Brave, Fey Ancestry, Dwarven Resilience)", () => {
  const facts = () => ({
    enabled: ["Brave", "Fey Ancestry", "Dwarven Resilience"],
    table: reg.EFFECT_BENDS,
    name: "Pip"
  });

  it("Brave counts Advantage against a demand that would frighten, with no effect on the sheet", () => {
    const out = r.effectSaveSources({
      ...facts(),
      effects: [],
      features: ["Brave", "Lucky"],
      demand: { spell: true, statuses: ["frightened"] }
    });
    expect(out.map(s => [s.bend, s.label])).toEqual([
      ["advantage", "Pip — Brave — against Frightened"]
    ]);
    expect(out[0].effectId).toBeUndefined();
  });

  it("…and a bare sheet roll (a save to END the condition has no demand) lists it uncounted", () => {
    const out = r.effectSaveSources({ ...facts(), features: ["Brave"], demand: null });
    expect(out.map(s => s.bend)).toEqual([null]);
    expect(out[0].label).toBe(
      "Pip — Brave (listed — a save against Frightened; press Advantage if this is one)"
    );
  });

  it("each trait answers its own condition only: Fey Ancestry charmed, Dwarven Resilience poisoned", () => {
    const features = ["Fey Ancestry", "Dwarven Resilience"];
    const charm = r.effectSaveSources({
      ...facts(),
      features,
      demand: { spell: true, statuses: ["charmed"] }
    });
    expect(charm.map(s => s.label)).toEqual(["Pip — Fey Ancestry — against Charmed"]);
    const poison = r.effectSaveSources({
      ...facts(),
      features,
      demand: { spell: false, statuses: ["poisoned"] }
    });
    expect(poison.map(s => s.label)).toEqual(["Pip — Dwarven Resilience — against Poisoned"]);
    expect(
      r.effectSaveSources({
        ...facts(),
        features,
        demand: { spell: true, statuses: ["frightened"] }
      })
    ).toEqual([]);
  });

  it("nothing without the feature, nothing from an EFFECT of the name, and the list is the switch", () => {
    const demand = { spell: true, statuses: ["frightened"] };
    expect(r.effectSaveSources({ ...facts(), features: [], demand })).toEqual([]);
    expect(
      r.effectSaveSources({
        ...facts(),
        effects: [{ id: "b", name: "Brave" }],
        features: [],
        demand
      })
    ).toEqual([]);
    expect(r.effectSaveSources({ ...facts(), enabled: [], features: ["Brave"], demand })).toEqual(
      []
    );
  });

  it("the rows bend no attack and no check — the other two readers skip them", () => {
    const enabled = facts().enabled;
    expect(
      r.effectSources({
        enabled,
        table: reg.EFFECT_BENDS,
        attacker: { features: ["Brave"] },
        target: { uuid: "t", features: ["Brave"] }
      })
    ).toEqual([]);
    expect(r.effectCheckSources({ enabled, table: reg.EFFECT_BENDS, features: ["Brave"] })).toEqual(
      []
    );
  });

  it("the three are rows of the effect table", () => {
    const names = reg.EFFECT_KEYS;
    for (const n of ["Brave", "Fey Ancestry", "Dwarven Resilience"]) expect(names).toContain(n);
  });
});

describe('effectNamedAs — the emanation\'s suffix (2026-09-05: "Aura of Purity — Tavin" stood on Bramm and no reader saw it)', () => {
  it("matches the bare name, the region's suffixed name, and nothing that merely starts alike", () => {
    expect(r.effectNamedAs("Aura of Purity", "Aura of Purity")).toBe(true);
    expect(r.effectNamedAs("Aura of Purity — Tavin", "aura of purity")).toBe(true);
    expect(r.effectNamedAs("Aura of Purity Lite", "Aura of Purity")).toBe(false);
    expect(r.effectNamedAs("", "Aura of Purity")).toBe(false);
  });
  it("every effect reader honours it: the attack gate (Holy Protection — Tavin), the check gate, the save facet", () => {
    const enabled = ["Holy Protection", "Heated Metal", "Aura of Purity"];
    const attack = r.effectSources({
      enabled,
      table: reg.EFFECT_BENDS,
      attacker: {},
      target: { uuid: "t", effects: [{ id: "h", name: "Holy Protection — Tavin" }] },
      pass: "target"
    });
    expect(attack.map(s => s.bend)).toEqual(["disadvantage"]);
    const check = r.effectCheckSources({
      enabled,
      table: reg.EFFECT_BENDS,
      effects: [{ id: "m", name: "Heated Metal — Elra" }]
    });
    expect(check.map(s => s.bend)).toEqual(["disadvantage"]);
    const save = r.effectSaveSources({
      enabled,
      table: reg.EFFECT_BENDS,
      effects: [{ id: "p", name: "Aura of Purity — Tavin" }],
      demand: { spell: true, statuses: ["paralyzed"] }
    });
    expect(save.map(s => s.bend)).toEqual(["advantage"]);
  });
});

describe("effectCarriesRow — a row's `item` tells two pack effects of one name apart (walk finding, 2026-09-18)", () => {
  const T = () => reg.EFFECT_BENDS;
  it("the Aura of Protection's Protected on an ally never fires Protection from Evil and Good's row", () => {
    const aura = {
      effects: [{ id: "a1", name: "Protected — Dorian", item: "Aura of Protection" }]
    };
    expect(
      r.effectSources({
        target: aura,
        enabled: ["Protected"],
        table: T(),
        scope: {},
        targetName: "Aster"
      })
    ).toEqual([]);
  });
  it("the spell's own Protected fires it, and an effect whose item is unknown still matches by name", () => {
    const spell = {
      effects: [{ id: "s1", name: "Protected", item: "Protection from Evil and Good" }]
    };
    const hand = { effects: [{ id: "h1", name: "Protected" }] };
    for (const who of [spell, hand]) {
      const out = r.effectSources({
        target: who,
        enabled: ["Protected"],
        table: T(),
        scope: {},
        targetName: "Aster"
      });
      expect(out.map(s => [s.bend, s.label])).toEqual([["disadvantage", "Aster is — Protected"]]);
    }
  });
  it("effectCarriesRow itself: name first, then the item only when both sides know it", () => {
    expect(
      r.effectCarriesRow({ name: "Blur", item: "Blur" }, "Protected", {
        item: "Protection from Evil and Good"
      })
    ).toBe(false);
    expect(
      r.effectCarriesRow({ name: "Protected", item: "Aura of Protection" }, "Protected", {
        item: "Protection from Evil and Good"
      })
    ).toBe(false);
    expect(
      r.effectCarriesRow(
        { name: "protected — X", item: "protection from evil and good" },
        "Protected",
        { item: "Protection from Evil and Good" }
      )
    ).toBe(true);
    expect(
      r.effectCarriesRow({ name: "Protected" }, "Protected", {
        item: "Protection from Evil and Good"
      })
    ).toBe(true);
    expect(
      r.effectCarriesRow({ name: "Protected", item: "Aura of Protection" }, "Protected", {})
    ).toBe(true);
  });
});

describe("the range cancellers (the PHB feats, group 2, 2026-09-26)", () => {
  const rules = { long: "L", single: "S", close: "C" };
  const bow = { rangedWeapon: true, spell: false, crossbow: false };
  const xbow = { rangedWeapon: true, spell: false, crossbow: true };
  const bolt = { rangedWeapon: false, spell: true, crossbow: false };

  it("a feat reaches only its own kind of attack", () => {
    const f = n => r.rangeFeatsFor([n], bow, reg.RANGE_FEATS);
    expect(f("Sharpshooter").cancels[0].rows).toEqual(["long", "close"]);
    expect(f("Sharpshooter").cover?.feature).toBe("Sharpshooter");
    expect(f("Spell Sniper")).toEqual({ cancels: [], cover: null, reach: null }); // a bow is no spell
    expect(r.rangeFeatsFor(["Spell Sniper"], bolt, reg.RANGE_FEATS)).toMatchObject({
      cover: { feature: "Spell Sniper" },
      reach: { feet: 60 }
    });
    expect(r.rangeFeatsFor(["Crossbow Expert"], bow, reg.RANGE_FEATS).cancels).toEqual([]);
    expect(r.rangeFeatsFor(["crossbow expert"], xbow, reg.RANGE_FEATS).cancels[0].rows).toEqual([
      "close"
    ]);
    expect(r.rangeFeatsFor(["Crossbow Expert"], xbow, reg.RANGE_FEATS).cover).toBeNull();
  });

  it("a cancelled row is LISTED with the feat, never counted; beyond long range still cannot be made", () => {
    const cancels = r.rangeFeatsFor(["Sharpshooter"], bow, reg.RANGE_FEATS).cancels;
    const close = r.rangeSources({ ranged: true, closeEnemies: ["Goblin"], cancels, rules });
    expect(close).toHaveLength(1);
    expect(close[0].bend).toBeNull();
    expect(close[0].label).toMatch(/Sharpshooter: no Disadvantage/);
    const long = r.rangeSources({
      ranged: true,
      distanceFeet: 200,
      normalFeet: 150,
      longFeet: 600,
      cancels,
      rules
    });
    expect(long[0]).toMatchObject({ bend: null });
    const beyond = r.rangeSources({
      ranged: true,
      distanceFeet: 700,
      normalFeet: 150,
      longFeet: 600,
      cancels,
      rules
    });
    expect(beyond[0].label).toMatch(/cannot be made/);
    // Crossbow Expert cancels the close row only
    const xc = r.rangeFeatsFor(["Crossbow Expert"], xbow, reg.RANGE_FEATS).cancels;
    const both = r.rangeSources({
      ranged: true,
      distanceFeet: 100,
      normalFeet: 80,
      longFeet: 320,
      closeEnemies: ["Orc"],
      cancels: xc,
      rules
    });
    expect(both.map(s => s.bend)).toEqual([null, "disadvantage"]); // the close row answered, the long row stands
    const far = r.rangeSources({
      ranged: true,
      distanceFeet: 100,
      normalFeet: 80,
      longFeet: 320,
      cancels: xc,
      rules
    });
    expect(far.map(s => s.bend)).toEqual(["disadvantage"]);
  });

  it("the cover a feat ignores is listed; no feat, no box", () => {
    const [s] = r.rangeSources({
      ranged: true,
      targetName: "Goblin",
      coverBonus: 2,
      coverFeat: { feature: "Sharpshooter", rule: "x" },
      rules
    });
    expect(s).toMatchObject({
      bend: null,
      label: "Goblin's cover (+2 AC) — Sharpshooter ignores it"
    });
    expect(r.rangeSources({ ranged: true, coverBonus: 2, rules })).toEqual([]);
  });

  it("Spell Sniper's reach: a spell range of 10 feet or more gains 60; Touch and a two-band range stand", () => {
    expect(
      r.reachedRange({ ranged: true, normalFeet: 120, longFeet: null }, { feet: 60 })
    ).toMatchObject({ normalFeet: 180 });
    expect(
      r.reachedRange({ ranged: true, normalFeet: 5, longFeet: null }, { feet: 60 }).normalFeet
    ).toBe(5);
    expect(
      r.reachedRange({ ranged: true, normalFeet: 80, longFeet: 320 }, { feet: 60 }).normalFeet
    ).toBe(80);
    expect(r.reachedRange({ ranged: true, normalFeet: 120 }, null).normalFeet).toBe(120);
  });

  it("the recorded AC without the cover; Total Cover (null) stays null", () => {
    expect(r.acWithoutCover(17, 2)).toBe(15);
    expect(r.acWithoutCover(20, 5)).toBe(15);
    expect(r.acWithoutCover(null, 5)).toBeNull();
    expect(r.acWithoutCover(14, 0)).toBe(14);
  });
});

describe("buyOff — why a buy box is greyed (Helpful Friend's familiar within 5 ft)", () => {
  const row = { point: "use", near: { companion: "Find Familiar", feet: 5 } };
  it("the pool first: no uses left greys any row", () => {
    expect(r.buyOff({ point: "Luck Point" }, { left: 0 })).toBe("no Luck Points left");
    expect(r.buyOff({ point: "Luck Point" }, { left: 2 })).toBeNull();
    expect(
      r.buyOff(row, { left: 0, companion: { state: "present", sameScene: true, distanceFt: 5 } })
    ).toBe("no uses left");
  });
  it("the companion: in its pocket, on another scene, further than the feet, or unreadable — each its own reason", () => {
    expect(r.buyOff(row, { left: 2, companion: null })).toBe("no familiar standing");
    expect(
      r.buyOff(row, { left: 2, companion: { state: "pocket", sameScene: false, distanceFt: null } })
    ).toBe("your familiar is in its pocket dimension");
    expect(
      r.buyOff(row, {
        left: 2,
        companion: { state: "present", sameScene: false, distanceFt: null }
      })
    ).toBe("your familiar is not on this scene");
    expect(
      r.buyOff(row, { left: 2, companion: { state: "present", sameScene: true, distanceFt: null } })
    ).toBe("your familiar's distance could not be read");
    expect(
      r.buyOff(row, { left: 2, companion: { state: "present", sameScene: true, distanceFt: 10 } })
    ).toBe("your familiar is 10 ft away — within 5 feet only");
  });
  it("within the feet, the box is offered", () => {
    expect(
      r.buyOff(row, { left: 2, companion: { state: "present", sameScene: true, distanceFt: 5 } })
    ).toBeNull();
    expect(
      r.buyOff(row, { left: 2, companion: { state: "present", sameScene: true, distanceFt: 0 } })
    ).toBeNull();
  });
});

describe("immunitySleepSource — Immunity to Exhaustion cannot be put to sleep (the 2024 Sleep's sentence)", () => {
  it("a sleep demand against an Exhaustion-immune sheet is a `succeeds` source pointing at Sleep", () => {
    const out = r.immunitySleepSource({
      name: "Skeleton",
      immunities: ["poisoned", "exhaustion"],
      demand: { sleep: true }
    });
    expect(out).toMatchObject({
      kind: "effect",
      bend: null,
      autoSucceed: true,
      feature: "Immunity to Exhaustion"
    });
    expect(out.label).toBe("Skeleton — Immunity to Exhaustion (cannot be put to sleep)");
    expect(out.detail).toMatchObject({ item: "Sleep" });
    expect(r.saveGate([out]).net).toBe("succeeds");
  });
  it("no sleep in the demand, or no immunity on the sheet: nothing", () => {
    expect(
      r.immunitySleepSource({
        name: "Skeleton",
        immunities: ["exhaustion"],
        demand: { sleep: false }
      })
    ).toBeNull();
    expect(
      r.immunitySleepSource({ name: "Skeleton", immunities: ["poisoned"], demand: { sleep: true } })
    ).toBeNull();
    expect(
      r.immunitySleepSource({ name: "Skeleton", immunities: null, demand: { sleep: true } })
    ).toBeNull();
    expect(r.immunitySleepSource({})).toBeNull();
  });
});
