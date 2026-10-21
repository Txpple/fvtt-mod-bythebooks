// @ts-check
/**
 * By the Books — DECISION (ARCHITECTURE.md §2): token lights, senses and sizes carried on an
 * EFFECT. Foundry 14 applies a `token.*` change to the bearer's tokens, so it lives and dies with
 * the effect and no token document is written.
 */

/**
 * The token-light row key this use answers to; a row with no `activity` answers any use.
 * @param {Record<string, {item?: string, activity?: string|null}>} table
 * @param {{ itemName: string|null|undefined, activityName: string|null|undefined }} use
 * @param {Set<string>} listed   lower-cased row names
 * @returns {string|null}
 */
export function lightRowKey(table, { itemName, activityName }, listed) {
  const item = String(itemName ?? "").toLowerCase();
  const act = String(activityName ?? "").toLowerCase();
  if ( !item ) return null;
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    if ( !listed?.has?.(key.toLowerCase()) ) continue;
    if ( String(row.item ?? key).toLowerCase() !== item ) continue;
    if ( row.activity && (String(row.activity).toLowerCase() !== act) ) continue;
    return key;
  }
  return null;
}

/**
 * The token-light row whose light this use puts OUT: the row's `out` names the activity, on the row's item.
 * @param {Record<string, {item?: string, out?: string|null}>} table
 * @param {{ itemName: string|null|undefined, activityName: string|null|undefined }} use
 * @param {Set<string>} listed   lower-cased row names
 * @returns {string|null}
 */
export function lightOutKey(table, { itemName, activityName }, listed) {
  const item = String(itemName ?? "").toLowerCase();
  const act = String(activityName ?? "").toLowerCase();
  if ( !item || !act ) return null;
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    if ( !row?.out || !listed?.has?.(key.toLowerCase()) ) continue;
    if ( String(row.item ?? key).toLowerCase() !== item ) continue;
    if ( String(row.out).toLowerCase() === act ) return key;
  }
  return null;
}

/**
 * The changes that carry a row's light. Foundry's `dim` is the OUTER radius; `angle` and the `look`
 * (colour, alpha, luminosity, attenuation, animation) are written only for a row that has them, so a
 * row without them leaves the token's own.
 * @typedef {{ color?: string, alpha?: number, luminosity?: number, attenuation?: number,
 *   animation?: { type: string, speed?: number, intensity?: number } }} LightLook  a light's colour and flicker
 * @param {{ bright: number, dim: number, angle?: number, look?: LightLook }} row
 * @returns {Array<{ key: string, type: string, value: number|string, phase: string }>}
 */
export function lightChanges(row) {
  const bright = Math.max(0, Number(row?.bright) || 0);
  const dim = Math.max(bright, Number(row?.dim) || 0);
  // D1 — a row with no light (Elder Champion) lands its effect alone: never a 0 written over the token's own light.
  if ( !bright && !dim ) return [];
  const out = [
    { key: "token.light.bright", type: "override", value: bright, phase: "initial" },
    { key: "token.light.dim", type: "override", value: dim, phase: "initial" }
  ];
  const angle = Number(row?.angle);
  if ( (angle > 0) && (angle < 360) ) out.push({ key: "token.light.angle", type: "override", value: angle, phase: "initial" });
  const look = row?.look;
  if ( look ) {
    const put = (key, value) => { if ( (value !== undefined) && (value !== null) ) out.push({ key: `token.light.${key}`, type: "override", value, phase: "initial" }); };
    put("color", look.color);
    for ( const k of ["alpha", "luminosity", "attenuation"] ) put(k, Number.isFinite(look[k]) ? look[k] : null);
    if ( look.animation?.type ) {
      put("animation.type", look.animation.type);
      put("animation.speed", Number.isFinite(look.animation.speed) ? look.animation.speed : null);
      put("animation.intensity", Number.isFinite(look.animation.intensity) ? look.animation.intensity : null);
    }
  }
  return out;
}

/* --- GEAR LIGHTS (registry GEAR_LIGHTS) ------------------------------------------------------------ */

/** The lit state every gear row has; a second state is named by its key in the row's `states`. */
export const GEAR_LIT = "lit";

/**
 * The gear-light row an item answers to: its identifier or its name against the row's key and aliases.
 * @param {Record<string, {item?: readonly string[]}>} table
 * @param {{ name?: string|null, identifier?: string|null }} item
 * @param {Set<string>} listed   lower-cased row names
 * @param {(name: string) => string} identifierOf
 * @returns {string|null}  the row key
 */
export function gearLightRow(table, { name, identifier }, listed, identifierOf) {
  const n = String(name ?? "").toLowerCase();
  const id = String(identifier ?? "");
  if ( !n && !id ) return null;
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    if ( !listed?.has?.(key.toLowerCase()) ) continue;
    const names = [key, ...(row.item ?? [])];
    if ( names.some(x => (String(x).toLowerCase() === n) || (id && (identifierOf(x) === id))) ) return key;
  }
  return null;
}

