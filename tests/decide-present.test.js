import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * DECISION-layer presentation (ARCHITECTURE.md §2). No Foundry stub on purpose — §2's layer
 * table names formatting as DECISION work, and none of this needs a document or the DOM.
 *
 * ⚠ The bar reads the wall clock, so the clock is faked here rather than the API. That is the
 * only impurity in the module and it is an input, not a dependency.
 */
/** @type {typeof import("../scripts/decide/present.js")} */
let p;
beforeAll(async () => {
  p = await import("../scripts/decide/present.js");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("popupKey — one decision, one key", () => {
  it("joins the message and the target", () => {
    expect(p.popupKey("msg1", "Actor.a")).toBe("msg1|Actor.a");
  });

  it("keeps two targets on one message apart, and one target across two messages", () => {
    expect(p.popupKey("m", "a")).not.toBe(p.popupKey("m", "b"));
    expect(p.popupKey("m1", "a")).not.toBe(p.popupKey("m2", "a"));
  });
});

describe("bfCard — the house card", () => {
  it("wears the tone's accent, and falls back to neutral for one it does not know", () => {
    expect(p.bfCard({ title: "T", tone: "good" })).toContain(p.TONE.good);
    expect(p.bfCard({ title: "T", tone: "nonsense" })).toContain(p.TONE.neutral);
    expect(p.bfCard({ title: "T" })).toContain(p.TONE.neutral);
  });

  it("renders no portrait at all when there is no image", () => {
    expect(p.bfCard({ title: "T" })).not.toContain("<img");
    expect(p.bfCard({ title: "T", img: "icons/a.webp" })).toContain('src="icons/a.webp"');
  });

  it("names the icon by the eyebrow, then the title — walk-5 (aa)", () => {
    expect(p.bfCard({ title: "T", eyebrow: "REACTION", img: "i.webp" })).toContain(
      'data-tooltip="REACTION"'
    );
    expect(p.bfCard({ title: "Shield", img: "i.webp" })).toContain('data-tooltip="Shield"');
  });

  it("strips tags and escapes quotes out of the TOOLTIP — that string lands in an attribute", () => {
    const html = p.bfCard({ title: '<b>Say "hi"</b>', img: "i.webp" });
    expect(html).toContain('data-tooltip="Say &quot;hi&quot;"');
    expect(html).toContain('alt="Say &quot;hi&quot;"');
  });

  it("escapes the eyebrow, title and subtitle as TEXT — they carry names a player can set", () => {
    // The body LINES stay trusted HTML fragments the machines compose; the heading stack does
    // not, because a token or actor name lands there (2026-09-26, the escaping review).
    const html = p.bfCard({
      eyebrow: "<i>E</i>",
      title: "<img src=x onerror=alert(1)>",
      subtitle: "a & b",
      lines: ["<b>line</b>"]
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;i&gt;E&lt;/i&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).toContain("<b>line</b>");
  });

  it("drops empty body lines instead of rendering blank rows", () => {
    const html = p.bfCard({ title: "T", lines: ["one", "", null, "two"] });
    expect(html.match(/margin-top:0\.2rem;/g)).toHaveLength(2);
  });

  it("omits the eyebrow and subtitle blocks entirely when unset", () => {
    const bare = p.bfCard({ title: "T" });
    expect(bare).not.toContain("text-transform:uppercase");
    expect(p.bfCard({ title: "T", eyebrow: "E" })).toContain("text-transform:uppercase");
  });
});

describe("ruleLine — the rule tick (DESIGN *Cards*)", () => {
  it("is a CLOSED fold under its tick, the caller's words quoted inside it — never text drawn open", () => {
    const html = p.ruleLine("You can use your reaction");
    expect(html.startsWith("<details data-bf-rule-fold")).toBe(true);
    expect(html).not.toContain("<details data-bf-rule-fold open");
    expect(html).toContain("the rule ▸");
    expect(html).toContain("<em>“You can use your reaction”</em></details>");
  });
});

describe("momentBarHTML — the countdown", () => {
  const at = ms => vi.setSystemTime(new Date(ms));

  it("draws nothing without both a deadline and a window — no hidden contract", () => {
    vi.useFakeTimers();
    at(1000);
    expect(p.momentBarHTML({ window: 20 })).toBe("");
    expect(p.momentBarHTML({ deadline: 21_000 })).toBe("");
    expect(p.momentBarHTML(undefined)).toBe("");
    expect(p.momentBarHTML({})).toBe("");
  });

  it("draws nothing once the deadline has passed, including exactly ON it", () => {
    vi.useFakeTimers();
    at(21_000);
    expect(p.momentBarHTML({ deadline: 21_000, window: 20 })).toBe("");
    at(21_001);
    expect(p.momentBarHTML({ deadline: 21_000, window: 20 })).toBe("");
  });

  it("writes the deadline and window onto the element, for the DOM half to snap to", () => {
    vi.useFakeTimers();
    at(1000);
    const html = p.momentBarHTML({ deadline: 21_000, window: 20 });
    expect(html).toContain('data-bf-deadline="21000"');
    expect(html).toContain('data-bf-window="20"');
  });

  it("names the action the buzzer will take, defaulting to answering", () => {
    vi.useFakeTimers();
    at(1000);
    expect(p.momentBarHTML({ deadline: 21_000, window: 20 })).toContain("20s to answer");
    expect(p.momentBarHTML({ deadline: 21_000, window: 20 }, "to roll")).toContain("20s to roll");
  });
});

describe("holdBarHTML — the status gate for WHOLE flags", () => {
  it("draws for a pending flag whose deadline is still ahead", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
    expect(p.holdBarHTML({ status: "pending", deadline: 21_000, window: 20 })).not.toBe("");
  });

  it("draws NOTHING for a resolved flag, even with time left on its clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000));
    expect(p.holdBarHTML({ status: "done", deadline: 21_000, window: 20 })).toBe("");
    expect(p.holdBarHTML({ deadline: 21_000, window: 20 })).toBe("");
    expect(p.holdBarHTML(undefined)).toBe("");
  });
});

describe("the staircase — finding (s)", () => {
  it("starts at the top-left slot for an empty pile", () => {
    expect(p.nextCascadeSlot([])).toBe(0);
  });

  it("takes the SMALLEST FREE slot, not the depth count — a closed popup's slot is free", () => {
    // The depth-count hole: with slots 0 and 2 live, counting popups gives 2 and lands the
    // newcomer exactly on top of a survivor.
    expect(p.nextCascadeSlot([0, 2])).toBe(1);
    expect(p.nextCascadeSlot([1, 2])).toBe(0);
    expect(p.nextCascadeSlot([0, 1, 2])).toBe(3);
  });

  it("steps one header down-right per slot, from the pile's anchor", () => {
    const anchor = { left: 100, top: 50 };
    expect(p.cascadePosition(anchor, 0)).toEqual({ left: 100, top: 50 });
    expect(p.cascadePosition(anchor, 1)).toEqual({
      left: 100 + p.CASCADE_STEP,
      top: 50 + p.CASCADE_STEP
    });
  });

  it("wraps a pathological pile back to the anchor rather than marching it off-screen", () => {
    const anchor = { left: 100, top: 50 };
    expect(p.cascadePosition(anchor, 8)).toEqual({ left: 100, top: 50 });
    expect(p.cascadePosition(anchor, 9)).toEqual(p.cascadePosition(anchor, 1));
  });

  it("fronts the pile back to front, so slot 0 ends on top — z-order is causal order", () => {
    const slots = new Map([
      ["m|first", 0],
      ["m|second", 1],
      ["m|third", 2]
    ]);
    expect(p.pileBackToFront(slots)).toEqual(["m|third", "m|second", "m|first"]);
  });

  it("walks the newcomer too — it belongs at the BACK of its class", () => {
    const slots = new Map([
      ["m|a", 0],
      ["m|b", 1]
    ]);
    expect(p.pileBackToFront(slots).at(-1)).toBe("m|a");
  });
});

describe("the rank — masteries, then the carrier offers, then the rest (user ruling 2026-09-13)", () => {
  it("ranks by the key's sub: the damage prompt 0, the mastery family 1, the listed offers 2, everything else 3", () => {
    expect(p.popupRank("m|damage")).toBe(0);
    expect(p.popupRank("m|mastery")).toBe(1);
    expect(p.popupRank("m|notice")).toBe(1);
    expect(p.popupRank("m|topple:Actor.abc")).toBe(1);
    expect(p.popupRank("m|bashoffer")).toBe(2);
    expect(p.popupRank("m|hew")).toBe(2);
    expect(p.popupRank("m|command")).toBe(2);
    expect(p.popupRank("m|riposte:Actor.abc")).toBe(2);
    expect(p.popupRank("m|hold")).toBe(3);
    expect(p.popupRank("m|save:Actor.abc")).toBe(3);
    expect(p.popupRank("m|rescue")).toBe(3);
  });

  it("ranks a key with no sub, and an unruled sub, LAST — a new moment is unranked until ruled", () => {
    expect(p.popupRank("bf-cascade-1")).toBe(3);
    expect(p.popupRank("m|somethingNew")).toBe(3);
    expect(p.popupRank(undefined)).toBe(3);
  });

  it("THE SECOND RULING: the damage prompt fronts everything, however late it arrives", () => {
    const slots = new Map([
      ["atk|bashoffer", 0],
      ["dmg|notice", 1],
      ["atk|damage", 2]
    ]);
    expect(p.pileBackToFront(slots)).toEqual(["atk|bashoffer", "dmg|notice", "atk|damage"]);
  });

  it("THE FINDING: the bash offer arrives first (the attack roll), the mastery second (the damage message) — the mastery still fronts", () => {
    const slots = new Map([
      ["atk|bashoffer", 0],
      ["dmg|mastery", 1]
    ]);
    expect(p.pileBackToFront(slots)).toEqual(["atk|bashoffer", "dmg|mastery"]);
  });

  it("event order still decides WITHIN a class, and the unranked go behind both", () => {
    const slots = new Map([
      ["a|hold", 0],
      ["b|bashoffer", 1],
      ["c|notice", 2],
      ["d|hew", 3],
      ["e|mastery", 4]
    ]);
    // back → front: the unranked, then the offers latest-first, then the masteries latest-first
    expect(p.pileBackToFront(slots)).toEqual([
      "a|hold",
      "d|hew",
      "b|bashoffer",
      "e|mastery",
      "c|notice"
    ]);
  });
});

/**
 * THE RESCUE VIEW — the merged window's row model.
 *
 * ⚠ These are plain objects on purpose and that IS the design: the whole point of putting the
 * row model in the DECISION layer is that every branch the merged window can be in — both
 * sources pending, one already spent, a fumble that keeps precision out, the reveal gate, a
 * check with no DC to fail — is decidable without a document, a dialog or a live Foundry. The
 * live suite then only has to prove that the real flags reach it.
 */
describe("rescueView — two machines, one window", () => {
  const read = flags => key => flags[key] ?? null;

  /** The §6 band, as flags: an attack of 10 that missed AC 18, offering both rescues. */
  const bothPending = {
    d20fold: {
      status: "pending",
      testKind: "attack",
      baseTotal: 10,
      deadline: 5000,
      window: 15,
      offers: [
        { kind: "bardic", name: "Inspired", label: "Bardic Inspiration", dieFormula: "1d8" }
      ],
      targets: [{ uuid: "a", name: "Training Dummy", ac: 18, margin: 8 }]
    },
    precision: {
      status: "pending",
      attackTotal: 10,
      deadline: 4000,
      window: 15,
      itemName: "Precision Attack",
      itemImg: "icons/skills/targeting/target.webp",
      dieFormula: "@scale.battle-master.superiority.die",
      targets: [{ uuid: "a", name: "Training Dummy", ac: 18, margin: 8 }]
    }
  };

  it("a SUCCEED row (Guarded Mind, 2026-09-27) is called by its benefit, quotes its row, says it rolls nothing", () => {
    const view = p.rescueView(
      read({
        d20fold: {
          status: "pending",
          testKind: "save",
          ability: "wis",
          baseTotal: 9,
          dc: 15,
          offers: [
            {
              kind: "succeed",
              name: "Mage Slayer",
              label: "Guarded Mind",
              dieFormula: null,
              cost: "one use, back after a Short or Long Rest · 1 left",
              rule: "Guarded Mind. If you fail an Intelligence, a Wisdom, or a Charisma saving throw, you can cause yourself to succeed instead."
            }
          ]
        }
      })
    );
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      kind: "succeed",
      action: "succeed",
      label: "Guarded Mind",
      icon: "fa-solid fa-shield-halved"
    });
    expect(view.quotes[0].detail).toBe(
      "The save succeeds instead — no roll — one use, back after a Short or Long Rest · 1 left."
    );
    expect(view.quotes[0].text.startsWith("Guarded Mind.")).toBe(true);
  });

  it("two TACTICAL rows on one check (Tactical Mind and Ambush, 2026-09-05) get distinct keys, actions and quotes", () => {
    const view = p.rescueView(
      read({
        d20fold: {
          status: "pending",
          testKind: "check",
          skill: "ste",
          baseTotal: 7,
          deadline: 5000,
          window: 15,
          offers: [
            { kind: "tactical", name: "Tactical Mind", label: "Tactical Mind", dieFormula: "1d10" },
            {
              kind: "tactical",
              name: "Ambush",
              label: "Ambush",
              dieFormula: "1d8",
              cost: "the superiority die is spent either way it lands",
              rule: "When you make a Dexterity (Stealth) check…"
            }
          ]
        }
      }),
      { reveal: true }
    );
    expect(view.rows.map(r => r.action)).toEqual(["tactical:Tactical Mind", "tactical:Ambush"]);
    expect(view.rows.map(r => r.key)).toEqual([
      "d20fold:tactical:Tactical Mind",
      "d20fold:tactical:Ambush"
    ]);
    expect(new Set(view.quotes.map(q => q.key)).size).toBe(2);
    // A lone one-row kind keeps its bare kind as the token — every suite and card that reads it stands.
    expect(
      p.rescueView(
        read({
          d20fold: {
            status: "pending",
            testKind: "check",
            baseTotal: 7,
            offers: [
              { kind: "bardic", name: "Inspired", label: "Bardic Inspiration", dieFormula: "1d8" }
            ]
          }
        })
      ).rows[0].action
    ).toBe("bardic");
  });

  it("both pending — one row per rescue, each carrying the machine's own answer token", () => {
    const view = p.rescueView(read(bothPending), { reveal: true });
    expect(view.rows.map(r => r.key)).toEqual(["d20fold:bardic", "precision:precision"]);
    expect(view.rows.map(r => r.action)).toEqual(["bardic", "use"]);
    expect(view.rows.every(r => r.spent === false)).toBe(true);
    // The label announces the FEATURE, never the lookup key the settings list finds it by.
    expect(view.rows[0].label).toBe("Bardic Inspiration");
    expect(view.rows[0].label).not.toBe("Inspired");
  });

  it("every row carries a glyph, and a document's art when the flag knows one", () => {
    const view = p.rescueView(read(bothPending), { reveal: true });
    expect(view.rows.every(r => typeof r.icon === "string" && r.icon.length)).toBe(true);
    // ⚠ heroic and bardic have no document ON THE FLAG — the art is an actor read, which is
    // EDGE work — so the row exposes the slot and the glyph carries the row until it is filled.
    expect(view.rows[0].img).toBe(null);
    expect(view.rows[1].img).toBe("icons/skills/targeting/target.webp");
  });

  it("the cost rides each row, because the three kinds do NOT agree about it", () => {
    const view = p.rescueView(read(bothPending), { reveal: true });
    expect(view.rows[0].cost).toMatch(/expended when rolled/);
    expect(view.rows[1].cost).toMatch(/spent either way/);
    expect(p.RESCUE_KINDS.tactical.cost).toMatch(/not expended/);
  });

  it("⚠ BOTH SOURCES DERIVE THE SAME HEADER — string-identical, and printed once", () => {
    const composed = { total: 10, added: 0, replaced: false };
    const fromFold = p.rescueHeaderLines(
      p.RESCUE_SOURCES[0].premise(bothPending.d20fold),
      composed,
      { reveal: true }
    );
    const fromPrecision = p.rescueHeaderLines(
      p.RESCUE_SOURCES[1].premise(bothPending.precision),
      composed,
      { reveal: true }
    );
    expect(fromFold).toEqual(fromPrecision);
    // …which is exactly what lets the view dedupe them without comparing numbers.
    expect(p.rescueView(read(bothPending), { composed, reveal: true }).headerLines).toEqual(
      fromFold
    );
  });

  it("initiative says its number and hands nothing to the DM (the Halfling walk, 2026-09-25)", () => {
    const lines = p.rescueHeaderLines(
      { testKind: "initiative", baseTotal: 13, targets: [] },
      null,
      { reveal: true }
    );
    expect(lines).toEqual(["Initiative: 13"]);
    expect(lines.join(" ")).not.toMatch(/DM/);
  });

  it("the header states the COMPOSED sum and the margin left to close", () => {
    const view = p.rescueView(read(bothPending), {
      composed: { total: 13, added: 3 },
      reveal: true
    });
    expect(view.headerLines).toEqual(["10 + 3 = 13 vs AC 18 — misses Training Dummy by 5"]);
  });

  it("a reroll reads with an arrow, because it REPLACED the d20 rather than adding to it", () => {
    const view = p.rescueView(read(bothPending), {
      composed: { total: 24, added: 0, replaced: true },
      reveal: true
    });
    expect(view.headerLines).toEqual(["10 → 24 vs AC 18 — hits Training Dummy"]);
  });

  it("reveal OFF hides what the roll must beat, never what the roll now totals", () => {
    const view = p.rescueView(read(bothPending), {
      composed: { total: 13, added: 3 },
      reveal: false
    });
    expect(view.headerLines).toEqual(["10 + 3 = 13"]);
    expect(view.headerLines.join(" ")).not.toMatch(/AC|misses/);
    // The rows are untouched by the gate — the player may always see what is theirs to spend.
    expect(view.rows).toHaveLength(2);
  });

  it("one spent — the spend greys in place, carrying the number it rolled", () => {
    const view = p.rescueView(
      read({
        d20fold: {
          ...bothPending.d20fold,
          status: "resolved",
          offers: [],
          spends: [{ kind: "bardic", name: "Inspired", label: "Bardic Inspiration", die: 3 }]
        },
        precision: bothPending.precision
      }),
      { composed: { total: 13, added: 3 }, reveal: true }
    );
    expect(view.rows.map(r => [r.key, r.spent, r.result])).toEqual([
      ["d20fold:bardic", true, 3],
      ["precision:precision", false, null]
    ]);
    // The survivor is still pressable, which is the whole reason the spend stays on screen.
    expect(view.rows[1].action).toBe("use");
  });

  it("a heroic spend records the total that REPLACED the roll, and says so", () => {
    const view = p.rescueView(
      read({
        d20fold: {
          ...bothPending.d20fold,
          status: "resolved",
          offers: [],
          spends: [{ kind: "heroic", label: "Heroic Inspiration", reroll: { total: 24 } }]
        }
      }),
      { reveal: true }
    );
    expect(view.rows[0]).toMatchObject({ spent: true, result: 24, replaced: true });
  });

  it("an OFFER is never rendered as a spend — the two lists mean different things", () => {
    const view = p.rescueView(
      read({
        d20fold: { ...bothPending.d20fold, spends: [] }
      }),
      { reveal: true }
    );
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0].spent).toBe(false);
    expect(view.rows[0].die).toBe("1d8");
  });

  it("⚠ the fumble case — precision never stamps on a natural 1, so only the fold has rows", () => {
    // maneuvers.js bails outright on `roll.isFumble` ("a natural 1 stands"), so the message
    // carries no precision flag at all. An absent source contributes nothing, silently.
    const view = p.rescueView(read({ d20fold: bothPending.d20fold }), { reveal: true });
    expect(view.rows.map(r => r.flag)).toEqual(["d20fold"]);
    expect(view.headerLines).toHaveLength(1);
  });

  it("a PASSED or expired precision leaves no row — there is nothing left to press", () => {
    for (const gone of [
      { status: "resolved", outcome: "passed" },
      { status: "resolved", outcome: "gone" },
      { status: "resolved", outcome: "passed (timer)", timedOut: true }
    ]) {
      const view = p.rescueView(read({ precision: { ...bothPending.precision, ...gone } }), {
        reveal: true
      });
      expect(view.rows).toEqual([]);
    }
  });

  it("a USED precision greys in place with the die it rolled", () => {
    const view = p.rescueView(
      read({
        precision: { ...bothPending.precision, status: "resolved", outcome: "used", die: 6 }
      }),
      { reveal: true }
    );
    expect(view.rows[0]).toMatchObject({ spent: true, result: 6, die: null });
  });

  it("⚠ the no-DC check — the arithmetic is stated and nothing is called a failure", () => {
    // The DC finding: dnd5e records no DC for a raw ability check, so there is no number to
    // test against and inventing one would be the module deciding a thing it cannot know.
    const view = p.rescueView(
      read({
        d20fold: {
          status: "pending",
          testKind: "check",
          baseTotal: 9,
          targets: [],
          offers: [
            { kind: "tactical", name: "Tactical Mind", label: "Tactical Mind", dieFormula: "1d10" }
          ]
        }
      }),
      { composed: { total: 14, added: 5 }, reveal: true }
    );
    expect(view.headerLines).toEqual(["9 + 5 = 14 — ask your DM whether that lands."]);
    expect(view.headerLines.join(" ")).not.toMatch(/DC \d|fail|short/);
    expect(view.rows[0].action).toBe("tactical:Tactical Mind"); // a tactical row answers by NAME (2026-09-05)
    // ⚠ And the window must not CALL it short either — nothing here knows that it is.
    expect(view.verdictKnown).toBe(false);
  });

  it("the check's hand-off to the DM is NOT gated by reveal — there is no number to hide", () => {
    const check = {
      d20fold: {
        status: "pending",
        testKind: "check",
        baseTotal: 9,
        targets: [],
        offers: [{ kind: "tactical", label: "Tactical Mind", dieFormula: "1d10" }]
      }
    };
    for (const reveal of [true, false]) {
      const view = p.rescueView(read(check), { composed: { total: 14, added: 5 }, reveal });
      expect(view.headerLines).toEqual(["9 + 5 = 14 — ask your DM whether that lands."]);
    }
  });

  it("an attack DOES know, so it keeps its verdict language", () => {
    expect(
      p.rescueView(read(bothPending), { composed: { total: 13, added: 3 }, reveal: true })
        .verdictKnown
    ).toBe(true);
  });

  it("a save DOES have a DC to name, because the ask owns it", () => {
    const view = p.rescueView(
      read({
        d20fold: {
          status: "pending",
          testKind: "save",
          baseTotal: 9,
          dc: 15,
          targets: [],
          offers: [{ kind: "bardic", label: "Bardic Inspiration", dieFormula: "1d8" }]
        }
      }),
      { composed: { total: 12, added: 3 }, reveal: true }
    );
    expect(view.headerLines).toEqual(["9 + 3 = 12 vs DC 15 — short by 3"]);
  });

  it("⚠ the EARLIEST clock wins — one bar may only promise the soonest loss", () => {
    expect(p.rescueView(read(bothPending), {}).earliestDeadline).toBe(4000);
    // A resolved source keeps its deadline field, and must not be allowed to set the bar.
    expect(
      p.rescueView(
        read({
          d20fold: bothPending.d20fold,
          precision: { ...bothPending.precision, status: "resolved", outcome: "used", die: 6 }
        }),
        {}
      ).earliestDeadline
    ).toBe(5000);
    expect(p.rescueView(read({}), {}).earliestDeadline).toBe(null);
  });

  it("one quote per row, the first is the default, and none of them is invented", () => {
    const view = p.rescueView(read(bothPending), { reveal: true });
    expect(view.quotes.map(q => q.key)).toEqual(["d20fold:bardic", "precision:precision"]);
    expect(view.quotes[0].text).toBe(p.RESCUE_KINDS.bardic.rule);
    expect(view.quotes[1].text).toBe(p.RESCUE_KINDS.precision.rule);
    expect(view.quotes.every(q => q.label && q.text)).toBe(true);
  });

  it('an offer from an older build degrades to the right WORDS, not to "undefined"', () => {
    // A deploy does not rewrite flags already in the chat log, and a v1.23.0 offer carries no
    // `label`. This printed "undefined — reroll the d20" on a real card once.
    expect(p.rescueLabel({ kind: "heroic" })).toBe("Heroic Inspiration");
    expect(p.rescueLabel({ name: "Some Homebrew Thing" })).toBe("Some Homebrew Thing");
    expect(p.rescueLabel(null)).toBe("a fold");
    expect(p.rescueLabel({ kind: "heroic", label: "House Rule Name" })).toBe("House Rule Name");
  });

  it("no rescue flags at all is an empty view, not a crash", () => {
    expect(p.rescueView(read({}), {})).toEqual({
      headerLines: [],
      rows: [],
      quotes: [],
      earliestDeadline: null,
      clockWindow: null,
      // ⚠ No sources means no PREMISE, so there is nothing left failing — which is the safe
      // answer either way: the still-short line is gated on a spend, and a view with no
      // sources has no spends to report.
      stillFailing: false,
      // ⚠ …and no PREMISE means no verdict to know either. Both flags answer "nothing to say"
      // on an absence, which is what keeps the window silent rather than guessing.
      verdictKnown: false
    });
  });
});

