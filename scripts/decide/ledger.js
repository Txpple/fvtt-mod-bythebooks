/**
 * By the Books — DECISION (ARCHITECTURE.md §2): THE LANDING LEDGER's judgement (ARCHITECTURE §4 *The flow elect*,
 * *The ledger*). A landing's world writes are steps; before each, its record holds the step's plan and the WITNESS:
 * what the write will change, as it stood. A re-drive over a dead claim reads each step's entry with the witness as it
 * stands now: done is skipped, a witness that moved is a write that landed, one that did not is done again, on the
 * plan the dead claimant made (never one recomputed off a world it already changed). Pure.
 */

/**
 * JSON with its keys sorted, so two reads of the same state compare equal whatever order a document keeps.
 * @param {any} value @returns {string}
 */
export function canonical(value) {
  if ( value === undefined ) return "null";
  if ( (value === null) || (typeof value !== "object") ) return JSON.stringify(value);
  if ( Array.isArray(value) ) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().filter(k => value[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

/** Has the witness moved since the step began? @param {any} before @param {any} now @returns {boolean} */
export const witnessMoved = (before, now) => canonical(before) !== canonical(now);

/**
 * What a drive does with one step: `run` it (no entry: a first drive), skip it (`done`), take it as `landed` (begun,
 * its witness moved: the dead claimant's write went through) or run it `again` (begun, nothing moved).
 * @param {{ state?: string, before?: any }|null|undefined} entry   the step's ledger entry
 * @param {any} now   the witness as it stands
 * @returns {"run"|"done"|"landed"|"again"}
 */
export function stepAction(entry, now) {
  if ( !entry ) return "run";
  if ( entry.state === "done" ) return "done";
  return witnessMoved(entry.before, now) ? "landed" : "again";
}

/**
 * The stamp a document made by a step carries, so a re-drive finds it instead of making it twice.
 * @param {string} messageId @param {string} key @param {string} scope @param {string} name
 */
export const ledgerStamp = (messageId, key, scope, name) => `${messageId}.${key}.${scope}.${name}`;
