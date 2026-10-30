import { beforeAll, describe, expect, it } from "vitest";
import { expectPointer } from "./rule-pointer.js";

/**
 * DECISION-layer emanations (ARCHITECTURE.md §2): reach by disposition, range from the content,
 * the source's numbers read into the pack's effect. No Foundry stub on purpose.
 */
/** @type {typeof import("../scripts/decide/emanations.js")} */
let em;
/** @type {typeof import("../scripts/decide/registry.js")} */
let reg;
beforeAll(async () => {
  em = await import("../scripts/decide/emanations.js");
  reg = await import("../scripts/decide/registry.js");
});

const { FRIENDLY, NEUTRAL, HOSTILE, SECRET } = { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1, SECRET: -2 };

describe("reach `all` and the area's own `affects` (the Aasimar walk, 2026-09-25)", () => {
  it("`all` reaches every side — allies included, as Inner Radiance's text says — but never a SECRET token", () => {
    for (const d of [FRIENDLY, NEUTRAL, HOSTILE])
      expect(em.reachAdmits("all", FRIENDLY, d)).toBe(true);
    expect(em.reachAdmits("all", FRIENDLY, SECRET)).toBe(false);
  });
  it('affects `enemy` takes everyone not on the caster\'s side (Necrotic Shroud: "creatures other than your allies")', () => {
    expect(em.affectsAdmits("enemy", FRIENDLY, HOSTILE)).toBe(true);
    expect(em.affectsAdmits("enemy", FRIENDLY, NEUTRAL)).toBe(true);
    expect(em.affectsAdmits("enemy", FRIENDLY, FRIENDLY)).toBe(false);
    expect(em.affectsAdmits("enemy", HOSTILE, HOSTILE)).toBe(false);
  });
  it("affects `ally` takes the caster's side only; any other affects takes everyone", () => {
    expect(em.affectsAdmits("ally", FRIENDLY, FRIENDLY)).toBe(true);
    expect(em.affectsAdmits("ally", FRIENDLY, NEUTRAL)).toBe(false);
    for (const a of ["creature", "", null, "any"])
      expect(em.affectsAdmits(a, FRIENDLY, HOSTILE)).toBe(true);
  });
  it("a `radius` area at range self is an Emanation from its user, its origin left out (Arms of Hadar, unlisted)", () => {
    const hadar = {
      range: { units: "self" },
      target: { template: { type: "radius" }, affects: { type: "creature" } }
    };
    expect(em.selfEmanation(hadar)).toBe(true);
    expect(em.selfEmanation({ ...hadar, range: {} })).toBe(true);
    expect(em.selfEmanation({ ...hadar, target: { template: { type: "emanation" } } })).toBe(true);
    expect(em.selfEmanation({ ...hadar, range: { units: "ft" } })).toBe(false);
    for (const type of ["circle", "sphere", "cone", "line", "cube", undefined])
      expect(em.selfEmanation({ range: { units: "self" }, target: { template: { type } } })).toBe(
        false
      );
    expect(em.selfEmanation(null)).toBe(false);
  });
  it("Inner Radiance is a feature row that stands while its effect does and pulses at the bearer's turn end", () => {
    const row = reg.EMANATIONS["Inner Radiance"];
    expect(row).toMatchObject({
      kind: "feature",
      item: "Celestial Revelation",
      activity: "Inner Radiance",
      while: "Searing Radiance",
      reach: "all",
      effect: null
    });
    expect(row.pulse).toEqual({ on: "sourceTurnEnd", activity: "Inner Radiance" });
  });
});

