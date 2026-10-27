import { describe, expect, it } from "vitest";
import {
  MOMENT_KINDS,
  MOMENT_RECORDS,
  MOMENT_WORDS,
  STATE_KEYS,
  isMomentWord,
  momentId,
  newMoments,
  resolvedMoments
} from "../scripts/decide/moments.js";

/** The ctx the spine reads off a message — a usage card here, so item defaults resolve. */
const ctx = {
  messageId: "msg1",
  itemUuid: "Actor.a.Item.card",
  activityUuid: "Actor.a.Item.card.Activity.act",
  actorUuid: "Actor.a"
};

/** Every row's resolves for a record, with the marker→events map a test can read at a glance. */
const resolves = (key, record) => resolvedMoments(key, record, ctx);
const markers = (key, record) => resolves(key, record).map(m => [m.marker, m.events]);

describe("the moment registry — shape", () => {
  it("every row publishes under words in the vocabulary, says what it means, and reads a record", () => {
    for (const [key, row] of Object.entries(MOMENT_RECORDS)) {
      expect(row.events.length, key).toBeGreaterThan(0);
      for (const w of row.events) expect(isMomentWord(w), `${key} → ${w}`).toBe(true);
      expect(row.means.length, key).toBeGreaterThan(20);
      expect(typeof row.resolved, key).toBe("function");
    }
    expect(MOMENT_KINDS).toEqual(Object.keys(MOMENT_RECORDS));
  });

  it("a key is a resolve or state, never both; every state reason is a sentence", () => {
    for (const key of Object.keys(STATE_KEYS)) {
      expect(MOMENT_RECORDS[key], `${key} is in both lists`).toBeUndefined();
      expect(STATE_KEYS[key].length, key).toBeGreaterThanOrEqual(20);
    }
  });

  it("an unregistered key, a null record and an empty record resolve nothing", () => {
    expect(resolves("nobody", { status: "done" })).toEqual([]);
    expect(resolves("hold", null)).toEqual([]);
    expect(resolves("hold", {})).toEqual([]);
    expect(resolves("saves", { targets: [] })).toEqual([]);
  });

  it("every resolve a row returns carries a string marker, a non-empty word list and plain facts", () => {
    // A generous record per row: the fields each reader looks at, all present.
    const fixtures = {
      hitManeuver: {
        sourceUuid: "Actor.f",
        itemUuid: "Actor.f.Item.t",
        feature: "Trip Attack",
        attackId: "atk",
        key: "trip-attack",
        poolSpend: { pool: "Combat Superiority", spent: 1, left: 3, max: 4 }
      },
      commandRide: {
        sourceUuid: "Actor.r",
        formula: "1d8",
        type: "slashing",
        directedBy: "Bramm",
        weapon: "Longsword",
        cardId: "c"
      },
      superiorityRide: {
        sourceUuid: "Actor.f",
        attackId: "atk",
        rode: [{ key: "lunging-attack", formula: "1d8", type: "slashing" }]
      },
      superiorityUse: {
        sourceUuid: "Actor.f",
        key: "evasive-footwork",
        die: "1d8",
        total: 5,
        line: "AC +5"
      },
      baitSwitch: {
        sourceUuid: "Actor.f",
        itemUuid: "Actor.f.Item.b",
        key: "bait-and-switch",
        total: 6,
        chosen: "Actor.r",
        options: [
          { uuid: "Actor.f", name: "F" },
          { uuid: "Actor.r", name: "R" }
        ]
      },
      sweepCard: {
        sourceUuid: "Actor.f",
        feature: "Sweeping Attack",
        attackId: "atk",
        chosen: "Actor.g2",
        resolved: { rolled: 4, verdict: "hit", name: "Goblin 2" }
      },
      precision: {
        status: "resolved",
        outcome: "used",
        attackerUuid: "Actor.f",
        itemId: "p",
        activityId: "a",
        itemName: "Precision Attack",
        die: 5,
        targets: [{ uuid: "Actor.g", name: "G", verdict: "hit" }]
      },
      damageHold: {
        status: "resolved",
        actorUuid: "Actor.s",
        reaction: "Stone's Endurance",
        target: { uuid: "Actor.s", name: "Stone" },
        amount: 12,
        answer: "cast",
        reduceBy: 9
      },
      dropToOne: {
        status: "resolved",
        row: "Relentless Endurance",
        actorUuid: "Actor.o",
        actorName: "Orc",
        amount: 30,
        answer: "use"
      },

      deathSave: {
        status: "resolved",
        cause: "turn",
        actorUuid: "Actor.h",
        actorName: "Ilka",
        result: "failure",
        natural: 1,
        outcome: null,
        face: 1,
        total: 1,
        after: { success: 0, failure: 2 },
        rollMessageId: "roll1",
        round: 2,
        combat: "c:2:0",
        sourceUuid: "Actor.h"
      },

      deathSaveOffer: {
        status: "resolved",
        row: "Searing Vengeance",
        keeperUuid: "Actor.w",
        keeperName: "Warlock",
        actorUuid: "Actor.h",
        actorName: "Halfling",
        answer: "use",
        applied: true,
        healed: 20,
        burst: 12,
        victims: ["Goblin"]
      },
      healReroll: {
        status: "used",
        feature: "Healer",
        actorUuid: "Actor.h",
        source: "Cure Wounds",
        total: 9,
        picks: [{ key: "0:0:0", old: 1, new: 6 }],
        newTotal: 14,
        delta: 5
      },
      initiativeSwap: {
        status: "resolved",
        row: "Alert",
        actorUuid: "Actor.al",
        actorName: "Alert",
        initiative: 11,
        allies: [{ combatantId: "c1", name: "Aster", initiative: 19, uuid: "Actor.g" }],
        answer: "swap",
        pick: "c1",
        applied: true,
        from: 11,
        to: 19
      },
      initiativeGrant: {
        status: "resolved",
        row: "Uncanny Metabolism",
        actorUuid: "Actor.mk",
        actorName: "Monk",
        answer: "yes",
        applied: true,
        regained: 3,
        healed: 9
      },
      conditionEnd: {
        status: "resolved",
        row: "Guarded Mind",
        actorUuid: "Actor.f",
        actorName: "Fighter",
        bearerUuid: "Actor.f",
        bearerName: "Fighter",
        answer: "frightened",
        applied: true,
        ended: "frightened",
        gone: ["Frightened"]
      },
      grappleDamage: {
        status: "resolved",
        row: "Unarmed Fighting",
        actorUuid: "Actor.f",
        actorName: "Fighter",
        candidates: [{ uuid: "Actor.g", name: "Goblin", certain: true }],
        pick: "Actor.g",
        answer: "deal"
      },
      kitTend: {
        status: "resolved",
        row: "Healer",
        actorUuid: "Actor.h",
        actorName: "Healer",
        targetUuid: "Actor.g",
        targetName: "Aster",
        pools: [{ key: "c", faces: 10, label: "Fighter", value: 3, max: 5 }],
        answer: "tend",
        pick: "c",
        applied: true,
        spent: true,
        faces: 10
      },
      restSong: {
        status: "resolved",
        row: "Musician",
        grant: "inspiration",
        actorUuid: "Actor.m",
        cap: 3,
        candidates: [
          { uuid: "Actor.a", name: "A", has: false },
          { uuid: "Actor.b", name: "B", has: true }
        ],
        picks: ["Actor.a"],
        applied: true,
        given: ["A"]
      },
      masterySwap: {
        status: "resolved",
        actorUuid: "Actor.f",
        actorName: "Fighter",
        allowance: 4,
        chosen: [{ base: "longsword", name: "Longsword", mastery: "sap" }],
        pool: [{ base: "greatsword", name: "Greatsword", mastery: "graze" }],
        out: "longsword",
        into: "greatsword",
        applied: true,
        outcome: "swapped"
      },
      summon: {
        status: "placed",
        sourceUuid: "Actor.c",
        sourceName: "Corin",
        itemUuid: "Actor.c.Item.sd",
        itemName: "Summon Dragon",
        activityUuid: "Actor.c.Item.sd.Activity.a",
        level: 5,
        profileName: "Draconic Spirit",
        summonName: "Draconic Spirit",
        choice: "Summon Dragon",
        picked: "fire",
        count: 1,
        applied: true,
        outcome: "landed",
        landed: [
          {
            tokenId: "t1",
            sceneId: "s1",
            actorUuid: "Scene.s1.Token.t1.Actor.x",
            name: "Draconic Spirit"
          }
        ]
      },
      transform: {
        status: "picked",
        key: "Wild Shape",
        sourceUuid: "Actor.d",
        sourceName: "Tamsin",
        itemUuid: "Actor.d.Item.ws",
        itemName: "Wild Shape",
        itemType: "feat",
        activityUuid: "Actor.d.Item.ws.Activity.a",
        self: true,
        targets: [{ uuid: "Actor.d", name: "Tamsin" }],
        pick: { uuid: "Compendium.mm.actors.Actor.wolf", name: "Wolf", img: null },
        applied: true,
        outcome: "landed",
        landed: [{ actorUuid: "Actor.w", originalUuid: "Actor.d", name: "Tamsin (Wolf)" }]
      },
      formSwap: {
        status: "resolved",
        key: "Wild Shape",
        actorUuid: "Actor.d",
        actorName: "Tamsin",
        itemUuid: "Actor.d.Item.ws",
        itemName: "Wild Shape",
        slots: 4,
        known: [{ uuid: "Compendium.mm.actors.Actor.wolf", name: "Wolf" }],
        out: "Compendium.mm.actors.Actor.wolf",
        into: { uuid: "Compendium.mm.actors.Actor.bear", name: "Brown Bear" },
        adds: [],
        applied: true,
        outcome: "changed"
      },
      rebuke: {
        status: "resolved",
        actorUuid: "Actor.s",
        actorName: "Storm",
        sourceUuid: "Actor.g",
        sourceName: "G",
        distance: 40,
        amount: 7,
        options: [{ name: "Storm's Thunder", itemId: "st", activityId: "a" }],
        answer: "use",
        choice: "Storm's Thunder"
      },
      riposte: {
        attackerUuid: "Actor.g",
        attackerName: "G",
        reactors: [
          {
            uuid: "Actor.f",
            name: "F",
            itemId: "r",
            activityId: "a",
            itemName: "Riposte",
            answer: "riposte",
            weaponName: "Longsword"
          }
        ]
      },
      sneakDamage: {
        sourceUuid: "Actor.rogue",
        attackId: "atk",
        dice: 7,
        formula: "7d6",
        cost: 1,
        dc: 15,
        cunning: [{ key: "trip" }]
      },
      bystanderRoll: {
        status: "resolved",
        answer: "roll",
        testKind: "save",
        rollerUuid: "Actor.h",
        by: "Actor.s",
        rescue: "Restore Balance",
        baseTotal: 9,
        dc: 14,
        bent: { how: "neutralised", total: 17 }
      },
      d20fold: {
        actorUuid: "Actor.b",
        status: "resolved",
        outcome: "used",
        testKind: "attack",
        baseTotal: 12,
        foldedTotal: 17,
        spends: [{ kind: "bardic", name: "Bardic Inspiration", die: 5 }]
      },
      tacticalRefund: {
        status: "refunded",
        actorUuid: "Actor.f",
        name: "Tactical Mind",
        poolName: "Second Wind",
        poolUuid: "Actor.f.Item.sw"
      },
      spellRiderCard: {
        sourceUuid: "Actor.aa",
        key: "celestial-revelation",
        label: "Celestial Revelation",
        value: 3,
        type: "radiant",
        targetUuid: "Actor.v",
        spellMessageId: "sp"
      },
      clockRiders: {
        sourceUuid: "Actor.rg",
        attackId: "atk",
        riders: [
          {
            key: "dread-ambusher",
            label: "Dreadful Strike",
            formula: "2d6",
            type: "psychic",
            usesLeft: 2
          }
        ]
      },
      hold: {
        sourceUuid: "Actor.g",
        targets: [
          {
            uuid: "Actor.w",
            name: "W",
            reaction: "Shield",
            kind: "ac",
            itemId: "s",
            activityId: "c",
            answer: "cast",
            answeredBy: "userW"
          }
        ]
      },
      masteryPick: {
        status: "done",
        attackerUuid: "Actor.f",
        stamped: "sap",
        options: [
          { key: "sap", label: "Sap" },
          { key: "push", label: "Push" },
          { key: "slow", label: "Slow" }
        ],
        hits: [{ uuid: "Actor.v", name: "Victim" }],
        answer: "push",
        weapon: { name: "Longsword" }
      },
      mastery: {
        status: "done",
        attackerUuid: "Actor.f",
        key: "topple",
        outcome: "used",
        answer: "use",
        weapon: { name: "Maul" },
        targets: [{ uuid: "Actor.g", name: "G" }]
      },
      damageShield: {
        sourceUuid: "Actor.c",
        key: "Fire Shield",
        attackId: "atk",
        damageId: "dmg",
        attackerUuid: "Actor.g",
        attackerName: "G",
        rolled: true,
        formula: "2d8",
        total: 9,
        type: "fire",
        why: "melee hit"
      },
      shieldMark: { sourceUuid: "Actor.c", key: "Fire Shield", effectId: "e", spellLevel: 4 },
      poolSpend: [
        {
          pool: "Sorcery Points",
          spent: 2,
          left: 3,
          max: 5,
          ability: "Quickened Spell",
          actorUuid: "Actor.s",
          at: 1
        }
      ],
      chipSpend: {
        sourceUuid: "Actor.f",
        spent: [
          {
            id: "e1",
            name: "Vexed",
            key: "vex",
            bearerUuid: "Actor.g",
            bearerName: "G",
            mode: "advantage"
          }
        ]
      },
      useChip: { sourceUuid: "Actor.rogue", effectId: "e", name: "Steady Aim", bend: "advantage" },
      help: {
        sourceUuid: "Actor.owl",
        status: "pending",
        helperName: "Owl",
        target: { uuid: "Actor.goblin", name: "Goblin" },
        feet: 5,
        chosen: { facet: "attack", lend: null },
        resolved: { facet: "attack", lend: null, effectName: "Helped", at: 1 }
      },
      typePick: {
        sourceUuid: "Actor.aster",
        row: "Elemental Adept",
        itemUuid: "Actor.aster.Item.x",
        left: ["fire", "cold"],
        chosen: "fire"
      },
      coatUse: {
        sourceUuid: "Actor.poisoner",
        key: "poisoner",
        chip: "Poison Coating",
        effectId: "e",
        left: 2
      },
      coatHit: {
        sourceUuid: "Actor.poisoner",
        status: "spent",
        key: "poisoner",
        attackId: "atk",
        ability: "dex",
        targets: [{ uuid: "Actor.goblin", name: "Goblin" }],
        saveId: "s"
      },
      cardChip: {
        sourceUuid: "Actor.gnome",
        key: "Tinker",
        chip: "Tiny Clockwork Device",
        made: true,
        effectId: "e",
        retired: []
      },
      spend: { sourceUuid: "Actor.f", rows: [{ name: "Second Wind", spent: 1 }] },
      receipt: {
        targets: [
          { uuid: "Actor.g", name: "G", taken: 9, sourceUuid: "Actor.f", parts: [], traits: [] }
        ]
      },
      effectReceipt: {
        targets: [
          {
            uuid: "Actor.g",
            name: "G",
            effects: [{ id: "e1", name: "Prone", sourceUuid: "Actor.f" }]
          }
        ]
      },
      saves: {
        sourceUuid: "Actor.c",
        dc: 15,
        abilities: ["dex"],
        item: { name: "Fireball" },
        activityUuid: "Actor.c.Item.fb.Activity.x",
        targets: [{ uuid: "Actor.g", name: "G", done: true, outcome: "failed", total: 9 }]
      },
      topple: {
        attackerUuid: "Actor.f",
        dc: 14,
        ability: "con",
        targets: [
          { uuid: "Actor.g", name: "G", done: true, outcome: "prone", total: 8, applied: true }
        ]
      },
      concentration: {
        status: "done",
        actorUuid: "Actor.c",
        dc: 10,
        names: ["Bless"],
        outcome: { success: false, total: 7 }
      },
      bashOffer: {
        status: "resolved",
        answer: "bash",
        attackerUuid: "Actor.f",
        itemId: "sm",
        activityId: "a",
        itemName: "Shield Master",
        targetUuid: "Actor.g",
        targets: [{ uuid: "Actor.g", name: "G" }]
      },
      damageCast: {
        sourceUuid: "Actor.c",
        key: "Heat Metal",
        activity: "Damage",
        scaling: 0,
        save: "Save"
      },
      volley: {
        status: "resolved",
        sourceUuid: "Actor.s",
        kind: "damage",
        n: 3,
        assignment: [{ uuid: "Actor.g", name: "G", count: 3 }]
      },
      emanationCard: {
        sourceUuid: "Actor.c",
        key: "Spirit Guardians",
        chosen: true,
        damageType: "radiant",
        damageWhy: "chosen"
      },
      castApply: {
        activityUuid: "Actor.c.Item.fs.Activity.x",
        targets: [{ uuid: "Actor.c", name: "C" }],
        choice: { options: ["Warm Shield", "Chill Shield"], chosen: "Warm Shield" }
      },
      metamagic: { key: "quickened", feature: "Quickened Spell", cost: 2, spent: true },
      diceChange: {
        status: "used",
        actorUuid: "Actor.f",
        attackId: "atk",
        sourceUuid: "Actor.f",
        rows: [
          {
            key: "savage-attacker",
            feature: "Savage Attacker",
            kind: "set",
            status: "used",
            formula: "1d8",
            first: 5,
            second: 7,
            stands: "second",
            delta: 2,
            after: 11
          },
          { key: "piercer", feature: "Piercer", kind: "one", status: "kept" }
        ]
      },
      areaChoice: {
        spell: "Slow",
        chosen: [{ uuid: "Actor.b", name: "Mirefang" }],
        left: [{ uuid: "Actor.i", name: "Dorian" }],
        asked: true,
        cap: 6,
        sourceUuid: "Actor.g"
      }
    };
    for (const key of Object.keys(MOMENT_RECORDS)) {
      expect(fixtures[key], `no fixture for ${key}`).toBeDefined();
      const out = resolves(key, fixtures[key]);
      expect(out.length, `${key} resolved nothing`).toBeGreaterThan(0);
      for (const m of out) {
        expect(typeof m.marker, key).toBe("string");
        expect(m.events.length, key).toBeGreaterThan(0);
        for (const w of m.events) expect(isMomentWord(w), `${key} → ${w}`).toBe(true);
        expect(typeof m.facts, key).toBe("object");
        // plain: no functions, no documents — it survives JSON
        expect(JSON.parse(JSON.stringify(m.facts))).toEqual(m.facts);
      }
    }
  });
});

