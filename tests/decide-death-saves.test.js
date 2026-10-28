import { describe, expect, it } from "vitest";
import { expectPointer } from "./rule-pointer.js";
import {
  DEATH_SAVE_RULE,
  THIRD,
  damageAtZero,
  damageAtZeroWords,
  deathSaveAsk,
  deathSaveCardLine,
  deathSaveDue,
  deathSaveFoldWanted,
  deathSaveTally,
  foldedDeathSave,
  deathSaveFloat,
  deathSaveLine,
  deathSaveOwed,
  deathSaveResult,
  deathSaveToast,
  makesDeathSaves,
  tallyWords
} from "../scripts/decide/death-saves.js";

/**
 * DECISION-layer: the Death Saving Throw (RULINGS *Death saves run themselves*) — who makes one, when the turn
 * start owes one, what the system's card and the sheet say, damage at 0 Hit Points, and the words. No Foundry.
 */

const pc = { type: "character", hp: 0 };

describe("who makes Death Saving Throws", () => {
  it("a player character, and an NPC marked important — the system's own population", () => {
    expect(makesDeathSaves({ type: "character" })).toBe(true);
    expect(makesDeathSaves({ type: "npc", important: true })).toBe(true);
    expect(makesDeathSaves({ type: "npc" })).toBe(false);
    expect(makesDeathSaves({ type: "npc", important: false })).toBe(false);
    expect(makesDeathSaves({ type: "vehicle" })).toBe(false);
    expect(makesDeathSaves({ type: "group" })).toBe(false);
  });

  it("the rule tick points at the system's rules page", () => {
    expectPointer(DEATH_SAVE_RULE, "DEATH_SAVE_RULE");
    expect(DEATH_SAVE_RULE).toEqual({ page: "rule", key: "deathsaves" });
    expect(THIRD).toBe(3);
  });
});

describe("deathSaveOwed — is a roll owed right now", () => {
  it("owed at 0 Hit Points with the tally open", () => {
    expect(deathSaveOwed({ ...pc })).toEqual({ owed: true, why: "at 0 Hit Points" });
    expect(deathSaveOwed({ ...pc, success: 2, failure: 2 }).owed).toBe(true);
    expect(deathSaveOwed({ type: "npc", important: true, hp: 0 }).owed).toBe(true);
  });

  it("not above 0, not dead, not Stable, not with a third already on the sheet, never for a plain NPC", () => {
    expect(deathSaveOwed({ ...pc, hp: 1 })).toEqual({ owed: false, why: "above 0 Hit Points" });
    expect(deathSaveOwed({ ...pc, dead: true })).toEqual({ owed: false, why: "dead" });
    expect(deathSaveOwed({ ...pc, stable: true })).toEqual({ owed: false, why: "Stable" });
    expect(deathSaveOwed({ ...pc, failure: 3 })).toEqual({
      owed: false,
      why: "three failures already"
    });
    expect(deathSaveOwed({ ...pc, success: 3 })).toEqual({
      owed: false,
      why: "three successes already"
    });
    expect(deathSaveOwed({ type: "npc", hp: 0 })).toEqual({
      owed: false,
      why: "makes no Death Saving Throws"
    });
  });
});

describe("deathSaveDue — asked at this turn start", () => {
  it("due when owed, with no earlier card waiting and this place not asked", () => {
    expect(deathSaveDue({ ...pc })).toEqual({
      due: true,
      why: "at 0 Hit Points at the start of its turn"
    });
  });

  it("an earlier card still waiting, or this turn asked already, asks nothing; a creature that owes nothing says why", () => {
    expect(deathSaveDue({ ...pc, pending: true })).toEqual({
      due: false,
      why: "an earlier Death Saving Throw still waits"
    });
    expect(deathSaveDue({ ...pc, asked: true })).toEqual({
      due: false,
      why: "asked this turn already"
    });
    expect(deathSaveDue({ ...pc, hp: 7, pending: true })).toEqual({
      due: false,
      why: "above 0 Hit Points"
    });
  });
});