describe("reachAdmits — the user's defaults (2026-09-03): helpful reaches allies and neutrals, harmful reaches enemies", () => {
  it("a friendly Paladin's aura reaches friendlies and neutrals, never hostiles", () => {
    expect(em.reachAdmits("helpful", FRIENDLY, FRIENDLY)).toBe(true);
    expect(em.reachAdmits("helpful", FRIENDLY, NEUTRAL)).toBe(true);
    expect(em.reachAdmits("helpful", FRIENDLY, HOSTILE)).toBe(false);
  });
  it("a hostile paladin's aura reaches hostiles and neutrals", () => {
    expect(em.reachAdmits("helpful", HOSTILE, HOSTILE)).toBe(true);
    expect(em.reachAdmits("helpful", HOSTILE, NEUTRAL)).toBe(true);
    expect(em.reachAdmits("helpful", HOSTILE, FRIENDLY)).toBe(false);
  });
  it("a friendly cleric's Spirit Guardians reach hostiles only — allies and neutrals are the designated unaffected", () => {
    expect(em.reachAdmits("harmful", FRIENDLY, HOSTILE)).toBe(true);
    expect(em.reachAdmits("harmful", FRIENDLY, FRIENDLY)).toBe(false);
    expect(em.reachAdmits("harmful", FRIENDLY, NEUTRAL)).toBe(false);
  });
  it("a neutral source's harm reaches every side but its own", () => {
    expect(em.reachAdmits("harmful", NEUTRAL, HOSTILE)).toBe(true);
    expect(em.reachAdmits("harmful", NEUTRAL, FRIENDLY)).toBe(true);
    expect(em.reachAdmits("harmful", NEUTRAL, NEUTRAL)).toBe(false);
  });
  it("a secret token is nobody's business, either way", () => {
    expect(em.reachAdmits("helpful", FRIENDLY, SECRET)).toBe(false);
    expect(em.reachAdmits("harmful", SECRET, HOSTILE)).toBe(false);
  });
  it("an unknown reach admits nobody", () => {
    expect(em.reachAdmits("sideways", FRIENDLY, FRIENDLY)).toBe(false);
  });
});

describe("resolveFormula / resolveChanges — the SOURCE's numbers travel with the effect", () => {
  const paladin = { abilities: { cha: { mod: 3 } }, scale: { paladin: { aura: { value: 10 } } } };
  it("reads @abilities.cha.mod off the Paladin, not the receiver (the pack's own note)", () => {
    const { changes, unresolved } = em.resolveChanges(
      [{ key: "system.bonuses.abilities.save", type: "add", value: "@abilities.cha.mod" }],
      paladin
    );
    expect(unresolved).toEqual([]);
    expect(changes[0].value).toBe("3");
    expect(changes[0].key).toBe("system.bonuses.abilities.save");
  });
  it("leaves a change with no formula alone (Warding's resistances, Half Speed's multiplier)", () => {
    const { changes } = em.resolveChanges(
      [
        { key: "system.traits.dr.value", type: "add", value: "necrotic" },
        { key: "system.attributes.movement.speed", type: "multiply", value: "0.5" }
      ],
      paladin
    );
    expect(changes.map(c => c.value)).toEqual(["necrotic", "0.5"]);
  });
  it("reports an unresolved token instead of shipping a silent zero", () => {
    const { changes, unresolved } = em.resolveChanges(
      [{ key: "x", type: "add", value: "@abilities.wis.mod" }],
      paladin
    );
    expect(unresolved).toEqual(["abilities.wis.mod"]);
    expect(changes[0].value).toBe("@abilities.wis.mod");
  });
  it("folds plain arithmetic and nothing else", () => {
    expect(em.foldArithmetic("2 + 1")).toBe("3");
    expect(em.foldArithmetic("-1")).toBe("-1");
    expect(em.foldArithmetic("3 * (2 - 1)")).toBe("3");
    expect(em.foldArithmetic("1d8 + 2")).toBe("1d8 + 2");
    expect(em.foldArithmetic("necrotic")).toBe("necrotic");
  });
  it("a scale value arrives as an object and reads as its number", () => {
    expect(em.lookupRollData(paladin, "scale.paladin.aura")).toBe(10);
    expect(em.lookupRollData(paladin, "scale.paladin.nothing")).toBe(null);
    expect(em.lookupRollData({}, "a.b.c")).toBe(null);
  });
});