describe("situationalBonusHTML / modeButtons — one shape for a popup that stands in for a roll dialog", () => {
  it("the bonus row carries the name the caller reads back", async () => {
    const m = await import("../scripts/decide/present.js");
    const html = m.situationalBonusHTML("bf-x-bonus");
    expect(html).toContain('name="bf-x-bonus"');
    expect(html).toContain("Situational Bonus");
  });
  it("the three mode buttons press the caller's answer, and only the default is marked", async () => {
    const m = await import("../scripts/decide/present.js");
    const pressed = [];
    const buttons = m.modeButtons(mode => pressed.push(mode), "normal");
    expect(buttons.map(b => b.action)).toEqual(["advantage", "normal", "disadvantage"]);
    expect(buttons.map(b => b.default)).toEqual([false, true, false]);
    buttons[0].callback();
    buttons[2].callback();
    expect(pressed).toEqual(["advantage", "disadvantage"]);
  });
  it("no default flagged when none is asked for — and the gate passes its NET, because DialogV2 defaults the first button otherwise", async () => {
    const m = await import("../scripts/decide/present.js");
    expect(m.modeButtons(() => {}).every(b => b.default === false)).toBe(true);
    expect(m.modeButtons(() => {}, "disadvantage").map(b => b.default)).toEqual([
      false,
      false,
      true
    ]);
  });
});

