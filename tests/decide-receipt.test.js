import { beforeAll, describe, expect, it } from "vitest";

/**
 * DECISION-layer receipt arithmetic (ARCHITECTURE.md §2). No Foundry stub on purpose.
 *
 * ⚠ This is the arithmetic that MOVES HIT POINTS: what a card says the hit dealt, and what a
 * revert restores. It moved here from code with no unit coverage at all — three of the cases
 * below are live table reports (the 0-HP Ice Mephit, the "−-25 HP" heal, Bramm's temp-HP
 * Dash), and each one is a sentence the numbers chose wrongly.
 */
/** @type {typeof import("../scripts/decide/receipt.js")} */
let r;
beforeAll(async () => {
  r = await import("../scripts/decide/receipt.js");
});

/** `calculateDamage` returns an ARRAY carrying an `amount` property — not a plain object. */
const summary = (amount, parts = []) => Object.assign([...parts], { amount });

describe("traitOutcome — what the traits made of one part", () => {
  it("reads the multiplier the system annotated", () => {
    expect(r.traitOutcome({ multiplier: 0 })).toBe("immune");
    expect(r.traitOutcome({ multiplier: 0.5 })).toBe("resistant");
    expect(r.traitOutcome({ multiplier: 2 })).toBe("vulnerable");
  });

  it("puts the threshold first — it explains the number even when a multiplier also applied", () => {
    expect(r.traitOutcome({ threshold: 10, multiplier: 0.5 })).toBe("threshold");
  });

  it("reports a modification from either side", () => {
    expect(r.traitOutcome({ all: { modification: true } })).toBe("modified");
    expect(r.traitOutcome({ type: { modification: true } })).toBe("modified");
  });

  it("stays SILENT at ×1 — resist and vulnerable cancel, and the number did not move", () => {
    expect(r.traitOutcome({ multiplier: 1 })).toBe(null);
    expect(r.traitOutcome({})).toBe(null);
    expect(r.traitOutcome(undefined)).toBe(null);
  });

  it("divides the caller's multiplier out — a halved save is not a resistance", () => {
    // dnd5e folds options.multiplier into active.multiplier before the traits (actor.mjs):
    // saved, no trait → 0.5 raw; saved AND resistant → 0.25 raw; saved AND vulnerable → 1 raw.
    // a play session's breath (2026-09-24): Bramm 32 → 16 was labelled resistant, Aster 32 → 8 not.
    expect(r.traitOutcome({ multiplier: 0.5 }, 0.5)).toBe(null);
    expect(r.traitOutcome({ multiplier: 0.25 }, 0.5)).toBe("resistant");
    expect(r.traitOutcome({ multiplier: 1 }, 0.5)).toBe("vulnerable");
    // immunity and a threshold are ×0 whatever the caller passed
    expect(r.traitOutcome({ multiplier: 0 }, 0.5)).toBe("immune");
    expect(r.traitOutcome({ threshold: 10, multiplier: 0 }, 0.5)).toBe("threshold");
  });
});

describe("traitReasons — the row's reason list", () => {
  it("tells one story per (type, outcome), however many parts share it", () => {
    const calc = summary(9, [
      { type: "cold", active: { multiplier: 0 } },
      { type: "cold", active: { multiplier: 0 } },
      { type: "fire", active: { multiplier: 2 } }
    ]);
    expect(r.traitReasons(calc)).toEqual([
      { type: "cold", outcome: "immune" },
      { type: "fire", outcome: "vulnerable" }
    ]);
  });

  it("keeps two DIFFERENT outcomes for one type — they are different sentences", () => {
    const calc = summary(4, [
      { type: "cold", active: { multiplier: 0.5 } },
      { type: "cold", active: { threshold: 12 } }
    ]);
    expect(r.traitReasons(calc)).toEqual([
      { type: "cold", outcome: "resistant" },
      { type: "cold", outcome: "threshold" }
    ]);
  });

  it("passes the entry's multiplier through, so a saved volley reads its traits right", () => {
    const calc = summary(12, [
      { type: "poison", active: { multiplier: 0.5 } },
      { type: "fire", active: { multiplier: 0.25 } }
    ]);
    expect(r.traitReasons(calc, 0.5)).toEqual([{ type: "fire", outcome: "resistant" }]);
  });

  it("says nothing about parts that landed plain", () => {
    expect(r.traitReasons(summary(7, [{ type: "slashing", active: { multiplier: 1 } }]))).toEqual(
      []
    );
  });

  it("survives a CANCELLED calculation — calculateDamage returns false, not an array", () => {
    expect(r.traitReasons(false)).toEqual([]);
    expect(r.traitReasons(undefined)).toEqual([]);
  });
});