describe("emanationRange — the content's data first, the class's scale value second, nothing invented", () => {
  it("takes the activity's own size when the pack gives one (Spirit Guardians: 15)", () => {
    expect(em.emanationRange({ range: "@scale.paladin.aura" }, {}, 15)).toBe(15);
    expect(em.emanationRange({ range: 10 }, {}, "15")).toBe(15);
  });
  it("reads the Paladin's aura scale value — 10 at 6th, 30 at 18th — and NOTHING below 6th", () => {
    const row = { range: "@scale.paladin.aura" };
    expect(em.emanationRange(row, { scale: { paladin: { aura: { value: 10 } } } })).toBe(10);
    expect(em.emanationRange(row, { scale: { paladin: { aura: { value: 30 } } } })).toBe(30);
    expect(em.emanationRange(row, { scale: { paladin: { aura: null } } })).toBe(null);
    expect(em.emanationRange(row, {})).toBe(null);
  });
  it("a zero-size activity (Aura of Courage's formula on a bare item) falls through to the row", () => {
    expect(
      em.emanationRange(
        { range: "@scale.paladin.aura" },
        { scale: { paladin: { aura: { value: 10 } } } },
        0
      )
    ).toBe(10);
  });
  it("a row with no range at all reaches nowhere", () => {
    expect(em.emanationRange({}, {})).toBe(null);
    expect(em.emanationRange({ range: 0 }, {})).toBe(null);
  });
});

describe("triggerDue — once per turn in combat, every time out of it (DESIGN §8)", () => {
  it("in combat, a standing chit means the save was already made this turn", () => {
    expect(em.triggerDue({ inCombat: true, chitStands: true }).due).toBe(false);
    expect(em.triggerDue({ inCombat: true, chitStands: false })).toEqual({
      due: true,
      why: "once this turn"
    });
  });
  it("out of combat there is no turn to be once-per", () => {
    expect(em.triggerDue({ inCombat: false, chitStands: true }).due).toBe(true);
  });
});

describe("memberEffectData — the pack's effect, named for its source, fingerprinted for the floor", () => {
  it("carries the resolved changes, the source's item as origin, and the region in its flag", () => {
    const data = em.memberEffectData(
      { key: "Aura of Protection", rule: "You radiate…" },
      {
        name: "Protected",
        img: null,
        changes: [{ key: "system.bonuses.abilities.save", type: "add", value: "3" }]
      },
      {
        sourceName: "Ysolde",
        itemUuid: "Actor.a.Item.b",
        regionId: "R1",
        moduleId: "bf",
        flagKey: "emanation"
      }
    );
    expect(data.name).toBe("Protected — Ysolde");
    expect(data.origin).toBe("Actor.a.Item.b");
    expect(data.transfer).toBe(false);
    expect(data.changes[0].value).toBe("3");
    expect(data.flags.bf.emanation).toEqual({ regionId: "R1", key: "Aura of Protection" });
    expect(data.img).toBe("icons/svg/aura.svg");
    expect(data.description).toContain("Aura of Protection: Ysolde's emanation");
  });
  it("reads the row the way the edge hands it — `rowNamed`'s shape, whose name is `key` (2026-09-23: `row.name` was undefined on every live copy)", async () => {
    const row = reg.tableIndex(reg.EMANATIONS).rowNamed("aura of protection");
    const data = em.memberEffectData(
      row,
      { name: "Protected", changes: [] },
      { sourceName: "Ysolde", itemUuid: null, regionId: "R1", moduleId: "bf", flagKey: "emanation" }
    );
    expect(data.flags.bf.emanation.key).toBe("Aura of Protection");
    expect(data.description).not.toContain("undefined");
  });
  it("carries the aura's group when given — the key the floor keeps one copy per", () => {
    const data = em.memberEffectData(
      { key: "Aura of Protection" },
      { name: "Protected", changes: [] },
      {
        sourceName: "Ysolde",
        itemUuid: "Actor.a.Item.b",
        regionId: "R1",
        group: "Actor.a.Item.b|Aura of Protection",
        moduleId: "bf",
        flagKey: "emanation"
      }
    );
    expect(data.flags.bf.emanation).toEqual({
      regionId: "R1",
      key: "Aura of Protection",
      group: "Actor.a.Item.b|Aura of Protection"
    });
  });
});

