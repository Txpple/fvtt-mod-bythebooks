// @ts-check
/**
 * By the Books — DECISION layer (ARCHITECTURE.md §2): THE DEATH SAVING THROW as plain facts — who makes one at all,
 * who owes one at a turn start, what damage at 0 Hit Points does to the tally, and the words. The roll's own
 * arithmetic is the system's (`Actor5e#rollDeathSave` writes the tally, the 1 Hit Point on a 20 and the outcome on
 * its card); this layer reads that outcome and says it. ⚠ PURE: no `game`, no imports.
 * The rule (the PHB's "Death Saving Throws"): at 0 Hit Points a d20 at the start of each turn — 10 or higher a
 * success, lower a failure, a 1 two failures, a 20 back at 1 Hit Point; three successes Stable, three failures
 * death. Damage at 0 Hit Points is a failure, two from a Critical Hit, death when it meets the maximum.
 */

/** The book's page for the rule tick (rule-text.js reads it off `CONFIG.DND5E.rules`). */
export const DEATH_SAVE_RULE = Object.freeze({ page: "rule", key: "deathsaves" });

/** The third success or failure settles it. */
export const THIRD = 3;

/**
 * Does this creature make Death Saving Throws at all? A player character, or an NPC the GM marked important — the
 * system's own population (`Actor5e#updateDowned`: an important NPC falls Unconscious and dies at three failures as a
 * character does; any other NPC dies at 0).
 * @param {{type: string, important?: boolean|null}} facts
 */
export function makesDeathSaves({ type, important = false }) {
  return (type === "character") || ((type === "npc") && !!important);
}

/**
 * Does the creature owe a Death Saving Throw right now, and if not, why not? Nothing is owed above 0 Hit Points,
 * dead, Stable, or with a third success or failure already on the sheet (the system refuses the roll there too).
 * @param {{type: string, important?: boolean|null, hp: number, dead?: boolean, stable?: boolean,
 *   success?: number, failure?: number}} facts
 * @returns {{owed: boolean, why: string}}
 */
export function deathSaveOwed({ type, important = false, hp, dead = false, stable = false, success = 0, failure = 0 }) {
  if ( !makesDeathSaves({ type, important }) ) return { owed: false, why: "makes no Death Saving Throws" };
  if ( Number(hp) > 0 ) return { owed: false, why: "above 0 Hit Points" };
  if ( dead ) return { owed: false, why: "dead" };
  if ( stable ) return { owed: false, why: "Stable" };
  if ( Number(failure) >= THIRD ) return { owed: false, why: "three failures already" };
  if ( Number(success) >= THIRD ) return { owed: false, why: "three successes already" };
  return { owed: true, why: "at 0 Hit Points" };
}

/**
 * Is the roll to be ASKED at this turn start? Owed, with no earlier card still waiting for it and this turn not
 * asked already (the place: `combat|round|turn|actor`, the log the durable copy).
 * @param {{type: string, important?: boolean|null, hp: number, dead?: boolean, stable?: boolean, success?: number,
 *   failure?: number, pending?: boolean, asked?: boolean}} facts
 * @returns {{due: boolean, why: string}}
 */
export function deathSaveDue({ pending = false, asked = false, ...facts }) {
  const owed = deathSaveOwed(facts);
  if ( !owed.owed ) return { due: false, why: owed.why };
  if ( pending ) return { due: false, why: "an earlier Death Saving Throw still waits" };
  if ( asked ) return { due: false, why: "asked this turn already" };
  return { due: true, why: "at 0 Hit Points at the start of its turn" };
}

/**
 * What a roll did, read off the system's card and the sheet: the natural face that mattered (a 20 revives, a 1 is two
 * failures — the roll's own critical and fumble faces, which a feature may move), the terminal outcome the system
 * wrote (`revive` | `stable` | `death`, or none), and the tally as the sheet now shows it.
 * @param {{face: number|null, total: number, target?: number, critAt?: number, fumbleAt?: number,
 *   outcome?: "revive"|"stable"|"death"|"broken"|null, success: number, failure: number}} facts
 * @returns {{result: "success"|"failure", natural: 20|1|null, outcome: "revive"|"stable"|"death"|null,
 *   success: number, failure: number}}
 */
