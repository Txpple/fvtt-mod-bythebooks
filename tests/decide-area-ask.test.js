import { describe, it, expect } from "vitest";
import {
  areaChoiceLine,
  askDefaults,
  askOutcome,
  askTicks,
  askWords,
  choiceCapFrom,
  choiceNeedsAsk,
  choiceRuleFrom,
  chosenByDefault
} from "../scripts/decide/area-ask.js";
import { CHOSEN_AREAS, REPEAT_SAVES, chosenAreaListed } from "../scripts/decide/registry.js";
import { putsToSleep } from "../scripts/decide/demand.js";

// The ask at the area's own arithmetic (2026-09-24, the cut out of metamagic.js). The defaults,
// the readers of a spell's text and the merged mark are covered in decide-metamagic.test.js,
// where they were born; this file pins what the machine reads off an answer.

const G = { uuid: "Actor.aster", name: "Aster", disposition: 1, party: true };
const ally = { uuid: "Actor.dorian", name: "Dorian", disposition: 1, party: true };
const foe = { uuid: "Actor.mirefang", name: "Mirefang", disposition: -1 };
const croc = { uuid: "Actor.croc", name: "Giant Crocodile", disposition: -1 };
const caster = { casterUuid: G.uuid, casterDisposition: 1, casterName: "Aster" };

describe("the outcome of an answer", () => {
  it("Careful: the ticked are protected, up to the cap, and leave the demand", () => {
    const ask = {
      kind: "careful",
      feature: "Careful Spell",
      cap: 1,
      candidates: [G, ally, foe],
      ...caster
    };
    const out = askOutcome(ask, [ally.uuid, G.uuid]);
    expect(out.protectedList.map(c => c.name)).toEqual(["Dorian"]);
    expect(out.mark).toBeNull();
    expect(out.areaChoice).toBeNull();
    expect(out.stays(ally.uuid)).toBe(false);
    expect(out.stays(foe.uuid)).toBe(true);
  });
  it("Careful on the clock: the defaults — the caster and the party first", () => {
    const ask = {
      kind: "careful",
      feature: "Careful Spell",
      cap: 2,
      candidates: [foe, ally, G],
      ...caster
    };
    const out = askOutcome(ask, null, { timedOut: true });
    expect(out.protectedList.map(c => c.name)).toEqual(["Aster", "Dorian"]);
    expect(out.timedOut).toBe(true);
  });
  it("Heightened: one mark, the first tick", () => {
    const ask = {
      kind: "heightened",
      feature: "Heightened Spell",
      candidates: [ally, foe, croc],
      ...caster
    };
    expect(askOutcome(ask, [croc.uuid]).mark?.name).toBe("Giant Crocodile");
    expect(askOutcome(ask, null).mark?.name).toBe("Mirefang");
    expect(askOutcome(ask, [croc.uuid]).stays(ally.uuid)).toBe(true);
  });
  it("a chosen area: the ticked up to the spell's number are the choice, the rest are left, and only the chosen keep their save", () => {
    const ask = {
      kind: "choose",
      feature: "Slow",
      spell: "Slow",
      cap: 1,
      candidates: [ally, foe, croc],
      ...caster
    };
    const out = askOutcome(ask, [foe.uuid, croc.uuid]);
    expect(out.areaChoice.chosen.map(c => c.name)).toEqual(["Mirefang"]);
    expect(out.areaChoice.left.map(c => c.name)).toEqual(["Dorian", "Giant Crocodile"]);
    expect(out.areaChoice.asked).toBe(true);
    expect(out.stays(foe.uuid)).toBe(true);
    expect(out.stays(croc.uuid)).toBe(false);
  });
  it("a chosen area cast with Heightened carries the mark among the chosen", () => {
    const ask = {
      kind: "choose",
      feature: "Slow",
      spell: "Slow",
      cap: 6,
      candidates: [ally, foe, croc],
      ...caster,
      heightened: { feature: "Heightened Spell", rule: "…" }
    };
    expect(askOutcome(ask, [foe.uuid, croc.uuid], { mark: croc.uuid }).mark?.name).toBe(
      "Giant Crocodile"
    );
    expect(askOutcome(ask, [foe.uuid], { mark: croc.uuid }).mark?.name).toBe("Mirefang");
  });
});