describe("deathSaveResult — the system's card and the sheet, read", () => {
  it("10 or higher is a success, lower a failure; the tally is the sheet's", () => {
    expect(deathSaveResult({ face: 12, total: 12, success: 1, failure: 0 })).toEqual({
      result: "success",
      natural: null,
      outcome: null,
      success: 1,
      failure: 0
    });
    expect(deathSaveResult({ face: 9, total: 9, success: 1, failure: 1 })).toEqual({
      result: "failure",
      natural: null,
      outcome: null,
      success: 1,
      failure: 1
    });
    expect(deathSaveResult({ face: 10, total: 10, success: 1, failure: 0 }).result).toBe("success");
  });

  it("a 20 revives (the system's outcome), a 1 is two failures; the roll's own critical and fumble faces rule (Survivor's 18)", () => {
    expect(
      deathSaveResult({ face: 20, total: 20, outcome: "revive", success: 0, failure: 0 })
    ).toEqual({ result: "success", natural: 20, outcome: "revive", success: 0, failure: 0 });
    expect(deathSaveResult({ face: 1, total: 1, success: 0, failure: 2 })).toEqual({
      result: "failure",
      natural: 1,
      outcome: null,
      success: 0,
      failure: 2
    });
    expect(
      deathSaveResult({
        face: 18,
        total: 18,
        critAt: 18,
        outcome: "revive",
        success: 0,
        failure: 0
      }).natural
    ).toBe(20);
    expect(deathSaveResult({ face: 18, total: 18, success: 1, failure: 0 }).natural).toBeNull();
  });

  it("the third success is Stable and the third failure death, as the system wrote them; a 1 that kills says both", () => {
    expect(
      deathSaveResult({ face: 14, total: 14, outcome: "stable", success: 0, failure: 2 })
    ).toMatchObject({ result: "success", outcome: "stable" });
    expect(
      deathSaveResult({ face: 4, total: 4, outcome: "death", success: 1, failure: 3 })
    ).toMatchObject({ result: "failure", natural: null, outcome: "death" });
    expect(
      deathSaveResult({ face: 1, total: 1, outcome: "death", success: 1, failure: 3 })
    ).toMatchObject({ result: "failure", natural: 1, outcome: "death" });
  });

  it("a face the roll does not show marks no natural; an outcome outside the three is none", () => {
    expect(deathSaveResult({ total: 15, success: 1, failure: 0 }).natural).toBeNull();
    expect(
      deathSaveResult({ face: 11, total: 11, outcome: "broken", success: 1, failure: 0 }).outcome
    ).toBeNull();
  });
});

describe("damageAtZero — a failure, two from a Critical Hit, death at the maximum", () => {
  it("one failure, capped at three", () => {
    expect(damageAtZero({ failure: 0, amount: 5, max: 40 })).toEqual({
      failure: 1,
      steps: 1,
      massive: false,
      outcome: null
    });
    expect(damageAtZero({ failure: 2, amount: 5, max: 40 })).toEqual({
      failure: 3,
      steps: 1,
      massive: false,
      outcome: "death"
    });
    expect(damageAtZero({ failure: 3, amount: 5, max: 40 }).failure).toBe(3);
  });

  it("a Critical Hit is two", () => {
    expect(damageAtZero({ failure: 0, critical: true, amount: 5, max: 40 })).toEqual({
      failure: 2,
      steps: 2,
      massive: false,
      outcome: null
    });
    expect(damageAtZero({ failure: 1, critical: true, amount: 5, max: 40 })).toMatchObject({
      failure: 3,
      outcome: "death"
    });
  });

  it("damage that meets the Hit Point maximum is death outright; no maximum known, no massive damage", () => {
    expect(damageAtZero({ failure: 0, amount: 40, max: 40 })).toEqual({
      failure: 3,
      steps: 3,
      massive: true,
      outcome: "death"
    });
    expect(damageAtZero({ failure: 0, amount: 39, max: 40 }).massive).toBe(false);
    expect(damageAtZero({ failure: 0, amount: 99, max: 0 }).massive).toBe(false);
  });
});