describe("hpDelta — what the pool did", () => {
  it("signs the change in both channels", () => {
    expect(r.hpDelta({ value: 20, temp: 5 }, { value: 12, temp: 0 })).toEqual({
      value: -8,
      temp: -5
    });
  });

  it("reads a temp GRANT as a positive temp delta with the pool untouched", () => {
    expect(r.hpDelta({ value: 20, temp: 0 }, { value: 20, temp: 7 })).toEqual({
      value: 0,
      temp: 7
    });
  });

  it("treats an absent channel as zero rather than NaN", () => {
    expect(r.hpDelta({ value: 6 }, { value: 4 })).toEqual({ value: -2, temp: 0 });
  });
});

describe("receiptEntry — one entry, from the snapshots either side", () => {
  const prior = { value: 20, temp: 0, tempmax: 0 };
  const after = { value: 6, temp: 0, tempmax: 0 };
  const base = { uuid: "Actor.a", name: "Ice Mephit", img: "icons/m.webp", prior, after };

  it("records prior, delta, taken, the reasons — and the data-plane stamp, null without context", () => {
    const entry = r.receiptEntry({
      ...base,
      calc: summary(14, [{ type: "cold", active: {}, value: 14 }])
    });
    expect(entry).toEqual({
      uuid: "Actor.a",
      name: "Ice Mephit",
      img: "icons/m.webp",
      prior,
      delta: { value: -14, temp: 0 },
      taken: 14,
      parts: [{ type: "cold", amount: 14 }],
      traits: [],
      reverted: false,
      combat: null,
      sourceUuid: null
    });
  });

  it("keeps per-part POST-trait amounts — calc's values arrive already multiplied (measured)", () => {
    // Probed live 2026-08-27: calculateDamage rewrites each part's `value` through the trait
    // story (fire 9 under resistance comes back 4, cold 10 under immunity comes back 0), so
    // the parts ARE what each type dealt — the message's rolls stay the pre-mitigation side.
    const entry = r.receiptEntry({
      ...base,
      calc: summary(11, [
        { type: "cold", value: 0, active: { multiplier: 0 } },
        { type: "fire", value: 4, active: { type: { resistance: true }, multiplier: 0.5 } },
        { type: "slashing", value: 7, active: { multiplier: 1 } }
      ])
    });
    expect(entry.parts).toEqual([
      { type: "cold", amount: 0 },
      { type: "fire", amount: 4 },
      { type: "slashing", amount: 7 }
    ]);
  });

  it("parts stay an empty list when the calculation was cancelled", () => {
    expect(r.receiptEntry({ ...base, calc: false }).parts).toEqual([]);
  });

  it("carries the data-plane context PER ENTRY — a held target's late landing keeps its own turn", () => {
    const context = { combat: "combatA:2:1", sourceUuid: "Actor.bramm" };
    const entry = r.receiptEntry({ ...base, calc: summary(14), context });
    expect(entry.combat).toBe("combatA:2:1");
    expect(entry.sourceUuid).toBe("Actor.bramm");
  });

  it("leaves note and multiplier OFF unless they say something", () => {
    const plain = r.receiptEntry({ ...base, calc: summary(14) });
    expect("note" in plain).toBe(false);
    expect("multiplier" in plain).toBe(false);

    const halved = r.receiptEntry({ ...base, calc: summary(7), multiplier: 0.5, note: "Graze" });
    expect(halved.multiplier).toBe(0.5);
    expect(halved.note).toBe("Graze");
  });

  it("keeps `taken` when the delta clamped to nothing — the 0-HP Ice Mephit", () => {
    // Reported live 2026-08-15: the row said "−0 HP" beside the native tray's −14, because a
    // target already at 0 clamps every delta. `taken` is what the hit DEALT.
    const dead = { value: 0, temp: 0, tempmax: 0 };
    const entry = r.receiptEntry({ ...base, prior: dead, after: dead, calc: summary(14) });
    expect(entry.delta).toEqual({ value: 0, temp: 0 });
    expect(entry.taken).toBe(14);
  });

  it("records a null take when the calculation was cancelled", () => {
    expect(r.receiptEntry({ ...base, calc: false }).taken).toBe(null);
  });

  it("defaults the portrait to null so an old row still renders its glyph", () => {
    expect(r.receiptEntry({ uuid: "a", name: "n", prior, after, calc: summary(1) }).img).toBe(null);
  });
});