export function deathSaveResult({ face = null, total, target = 10, critAt = 20, fumbleAt = 1, outcome = null, success, failure }) {
  const result = (outcome === "revive") || (outcome === "stable") ? "success"
    : (outcome === "death") ? "failure"
    : (Number(total) >= Number(target)) ? "success" : "failure";
  const natural = (face === null) ? null
    : ((result === "success") && (Number(face) >= critAt)) ? 20
    : ((result === "failure") && (Number(face) <= fumbleAt)) ? 1
    : null;
  const terminal = ((outcome === "revive") || (outcome === "stable") || (outcome === "death")) ? outcome : null;
  return { result, natural, outcome: terminal, success: Number(success) || 0, failure: Number(failure) || 0 };
}

/**
 * Damage taken at 0 Hit Points: a failure, two from a Critical Hit, and death outright when the damage meets the
 * creature's Hit Point maximum. The tally never passes three.
 * @param {{failure?: number, critical?: boolean, amount: number, max: number}} facts
 * @returns {{failure: number, steps: number, massive: boolean, outcome: "death"|null}}
 */
export function damageAtZero({ failure = 0, critical = false, amount, max }) {
  const before = Math.max(0, Number(failure) || 0);
  const massive = (Number(max) > 0) && (Number(amount) >= Number(max));
  const steps = massive ? THIRD : critical ? 2 : 1;
  const after = Math.min(THIRD, before + steps);
  return { failure: after, steps, massive, outcome: (after >= THIRD) ? "death" : null };
}

/* --- the words ----------------------------------------------------------------------------------------------- */

/** "1 of 3 successes · 2 of 3 failures". */
export const tallyWords = (success, failure) => `${Number(success) || 0} of ${THIRD} successes · ${Number(failure) || 0} of ${THIRD} failures`;

/**
 * The ask: the card's and the dialog's title and subtitle.
 * @param {{name: string, success: number, failure: number, round?: number|null}} facts
 */
export function deathSaveAsk({ name, success, failure, round = null }) {
  return {
    title: `${name} is dying — a Death Saving Throw`,
    subtitle: `${tallyWords(success, failure)} · the start of its turn${round ? `, round ${round}` : ""}`
  };
}

/**
 * One line for a roll's result, source then result (ARCHITECTURE §5 law 6): the terminal outcome when there is one,
 * else the step and the tally. `timedOut` marks the buzzer's roll.
 * @param {{name: string, result: "success"|"failure", natural: 20|1|null, outcome: "revive"|"stable"|"death"|null,
 *   success: number, failure: number, timedOut?: boolean}} facts
 */
export function deathSaveLine({ name, result, natural, outcome, success, failure, timedOut = false }) {
  const by = timedOut ? " (timer)" : "";
  if ( outcome === "revive" ) return `Death Saving Throw — natural 20! ${name} is back up with 1 Hit Point${by}`;
  if ( outcome === "stable" ) return `Death Saving Throw — a success, the third: ${name} is Stable${by}`;
  if ( outcome === "death" ) return `Death Saving Throw — ${natural === 1 ? "natural 1, two failures" : "a failure"}, the third: ${name} dies${by}`;
  if ( result === "success" ) return `Death Saving Throw — a success · ${tallyWords(success, failure)}${by}`;
  return `Death Saving Throw — ${natural === 1 ? "natural 1, two failures" : "a failure"} · ${tallyWords(success, failure)}${by}`;
}

/**
 * The notice every screen gets, or null for a plain step (the card says those): a 20, a 1, Stable and death.
 * @param {{name: string, natural: 20|1|null, outcome: "revive"|"stable"|"death"|null, success: number, failure: number}} facts
 * @returns {{level: "info"|"warn"|"error", text: string}|null}
 */
export function deathSaveToast({ name, natural, outcome, success, failure }) {
  if ( outcome === "revive" ) return { level: "info", text: `Natural 20! ${name} is back up with 1 Hit Point.` };
  if ( outcome === "death" ) return { level: "error", text: `${name} has died — three failed Death Saving Throws${natural === 1 ? " (a natural 1 counts two)" : ""}.` };
  if ( outcome === "stable" ) return { level: "info", text: `${name} is Stable — three successes; no more Death Saving Throws unless damaged.` };
  if ( natural === 1 ) return { level: "warn", text: `Natural 1 — ${name} suffers two failures (${failure} of ${THIRD}).` };
  if ( natural === 20 ) return { level: "info", text: `Natural 20 — ${name}: a success (${success} of ${THIRD}).` };
  return null;
}