describe("modeTagHTML and the palette — one meaning per hue (user ruling 2026-09-02)", () => {
  it("Advantage is green, Disadvantage red with white text, Normal grey, Listed the grey outline", () => {
    expect(p.modeTagHTML("advantage")).toContain(`background:${p.TONE.good}`);
    expect(p.modeTagHTML("disadvantage")).toContain(`background:${p.TONE.bad}`);
    expect(p.modeTagHTML("disadvantage")).toContain("color:#fff");
    expect(p.modeTagHTML("normal")).toContain(`background:${p.TONE.neutral}`);
    expect(p.modeTagHTML("listed")).toContain("background:transparent");
    expect(p.modeTagHTML("listed")).toContain(`border:1px solid ${p.TONE.neutral}`);
    for (const m of ["advantage", "disadvantage", "normal", "listed"]) {
      expect(p.modeTagHTML(m)).toContain(`data-bf-mode="${m}"`);
    }
    expect(p.modeTagHTML("listed")).toContain(">Listed</span>");
  });
  it("the tones are five and distinct — pending is orange, crit is yellow, and they no longer match", () => {
    expect(Object.keys(p.TONE).sort()).toEqual(["bad", "crit", "good", "neutral", "pending"]);
    expect(new Set(Object.values(p.TONE)).size).toBe(5);
    expect(p.TONE.pending).not.toBe(p.TONE.crit);
    expect(p.modeTone("advantage")).toBe(p.TONE.good);
    expect(p.modeTone("disadvantage")).toBe(p.TONE.bad);
    expect(p.modeTone("normal")).toBe(p.TONE.neutral);
    expect(p.modeTone(null)).toBe(p.TONE.neutral);
  });
});