describe("statFields — the data-plane stamp's two facts, always present", () => {
  it("normalizes a full context through unchanged", () => {
    expect(r.statFields({ combat: "c:1:0", sourceUuid: "Actor.x" })).toEqual({
      combat: "c:1:0",
      sourceUuid: "Actor.x"
    });
  });

  it("writes EXPLICIT nulls for an empty context — null means 'resolved, and the answer was nothing'", () => {
    // An ABSENT field marks a record from before the data plane existed; an explicit null is
    // an out-of-combat / unattributable event resolved at write time. The scan tells legacy
    // history from an out-of-combat event by exactly this difference.
    expect(r.statFields(undefined)).toEqual({ combat: null, sourceUuid: null });
    expect(r.statFields(null)).toEqual({ combat: null, sourceUuid: null });
    expect(r.statFields({})).toEqual({ combat: null, sourceUuid: null });
  });
});

describe("effectRecord — THE constructor for every applied-effect record", () => {
  it("shapes the record with the stamp riding it", () => {
    const record = r.effectRecord(
      { id: "e1", name: "Slowed", img: "icons/s.webp", description: "−10 ft." },
      { combat: "c:3:2", sourceUuid: "Actor.bramm" }
    );
    expect(record).toEqual({
      id: "e1",
      name: "Slowed",
      img: "icons/s.webp",
      description: "−10 ft.",
      reverted: false,
      combat: "c:3:2",
      sourceUuid: "Actor.bramm"
    });
  });

  it("defaults the optional fields the way the push sites used to by hand", () => {
    const record = r.effectRecord({ id: "e1", name: "Slowed" }, undefined);
    expect(record.img).toBe(null);
    expect(record.description).toBe("");
    expect(record.combat).toBe(null);
    expect(record.sourceUuid).toBe(null);
  });
});