describe("the moment registry — the edges", () => {
  it("a chosen area's default — nothing to choose, nobody asked — resolves nothing; an answered one resolves once, the chosen as its targets", () => {
    const base = {
      spell: "Slow",
      chosen: [{ uuid: "Actor.b", name: "Mirefang" }],
      left: [],
      cap: 6,
      sourceUuid: "Actor.g"
    };
    expect(markers("areaChoice", { ...base, asked: false })).toEqual([]);
    const out = resolves("areaChoice", { ...base, asked: true });
    expect(out.length).toBe(1);
    expect(out[0].events).toEqual(["choice"]);
    expect(out[0].facts.targets).toEqual([{ uuid: "Actor.b", name: "Mirefang" }]);
  });
  it("a pending hold resolves nothing; each answered target is one resolve, Parry's die under two words, on the answerer's client", () => {
    const pending = {
      sourceUuid: "Actor.g",
      targets: [{ uuid: "Actor.w", reaction: "Shield", answer: null }]
    };
    expect(markers("hold", pending)).toEqual([]);
    const answered = {
      sourceUuid: "Actor.g",
      targets: [
        {
          uuid: "Actor.w",
          name: "W",
          reaction: "Shield",
          kind: "ac",
          itemId: "s",
          activityId: "c",
          answer: "cast",
          answeredBy: "userW"
        },
        {
          uuid: "Actor.f",
          name: "F",
          reaction: "Parry",
          kind: "damage",
          itemId: "p",
          answer: "cast",
          reduceBy: 7,
          reduce: { formula: "1d8 + 3" },
          poolSpend: { pool: "Combat Superiority", spent: 1, left: 2, max: 4 },
          answeredBy: "userF"
        },
        { uuid: "Actor.p", name: "P", reaction: "Shield", answer: "pass", timedOut: true }
      ]
    };
    const out = resolves("hold", answered);
    expect(out.map(m => [m.marker, m.events, m.publisher])).toEqual([
      ["Actor.w", ["hold-answered"], "userW"],
      ["Actor.f", ["hold-answered", "maneuver"], "userF"],
      ["Actor.p", ["hold-answered"], null]
    ]);
    expect(out[0].facts).toMatchObject({
      actor: "Actor.w",
      item: "Actor.w.Item.s",
      activity: "Actor.w.Item.s.Activity.c",
      ability: "Shield",
      attackId: "msg1",
      targets: [{ uuid: "Actor.g", name: null }]
    });
    expect(out[1].facts.details).toMatchObject({
      answer: "cast",
      reduceBy: 7,
      formula: "1d8 + 3",
      mode: "reduce"
    });
    expect(out[2].facts.details).toMatchObject({ answer: "pass", timedOut: true });
  });

  it("a reduction that is NOT a maneuver (Stone's Endurance, reduce.maneuver false) publishes hold-answered alone, its use spent", () => {
    const flag = {
      sourceUuid: "Actor.g",
      targets: [
        {
          uuid: "Actor.o",
          name: "O",
          reaction: "Stone's Endurance",
          kind: "damage",
          itemId: "s",
          answer: "cast",
          reduceBy: 9,
          reduce: {
            formula: "1d12 + @abilities.con.mod",
            maneuver: false,
            eyebrow: "Reaction",
            spend: "use"
          },
          poolSpend: { pool: "Stone's Endurance", spent: 1, left: 2, max: 3 }
        }
      ]
    };
    const out = resolves("hold", flag);
    expect(out.map(m => m.events)).toEqual([["hold-answered"]]);
    expect(out[0].facts.spend).toMatchObject({ pool: "Stone's Endurance", left: 2 });
    expect(out[0].facts.details).toMatchObject({ reduceBy: 9, mode: "reduce" });
  });

  it("a `roll` answer (Slice A, 2026-09-24) names the row that bent the roll, and its Luck Point is never a maneuver", () => {
    const out = resolves("hold", {
      sourceUuid: "Actor.g",
      targets: [
        {
          uuid: "Actor.h",
          name: "H",
          reaction: "Shield",
          kind: "ac",
          itemId: "s",
          activityId: "c",
          rescues: [{ name: "Lucky", itemId: "lk", activityId: "dis" }],
          answer: "roll",
          rescue: "Lucky",
          verdict: "miss",
          bent: { how: "lower", total: 13, isCritical: false },
          poolSpend: { pool: "Luck Points", spent: 1, left: 2, max: 3 },
          answeredBy: "userH"
        }
      ]
    });
    expect(out.map(m => m.events)).toEqual([["hold-answered"]]);
    expect(out[0].facts).toMatchObject({
      item: "Actor.h.Item.lk",
      activity: "Actor.h.Item.lk.Activity.dis",
      ability: "Lucky"
    });
    expect(out[0].facts.details).toMatchObject({
      answer: "roll",
      rescue: "Lucky",
      how: "lower",
      stood: 13,
      verdict: "miss"
    });
    expect(out[0].facts.details.mode).toBeUndefined();
  });

  it("the dice changers' record resolves once it is used, one resolve per row used — kept, due, pending, spent and moot resolve nothing", () => {
    const rows = [
      { key: "empowered", feature: "Empowered Spell", kind: "pick", status: "pending", cap: 3 },
      {
        key: "savage-attacker",
        feature: "Savage Attacker",
        kind: "set",
        status: "pending",
        formula: "2d6",
        first: 5
      },
      { key: "piercer", feature: "Piercer", kind: "one", status: "pending", faces: 6, first: 2 }
    ];
    const base = { actorUuid: "Actor.f", attackId: "atk", rows };
    for (const status of ["due", "pending", "answering", "kept", "spent", "moot"]) {
      expect(markers("diceChange", { ...base, status }), status).toEqual([]);
    }
    const out = resolves("diceChange", {
      ...base,
      status: "used",
      rows: [
        {
          ...rows[0],
          status: "used",
          picks: [{ key: "0:0:0", old: 1, new: 5 }],
          delta: 4,
          after: 16
        },
        { ...rows[1], status: "used", second: 10, stands: "second", delta: 5, after: 21 },
        { ...rows[2], status: "kept" }
      ]
    });
    expect(out.map(o => [o.marker, o.events])).toEqual([
      ["empowered", ["metamagic"]],
      ["savage-attacker", ["fold"]]
    ]);
    expect(out[1].facts).toMatchObject({
      actor: "Actor.f",
      ability: "Savage Attacker",
      attackId: "atk",
      targetsFrom: "attack"
    });
    expect(out[1].facts.details).toMatchObject({
      first: 5,
      second: 10,
      stands: "second",
      delta: 5,
      total: 21
    });
    expect(out[0].facts.details).toMatchObject({ newTotal: 16, delta: 4 });
  });

  it("the saves flag resolves one save per target done — and the attacker's choice beside it", () => {
    const flag = {
      sourceUuid: "Actor.c",
      dc: 15,
      abilities: ["dex"],
      item: { name: "Fireball" },
      targets: [
        { uuid: "Actor.g1", name: "G1", done: true, outcome: "saved", total: 17 },
        { uuid: "Actor.g2", name: "G2", done: false },
        {
          uuid: "Actor.g3",
          name: "G3",
          done: true,
          outcome: "failed",
          total: null,
          autoFailed: true,
          autoFailedBy: "Paralyzed",
          choice: {
            kind: "bash",
            itemName: "Shield Master",
            subjectUuid: "Actor.f",
            answer: "push"
          }
        }
      ]
    };
    expect(markers("saves", flag)).toEqual([
      ["Actor.g1", ["save"]],
      ["Actor.g3", ["save"]],
      ["Actor.g3|choice", ["choice"]]
    ]);
    const [g1, g3, choice] = resolves("saves", flag);
    expect(g1.facts).toMatchObject({
      actor: "Actor.g1",
      ability: "Fireball",
      details: { outcome: "saved", total: 17, dc: 15, casterUuid: "Actor.c" }
    });
    expect(g3.facts.details).toMatchObject({
      outcome: "failed",
      autoFailed: true,
      autoFailedBy: "Paralyzed"
    });
    expect(choice.facts).toMatchObject({
      actor: "Actor.f",
      ability: "Shield Master",
      targets: [{ uuid: "Actor.g3", name: "G3" }],
      details: { answer: "push", kind: "bash" }
    });
  });

  it("a d20 fold publishes each settled spend once, never one still pending its verdict, and a human's pass", () => {
    const inFlight = {
      actorUuid: "Actor.b",
      status: "pending",
      testKind: "save",
      spends: [{ kind: "bardic", name: "Bardic Inspiration", die: 4, pendingVerdict: true }]
    };
    expect(markers("d20fold", inFlight)).toEqual([]);
    const settled = {
      ...inFlight,
      spends: [
        { kind: "bardic", name: "Bardic Inspiration", die: 4 },
        { kind: "heroic", name: "Heroic Inspiration", reroll: { total: 15 }, pendingVerdict: true }
      ]
    };
    expect(markers("d20fold", settled)).toEqual([["spend:0", ["fold"]]]);
    const passed = {
      actorUuid: "Actor.b",
      status: "resolved",
      outcome: "passed",
      testKind: "attack",
      spends: []
    };
    expect(markers("d20fold", passed)).toEqual([["passed", ["fold"]]]);
    const mooted = { ...passed, outcome: "no longer needed" };
    expect(markers("d20fold", mooted)).toEqual([]);
  });

  it("receipts resolve per target and again on a revert; effect receipts per effect", () => {
    const dmg = {
      targets: [
        { uuid: "Actor.g", name: "G", taken: 9 },
        { uuid: "Actor.h", name: "H", taken: 3, reverted: true }
      ]
    };
    expect(markers("receipt", dmg)).toEqual([
      ["Actor.g", ["damage"]],
      ["Actor.h", ["damage"]],
      ["Actor.h|reverted", ["damage"]]
    ]);
    expect(resolves("receipt", dmg)[2].facts.details).toMatchObject({ reverted: true, taken: 3 });
    const fx = {
      targets: [
        {
          uuid: "Actor.g",
          name: "G",
          effects: [
            { id: "e1", name: "Prone" },
            { id: "e2", name: "Vexed", reverted: true }
          ]
        }
      ]
    };
    expect(markers("effectReceipt", fx)).toEqual([
      ["Actor.g|e1", ["effect"]],
      ["Actor.g|e2", ["effect"]],
      ["Actor.g|e2|reverted", ["effect"]]
    ]);
  });

  it("concentration publishes save on a success, save and break on a failure, save alone when voided", () => {
    expect(
      markers("concentration", {
        status: "done",
        actorUuid: "Actor.c",
        outcome: { success: true, total: 14 }
      })
    ).toEqual([["verdict", ["save"]]]);
    expect(
      markers("concentration", {
        status: "done",
        actorUuid: "Actor.c",
        outcome: { success: false, total: 4 }
      })
    ).toEqual([["verdict", ["save", "break"]]]);
    expect(
      markers("concentration", { status: "done", actorUuid: "Actor.c", outcome: { voided: true } })
    ).toEqual([["verdict", ["save"]]]);
    expect(markers("concentration", { status: "pending", actorUuid: "Actor.c" })).toEqual([]);
  });

  it("riders and rides publish one resolve per die that rode; the hit menu one per record with the attack's targets deferred to the spine", () => {
    const riders = {
      sourceUuid: "Actor.rg",
      attackId: "atk",
      riders: [
        { key: "dread-ambusher", label: "Dreadful Strike", formula: "2d6", type: "psychic" },
        { key: "divine-fury", label: "Divine Fury", formula: "1d6 + 2" }
      ]
    };
    expect(markers("clockRiders", riders)).toEqual([
      ["dread-ambusher", ["rider"]],
      ["divine-fury", ["rider"]]
    ]);
    expect(resolves("clockRiders", riders)[0].facts).toMatchObject({
      actor: "Actor.rg",
      itemName: "Dreadful Strike",
      attackId: "atk",
      targetsFrom: "attack"
    });
    const hm = {
      sourceUuid: "Actor.f",
      itemUuid: "Actor.f.Item.t",
      feature: "Trip Attack",
      attackId: "atk",
      key: "trip-attack",
      mode: "ride",
      poolSpend: { pool: "Combat Superiority", spent: 1, left: 3, max: 4 }
    };
    expect(markers("hitManeuver", hm)).toEqual([["message", ["maneuver"]]]);
    expect(resolves("hitManeuver", hm)[0].facts).toMatchObject({
      actor: "Actor.f",
      item: "Actor.f.Item.t",
      ability: "Trip Attack",
      targetsFrom: "attack",
      spend: hm.poolSpend
    });
    // A Giant Ancestry boon (maneuver false, Slice A 2026-09-24) is no maneuver: it rides as a rider.
    const boon = {
      ...hm,
      feature: "Fire's Burn",
      key: "fires-burn",
      maneuver: false,
      type: "fire",
      poolSpend: { pool: "Fire's Burn", spent: 1, left: 2, max: 3 }
    };
    expect(markers("hitManeuver", boon)).toEqual([["message", ["rider"]]]);
    expect(resolves("hitManeuver", boon)[0].facts.details).toMatchObject({
      key: "fires-burn",
      type: "fire"
    });
  });

  it("status-gated rows resolve only past their edge", () => {
    expect(markers("mastery", { status: "pending", key: "vex" })).toEqual([]);
    expect(
      markers("mastery", { status: "done", key: "vex", outcome: "passed", attackerUuid: "Actor.f" })
    ).toEqual([["message", ["mastery"]]]);
    expect(markers("precision", { status: "pending" })).toEqual([]);
    expect(
      markers("precision", { status: "resolved", outcome: "passed", attackerUuid: "Actor.f" })
    ).toEqual([["message", ["maneuver", "fold"]]]);
    expect(markers("bashOffer", { status: "pending" })).toEqual([]);
    expect(markers("volley", { status: "pending" })).toEqual([]);
    expect(markers("tacticalRefund", { status: "pending" })).toEqual([]);
    expect(
      markers("tacticalRefund", { status: "kept", actorUuid: "Actor.f", name: "Tactical Mind" })
    ).toEqual([["message", ["fold"]]]);
    expect(markers("baitSwitch", { chosen: null })).toEqual([]);
    expect(markers("sweepCard", { chosen: "Actor.g", resolved: null })).toEqual([]);
    expect(markers("emanationCard", { chosen: false })).toEqual([]);
    expect(markers("castApply", { choice: { options: ["a", "b"], chosen: null } })).toEqual([]);
    expect(markers("metamagic", { key: "quickened", spent: false })).toEqual([]);
    expect(markers("diceChange", { status: "answering", rows: [] })).toEqual([]);
    expect(markers("riposte", { reactors: [{ uuid: "Actor.f", answer: null }] })).toEqual([]);
    expect(markers("topple", { targets: [{ uuid: "Actor.g", done: false }] })).toEqual([]);
  });

  it("pool spends take one record or many, each its own resolve; chip spends one per chip", () => {
    const one = {
      pool: "Sorcery Points",
      spent: 1,
      left: 4,
      max: 5,
      ability: "Seeking Spell",
      at: 7
    };
    expect(markers("poolSpend", one)).toEqual([["Sorcery Points|7", ["spend"]]]);
    const many = [
      { pool: "Dreadful Strike", spent: 1, left: 1, max: 2, at: 1 },
      { pool: "Divine Fury", spent: 1, left: 0, max: 1, at: 2 }
    ];
    expect(markers("poolSpend", many)).toEqual([
      ["Dreadful Strike|1", ["spend"]],
      ["Divine Fury|2", ["spend"]]
    ]);
    const chips = {
      sourceUuid: "Actor.f",
      spent: [
        { id: "e1", name: "Vexed", key: "vex" },
        { id: "e2", name: "Sapped", key: "sap" }
      ]
    };
    expect(markers("chipSpend", chips)).toEqual([
      ["e1", ["spend"]],
      ["e2", ["spend"]]
    ]);
  });
});