describe("the EMANATIONS table (decide/registry.js)", () => {
  it("names the four rows of the first slice, each with a kind, a reach, a rule and an effect", () => {
    const names = Object.keys(reg.EMANATIONS);
    expect(names).toEqual(
      expect.arrayContaining([
        "Aura of Protection",
        "Aura of Courage",
        "Aura of Warding",
        "Spirit Guardians"
      ])
    );
    for (const [name, row] of Object.entries(reg.EMANATIONS)) {
      expect(reg.EMANATION_KINDS.has(row.kind), name).toBe(true);
      // `all` (the Aasimar walk, 2026-09-25): Inner Radiance's "each creature within 10 feet".
      // `summoner` (2026-10-13): Conjure Animals' pack grants its Advantage to the conjurer alone
      expect(["helpful", "harmful", "all", "summoner"], name).toContain(row.reach);
      if (row.pulse) expect(row.effect, name).toBeNull();
      expectPointer(row.rule, name);
      // The second slice (2026-09-05) admits rows that apply NOTHING — a barrier, a notice.
      expect(["string", "object"], name).toContain(typeof row.effect);
    }
  });
  it("the second slice: five PHB auras with the pack's own effect, a notice, a ring — and no dice anywhere", () => {
    const names = Object.keys(reg.EMANATIONS);
    for (const n of [
      "Aura of Life",
      "Aura of Purity",
      "Circle of Power",
      "Crusader's Mantle",
      "Holy Aura"
    ]) {
      expect(names).toContain(n);
      expect(typeof reg.EMANATIONS[n].effect, n).toBe("string");
      expect(reg.EMANATIONS[n].kind, n).toBe("spell");
      expect(reg.EMANATIONS[n].reach, n).toBe("helpful");
      expect(reg.EMANATIONS[n].range, n).toBe(null);
    }
    expect(reg.EMANATIONS["Aura of Life"].heal).toEqual({
      on: "turnStart",
      when: "zeroHP",
      activity: "Create Aura"
    });
    expect(reg.EMANATIONS["Aura of Vitality"]).toMatchObject({
      effect: null,
      remind: { on: "sourceTurnStart", activity: "Start of Turn Heal" }
    });
    expect(reg.EMANATIONS["Antilife Shell"]).toMatchObject({ effect: null, reach: "harmful" });
    for (const [name, row] of Object.entries(reg.EMANATIONS)) {
      const { rule, ...rest } = row;
      expect(JSON.stringify(rest), name).not.toMatch(/\d+d\d+/);
    }
  });
  it("healTriggerDue: Aura of Life pays an ally at 0 HP at its turn start, and nobody else", () => {
    const row = reg.EMANATIONS["Aura of Life"];
    expect(em.healTriggerDue(row, { cause: "turnStart", hp: 0 })).toEqual({
      due: true,
      why: "at 0 Hit Points at the start of its turn"
    });
    expect(em.healTriggerDue(row, { cause: "turnStart", hp: 12 }).due).toBe(false);
    expect(em.healTriggerDue(row, { cause: "turnEnd", hp: 0 }).due).toBe(false);
    // dnd5e marks a 0-HP creature dead on its own — the Hit Points alone decide (measured 2026-09-05).
    expect(
      em.healTriggerDue(reg.EMANATIONS["Aura of Purity"], { cause: "turnStart", hp: 0 }).due
    ).toBe(false);
  });
  it("the Paladin's three auras read their range off the class's own scale value, never a number here", () => {
    for (const n of ["Aura of Protection", "Aura of Courage", "Aura of Warding"]) {
      expect(reg.EMANATIONS[n].range).toBe("@scale.paladin.aura");
      expect(reg.EMANATIONS[n].kind).toBe("feature");
      expect(reg.EMANATIONS[n].incapacitated).toBe(true);
    }
  });
  it("Spirit Guardians is a cast emanation with a save on entering and on ending a turn inside, once per turn", () => {
    const sg = reg.EMANATIONS["Spirit Guardians"];
    expect(sg.kind).toBe("spell");
    expect(sg.reach).toBe("harmful");
    expect(sg.range).toBe(null);
    expect(sg.trigger).toEqual({ on: ["enter", "turnEnd"], oncePerTurn: true });
  });
  it("the emanation kind set is counted by the R4 tripwire", () => {
    const set = reg.KIND_SETS.find(s => s.name === "emanation");
    expect(set?.owner).toBe("emanations.js");
    expect([...set.kinds].sort()).toEqual(["area", "feature", "spell"]);
  });
});