describe("reminderSectionHTML / reminderFieldsetHTML — the header line and the boxes", () => {
  const view = {
    head: { title: "3 Modifiers — Net", net: "normal", why: "they cancel" },
    boxes: [
      { label: "Gruk — Sapped", bend: "disadvantage", rule: "sap rule" },
      { label: "Gruk Vexed Tavin", bend: "advantage", rule: "vex rule" },
      { label: "Prone — distance unknown", bend: null, rule: "" }
    ]
  };
  it("is ONE fieldset the dialog can find, with the same legend shape as the dialog's own, folded to its header line", () => {
    const html = p.reminderFieldsetHTML(view);
    expect(html.trim().startsWith("<fieldset data-bf-reminder>")).toBe(true);
    expect(html).toContain("<legend>Before you roll</legend>");
    expect(html.match(/<fieldset/g)).toHaveLength(1);
    expect(html).toContain("<details data-bf-reminder-details >");
    expect(html).toContain("<summary");
    expect(p.reminderFieldsetHTML(view, { open: true })).toContain(
      "<details data-bf-reminder-details open>"
    );
  });
  it("opens with the header line — the count and the net as a tag, NO tooltip (it covered the boxes) — and NO net block", () => {
    const html = p.reminderSectionHTML(view);
    expect(html).toContain("<span>3 Modifiers — Net</span>");
    expect(html).toContain("data-bf-reminder-head");
    expect(html).not.toContain("data-tooltip");
    expect(html).not.toContain("they cancel");
    expect(html).toContain(p.modeTagHTML("normal"));
    expect(html).not.toContain("Net:");
    expect(html.indexOf("3 Modifiers")).toBeLessThan(html.indexOf("Gruk — Sapped"));
  });
  it("draws a box per source, wearing the bend's tone and its tag, and the rule as the verbatim quote", () => {
    const html = p.reminderSectionHTML(view);
    expect(html).toContain(`border-left:3px solid ${p.TONE.bad}`);
    expect(html).toContain(`border-left:3px solid ${p.TONE.good}`);
    expect(html).toContain(`border-left:3px solid ${p.TONE.neutral}`);
    expect(html).toContain(p.modeTagHTML("disadvantage"));
    expect(html).toContain(p.modeTagHTML("advantage"));
    expect(html).toContain(p.modeTagHTML("listed"));
    expect(html).toContain(p.ruleLine("sap rule"));
    expect(html).not.toContain("<em>“”</em>");
  });
  it("escapes the header and the legend — they land in markup from the table's own words", () => {
    const html = p.reminderFieldsetHTML({
      head: { title: "1 <Modifier> — Net", net: "normal", why: 'a "why"' },
      boxes: [{ label: "x", bend: null, rule: "" }],
      legend: "A & B"
    });
    expect(html).toContain("1 &lt;Modifier&gt; — Net");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("data-tooltip");
  });
});