describe("the words", () => {
  it("the ask names the creature and the tally", () => {
    expect(tallyWords(1, 2)).toBe("1 of 3 successes · 2 of 3 failures");
    expect(deathSaveAsk({ name: "Ilka", success: 1, failure: 2, round: 3 })).toEqual({
      title: "Ilka is dying — a Death Saving Throw",
      subtitle: "1 of 3 successes · 2 of 3 failures · the start of its turn, round 3"
    });
    expect(deathSaveAsk({ name: "Ilka", success: 0, failure: 0 }).subtitle).toBe(
      "0 of 3 successes · 0 of 3 failures · the start of its turn"
    );
  });

  it("the line leads with the throw (law 6), says the outcome or the step, and marks the buzzer's roll", () => {
    expect(
      deathSaveLine({
        name: "Ilka",
        result: "success",
        natural: null,
        outcome: null,
        success: 2,
        failure: 1
      })
    ).toBe("Death Saving Throw — a success · 2 of 3 successes · 1 of 3 failures");
    expect(
      deathSaveLine({
        name: "Ilka",
        result: "failure",
        natural: 1,
        outcome: null,
        success: 0,
        failure: 2,
        timedOut: true
      })
    ).toBe(
      "Death Saving Throw — natural 1, two failures · 0 of 3 successes · 2 of 3 failures (timer)"
    );
    expect(
      deathSaveLine({
        name: "Ilka",
        result: "success",
        natural: 20,
        outcome: "revive",
        success: 0,
        failure: 0
      })
    ).toBe("Death Saving Throw — natural 20! Ilka is back up with 1 Hit Point");
    expect(
      deathSaveLine({
        name: "Ilka",
        result: "success",
        natural: null,
        outcome: "stable",
        success: 0,
        failure: 0
      })
    ).toBe("Death Saving Throw — a success, the third: Ilka is Stable");
    expect(
      deathSaveLine({
        name: "Ilka",
        result: "failure",
        natural: 1,
        outcome: "death",
        success: 0,
        failure: 3
      })
    ).toBe("Death Saving Throw — natural 1, two failures, the third: Ilka dies");
  });

  it("the notice: a 20, a 1, Stable and death speak; a plain step is the card's alone", () => {
    expect(
      deathSaveToast({ name: "Ilka", natural: 20, outcome: "revive", success: 0, failure: 0 })
    ).toEqual({ level: "info", text: "Natural 20! Ilka is back up with 1 Hit Point." });
    expect(
      deathSaveToast({ name: "Ilka", natural: 1, outcome: null, success: 0, failure: 2 })
    ).toEqual({ level: "warn", text: "Natural 1 — Ilka suffers two failures (2 of 3)." });
    expect(
      deathSaveToast({ name: "Ilka", natural: null, outcome: "death", success: 0, failure: 3 })
    ).toMatchObject({ level: "error" });
    expect(
      deathSaveToast({ name: "Ilka", natural: null, outcome: "stable", success: 0, failure: 0 })
    ).toMatchObject({ level: "info" });
    expect(
      deathSaveToast({ name: "Ilka", natural: null, outcome: null, success: 1, failure: 0 })
    ).toBeNull();
  });

  it("the float: gold for the 20, red for the 1 and death, green for Stable, white for a step", () => {
    expect(
      deathSaveFloat({ result: "success", natural: 20, outcome: "revive", success: 0, failure: 0 })
    ).toEqual({ text: "Natural 20!", fill: "#ffd700" });
    expect(
      deathSaveFloat({ result: "failure", natural: null, outcome: "death", success: 0, failure: 3 })
    ).toEqual({ text: "Dead", fill: "#ff4040" });
    expect(
      deathSaveFloat({
        result: "success",
        natural: null,
        outcome: "stable",
        success: 0,
        failure: 0
      })
    ).toEqual({ text: "Stable", fill: "#7cfc00" });
    expect(
      deathSaveFloat({ result: "success", natural: null, outcome: null, success: 2, failure: 0 })
    ).toEqual({ text: "Death save ✓ 2/3", fill: "#ffffff" });
    expect(
      deathSaveFloat({ result: "failure", natural: 1, outcome: null, success: 0, failure: 2 }).text
    ).toBe("Natural 1 — ✗✗ 2/3");
  });

  it("damage at 0 Hit Points: the step, the Critical Hit, the maximum, Stable ended", () => {
    const one = damageAtZeroWords({
      name: "Ilka",
      amount: 6,
      ...damageAtZero({ failure: 0, amount: 6, max: 40 })
    });
    expect(one.title).toBe("Ilka takes 6 damage at 0 Hit Points — a failure");
    expect(one.subtitle).toBe("0 of 3 successes · 1 of 3 failures");
    expect(one.toast).toEqual({
      level: "warn",
      text: "Ilka took damage at 0 Hit Points — a failure (1 of 3)."
    });
    const crit = damageAtZeroWords({
      name: "Ilka",
      amount: 6,
      critical: true,
      wasStable: true,
      ...damageAtZero({ failure: 0, critical: true, amount: 6, max: 40 })
    });
    expect(crit.title).toBe("Ilka takes 6 damage at 0 Hit Points — two failures (a Critical Hit)");
    expect(crit.subtitle).toBe("0 of 3 successes · 2 of 3 failures — no longer Stable");
    const dead = damageAtZeroWords({
      name: "Ilka",
      amount: 40,
      ...damageAtZero({ failure: 0, amount: 40, max: 40 })
    });
    expect(dead.title).toBe("Ilka takes 40 damage at 0 Hit Points — Ilka dies");
    expect(dead.subtitle).toBe("the damage meets its Hit Point maximum");
    expect(dead.toast.level).toBe("error");
    expect(dead.float).toEqual({ text: "Dead", fill: "#ff4040" });
    const third = damageAtZeroWords({
      name: "Ilka",
      amount: 3,
      ...damageAtZero({ failure: 2, amount: 3, max: 40 })
    });
    expect(third.subtitle).toBe("a failure, the third");
  });

  it("the card's line follows the record's state", () => {
    expect(deathSaveCardLine(null)).toBe("");
    expect(deathSaveCardLine({ status: "pending", before: { success: 1, failure: 0 } })).toBe(
      "Death Saving Throw owed — 1 of 3 successes · 0 of 3 failures"
    );
    expect(deathSaveCardLine({ status: "moot", why: "above 0 Hit Points" })).toBe(
      "Death Saving Throw — nothing to roll: above 0 Hit Points"
    );
    expect(
      deathSaveCardLine({
        status: "resolved",
        cause: "turn",
        actorName: "Ilka",
        result: "success",
        natural: 20,
        outcome: "revive",
        after: { success: 0, failure: 0 }
      })
    ).toBe("Death Saving Throw — natural 20! Ilka is back up with 1 Hit Point");
    expect(
      deathSaveCardLine({
        status: "resolved",
        cause: "damage",
        actorName: "Ilka",
        amount: 6,
        steps: 1,
        after: { success: 0, failure: 1 },
        reverted: true
      })
    ).toBe(
      "Ilka takes 6 damage at 0 Hit Points — a failure · 0 of 3 successes · 1 of 3 failures · reverted"
    );
  });
});