describe("damageTypeFor — Spirit Guardians' type is the alignment's by default, and the caster's when chosen", () => {
  const both = ["necrotic", "radiant"];
  it("a good or neutral (or unaligned) caster deals radiant", () => {
    expect(em.damageTypeFor(both, "Neutral Good").type).toBe("radiant");
    expect(em.damageTypeFor(both, "").type).toBe("radiant");
    expect(em.damageTypeFor(both, null).type).toBe("radiant");
  });
  it("an evil caster deals necrotic", () => {
    expect(em.damageTypeFor(both, "Chaotic Evil").type).toBe("necrotic");
    expect(em.damageTypeFor(both, "lawful evil").type).toBe("necrotic");
  });
  it("a pick that the part offers wins over the alignment", () => {
    expect(em.damageTypeFor(both, "Neutral Good", "necrotic")).toEqual({
      type: "necrotic",
      why: "chosen"
    });
    expect(em.damageTypeFor(both, "Chaotic Evil", "fire").type).toBe("necrotic");
  });
  it("a single-type part is that type; no part is no type", () => {
    expect(em.damageTypeFor(["fire"], "Chaotic Evil").type).toBe("fire");
    expect(em.damageTypeFor([], "Good").type).toBe(null);
  });
});

describe("liveScenes — the active scene and every scene a connected user views (user, 2026-09-23: a play session ran on pulled scenes nobody activated)", () => {
  it("the active scene is live, and says so", () => {
    expect([...em.liveScenes("field", [])]).toEqual([["field", "the active scene"]]);
  });
  it("a scene a user is viewing is live too, named for the viewer; the active scene keeps its own why", () => {
    const live = em.liveScenes("field", [
      { sceneId: "upper-floor", name: "Elra's player" },
      { sceneId: "field", name: "GM" }
    ]);
    expect(live.get("field")).toBe("the active scene");
    expect(live.get("upper-floor")).toBe("Elra's player is viewing it");
    expect(live.size).toBe(2);
  });
  it("no active scene is fine — the viewed scenes still count; a viewer on no scene adds nothing", () => {
    const live = em.liveScenes(null, [
      { sceneId: "apothecary", name: "Aster" },
      { sceneId: null, name: "Idle" }
    ]);
    expect([...live.keys()]).toEqual(["apothecary"]);
  });
  it("nobody anywhere: nothing is live", () => {
    expect(em.liveScenes(null, []).size).toBe(0);
  });
  it("a GM's view does NOT count while a player is connected — a preview of an old scene never raises its rings (user, 2026-09-23: 'if it keeps accuracy')", () => {
    const live = em.liveScenes("field", [
      { sceneId: "apothecary", name: "Aster", isGM: false },
      { sceneId: "old-field", name: "Game Master", isGM: true },
      { sceneId: "vault", name: "Claude (bridge)", isGM: true }
    ]);
    expect([...live.keys()].sort()).toEqual(["apothecary", "field"]);
  });
  it("a connected player on no scene still makes it a session — the GM's view does not count", () => {
    const live = em.liveScenes(null, [
      { sceneId: null, name: "Aster", isGM: false },
      { sceneId: "old-field", name: "Game Master", isGM: true }
    ]);
    expect(live.size).toBe(0);
  });
  it("the GM alone — prepping, testing — counts: the view is the only one there is", () => {
    const live = em.liveScenes("field", [
      { sceneId: "test-range", name: "Game Master", isGM: true }
    ]);
    expect(live.get("test-range")).toBe("Game Master is viewing it");
  });
});

