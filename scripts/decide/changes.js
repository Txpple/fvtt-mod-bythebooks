/**
 * By the Books — DECISION (ARCHITECTURE.md §2): AN EFFECT CHANGE's kind. Foundry 14 replaced a change's numeric `mode`
 * with a string `type`; `mode` is now a shim that logs a deprecation on every read and goes in 16, and
 * `CONST.ACTIVE_EFFECT_MODES` warns too. Every script reads a change's kind through `changeType` and writes the typed
 * shape, `{ key, type, value }` (gate: npm run changemodes). A numeric mode is read only off raw data that predates
 * 14 (a pack's or a flag's source, never migrated), and only as a plain field, never through the shim. Pure.
 */

/** Foundry 13's numeric modes, as Foundry 14's string types (core's own migration table). */
const MODE_TYPES = Object.freeze({ 0: "custom", 1: "multiply", 2: "add", 3: "downgrade", 4: "upgrade", 5: "override" });

/**
 * `change.mode` as a plain field, never through Foundry 14's warning getter (a 14 change carries `type`, so the
 * getter is only ever met on a change that also has its type).
 * @param {any} change @returns {number|null}
 */
function plainMode(change) {
  const d = Object.getOwnPropertyDescriptor(change, "mode");
  if ( !d || d.get || (d.value === undefined) || (d.value === null) || (d.value === "") ) return null;
  const n = Number(d.value);
  return Number.isInteger(n) ? n : null;
}

/**
 * A change's kind in Foundry 14's vocabulary: `add`, `subtract`, `multiply`, `upgrade`, `downgrade`, `override`,
 * `custom`, or a system's own (`dnd5e.bonus`, `dnd5e.advantage`, …). Raw pre-14 data's number maps across, an
 * unknown number to `custom.<n>` as core migrates it. Null when the change says nothing.
 * @param {any} change @returns {string|null}
 */
export function changeType(change) {
  if ( !change || (typeof change !== "object") ) return null;
  if ( (typeof change.type === "string") && change.type ) return change.type;
  const mode = plainMode(change);
  if ( mode === null ) return null;
  return MODE_TYPES[mode] ?? `custom.${mode}`;
}

/**
 * A change as plain typed data, to write onto another effect: every field it carries (Foundry 14's `phase`, dnd5e's
 * `conditions` and `replacement` among them), never its id, never a `mode` (a pre-14 one becomes its `type`).
 * @param {any} change @returns {Record<string, any>}
 */
export function changeCopy(change) {
  const { _id, mode, ...rest } = { ...(change ?? {}) };
  const type = changeType(change);
  return type ? { ...rest, type } : rest;
}

/**
 * The comparable form of a change list: key, kind and value, in order (a pre-14 change compares equal to the same
 * change typed).
 * @param {any[]} changes @returns {string}
 */
export function changesSignature(changes) {
  return JSON.stringify((changes ?? []).map(c => [c?.key ?? null, changeType(c), String(c?.value ?? "")]));
}