/**
 * The float over the token: what to say and in which colour (gold for a 20, red for a 1 or death, green for Stable,
 * white for a plain step).
 * @param {{result: "success"|"failure", natural: 20|1|null, outcome: "revive"|"stable"|"death"|null, success: number, failure: number}} facts
 * @returns {{text: string, fill: string}}
 */
export function deathSaveFloat({ result, natural, outcome, success, failure }) {
  if ( outcome === "revive" ) return { text: "Natural 20!", fill: "#ffd700" };
  if ( outcome === "death" ) return { text: "Dead", fill: "#ff4040" };
  if ( outcome === "stable" ) return { text: "Stable", fill: "#7cfc00" };
  if ( natural === 1 ) return { text: `Natural 1 — ✗✗ ${failure}/${THIRD}`, fill: "#ff4040" };
  if ( result === "success" ) return { text: `Death save ✓ ${success}/${THIRD}`, fill: "#ffffff" };
  return { text: `Death save ✗ ${failure}/${THIRD}`, fill: "#ff8080" };
}

/**
 * The words for damage at 0 Hit Points: the card's title and subtitle, the notice, the float.
 * @param {{name: string, amount: number, critical?: boolean, wasStable?: boolean, failure: number, steps: number,
 *   massive: boolean, outcome: "death"|null, success?: number}} facts
 */
export function damageAtZeroWords({ name, amount, critical = false, wasStable = false, failure, steps, massive, outcome, success = 0 }) {
  const took = `${name} takes ${amount} damage at 0 Hit Points`;
  const ended = wasStable ? " — no longer Stable" : "";
  if ( outcome === "death" ) {
    const why = massive ? "the damage meets its Hit Point maximum" : critical ? "a Critical Hit, two failures, the third" : "a failure, the third";
    return {
      title: `${took} — ${name} dies`, subtitle: `${why}${ended}`,
      toast: { level: "error", text: `${name} has died — ${massive ? "damage at 0 Hit Points met its maximum" : "damage at 0 Hit Points was the third failure"}.` },
      float: { text: "Dead", fill: "#ff4040" }
    };
  }
  const step = (steps === 2) ? "two failures (a Critical Hit)" : "a failure";
  return {
    title: `${took} — ${step}`, subtitle: `${tallyWords(success, failure)}${ended}`,
    toast: { level: "warn", text: `${name} took damage at 0 Hit Points — ${step} (${failure} of ${THIRD}).` },
    float: { text: `Death save ✗ ${failure}/${THIRD}`, fill: "#ff8080" }
  };
}

/**
 * The line a death save card shows, by its record's state: waiting, moot (nothing to roll any more), a roll's
 * result, or damage at 0 Hit Points.
 * @param {any} flag
 */
export function deathSaveCardLine(flag) {
  if ( !flag ) return "";
  if ( flag.status === "pending" ) return `Death Saving Throw owed — ${tallyWords(flag.before?.success, flag.before?.failure)}`;
  if ( flag.status === "moot" ) return `Death Saving Throw — nothing to roll: ${flag.why ?? "no longer owed"}`;
  if ( flag.cause === "damage" ) {
    const words = damageAtZeroWords({ name: flag.actorName ?? "The creature", amount: flag.amount ?? 0, critical: !!flag.critical, wasStable: !!flag.wasStable,
      failure: flag.after?.failure ?? 0, steps: flag.steps ?? 1, massive: !!flag.massive, outcome: flag.outcome ?? null, success: flag.after?.success ?? 0 });
    return `${words.title} · ${words.subtitle}${flag.reverted ? " · reverted" : ""}`;
  }
  return deathSaveLine({ name: flag.actorName ?? "The creature", result: flag.result, natural: flag.natural ?? null, outcome: flag.outcome ?? null,
    success: flag.after?.success ?? 0, failure: flag.after?.failure ?? 0, timedOut: !!flag.timedOut });
}