describe("appliesOnScene — only a LIVE scene's emanations apply (user, 2026-09-04: an aura bled from a resting scene onto the battle map; 2026-09-23: a viewed scene is live)", () => {
  it("a ring on the active scene applies", () => {
    expect(em.appliesOnScene("field", em.liveScenes("field", []))).toEqual({
      applies: true,
      why: "the active scene"
    });
  });
  it("a ring on a scene a connected user views applies, though nobody activated it", () => {
    expect(
      em.appliesOnScene(
        "apothecary",
        em.liveScenes("field", [{ sceneId: "apothecary", name: "Aster" }])
      )
    ).toEqual({ applies: true, why: "Aster is viewing it" });
  });
  it("a ring on a scene nobody is on applies nothing — a linked actor's effect would show on every scene it stands on", () => {
    expect(
      em.appliesOnScene(
        "old-field",
        em.liveScenes("battle", [{ sceneId: "battle", name: "Aster" }])
      ).applies
    ).toBe(false);
  });
  it("no live scene, or no scene at all: nothing applies", () => {
    expect(em.appliesOnScene("field", null).applies).toBe(false);
    expect(em.appliesOnScene("field", new Map()).applies).toBe(false);
    expect(em.appliesOnScene(null, em.liveScenes("field", [])).applies).toBe(false);
  });
  it("before the views are heard a standing ring is kept, whatever the live set says; a ring on no scene still applies nothing", () => {
    const early = em.liveScenes("elsewhere", [
      { sceneId: "elsewhere", name: "Newcomer", isGM: true }
    ]);
    expect(em.appliesOnScene("range", early).applies).toBe(false);
    expect(em.appliesOnScene("range", early, { heard: false }).applies).toBe(true);
    expect(em.appliesOnScene(null, early, { heard: false }).applies).toBe(false);
  });
});

describe("viewsHeard — the elect hand-off: a client arriving reads no other user's view until the server's activity lands", () => {
  const T = 1_000_000;
  it("before its own ready nothing is heard, even alone", () => {
    expect(
      em.viewsHeard({
        readyAt: null,
        now: T,
        graceMs: 3000,
        viewers: [{ self: true, sceneId: "field" }]
      }).heard
    ).toBe(false);
  });
  it("one GM alone is heard at ready: a single-GM world raises on first need, no wait", () => {
    expect(
      em.viewsHeard({
        readyAt: T,
        now: T,
        graceMs: 3000,
        viewers: [{ self: true, sceneId: "field" }]
      }).heard
    ).toBe(true);
    expect(
      em.viewsHeard({ readyAt: T, now: T, graceMs: 3000, viewers: [{ self: true, sceneId: null }] })
        .heard
    ).toBe(true);
  });
  it("the newcomer: the other GM's view still null at ready — not heard; once it lands, heard", () => {
    const before = [
      { self: true, sceneId: "elsewhere" },
      { self: false, sceneId: null }
    ];
    expect(em.viewsHeard({ readyAt: T, now: T + 50, graceMs: 3000, viewers: before }).heard).toBe(
      false
    );
    const after = [
      { self: true, sceneId: "elsewhere" },
      { self: false, sceneId: "range" }
    ];
    expect(em.viewsHeard({ readyAt: T, now: T + 60, graceMs: 3000, viewers: after }).heard).toBe(
      true
    );
  });
  it("a user who never sends a view (no canvas) holds it only until the grace ends", () => {
    const quiet = [
      { self: true, sceneId: "field" },
      { self: false, sceneId: null }
    ];
    expect(em.viewsHeard({ readyAt: T, now: T + 2999, graceMs: 3000, viewers: quiet }).heard).toBe(
      false
    );
    expect(em.viewsHeard({ readyAt: T, now: T + 3000, graceMs: 3000, viewers: quiet }).heard).toBe(
      true
    );
  });
  it("why the gate: the live set read before the views lands drops the scene only the other GM views", () => {
    const early = em.liveScenes("elsewhere", [
      { sceneId: "elsewhere", name: "Newcomer", isGM: true },
      { sceneId: null, name: "Suite", isGM: true }
    ]);
    const heard = em.liveScenes("elsewhere", [
      { sceneId: "elsewhere", name: "Newcomer", isGM: true },
      { sceneId: "range", name: "Suite", isGM: true }
    ]);
    expect(early.has("range")).toBe(false);
    expect(heard.has("range")).toBe(true);
  });
});

describe("ringCardDue — a feature ring taken down and put back says nothing again", () => {
  const T = 1_000_000;
  const quietMs = 10_000;
  it("a ring with no card of its own: due", () => {
    expect(em.ringCardDue({ last: null, range: 10, fellAt: T, now: T + 100, quietMs }).due).toBe(
      true
    );
  });
  it("put back moments after it fell, its card saying it stands at that range: not due", () => {
    expect(
      em.ringCardDue({
        last: { verb: "stands", range: 10 },
        range: 10,
        fellAt: T,
        now: T + 2400,
        quietMs
      }).due
    ).toBe(false);
  });
  it("risen anew long after it fell, or never seen falling here: due", () => {
    expect(
      em.ringCardDue({
        last: { verb: "stands", range: 10 },
        range: 10,
        fellAt: T,
        now: T + quietMs + 1,
        quietMs
      }).due
    ).toBe(true);
    expect(
      em.ringCardDue({
        last: { verb: "stands", range: 10 },
        range: 10,
        fellAt: null,
        now: T,
        quietMs
      }).due
    ).toBe(true);
  });
  it("a new range is news: due", () => {
    expect(
      em.ringCardDue({
        last: { verb: "stands", range: 10 },
        range: 30,
        fellAt: T,
        now: T + 100,
        quietMs
      }).due
    ).toBe(true);
  });
});