describe("joinDamageReceipt — merge, never overwrite the flag", () => {
  it("keeps the entries already there when a later application lands", () => {
    const flag = { targets: [{ uuid: "a", taken: 3 }] };
    r.joinDamageReceipt(flag, [{ uuid: "b", taken: 5 }]);
    expect(flag.targets.map(t => t.uuid)).toEqual(["a", "b"]);
  });

  it("FOLDS a later application into the uuid's live entry — one HP story per target per message", () => {
    // The 2026-09-28 review: a reroll's adjustment used to REPLACE the hit's entry, so ✕ Revert
    // undid the difference and forgot the hit. Now the hit's `prior` stays and the numbers sum.
    const flag = {
      targets: [
        {
          uuid: "a",
          name: "A",
          note: "the hit",
          prior: { value: 20, temp: 0, tempmax: 0 },
          delta: { value: -8, temp: 0 },
          taken: 8,
          parts: [{ type: "slashing", amount: 8 }],
          traits: [],
          reverted: false
        }
      ]
    };
    r.joinDamageReceipt(flag, [
      {
        uuid: "a",
        name: "A",
        note: "Savage Attacker — the reroll",
        prior: { value: 12, temp: 0, tempmax: 0 },
        delta: { value: -3, temp: 0 },
        taken: 3,
        parts: [{ type: "slashing", amount: 3 }],
        traits: [],
        reverted: false
      }
    ]);
    expect(flag.targets).toHaveLength(1);
    const [a] = flag.targets;
    expect(a.prior).toEqual({ value: 20, temp: 0, tempmax: 0 });
    expect(a.taken).toBe(11);
    expect(a.delta).toEqual({ value: -11, temp: 0 });
    expect(a.parts).toEqual([
      { type: "slashing", amount: 8 },
      { type: "slashing", amount: 3 }
    ]);
    expect(a.note).toBe("the hit · Savage Attacker — the reroll");
    expect(a.adjustments).toEqual([
      {
        note: "Savage Attacker — the reroll",
        taken: 3,
        delta: { value: -3, temp: 0 },
        prior: { value: 12, temp: 0, tempmax: 0 }
      }
    ]);
    // and the revert restores the HIT's prior — the whole story, not the difference
    expect(r.revertPlan(flag, "a").update["system.attributes.hp.value"]).toBe(20);
  });

  it("folds a lower reroll as a negative take — healing back is part of the same story", () => {
    const flag = {
      targets: [
        {
          uuid: "a",
          prior: { value: 20, temp: 0, tempmax: 0 },
          delta: { value: -8, temp: 0 },
          taken: 8,
          reverted: false
        }
      ]
    };
    r.joinDamageReceipt(flag, [
      {
        uuid: "a",
        prior: { value: 12, temp: 0, tempmax: 0 },
        delta: { value: 2, temp: 0 },
        taken: -2
      }
    ]);
    expect(flag.targets[0].taken).toBe(6);
    expect(flag.targets[0].delta).toEqual({ value: -6, temp: 0 });
  });

  it("REPLACES a reverted entry — what follows a human's ↩ is a fresh application", () => {
    const flag = { targets: [{ uuid: "a", taken: 3, reverted: true }] };
    r.joinDamageReceipt(flag, [{ uuid: "a", taken: 9, reverted: false }]);
    expect(flag.targets).toEqual([{ uuid: "a", taken: 9, reverted: false }]);
  });

  it("unions the trait reasons and keeps a null take null when neither side had one", () => {
    const flag = {
      targets: [
        {
          uuid: "a",
          traits: [{ type: "fire", outcome: "resistant" }],
          taken: null,
          reverted: false
        }
      ]
    };
    r.joinDamageReceipt(flag, [
      {
        uuid: "a",
        traits: [
          { type: "fire", outcome: "resistant" },
          { type: "cold", outcome: "immune" }
        ],
        taken: null
      }
    ]);
    expect(flag.targets[0].traits).toEqual([
      { type: "fire", outcome: "resistant" },
      { type: "cold", outcome: "immune" }
    ]);
    expect(flag.targets[0].taken).toBe(null);
  });

  it("seeds an empty flag", () => {
    const flag = {};
    r.joinDamageReceipt(flag, [{ uuid: "a" }]);
    expect(flag.targets).toEqual([{ uuid: "a" }]);
  });
});

describe("joinEffectReceipt — the effect side ACCUMULATES", () => {
  const entry = (uuid, effects) => ({ uuid, name: uuid, effects });

  it("adds a target, then adds to it", () => {
    const flag = { targets: [] };
    r.joinEffectReceipt(flag, entry("a", [{ id: "e1" }]));
    r.joinEffectReceipt(flag, entry("a", [{ id: "e2" }]));
    expect(flag.targets).toHaveLength(1);
    expect(flag.targets[0].effects.map(e => e.id)).toEqual(["e1", "e2"]);
  });

  it("dedupes by effect id — a re-run never stacks a chip twice", () => {
    const flag = { targets: [] };
    r.joinEffectReceipt(flag, entry("a", [{ id: "e1", name: "Slow" }]));
    r.joinEffectReceipt(flag, entry("a", [{ id: "e1", name: "Slow" }]));
    expect(flag.targets[0].effects).toHaveLength(1);
  });

  it("never overwrites an existing effect entry — the first record wins", () => {
    const flag = { targets: [] };
    r.joinEffectReceipt(flag, entry("a", [{ id: "e1", description: "the story" }]));
    r.joinEffectReceipt(flag, entry("a", [{ id: "e1", description: "" }]));
    expect(flag.targets[0].effects[0].description).toBe("the story");
  });

  it("carries the portrait, defaulting to null", () => {
    const flag = { targets: [] };
    r.joinEffectReceipt(flag, { uuid: "a", name: "A", img: "icons/a.webp", effects: [] });
    r.joinEffectReceipt(flag, { uuid: "b", name: "B", effects: [] });
    expect(flag.targets.map(t => t.img)).toEqual(["icons/a.webp", null]);
  });
});