describe("the latch arithmetic", () => {
  it("momentId is message|kind|marker and newMoments is the set difference in record order", () => {
    expect(momentId("m1", "hold", "Actor.w")).toBe("m1|hold|Actor.w");
    expect(momentId(null, "hold", "x")).toBe("?|hold|x");
    const moments = [
      { marker: "a", events: ["save"], facts: {} },
      { marker: "b", events: ["save"], facts: {} },
      { marker: "c", events: ["save"], facts: {} }
    ];
    const latch = new Set([momentId("m1", "saves", "b")]);
    expect(newMoments("m1", "saves", moments, latch).map(m => m.marker)).toEqual(["a", "c"]);
    expect(newMoments("m2", "saves", moments, latch).map(m => m.marker)).toEqual(["a", "b", "c"]);
  });

  it("the vocabulary is closed and frozen", () => {
    expect(Object.isFrozen(MOMENT_WORDS)).toBe(true);
    expect(isMomentWord("maneuver")).toBe(true);
    expect(isMomentWord("smite")).toBe(false);
  });
});

describe("the death save record", () => {
  it("a settled ask publishes save with the creature as actor and target, the result, the natural face and the tally", () => {
    const out = resolves("deathSave", {
      status: "resolved",
      cause: "turn",
      actorUuid: "Actor.h",
      actorName: "Ilka",
      result: "success",
      natural: 20,
      outcome: "revive",
      face: 20,
      total: 20,
      after: { success: 0, failure: 0 },
      rollMessageId: "roll1",
      timedOut: true,
      round: 3
    });
    expect(
      markers(
        "deathSave",
        out.length ? { status: "resolved", result: "success", actorUuid: "Actor.h" } : {}
      )
    ).toEqual([["message", ["save"]]]);
    expect(out).toHaveLength(1);
    expect(out[0].facts).toMatchObject({
      actor: "Actor.h",
      ability: "Death Saving Throw",
      targets: [{ uuid: "Actor.h", name: "Ilka" }],
      details: {
        cause: "turn",
        result: "success",
        natural: 20,
        outcome: "revive",
        success: 0,
        failure: 0,
        face: 20,
        total: 20,
        timedOut: true,
        rollMessageId: "roll1",
        round: 3,
        amount: null,
        critical: false,
        massive: false,
        wasStable: false
      }
    });
  });

  it("damage at 0 Hit Points publishes the same word with its cause and amount; a waiting or moot ask publishes nothing", () => {
    const out = resolves("deathSave", {
      status: "resolved",
      cause: "damage",
      actorUuid: "Actor.h",
      actorName: "Ilka",
      result: "failure",
      outcome: "death",
      amount: 40,
      critical: false,
      massive: true,
      wasStable: true,
      after: { success: 0, failure: 3 }
    });
    expect(out).toHaveLength(1);
    expect(out[0].facts.details).toMatchObject({
      cause: "damage",
      amount: 40,
      massive: true,
      wasStable: true,
      outcome: "death",
      failure: 3,
      natural: null
    });
    expect(resolves("deathSave", { status: "pending", actorUuid: "Actor.h" })).toEqual([]);
    expect(
      resolves("deathSave", { status: "moot", why: "above 0 Hit Points", actorUuid: "Actor.h" })
    ).toEqual([]);
  });
});
