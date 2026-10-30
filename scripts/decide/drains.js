// @ts-check
/**
 * By the Books — DECISION layer (ARCHITECTURE.md §2): the drain (registry.js DRAINS) — how much of what
 * landed lowers the target's maximum, the die a score row reads off its text, the effect the module
 * writes, and the card's words. No `game`.
 */

/**
 * THE MAXIMUM'S FALL: the amount TAKEN, narrowed to the row's damage type by the rolled parts' proportion
 * (Proboscis: the Necrotic alone), floored.
 * @param {{what?: string, type?: string|null}} row
 * @param {{taken: number, parts?: Array<{value: number, type?: string|null}>}} facts
 * @returns {{drains: boolean, amount: number, why: string}}
 */
export function drainAmount(row, { taken, parts = [] }) {
  const landed = Math.max(0, Math.floor(Number(taken) || 0));
  if ( !landed ) return { drains: false, amount: 0, why: "nothing landed" };
  const type = row?.type ? String(row.type).toLowerCase() : null;
  const list = (parts ?? []).filter(p => Number(p?.value) > 0);
  let ratio = 1;
  if ( type && list.length ) {
    const all = list.reduce((n, p) => n + Number(p.value), 0);
    const typed = list.filter(p => String(p.type ?? "").toLowerCase() === type).reduce((n, p) => n + Number(p.value), 0);
    ratio = all > 0 ? (typed / all) : 0;
  }
  const amount = Math.floor(landed * ratio);
  if ( !amount ) return { drains: false, amount: 0, why: type ? `no ${type} damage among what landed` : "nothing landed" };
  return { drains: true, amount, why: `the ${type ?? ""} damage that landed`.replace(/\s+/g, " ") };
}

/**
 * The die a score row reads off its item's text — the first `[[/r 1d4]]` roll enricher (Draining Swipe:
 * "the target's Strength score decreases by [[/r 1d4]]"), or null.
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
export function drainDieFrom(text) {
  const m = /\[\[\/r\s+([^\]\s#]+)/i.exec(String(text ?? ""));
  return m?.[1] ?? null;
}

/**
 * The effect the module writes for a maximum's fall: one per drain row on the bearer, the total under it
 * (a second hit refreshes the one copy, found by the module's flag on it).
 * @param {{key: string, amount: number, img?: string|null, moduleId: string}} facts
 */
export function drainEffectData({ key, amount, img = null, moduleId }) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return {
    _id: drainEffectId(key),
    name: `${key} — Hit Point maximum −${n}`,
    img,
    transfer: false,
    disabled: false,
    changes: [{ key: "system.attributes.hp.tempmax", type: "add", value: String(-n), priority: 20 }],
    description: `<p>${key}: the Hit Point maximum lowered by ${n}, the damage that landed.</p>`,
    flags: { [moduleId]: { drain: { key, amount: n } } }
  };
}

/** A 16-character id off the row's name, so the one copy is found and refreshed. */
export function drainEffectId(key) {
  const base = `bfDrain${String(key ?? "").replace(/[^A-Za-z0-9]/g, "")}0000000000`;
  return base.slice(0, 16);
}

/**
 * The card's title.
 * @param {{key: string, target: string, what: "max"|"ability"|string, amount: number, total?: number|null, ability?: string|null}} facts
 */
export function drainTitle({ key, target, what, amount, total = null, ability = null }) {
  if ( what === "ability" ) return `${key} — ${target}'s ${ability ?? "score"} falls by ${amount}${(total && (total !== amount)) ? ` (${total} in all)` : ""}`;
  return `${key} — ${target}'s Hit Point maximum falls by ${amount}${(total && (total !== amount)) ? ` (${total} in all)` : ""}`;
}