/**
 * The light one state of a gear row sheds: the lit state is the row's own, a second state its entry.
 * @param {{ bright: number, dim: number, angle?: number, look?: LightLook, states?: Record<string, {bright: number, dim: number}> }} row
 * @param {string} state
 * @returns {{ bright: number, dim: number, angle?: number, look?: LightLook }|null}
 */
export function gearLightOf(row, state) {
  if ( !row ) return null;
  const base = { bright: row.bright, dim: row.dim, ...(row.angle ? { angle: row.angle } : {}), ...(row.look ? { look: row.look } : {}) };
  if ( state === GEAR_LIT ) return base;
  const s = row.states?.[state];
  return s ? { ...base, bright: s.bright, dim: s.dim } : null;
}

/**
 * The popup's buttons for a gear row, unlit or lit in a state.
 * @param {{ label?: string, switchTo?: string, states?: Record<string, {label?: string, switchTo?: string}> }} row
 * @param {string|null} litState  the state it is lit in, or null when unlit
 * @returns {Array<{ press: "light"|"out"|"switch", state?: string, label: string }>}
 */
export function gearButtons(row, litState) {
  const states = [GEAR_LIT, ...Object.keys(row?.states ?? {})];
  const word = s => (s === GEAR_LIT) ? row?.label : row?.states?.[s]?.label;
  const switchWord = s => (s === GEAR_LIT) ? row?.switchTo : row?.states?.[s]?.switchTo;
  if ( !litState ) {
    if ( states.length === 1 ) return [{ press: "light", state: GEAR_LIT, label: "Light" }];
    return states.map(s => ({ press: "light", state: s, label: `Light — ${word(s) ?? s}` }));
  }
  /** @type {Array<{ press: "light"|"out"|"switch", state?: string, label: string }>} */
  const out = [{ press: "out", label: "Put out" }];
  for ( const s of states ) if ( s !== litState ) out.push({ press: "switch", state: s, label: switchWord(s) ?? `Switch to ${word(s) ?? s}` });
  return out;
}

/**
 * What one press does to the bearer's gear lights.
 * @param {{ lit: {id: string, state: string}|null, others?: string[] }} now
 *   `lit` this item's standing effect; `others` the ids of the bearer's OTHER gear-light effects
 * @param {{ press: "light"|"out"|"switch", state?: string }} press
 * @returns {{ op: "create"|"delete"|"update"|"none", state?: string, putOut: string[] }}
 *   `putOut` the other gear lights to delete first: one gear light per character
 */
export function gearToggle({ lit, others = [] }, press) {
  if ( press?.press === "out" ) return lit ? { op: "delete", putOut: [] } : { op: "none", putOut: [] };
  const state = press?.state ?? GEAR_LIT;
  if ( (press?.press !== "light") && (press?.press !== "switch") ) return { op: "none", putOut: [] };
  if ( lit ) return (lit.state === state) ? { op: "none", putOut: [] } : { op: "update", state, putOut: [] };
  return { op: "create", state, putOut: [...others] };
}

/**
 * A light in the receipt's words: "20 ft Bright, 20 ft more Dim", "5 ft Dim", "a 53° cone".
 * @param {{ bright: number, dim: number, angle?: number }|null} light
 * @returns {string}
 */
export function gearLightWords(light) {
  if ( !light ) return "";
  const bright = Number(light.bright) || 0;
  const dim = Math.max(bright, Number(light.dim) || 0);
  const radius = bright ? `${bright} ft Bright, ${dim - bright} ft more Dim` : `${dim} ft Dim`;
  return light.angle ? `${radius}, in a ${Math.round(light.angle)}° cone` : radius;
}

/**
 * The receipt card's title for one press.
 * @param {{ actor: string, item: string, op: "create"|"delete"|"update", row?: {states?: Record<string, {switchTo?: string}>, switchTo?: string}|null,
 *   state?: string, light?: {bright: number, dim: number, angle?: number}|null, reason?: string|null }} said
 * @returns {string}
 */
export function gearCardTitle({ actor, item, op, row = null, state = GEAR_LIT, light = null, reason = null }) {
  if ( op === "delete" ) return reason ? `${actor}'s ${item} goes out (${reason})` : `${actor} puts out the ${item}`;
  if ( op === "update" ) {
    const words = (state === GEAR_LIT) ? row?.switchTo : row?.states?.[state]?.switchTo;
    const verb = words ? words.replace(/^(\w)/, c => c.toLowerCase()).replace(/^(lower|raise)/, "$1s") : "switches";
    return `${actor} ${verb}: ${gearLightWords(light)}`;
  }
  return `${actor} lights the ${item}: ${gearLightWords(light)}`;
}

/**
 * Who a row's light lands on; a `targets` row with none targeted lands nothing.
 * @param {{ on: "self"|"targets" }} row
 * @param {{ self?: {uuid: string, name: string}|null, targets?: Array<{uuid: string, name: string}> }} facts
 * @returns {Array<{uuid: string, name: string}>}
 */