describe("emanationGroup — one aura however many scenes it stands on", () => {
  it("a linked bearer's item names the same aura on every scene", () => {
    expect(em.emanationGroup("Actor.dorian.Item.aop", "Aura of Protection", "R1")).toBe(
      em.emanationGroup("Actor.dorian.Item.aop", "Aura of Protection", "R2")
    );
  });
  it("two auras of one bearer are two groups; an unlinked bearer's token-borne item is its own", () => {
    expect(em.emanationGroup("Actor.dorian.Item.aop", "Aura of Protection", "R1")).not.toBe(
      em.emanationGroup("Actor.dorian.Item.aoc", "Aura of Courage", "R1")
    );
    expect(
      em.emanationGroup("Scene.a.Token.t1.Actor.x.Item.i", "Aura of Protection", "R1")
    ).not.toBe(em.emanationGroup("Scene.b.Token.t2.Actor.x.Item.i", "Aura of Protection", "R2"));
  });
  it("a region that names no item is a group of one", () => {
    expect(em.emanationGroup(null, "Aura of Protection", "R1")).toBe("region:R1");
    expect(em.emanationGroup(null, "Aura of Protection", "R1")).not.toBe(
      em.emanationGroup(null, "Aura of Protection", "R2")
    );
  });
});

describe("groupMembers — ONE copy per aura per creature across every live scene (user, 2026-09-23: two scenes can never stack)", () => {
  const area = (regionId, inside, extra = {}) => ({
    regionId,
    applies: true,
    kind: "feature",
    reach: "helpful",
    sourceTokenId: `pal-${regionId}`,
    sourceDisposition: FRIENDLY,
    inside,
    ...extra
  });
  const aster = (tokenId, disposition = FRIENDLY) => ({
    tokenId,
    actorKey: "Actor.aster",
    disposition
  });
  it("a linked ally inside the ring on two live scenes wears ONE copy — the first region's", () => {
    const m = em.groupMembers([area("field", [aster("g1")]), area("battle", [aster("g2")])]);
    expect([...m]).toEqual([["Actor.aster", "field"]]);
  });
  it("inside on one scene and outside on the other: still a member", () => {
    const m = em.groupMembers([area("field", []), area("battle", [aster("g2")])]);
    expect(m.get("Actor.aster")).toBe("battle");
  });
  it("a region on a scene nobody plays on admits nobody", () => {
    const m = em.groupMembers([area("old-field", [aster("g1")], { applies: false })]);
    expect(m.size).toBe(0);
  });
  it("the reach still decides, per region; a feature's bearer never wears its own ring, a spell's caster does", () => {
    const hostile = { tokenId: "gob", actorKey: "Scene.s.Token.gob.Actor.x", disposition: HOSTILE };
    const bearer = { tokenId: "pal-field", actorKey: "Actor.pal", disposition: FRIENDLY };
    expect([...em.groupMembers([area("field", [hostile, bearer])]).keys()]).toEqual([]);
    expect([...em.groupMembers([area("field", [bearer], { kind: "spell" })]).keys()]).toEqual([
      "Actor.pal"
    ]);
  });
});