describe("takenOf — what the target actually took", () => {
  it("prefers the recorded take", () => {
    expect(r.takenOf({ taken: 14, delta: { value: 0, temp: 0 } })).toBe(14);
  });

  it("honours a recorded ZERO instead of falling through to the delta", () => {
    expect(r.takenOf({ taken: 0, delta: { value: 0, temp: 7 } })).toBe(0);
  });

  it("falls back to the pool's movement for an entry written before `taken` existed", () => {
    expect(r.takenOf({ delta: { value: -8, temp: -2 } })).toBe(10);
  });

  it("tolerates an entry with neither — the tolerance the two old copies disagreed on", () => {
    // Negating a zero sum yields −0, which is the same number everywhere it is used (and what
    // `tempOnly`'s `taken === 0` test is written to catch); only Object.is tells them apart.
    expect(r.takenOf({})).toBe(-0);
    expect(r.takenOf({}) === 0).toBe(true);
    expect(r.takenOf(undefined)).toBe(-0);
  });
});

describe("receiptAmounts — the numbers, and the voice they speak in", () => {
  it("damage reads −N in the damage voice", () => {
    const a = r.receiptAmounts({
      prior: { value: 20, temp: 0 },
      delta: { value: -14, temp: 0 },
      taken: 14
    });
    expect(a.amountText).toBe("−14 HP");
    expect(a.healed).toBe(false);
    expect(a.tempOnly).toBe(false);
    expect(a.tempExtraText).toBe(null);
  });

  it('healing reads +N, never "−-25 HP" — healing arrives as a NEGATIVE take', () => {
    const a = r.receiptAmounts({
      prior: { value: 10, temp: 0 },
      delta: { value: 25, temp: 0 },
      taken: -25
    });
    expect(a.amountText).toBe("+25 HP");
    expect(a.healed).toBe(true);
  });

  it("a pure TEMP grant is a third kind — Bramm's Dash, not a −0 HP hit", () => {
    const a = r.receiptAmounts({
      prior: { value: 30, temp: 0 },
      delta: { value: 0, temp: 7 },
      taken: 0
    });
    expect(a.amountText).toBe("+7 temp HP");
    expect(a.tempOnly).toBe(true);
    expect(a.tempExtraText).toBe(null);
  });

  it("treats a zeroed calc's −0 as zero, like the source does", () => {
    const a = r.receiptAmounts({ prior: { value: 30 }, delta: { value: 0, temp: 7 }, taken: -0 });
    expect(a.tempOnly).toBe(true);
    expect(a.healed).toBe(false);
  });

  it("a MIXED entry keeps its own number and APPENDS the temp", () => {
    const a = r.receiptAmounts({
      prior: { value: 30, temp: 0 },
      delta: { value: -6, temp: 4 },
      taken: 6
    });
    expect(a.amountText).toBe("−6 HP");
    expect(a.tempExtraText).toBe(" · +4 temp");
  });

  it("the GM's pool counts temp in, and reads the same either side at 0 HP", () => {
    const full = r.receiptAmounts({
      prior: { value: 20, temp: 5 },
      delta: { value: -14, temp: -5 },
      taken: 14
    });
    expect(full.from).toBe(25);
    expect(full.after).toBe(6);

    const floored = r.receiptAmounts({
      prior: { value: 0, temp: 0 },
      delta: { value: 0, temp: 0 },
      taken: 14
    });
    expect(floored.amountText).toBe("−14 HP");
    expect(floored.from).toBe(0);
    expect(floored.after).toBe(0);
  });
});