export function lightTargets(row, { self = null, targets = [] } = {}) {
  if ( row?.on === "self" ) return self?.uuid ? [self] : [];
  const seen = new Set();
  return (targets ?? []).filter(t => t?.uuid && !seen.has(t.uuid) && seen.add(t.uuid));
}

/**
 * How long a row's light stands, in the card's words: a form's while it stands, a spell's for its duration,
 * and what puts it out early.
 * @param {{ on?: string, recast?: string|null, ends?: string|null, out?: string|null }} row
 * @returns {string}
 */
export function lightLasts(row) {
  const span = (row?.ends === "enchantment") ? "while the weapon's enchantment stands"
    : row?.recast ? "for the spell's duration; casting it again puts it out"
    : (row?.on === "self") ? "while the transformation stands"
    : "for the spell's duration";
  return row?.out ? `${span}; ${row.out} puts it out` : span;
}

/**
 * The token-sense row key an effect answers to by name (the row's `effect`, else its key).
 * @param {Record<string, {effect?: string}>} table
 * @param {string|null|undefined} effectName
 * @param {Set<string>} listed   lower-cased row names
 * @returns {string|null}
 */
export function senseRowKey(table, effectName, listed) {
  const name = String(effectName ?? "").toLowerCase();
  if ( !name ) return null;
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    if ( !listed?.has?.(key.toLowerCase()) ) continue;
    if ( String(row.effect ?? key).toLowerCase() === name ) return key;
  }
  return null;
}

/**
 * The changes that carry a row's sense (Foundry inflates the vision mode's defaults).
 * @param {{ vision?: string|null, range?: number|null, detect?: {mode: string, range: number}|null }} row
 * @returns {Array<{ key: string, type: string, value: any, phase: string }>}
 */
export function senseChanges(row) {
  const out = [];
  const change = (key, value) => out.push({ key, type: "override", value, phase: "initial" });
  if ( row?.vision ) change("token.sight.visionMode", String(row.vision));
  if ( Number(row?.range) > 0 ) change("token.sight.range", Number(row.range));
  if ( row?.detect?.mode && (Number(row.detect.range) > 0) ) {
    change(`token.detectionModes.${row.detect.mode}.enabled`, true);
    change(`token.detectionModes.${row.detect.mode}.range`, Number(row.detect.range));
  }
  return out;
}

/** Does this change list already carry a sense? @param {Array<{key?: string}>} changes @returns {boolean} */
export function carriesSense(changes) {
  return (changes ?? []).some(c => String(c?.key ?? "").startsWith("token.sight.")
    || String(c?.key ?? "").startsWith("token.detectionModes."));
}

/**
 * TOKEN SIZES: the listed row and entry an effect's name answers to.
 * @param {Record<string, {effects: Record<string, {size?: string, step?: number}>}>} table
 * @param {string} effectName
 * @param {Set<string>} listed
 */
export function sizeRowFor(table, effectName, listed) {
  const name = String(effectName ?? "").toLowerCase();
  if ( !name ) return null;
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    if ( !listed?.has?.(key.toLowerCase()) ) continue;
    for ( const [effect, entry] of Object.entries(row.effects ?? {}) ) {
      if ( effect.toLowerCase() === name ) return { key, entry };
    }
  }
  return null;
}

/**
 * The size an entry makes: `size` absolute, `step` clamped along the order; null when unchanged.
 * @param {{size?: string, step?: number}} entry
 * @param {string} current  ("med")
 * @param {Record<string, {numerical: number, token?: number}>} sizes  CONFIG.DND5E.actorSizes
 * @returns {string|null}
 */
export function sizeAfter(entry, current, sizes) {
  const order = Object.entries(sizes ?? {}).filter(([, v]) => Number.isFinite(v?.numerical))
    .sort((a, b) => a[1].numerical - b[1].numerical).map(([k]) => k);
  if ( !order.length ) return null;
  let next = null;
  if ( entry?.size ) next = order.includes(entry.size) ? entry.size : null;
  else if ( Number(entry?.step) ) {
    const at = order.indexOf(current);
    if ( at < 0 ) return null;
    next = order[Math.min(order.length - 1, Math.max(0, at + Number(entry.step)))];
  }
  return (next && (next !== current)) ? next : null;
}

/**
 * The changes that carry a size: the actor's size and the token's footprint.
 * @param {string} size
 * @param {Record<string, {token?: number}>} sizes  CONFIG.DND5E.actorSizes
 */
export function sizeChanges(size, sizes) {
  const grid = Number(sizes?.[size]?.token) || 1;
  const change = (key, value) => ({ key, type: "override", value, phase: "initial" });
  return [change("system.traits.size", size), change("token.width", grid), change("token.height", grid)];
}

/** Does this change list already carry a size? */
export function carriesSize(changes) {
  return (changes ?? []).some(c => ["token.width", "token.height", "system.traits.size"].includes(String(c?.key ?? "")));
}
