/**
 * By the Books — THE LANDING LEDGER (ARCHITECTURE.md §4 *The flow elect*, *The ledger*; issue #22). A landing, or a
 * step re-driven like one (a dismissal, a companion's errand, a change of form, a sweep, a switch), makes its world
 * writes through `step`: the record holds each write's plan and witness before it is made and marks it done after, so
 * a re-drive over a dead claim repeats nothing that landed and lands everything that did not. A document a step makes
 * carries the step's stamp (`stamp`), its witness the stamped documents found. The record's ledger for a scope goes
 * when the scope's run ends (`closeLedger`, in the run's own final write).
 */
import { MODULE_ID, readFlag, queueFlagWrite } from "./core.js";
import { ledgerStamp, stepAction } from "./decide/ledger.js";

/** The flag a step's documents carry: `flags.<module>.ledgerStamp`, the step's stamp. */
export const LEDGER_STAMP_FLAG = "ledgerStamp";

/**
 * The steps of one run of a record's scope (`land`, `dismiss`, …).
 * @typedef {object} StepSpec
 * @property {() => any} [plan]          what the write will do, computed once (a re-drive reuses the first); JSON
 * @property {(plan: any) => any} witness   what the write changes, read off the world now; JSON
 * @property {(plan: any) => Promise<any>} run   the write; its result is kept (JSON) for a re-drive that skips it
 * @param {any} message   the card the record lives on
 * @param {string} key    the record's flag key
 * @param {string} scope  the run: one ledger per scope, closed when the run ends
 */
export function landingSteps(message, key, scope) {
  const entryOf = name => readFlag(message, key)?.ledger?.[scope]?.[name] ?? null;
  const write = (name, entry) => queueFlagWrite(message, key, current => {
    current.ledger ??= {};
    current.ledger[scope] ??= {};
    current.ledger[scope][name] = entry;
  });
  return {
    /** The flags a document made by step `name` carries. @param {string} name */
    stamp: name => ({ [MODULE_ID]: { [LEDGER_STAMP_FLAG]: ledgerStamp(message.id, key, scope, name) } }),
    /** The ids of `docs` made by step `name`. @param {Iterable<any>} docs @param {string} name */
    made: (docs, name) => [...(docs ?? [])]
      .filter(d => d?.flags?.[MODULE_ID]?.[LEDGER_STAMP_FLAG] === ledgerStamp(message.id, key, scope, name)).map(d => d.id),
    /**
     * One write, once. Resolves `{ plan, result, how, now }`: `how` is `ran`, or `done` / `landed` for a write a
     * dead claimant already made (its result kept when it got as far as recording it, else null: read it off `now`,
     * the witness as the re-drive found it).
     * @param {string} name @param {StepSpec} spec
     */
    async step(name, { plan = () => null, witness, run }) {
      const entry = entryOf(name);
      const now = entry ? (witness(entry.plan) ?? null) : null;
      const action = stepAction(entry, now);
      if ( action === "done" ) return { plan: entry.plan, result: entry.result ?? null, how: "done", now };
      if ( action === "landed" ) {
        await write(name, { ...entry, state: "done", result: null });
        return { plan: entry.plan, result: null, how: "landed", now };
      }
      const p = entry ? entry.plan : (plan() ?? null);
      if ( !entry ) await write(name, { state: "begun", plan: p, before: witness(p) ?? null });
      const result = (await run(p)) ?? null;
      await write(name, { state: "done", plan: p, before: entry?.before ?? null, result });
      return { plan: p, result, how: "ran", now: null };
    }
  };
}

/** In a run's final flag write: the scope's ledger goes with the run. @param {any} current @param {string} scope */
export function closeLedger(current, scope) {
  if ( !current?.ledger ) return;
  delete current.ledger[scope];
  if ( !Object.keys(current.ledger).length ) delete current.ledger;
}

/* --- witnesses: what a step's write changes, read off the world ----------------------------------------------- */

/** A creature's Hit Points: a damage or heal step's witness. @param {any} actor */
export function hitPointsOf(actor) {
  const hp = actor?.system?.attributes?.hp;
  return hp ? { value: hp.value ?? null, temp: hp.temp ?? null, tempmax: hp.tempmax ?? null } : null;
}

/** The ids of the effects named `name` on `actor`, sorted: an effect step's witness. @param {any} actor @param {string} name */
export function effectsNamed(actor, name) {
  return [...(actor?.effects ?? [])].filter(e => e.name === name).map(e => e.id).sort();
}