describe("a d20 fold on a Death Saving Throw", () => {
  it("is offered on a failure only: a 10 already succeeds", () => {
    expect(deathSaveFoldWanted({ total: 10, target: 10 })).toBe(false);
    expect(deathSaveFoldWanted({ total: 15 })).toBe(false);
    expect(deathSaveFoldWanted({ total: 9 })).toBe(true);
    expect(deathSaveFoldWanted({ total: 0 })).toBe(true);
  });

  it("reads the roll as it stands: the reroll's total and its natural", () => {
    const base = { total: 7, isCritical: false, isFumble: false };
    expect(
      foldedDeathSave({
        base,
        foldedTotal: 14,
        spends: [{ reroll: { total: 14, isCritical: false, isFumble: false } }]
      })
    ).toEqual({ total: 14, isSuccess: true, isCritical: false, isFumble: false });
    expect(
      foldedDeathSave({
        base,
        foldedTotal: 20,
        spends: [{ reroll: { total: 20, isCritical: true, isFumble: false } }]
      }).isCritical
    ).toBe(true);
    // A natural 1 rerolled into a plain failure is one failure, not two.
    const fumble = { total: 1, isCritical: false, isFumble: true };
    expect(
      foldedDeathSave({
        base: fumble,
        foldedTotal: 6,
        spends: [{ reroll: { total: 6, isCritical: false, isFumble: false } }]
      })
    ).toEqual({ total: 6, isSuccess: false, isCritical: false, isFumble: false });
    // A die added keeps the d20's own natural; a verdict fold succeeds; a twenty is a critical.
    expect(foldedDeathSave({ base, foldedTotal: 11, spends: [{ die: 4 }] })).toEqual({
      total: 11,
      isSuccess: true,
      isCritical: false,
      isFumble: false
    });
    expect(foldedDeathSave({ base, spends: [{ verdict: "saved" }] }).isSuccess).toBe(true);
    expect(
      foldedDeathSave({ base, foldedTotal: 20, spends: [{ twenty: { total: 20, face: 7 } }] })
        .isCritical
    ).toBe(true);
    // Passed: the roll as rolled.
    expect(foldedDeathSave({ base })).toEqual({
      total: 7,
      isSuccess: false,
      isCritical: false,
      isFumble: false
    });
  });

  it("writes the tally as the system does", () => {
    expect(deathSaveTally({ success: 0, failure: 0 }, { isSuccess: true })).toEqual({
      outcome: null,
      updates: { "system.attributes.death.success": 1 }
    });
    expect(deathSaveTally({ success: 2, failure: 1 }, { isSuccess: true }).outcome).toBe("stable");
    expect(
      deathSaveTally({ success: 1, failure: 2 }, { isSuccess: true, isCritical: true })
    ).toEqual({
      outcome: "revive",
      updates: {
        "system.attributes.death.success": 0,
        "system.attributes.death.failure": 0,
        "system.attributes.hp.value": 1
      }
    });
    expect(
      deathSaveTally({ success: 0, failure: 0 }, { isSuccess: false, isFumble: true })
    ).toEqual({ outcome: null, updates: { "system.attributes.death.failure": 2 } });
    expect(deathSaveTally({ success: 0, failure: 2 }, { isSuccess: false }).outcome).toBe("death");
    expect(
      deathSaveTally({ success: 0, failure: 2 }, { isSuccess: false, isFumble: true }).updates[
        "system.attributes.death.failure"
      ]
    ).toBe(3);
  });
});