describe("the words and the shape", () => {
  it("ticks for Careful and a chosen area, a radio for Heightened", () => {
    expect(askTicks({ kind: "careful" })).toBe(true);
    expect(askTicks({ kind: "choose" })).toBe(true);
    expect(askTicks({ kind: "heightened" })).toBe(false);
  });
  it("each kind wears its own words", () => {
    const careful = askWords({
      kind: "careful",
      feature: "Careful Spell",
      cap: 2,
      candidates: [ally, foe]
    });
    expect(careful.title).toBe("Who does the spell spare? Up to 2.");
    expect(careful.eyebrow).toBe("Metamagic — Careful Spell");
    const choose = askWords({
      kind: "choose",
      feature: "Slow",
      spell: "Slow",
      cap: 6,
      candidates: [ally, foe, croc],
      heightened: { feature: "Heightened Spell" }
    });
    expect(choose.title).toBe("Who does Slow affect? Up to 6.");
    expect(choose.subtitle).toBe(
      "3 in the area · Heightened Spell: one of them saves at Disadvantage"
    );
    expect(choose.carrierSubtitle).toBe("Heightened Spell rides it — the card follows the answer");
    const heightened = askWords({
      kind: "heightened",
      feature: "Heightened Spell",
      spell: "Fireball",
      candidates: [foe]
    });
    expect(heightened.question).toBe("who saves at Disadvantage?");
    expect(heightened.carrierSubtitle).toBe("Fireball — the card follows the answer");
  });
});

/* ---------------------------------------------------------------------------------------------
 * SLEEP IS A CHOSEN AREA (2026-10-21, Echoes of Halruaa's session of 2026-10-20: Tychon's Sleep
 * over two grimlocks and the intellect devourer, Cecil down beside them — "it's of my choice?").
 * The 2024 spell asks the caster who the Sphere affects the way Slow's Cube does; only its number
 * differs (none). What the chosen then meet is the spell's own: the Sleeping effect on a failed
 * save, the turn-end repeat, Unconscious pressed on the second failure, the save that cannot fail.
 * ------------------------------------------------------------------------------------------- */