describe("sneakBoxHTML — the choice beside the roll (user rulings 2026-09-02)", () => {
  const view = {
    dice: "7d6",
    rule: "Once per turn, you can deal an extra 1d6 damage"
  };
  it("is the name and the dice, the tick, and the rule FOLDED closed by default — nothing else", () => {
    const html = p.sneakBoxHTML({ ...view, checked: true });
    expect(html).toContain('name="bf-sneak"');
    expect(html).toContain("checked");
    expect(html).toContain("Sneak Attack — 7d6</div>");
    expect(html).not.toContain("Read for you");
    expect(html).not.toContain("once per turn</div>");
    expect(html).toContain("<details data-bf-rule");
    expect(html).not.toContain("<details data-bf-rule open");
    expect(html).toContain("<em>“Once per turn, you can deal an extra 1d6 damage”</em></details>");
  });
  it("used this turn: no tick, the reason on its own full-width line", () => {
    const html = p.sneakBoxHTML({
      ...view,
      used: "used this turn — the chit clears at the end of the turn"
    });
    expect(html).not.toContain('name="bf-sneak"');
    expect(html).toContain(
      'grid-column:1 / -1;font-size:var(--font-size-11,11px);line-height:1.45;opacity:0.85;">used this turn'
    );
  });
});

describe("buyBoxHTML — a buy's box, and why it is off", () => {
  const rule = {
    item: "Familiar Friend",
    uuid: "Compendium.dnd-arcana-unleashed.feats.Item.aunFamiliarFri4q",
    benefit: "Helpful Friend"
  };
  it("offered: the pool and a tick", () => {
    const html = p.buyBoxHTML({ name: "Familiar Friend", point: "use", left: 2, rule });
    expect(html).toContain("Familiar Friend — 1 use · 2 left");
    expect(html).toContain('name="bf-buy"');
  });
  it("an empty pool greys it with the pool's words; `off` greys it with its own reason, the pool still shown", () => {
    const empty = p.buyBoxHTML({ name: "Familiar Friend", point: "use", left: 0, rule });
    expect(empty).not.toContain('name="bf-buy"');
    expect(empty).toContain("no uses left");
    const far = p.buyBoxHTML({
      name: "Familiar Friend",
      point: "use",
      left: 2,
      rule,
      off: "your familiar is 10 ft away — within 5 feet only"
    });
    expect(far).not.toContain('name="bf-buy"');
    expect(far).toContain("your familiar is 10 ft away — within 5 feet only");
    expect(far).toContain("2 left");
    expect(far).not.toContain("no uses left");
  });
});