describe("traitPhrase — the reason, in table English", () => {
  it("speaks the label it was handed, lowercased", () => {
    expect(r.traitPhrase({ type: "cold", outcome: "immune", label: "Cold" })).toBe(
      "immune to cold"
    );
    expect(r.traitPhrase({ type: "cold", outcome: "resistant", label: "Cold" })).toBe(
      "resists cold"
    );
    expect(r.traitPhrase({ type: "fire", outcome: "vulnerable", label: "Fire" })).toBe(
      "vulnerable to fire"
    );
    expect(r.traitPhrase({ type: "fire", outcome: "modified", label: "Fire" })).toBe(
      "fire modified by a trait"
    );
  });

  it("names no type at all for a threshold — the threshold is the whole story", () => {
    expect(r.traitPhrase({ type: "bludgeoning", outcome: "threshold", label: "Bludgeoning" })).toBe(
      "under its damage threshold"
    );
  });

  it("falls back to the raw type when the EDGE could not resolve a label", () => {
    expect(r.traitPhrase({ type: "psychic", outcome: "immune" })).toBe("immune to psychic");
    expect(r.traitPhrase({ outcome: "immune" })).toBe("immune to damage");
  });

  it("says nothing for an outcome it has no sentence for", () => {
    expect(r.traitPhrase({ type: "cold", outcome: null })).toBe("");
  });
});

describe("revertPlan — the inverse, and its idempotence", () => {
  const receipt = () => ({
    targets: [
      { uuid: "a", prior: { value: 20, temp: 5, tempmax: 2 }, reverted: false },
      { uuid: "b", prior: { value: 0, temp: 0, tempmax: 0 }, reverted: true }
    ]
  });

  it("restores all three stored HP fields, exactly as they were", () => {
    expect(r.revertPlan(receipt(), "a").update).toEqual({
      "system.attributes.hp.value": 20,
      "system.attributes.hp.temp": 5,
      "system.attributes.hp.tempmax": 2
    });
  });

  it("plans NOTHING for an entry already reverted — a human's ↩ is never re-fought", () => {
    expect(r.revertPlan(receipt(), "b")).toBe(null);
  });

  it("plans nothing for a target that has no entry, or no receipt at all", () => {
    expect(r.revertPlan(receipt(), "zzz")).toBe(null);
    expect(r.revertPlan(undefined, "a")).toBe(null);
    expect(r.revertPlan({}, "a")).toBe(null);
  });

  it("clears the defeated mark only when the revert raises the target back above 0", () => {
    expect(r.revertPlan(receipt(), "a").clearDefeated).toBe(true);
    const downed = { targets: [{ uuid: "c", prior: { value: 0, temp: 0, tempmax: 0 } }] };
    expect(r.revertPlan(downed, "c").clearDefeated).toBe(false);
  });

  it("hands back the LIVE entry, so marking it marks the flag the caller writes", () => {
    const flag = receipt();
    r.revertPlan(flag, "a").entry.reverted = true;
    expect(flag.targets[0].reverted).toBe(true);
    expect(r.revertPlan(flag, "a")).toBe(null);
  });
});

describe("revertableEffect — the effect twin", () => {
  const flag = () => ({
    targets: [
      { uuid: "a", effects: [{ id: "e1" }, { id: "e2", reverted: true }] },
      { uuid: "b", effects: [] }
    ]
  });

  it("finds the entry one click owns", () => {
    expect(r.revertableEffect(flag(), "a", "e1")).toEqual({ id: "e1" });
  });

  it("refuses one already reverted", () => {
    expect(r.revertableEffect(flag(), "a", "e2")).toBe(null);
  });

  it("refuses an unknown effect, an unknown target, or no flag at all", () => {
    expect(r.revertableEffect(flag(), "a", "nope")).toBe(null);
    expect(r.revertableEffect(flag(), "zzz", "e1")).toBe(null);
    expect(r.revertableEffect(undefined, "a", "e1")).toBe(null);
  });
});