describe("Sleep — each creature of your choice in a 5-foot-radius Sphere", () => {
  // The 2024 PHB pack's own description (dnd-players-handbook, phbsplSleep00000).
  const SLEEP_TEXT =
    "<p>Each creature of your choice in a 5-foot-radius Sphere centered on a point within range must succeed on a Wisdom saving throw or have the &amp;Reference[incapacitated apply=false] condition until the end of its next turn, at which point it must repeat the save. If the target fails the second save, the target has the &amp;Reference[unconscious] condition for the duration. The spell ends on a target if it takes damage or someone within 5 feet of it takes an action to shake it out of the spell’s effect.</p><p>Creatures that don’t sleep, such as elves, or that have Immunity to the Exhaustion condition automatically succeed on saves against this spell.</p>";
  const tychon = { uuid: "Actor.tychon", name: "Tychon", disposition: 1, party: true };
  // At 0 Hit Points and still a candidate: a dying PC is demanded (decide/eligible.js `isDeadForSaves`).
  const cecil = { uuid: "Actor.cecil", name: "Cecil", disposition: 1, party: true };
  const grimA = { uuid: "Scene.s.Token.a.Actor.grimlock", name: "Grimlock", disposition: -1 };
  const grimB = { uuid: "Scene.s.Token.b.Actor.grimlock", name: "Grimlock", disposition: -1 };
  const devourer = {
    uuid: "Scene.s.Token.c.Actor.devourer",
    name: "Intellect Devourer",
    disposition: -1
  };
  const facts = { casterUuid: tychon.uuid, casterDisposition: 1 };
  const sphere = [grimA, grimB, devourer, cecil];
  const ask = {
    kind: "choose",
    feature: "Sleep",
    spell: "Sleep",
    cap: choiceCapFrom(SLEEP_TEXT),
    rule: choiceRuleFrom(SLEEP_TEXT),
    candidates: sphere,
    ...facts,
    casterName: "Tychon"
  };

  it("is on the Chosen Areas list by name and by identifier — the pack's choose flag is off", () => {
    expect(Object.keys(CHOSEN_AREAS)).toContain("Sleep");
    expect(chosenAreaListed("Sleep")).toBe(true);
    expect(
      chosenAreaListed({ name: "Sleep", type: "spell", system: { identifier: "sleep" } })
    ).toBe(true);
    expect(
      chosenAreaListed({ name: "Schlaf", type: "spell", system: { identifier: "sleep" } })
    ).toBe(true);
    expect(
      chosenAreaListed({
        name: "Sleet Storm",
        type: "spell",
        system: { identifier: "sleet-storm" }
      })
    ).toBe(false);
  });

  it("its text sets no number and its sentence is the popup's quote", () => {
    expect(ask.cap).toBeNull();
    expect(ask.rule).toMatch(
      /^Each creature of your choice in a 5-foot-radius Sphere centered on a point within range/
    );
  });

  it("a friend in the Sphere is a choice: the caster is asked, the hostiles ticked, every one of them", () => {
    expect(choiceNeedsAsk({ candidates: sphere, ...facts, cap: ask.cap })).toBe(true);
    expect(askDefaults(ask).map(c => c.name)).toEqual([
      "Grimlock",
      "Grimlock",
      "Intellect Devourer"
    ]);
    const words = askWords(ask);
    expect(words.title).toBe("Who does Sleep affect?");
    expect(words.eyebrow).toBe("Sleep — creatures of your choice");
    expect(words.subtitle).toBe("4 in the area — a tick pings the token");
    expect(askTicks(ask)).toBe(true);
  });

  it("the caster is never chosen, even standing in its own Sphere", () => {
    const withCaster = [tychon, ...sphere];
    expect(
      chosenByDefault({ candidates: withCaster, ...facts, cap: null }).map(c => c.uuid)
    ).not.toContain(tychon.uuid);
    expect(choiceNeedsAsk({ candidates: [tychon, grimA], ...facts, cap: null })).toBe(false);
  });

  it("only the chosen keep the save: the unticked hostile and the friend leave the demand untouched", () => {
    const out = askOutcome(ask, [devourer.uuid, grimA.uuid]);
    expect(out.areaChoice.chosen.map(c => c.uuid)).toEqual([devourer.uuid, grimA.uuid]);
    expect(out.areaChoice.left.map(c => c.uuid)).toEqual([grimB.uuid, cecil.uuid]);
    expect(out.areaChoice).toMatchObject({ spell: "Sleep", asked: true, cap: null });
    expect(out.stays(devourer.uuid)).toBe(true);
    expect(out.stays(grimA.uuid)).toBe(true);
    expect(out.stays(grimB.uuid)).toBe(false);
    expect(out.stays(cecil.uuid)).toBe(false);
    expect(out.protectedList).toEqual([]);
    expect(out.mark).toBeNull();
    expect(areaChoiceLine(out.areaChoice)).toBe(
      "Sleep — chosen: Intellect Devourer, Grimlock · not chosen: Grimlock, Cecil"
    );
  });

  it("the caster may choose the friend too — the choice is the caster's, not the side's", () => {
    const out = askOutcome(ask, [grimA.uuid, cecil.uuid]);
    expect(out.stays(cecil.uuid)).toBe(true);
    expect(out.areaChoice.left.map(c => c.uuid)).toEqual([grimB.uuid, devourer.uuid]);
  });

  it("no number: the clock keeps every hostile, however many, and never the friend", () => {
    const crowd = Array.from({ length: 9 }, (_, i) => ({
      uuid: `Actor.goblin${i}`,
      name: `Goblin ${i}`,
      disposition: -1
    }));
    const out = askOutcome({ ...ask, candidates: [...crowd, cecil] }, null, { timedOut: true });
    expect(out.areaChoice.chosen).toHaveLength(9);
    expect(out.areaChoice.timedOut).toBe(true);
    expect(out.stays(cecil.uuid)).toBe(false);
  });

  it("nobody chosen: the demand keeps no one (the answer's write closes it)", () => {
    const out = askOutcome(ask, []);
    expect(out.areaChoice.chosen).toEqual([]);
    expect(sphere.some(c => out.stays(c.uuid))).toBe(false);
    expect(areaChoiceLine(out.areaChoice)).toBe(
      "Sleep — nobody chosen · not chosen: Grimlock, Grimlock, Intellect Devourer, Cecil"
    );
  });

  it("a Sphere of hostiles alone asks nobody: every hostile is the choice (the 2026-09-24 ruling)", () => {
    const hostiles = [grimA, grimB, devourer];
    expect(choiceNeedsAsk({ candidates: hostiles, ...facts, cap: null })).toBe(false);
    expect(chosenByDefault({ candidates: hostiles, ...facts, cap: null }).map(c => c.name)).toEqual(
      ["Grimlock", "Grimlock", "Intellect Devourer"]
    );
  });

  it("the chosen meet the spell's own consequences: a demand that sleeps, the Sleeping repeat", () => {
    expect(putsToSleep({ itemName: "Sleep", effectNames: ["Sleeping"] })).toBe(true);
    expect(REPEAT_SAVES.Sleep).toMatchObject({
      effect: "Sleeping",
      count: { saves: 1, fails: 1, press: "unconscious" },
      endsOn: ["damaged"],
      lifts: true
    });
  });
});