describe("cunningMenuHTML — the rules fold like every other box (user walk 2026-09-02)", () => {
  it("each row is the name, the cost and a closed <details> — nothing else", () => {
    const html = p.cunningMenuHTML({
      dice: "7d6",
      max: 2,
      dc: 17,
      rows: [
        {
          key: "trip",
          label: "Trip",
          cost: 1,
          affordable: true,
          rule: "Trip (Cost: 1d6). If the target is Large or smaller…",
          caveat: "the target must be Large or smaller"
        },
        {
          key: "withdraw",
          label: "Withdraw",
          cost: 1,
          affordable: true,
          line: true,
          rule: "Withdraw (Cost: 1d6). Immediately after the attack…"
        }
      ]
    });
    expect(html.match(/<details data-bf-rule/g)).toHaveLength(2);
    expect(html).not.toContain("<details data-bf-rule open");
    // Name, cost, the folded rule — nothing else (user walk 2026-09-02: the caveat line and
    // "a line on the card" read as noise beside the fold).
    expect(html).not.toContain("the target must be Large or smaller");
    expect(html).not.toContain("a line on the card");
  });
});

describe("riderMenuHTML — the same fold rule (user, 2026-09-05: no text above the rule tick)", () => {
  it("a row is the tick, the name and the dice, then the closed rule — a caveat is NOT rendered", () => {
    const html = p.riderMenuHTML([
      {
        key: "lunge",
        label: "Lunging Attack",
        formula: "1d8",
        type: "bludgeoning",
        why: "the chip",
        rule: "Lunging Attack. As a Bonus Action…",
        caveat: "if you moved at least 5 feet in a straight line just before the hit"
      }
    ]);
    expect(html).toContain("Lunging Attack — 1d8 bludgeoning");
    expect(html.match(/<details data-bf-rule/g)).toHaveLength(1);
    expect(html).not.toContain("<details data-bf-rule open");
    expect(html).not.toContain("if you moved at least 5 feet");
    expect(html).not.toContain("the chip");
  });
});