describe("the band-B rows (Session 0 stage B5, 2026-09-30): the alert's turn end and the pick", () => {
  it("alertPhrase: a move entered, a turn started or ended inside — Inspiring Movement's `turnEnd` joins the vocabulary", () => {
    expect(em.alertPhrase("moveIn")).toBe("entered");
    expect(em.alertPhrase("turnStart")).toBe("started its turn within");
    expect(em.alertPhrase("turnEnd")).toBe("ended its turn within");
  });
  it("alertKeysOnTurn: a turn-start or turn-end alert fires once per turn, a move-in alert once per move", () => {
    expect(em.alertKeysOnTurn("turnStart")).toBe(true);
    expect(em.alertKeysOnTurn("turnEnd")).toBe(true);
    expect(em.alertKeysOnTurn("moveIn")).toBe(false);
    expect(em.alertKeysOnTurn("moveOut")).toBe(false);
  });
  it("pickCandidates: everyone the reach admits, never the bearer, in order; a tokenless or actorless entry dropped", () => {
    const inside = [
      { tokenId: "druid", actorUuid: "Actor.d", name: "Druid", disposition: FRIENDLY },
      { tokenId: "gob", actorUuid: "Actor.g", name: "Goblin", disposition: HOSTILE },
      { tokenId: "ally", actorUuid: "Actor.a", name: "Ally", disposition: FRIENDLY },
      { tokenId: "spy", actorUuid: "Actor.s", name: "Spy", disposition: SECRET },
      { tokenId: "ghost", actorUuid: null, name: "Ghost", disposition: HOSTILE }
    ];
    expect(
      em.pickCandidates(inside, {
        sourceTokenId: "druid",
        sourceDisposition: FRIENDLY,
        reach: "all"
      })
    ).toEqual([
      { tokenId: "gob", uuid: "Actor.g", name: "Goblin" },
      { tokenId: "ally", uuid: "Actor.a", name: "Ally" }
    ]);
    expect(
      em.pickCandidates(inside, {
        sourceTokenId: "druid",
        sourceDisposition: FRIENDLY,
        reach: "harmful"
      })
    ).toEqual([{ tokenId: "gob", uuid: "Actor.g", name: "Goblin" }]);
    expect(
      em.pickCandidates([], { sourceTokenId: "druid", sourceDisposition: FRIENDLY, reach: "all" })
    ).toEqual([]);
  });
  it("the four B5 rows stand on the table with their shapes: Branches (turnStart alert while raging), Inspiring Movement (turnEnd alert), Wrath (a pick), Devotion (Courage's row)", () => {
    const t = reg.EMANATIONS;
    expect(t["Branches of the Tree"]).toMatchObject({
      kind: "feature",
      reach: "harmful",
      range: 30,
      effect: null,
      quiet: true,
      while: "Rage",
      alert: { on: "turnStart" }
    });
    expect(t["Inspiring Movement"]).toMatchObject({
      kind: "feature",
      reach: "harmful",
      range: 5,
      effect: null,
      quiet: true,
      alert: { on: "turnEnd" }
    });
    expect(t["Wrath of the Sea"]).toMatchObject({
      kind: "feature",
      reach: "all",
      range: "@scale.sea.wrath-range",
      effect: null,
      while: "Manifesting Ocean Spray",
      pick: { on: "sourceTurnStart", activity: "Bonus Action Save" }
    });
    expect(t["Aura of Devotion"]).toMatchObject({
      kind: "feature",
      reach: "helpful",
      range: "@scale.paladin.aura",
      effect: "Devoted",
      incapacitated: true
    });
    for (const k of [
      "Branches of the Tree",
      "Inspiring Movement",
      "Wrath of the Sea",
      "Aura of Devotion"
    ])
      expectPointer(t[k].rule);
  });
});

describe("a summoner reach admits the one creature that summoned the bearer (2026-10-13, Conjure Animals)", () => {
  it("only the conjurer wears the pack's Strength save Advantage, an ally beside them does not", async () => {
    const em = await import("../scripts/decide/emanations.js");
    const inside = [
      { tokenId: "c", actorKey: "Actor.conjurer", disposition: 1 },
      { tokenId: "a", actorKey: "Actor.ally", disposition: 1 },
      { tokenId: "p", actorKey: "Scene.s.Token.p.Actor.x", disposition: 1 }
    ];
    const out = em.groupMembers([
      {
        regionId: "r",
        applies: true,
        kind: "feature",
        reach: "summoner",
        sourceTokenId: "p",
        sourceDisposition: 1,
        only: "Actor.conjurer",
        inside
      }
    ]);
    expect([...out.keys()]).toEqual(["Actor.conjurer"]);
  });
});