describe("the Exhaustion a damage's update changed (House Rules' going-down rule) rides the receipt and its revert", () => {
  const prior = { value: 7, temp: 0, tempmax: 0, exhaustion: 0 };
  const after = { value: 0, temp: 0, tempmax: 0, exhaustion: 1 };
  it("exhaustionChange reads the two snapshots; an older receipt without the field changes nothing", () => {
    expect(r.exhaustionChange(prior, after)).toEqual({ prior: 0, after: 1 });
    expect(r.exhaustionChange(prior, { ...after, exhaustion: 0 })).toBeNull();
    expect(r.exhaustionChange({ value: 7, temp: 0 }, { value: 0, temp: 0 })).toBeNull();
    expect(r.exhaustionChange(null, after)).toBeNull();
  });
  it("the entry carries `exhaustion` only when it moved", () => {
    const entry = r.receiptEntry({
      uuid: "Actor.k",
      name: "Kartor",
      prior,
      after,
      calc: null,
      context: { combat: null, sourceUuid: null }
    });
    expect(entry.exhaustion).toEqual({ prior: 0, after: 1 });
    const still = r.receiptEntry({
      uuid: "Actor.k",
      name: "Kartor",
      prior,
      after: { ...after, exhaustion: 0 },
      calc: null,
      context: { combat: null, sourceUuid: null }
    });
    expect("exhaustion" in still).toBe(false);
  });
  it("the revert restores the recorded level with the Hit Points", () => {
    const entry = r.receiptEntry({
      uuid: "Actor.k",
      name: "Kartor",
      prior,
      after,
      calc: null,
      context: { combat: null, sourceUuid: null }
    });
    const plan = r.revertPlan({ targets: [entry] }, "Actor.k");
    expect(plan.update["system.attributes.exhaustion"]).toBe(0);
    expect(plan.update["system.attributes.hp.value"]).toBe(7);
  });
  it("the revert says the recorded level even when the damage did not move it: a revert back to 0 is never charged", () => {
    // A receipted heal on a creature at 0 (prior 0 HP, Exhaustion 2): its revert writes 0 HP again, and House Rules'
    // going-down rule charges any write landing on 0 unless that write sets Exhaustion itself.
    const healed = r.receiptEntry({
      uuid: "Actor.k",
      name: "Kartor",
      prior: { value: 0, temp: 0, tempmax: 0, exhaustion: 2 },
      after: { value: 9, temp: 0, tempmax: 0, exhaustion: 2 },
      calc: null,
      context: { combat: null, sourceUuid: null }
    });
    expect("exhaustion" in healed).toBe(false);
    const plan = r.revertPlan({ targets: [healed] }, "Actor.k");
    expect(plan.update["system.attributes.hp.value"]).toBe(0);
    expect(plan.update["system.attributes.exhaustion"]).toBe(2);
  });
  it("an older receipt without a recorded level restores HP alone", () => {
    const bare = r.receiptEntry({
      uuid: "Actor.k",
      name: "Kartor",
      prior: { value: 7, temp: 0, tempmax: 0 },
      after: { value: 0, temp: 0, tempmax: 0 },
      calc: null,
      context: { combat: null, sourceUuid: null }
    });
    expect(
      "system.attributes.exhaustion" in r.revertPlan({ targets: [bare] }, "Actor.k").update
    ).toBe(false);
  });
  it("the row's phrase, death at six", () => {
    expect(r.exhaustionPhrase({ exhaustion: { prior: 0, after: 1 } })).toBe("Exhaustion 0 → 1");
    expect(r.exhaustionPhrase({ exhaustion: { prior: 5, after: 6 } })).toBe(
      "Exhaustion 5 → 6 (death)"
    );
    expect(r.exhaustionPhrase({})).toBeNull();
  });
});