describe("modeTagHTML — the save gate's fourth answer", () => {
  it("Fails is red with white text, like Disadvantage — bad for the roller", () => {
    const html = p.modeTagHTML("fails");
    expect(html).toContain(`background:${p.TONE.bad}`);
    expect(html).toContain("#fff");
    expect(html).toContain(">Fails<");
    expect(p.modeTone("fails")).toBe(p.TONE.bad);
  });
});

describe("the rule from the book — a pointer in the markup", () => {
  it("ruleLine folds a pointer for rule-text.js to fill, and quotes a string", async () => {
    const p = await import("../scripts/decide/present.js");
    const html = p.ruleLine({
      item: "Mage Slayer",
      uuid: "Compendium.x.y.Item.z",
      benefit: "Guarded Mind"
    });
    expect(html).toContain("<details data-bf-rule-fold");
    expect(html).toContain('data-bf-rule="');
    expect(html).toContain("&quot;benefit&quot;:&quot;Guarded Mind&quot;");
    expect(html).not.toContain("“");
    expect(p.ruleLine("Written before pointers.")).toContain("<em>“Written before pointers.”</em>");
    expect(p.ruleLine(null)).toBe("");
  });

  it("a fold around a pointer is marked, so a pointer that reads as nothing takes the fold with it", async () => {
    const p = await import("../scripts/decide/present.js");
    const html = p.foldedRuleHTML({ page: "condition", key: "prone", benefit: "Attacks Affected" });
    expect(html).toContain("<details data-bf-rule-fold");
    expect(html).toContain("data-bf-rule=");
    expect(html).toContain("the rule ▸");
  });
});

describe("scrubRule — a string rule cut to what a reader needs", () => {
  it("keeps the first paragraph of rule and drops the sheet's unfilled references", async () => {
    const p = await import("../scripts/decide/present.js");
    expect(
      p.scrubRule(
        "Prerequisite: Level 2+ Warlock\n\nYou push the creature 10 feet.\n\nRepeatable. Again."
      )
    ).toBe("You push the creature 10 feet.");
    expect(p.scrubRule("Your die starts as a d6 (currently, @scale.bard.inspiration.die).")).toBe(
      "Your die starts as a d6."
    );
    expect(p.ruleLine("A d6 (currently, @scale.bard.inspiration.die).")).toContain(
      "<em>“A d6.”</em>"
    );
  });
});

describe("rosterSide — the combat line's side tag", () => {
  it("reads the token's disposition, not the actor type", () => {
    expect(p.rosterSide({ isPC: false, disposition: 1 })).toBe("");
    expect(p.rosterSide({ isPC: true, disposition: 1 })).toBe("");
    expect(p.rosterSide({ isPC: false, disposition: 0 })).toBe(" (neutral)");
    expect(p.rosterSide({ isPC: false, disposition: -1 })).toBe(" (foe)");
    expect(p.rosterSide({ isPC: false, disposition: -2 })).toBe(" (foe)");
  });
  it("an older roster with no disposition falls back to the actor type", () => {
    expect(p.rosterSide({ isPC: true })).toBe("");
    expect(p.rosterSide({ isPC: false })).toBe(" (foe)");
    expect(p.rosterSide({ isPC: false, disposition: null })).toBe(" (foe)");
    expect(p.rosterSide({ isPC: true, disposition: undefined })).toBe("");
  });
  it("a disposition stored as text reads as its number; junk falls back", () => {
    expect(p.rosterSide({ isPC: false, disposition: "1" })).toBe("");
    expect(p.rosterSide({ isPC: false, disposition: "-1" })).toBe(" (foe)");
    expect(p.rosterSide({ isPC: true, disposition: "x" })).toBe("");
    expect(p.rosterSide()).toBe(" (foe)");
  });
});
