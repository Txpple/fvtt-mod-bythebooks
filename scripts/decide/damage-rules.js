/**
 * By the Books — DECISION (ARCHITECTURE.md §2): THE DAMAGE RULES' arithmetic — what is held, a
 * face's state, whether a roll fits, what a floor raised, a flat bonus's scope. Rows: registry.js
 * DAMAGE_RULES (the fighting styles, the damage feats, the spell-damage bonuses); RULINGS *The
 * fighting styles*, *The PHB classes — B4*.
 */

const MELEE = new Set(["simpleM", "martialM"]);
const ARMOR = new Set(["light", "medium", "heavy"]);

/*
 * @typedef {object} ItemFact
 * @property {string} name
 * @property {string} type
 * @property {string} [kind]  system.type.value
 * @property {boolean} equipped
 * @property {string[]} [properties]
 * @property {string} [base]  system.type.baseItem
 */

/** What the owner holds and wears: held is EQUIPPED (RULINGS *Where the table bends the rule*);
 * a natural weapon is never held.
 * @param {ItemFact[]} items
 * @returns {{weapons: ItemFact[], armor: ItemFact|null, shield: ItemFact|null}} */
export function heldOf(items) {
  const on = (items ?? []).filter(i => i?.equipped === true);
  return {
    weapons: on.filter(i => (i.type === "weapon") && (i.kind !== "natural")),
    armor: on.find(i => (i.type === "equipment") && ARMOR.has(i.kind)) ?? null,
    shield: on.find(i => (i.type === "equipment") && (i.kind === "shield")) ?? null
  };
}

const has = (item, prop) => (item?.properties ?? []).includes(prop);
/** registry.js CROSSBOWS (this layer imports nothing). */
const CROSSBOW_IDS = new Set(["handcrossbow", "lightcrossbow", "heavycrossbow"]);
const isMelee = item => MELEE.has(item?.kind);

/** The gates that switch a face on and off with what the owner holds or wears. Such a face stands on
 * the effect view's bar, live or off (RULINGS *The fighting styles*). Not `thrown` or `unarmed` (always
 * live: the attack's mode, or the die, is the whole difference) and not `always`.
 * @param {string} gate @returns {boolean} */
export function faceSwitches(gate) {
  return ["twoHanded", "offhand", "oneHanded", "armored", "heavy", "heavyArmor", "offhandCrossbow"].includes(gate);
}

/** A style's face: live, or off; `word` is the one-word state, `detail` the hover line.
 * @param {string} gate
 * @param {ReturnType<typeof heldOf>} held
 * @param {{small?: string, large?: string}} [dice]  Unarmed Fighting's dice
 * @returns {{live: boolean, word: string, detail: string}} */
export function faceState(gate, held, dice = {}) {
  const w = held?.weapons ?? [];
  const lc = item => String(item?.name ?? "").toLowerCase();
  switch ( gate ) {
    case "twoHanded": {
      const big = w.find(i => isMelee(i) && (has(i, "two") || has(i, "ver")));
      return big ? { live: true, word: lc(big), detail: `${big.name}, two hands` }
        : { live: false, word: "unequipped", detail: "no Two-Handed or Versatile melee weapon equipped" };
    }
    // always on: a thrown weapon need not be equipped; the attack's mode is the gate
    case "thrown": return { live: true, word: "", detail: "thrown attacks" };
    case "offhand": {
      const light = w.filter(i => has(i, "lgt"));
      return ((w.length >= 2) && light.length) ? { live: true, word: lc(light.at(-1)), detail: "the Light weapon's extra attack" }
        : { live: false, word: "unpaired", detail: "not holding two weapons" };
    }
    case "oneHanded": {
      const melee = w.filter(isMelee);
      if ( !melee.length ) return { live: false, word: "unequipped", detail: "no melee weapon equipped" };
      if ( w.length > 1 ) {
        const other = w.find(i => i !== melee[0]);
        return { live: false, word: "dual-wielding", detail: `a second weapon held (${other.name})` };
      }
      if ( has(melee[0], "two") ) return { live: false, word: "two-handed", detail: `${melee[0].name} needs two hands` };
      return { live: true, word: lc(melee[0]), detail: `${melee[0].name} in one hand` };
    }
    case "armored":
      return held?.armor ? { live: true, word: lc(held.armor), detail: held.armor.name }
        : { live: false, word: "unarmored", detail: "no armor worn" };
    case "heavy": {
      const heavy = w.find(i => has(i, "hvy"));
      return heavy ? { live: true, word: lc(heavy), detail: `${heavy.name}, Heavy` }
        : { live: false, word: "unequipped", detail: "no Heavy weapon equipped" };
    }
    case "heavyArmor":
      return (held?.armor?.kind === "heavy") ? { live: true, word: lc(held.armor), detail: held.armor.name }
        : { live: false, word: held?.armor ? "not heavy" : "unarmored",
          detail: held?.armor ? `${held.armor.name} is not Heavy armor` : "no armor worn" };
    case "offhandCrossbow": {
      const light = w.filter(i => has(i, "lgt") && CROSSBOW_IDS.has(i.base));
      return ((w.length >= 2) && light.length) ? { live: true, word: lc(light.at(-1)), detail: "the Light crossbow's extra attack" }
        : { live: false, word: "unpaired", detail: "not holding a Light crossbow and a second weapon" };
    }
    // no equipment in the rule (Elemental Adept, Poisoner): on while the feat is on the sheet
    case "always": return { live: true, word: "", detail: "always" };
    case "unarmed": {
      const empty = !w.length && !held?.shield;
      const die = empty ? (dice.large ?? "d8") : (dice.small ?? "d6");
      return { live: true, word: die, detail: empty ? `${die} — hands empty` : `${die} — a weapon or Shield held` };
    }
    default: return { live: false, word: "", detail: "" };
  }
}

/** A face whose number lives on the pack's effect (Dueling's +2, Defense's +1 AC) is off when none can be found — the
 * feat's own effect gone and no original to read it from — and says why; any other face is as `state` has it.
 * @param {{live: boolean, word: string, detail: string}} state
 * @param {{needs?: "damage"|"AC"|null, found?: boolean}} [number]
 * @returns {{live: boolean, word: string, detail: string}} */
export function numberedFace(state, { needs = null, found = false } = {}) {
  if ( !needs || found ) return state;
  return { live: false, word: "no bonus", detail: `no ${needs} bonus on the feat — its own effect is missing` };
}

/** Does THIS roll fit? The attack's mode decides the grip (none: Two-Handed is two hands). `ownTurn`
 * is false only on someone else's combat turn (Heavy Weapon Mastery's "on your turn").
 * @param {string} gate
 * @param {{kind?: string, properties?: string[], mode?: string|null, mod?: number, faceLive?: boolean, ownTurn?: boolean}} roll
 * @returns {boolean} */
export function rollFits(gate, roll) {
  const mode = roll?.mode || (has(roll, "two") ? "twoHanded" : "oneHanded");
  switch ( gate ) {
    case "heavy": return has(roll, "hvy") && (roll?.ownTurn !== false);
    case "twoHanded": return isMelee(roll) && (mode === "twoHanded") && (has(roll, "two") || has(roll, "ver"));
    case "thrown": return ((mode === "thrown") || (mode === "thrown-offhand")) && has(roll, "thr");
    // dnd5e keeps a NEGATIVE modifier on the off-hand already; the style adds only what it dropped
    case "offhand": return ((mode === "offhand") || (mode === "thrown-offhand")) && (Number(roll?.mod) > 0);
    case "offhandCrossbow": return (mode === "offhand") && CROSSBOW_IDS.has(roll?.base) && has(roll, "lgt") && (Number(roll?.mod) > 0);
    case "oneHanded": return isMelee(roll) && (mode === "oneHanded") && (roll?.faceLive === true);
    default: return false;
  }
}

/** The damage types a `typed` row reads off each copy's NAME ("Elemental Adept (Fire, Cold)").
 * @param {string[]} names
 * @param {string} base  the row's name
 * @param {Iterable<string>} known  CONFIG.DND5E.damageTypes keys
 * @returns {string[]}  lower-case, each once */
export function typesInNames(names, base, known) {
  const ok = new Set([...(known ?? [])].map(k => String(k).toLowerCase()));
  const out = [];
  const head = String(base ?? "").toLowerCase();
  for ( const name of (names ?? []) ) {
    const n = String(name ?? "").trim();
    if ( !n.toLowerCase().startsWith(head) ) continue;
    const inside = n.slice(head.length).match(/\(([^)]*)\)/)?.[1] ?? "";
    for ( const word of inside.split(/[,/&]|\band\b/i) ) {
      const t = word.trim().toLowerCase();
      if ( t && ok.has(t) && !out.includes(t) ) out.push(t);
    }
  }
  return out;
}

/** THE TYPE PICK: the row's choices less those other copies name ("a different damage type each time").
 * @param {string[]} choices
 * @param {string[]} held
 * @returns {string[]} */
export function typeChoicesLeft(choices, held) {
  const have = new Set((held ?? []).map(t => String(t).toLowerCase()));
  return (choices ?? []).filter(t => !have.has(String(t).toLowerCase()));
}

/**
 * B4 — THE SPELL-DAMAGE BONUS (RULINGS *The PHB classes — B4*, Q5): does a `spells` row with a `bonus` fit THIS
 * spell, and which of the roll's damage types it rides? The row's scope: `spells` true (any spell) or "cantrip";
 * `classes` (the spell's own class); `school`; the types (`types`, or a `typed` row's picks). Returns the types the
 * bonus may ride — every dealt type when the row names none — or null when the row does not fit.
 * @param {{spells?: boolean|string, classes?: string[], school?: string, bonus?: string}} row
 * @param {{level?: number|null, school?: string|null, sourceClass?: string|null, dealt?: string[]}} spell
 * @param {string[]} [types]  the row's types (a typed row's picks)
 * @returns {string[]|null} */
export function spellRuleFits(row, spell, types = []) {
  if ( !row?.spells || !row.bonus ) return null;
  if ( (row.spells === "cantrip") && (Number(spell?.level ?? -1) !== 0) ) return null;
  if ( row.classes?.length && !row.classes.includes(String(spell?.sourceClass ?? "")) ) return null;
  if ( row.school && (String(spell?.school ?? "").toLowerCase() !== String(row.school).toLowerCase()) ) return null;
  const dealt = [...new Set((spell?.dealt ?? []).filter(Boolean).map(t => String(t).toLowerCase()))];
  if ( !dealt.length ) return null;
  const own = (types ?? []).map(t => String(t).toLowerCase());
  if ( !own.length ) return dealt;
  const hit = dealt.filter(t => own.includes(t));
  return hit.length ? hit : null;
}

/** A typed row's face: the types it reads, or off with how to fix it.
 * @param {string} name
 * @param {string[]} types
 * @returns {{live: boolean, word: string, detail: string}} */
export function typedFace(name, types) {
  if ( !types?.length ) return { live: false, word: "no type", detail: `no damage type chosen — use Choose type on its card, or rename it "${name} (Fire)"` };
  const title = t => t.charAt(0).toUpperCase() + t.slice(1);
  return { live: true, word: types.join(", "), detail: types.map(title).join(" and ") };
}

/** THE IGNORED RESISTANCE: the row's types this damage carries that the target resists, for the
 * receipt (the ignoring itself is dnd5e's).
 * @param {{type?: string|null, value?: number}[]} damages
 * @param {string[]} types
 * @param {Iterable<string>} resisted
 * @returns {string[]} */
export function ignoredResistances(damages, types, resisted) {
  const dr = new Set(resisted ?? []);
  const kinds = new Set(types ?? []);
  const out = [];
  for ( const d of (damages ?? []) ) {
    const t = d?.type;
    if ( t && kinds.has(t) && dr.has(t) && ((Number(d?.value) || 0) > 0) && !out.includes(t) ) out.push(t);
  }
  return out;
}

/** THE BLOCK (Heavy Armor Master): the listed types cut by `amount` IN ALL (one number, not one per
 * type), from the parts in order, never below 0.
 * @param {{value: number, type?: string|null}[]} damages
 * @param {string[]} types
 * @param {number} amount
 * @returns {{values: number[], cut: number}} */
export function blockDamages(damages, types, amount) {
  let left = Math.max(0, Math.floor(Number(amount) || 0));
  const kinds = new Set(types ?? []);
  const values = (damages ?? []).map(d => {
    const v = Number(d?.value) || 0;
    if ( !left || !kinds.has(d?.type) || (v <= 0) ) return v;
    const take = Math.min(v, left);
    left -= take;
    return v - take;
  });
  return { values, cut: Math.max(0, Math.floor(Number(amount) || 0)) - left };
}

/** What a `min` floor raised (Foundry keeps the face in `result`, the counted value in `count`).
 * @param {object[]} rolls  evaluated rolls, as JSON
 * @param {number} minimum
 * @returns {{raised: {from: number, to: number}[], gain: number}} */
export function raisedOf(rolls, minimum) {
  const raised = [];
  const walk = terms => {
    for ( const t of (terms ?? []) ) {
      if ( Array.isArray(t?.terms) ) walk(t.terms);           // a pool or a parenthetical
      if ( Array.isArray(t?.rolls) ) for ( const r of t.rolls ) walk(r?.terms);
      if ( !Array.isArray(t?.results) || !(t.modifiers ?? []).some(m => /^min\d+$/i.test(m)) ) continue;
      for ( const r of t.results ) {
        if ( (r?.active === false) || (r?.discarded === true) ) continue;
        const face = Number(r?.result), counted = Number(r?.count);
        if ( Number.isFinite(face) && Number.isFinite(counted) && (face < minimum) && (counted > face) ) {
          raised.push({ from: face, to: counted });
        }
      }
    }
  };
  for ( const roll of (rolls ?? []) ) walk(roll?.terms);
  return { raised, gain: raised.reduce((sum, r) => sum + (r.to - r.from), 0) };
}

/** The damage card's line for one style that changed a roll.
 * @param {{feature: string, gain: number, raised?: {from: number, to: number}[], note?: string}} entry
 * @returns {string} */
export function styleLine(entry) {
  if ( entry?.raised?.length ) {
    const faces = [...new Set(entry.raised.map(r => r.from))].sort((a, b) => a - b).join(" and ");
    return `${entry.feature} — ${faces} → ${entry.raised[0].to}: +${entry.gain}`;
  }
  return `${entry.feature} — +${entry.gain}${entry.note ? ` ${entry.note}` : ""}`;
}

// THE DICE as chips (RULINGS *The dice that rise*): a raised die turns over, a flat bonus is a chip.

/** Chips at most; past this the row's own total carries it. */
export const DICE_CAP = 12;

/** Every die rolled, in order: size, count, and the face a floor raised it from (as raisedOf).
 * @param {object[]} rolls  evaluated rolls, as JSON
 * @param {number|null} [minimum]
 * @returns {{faces: number, v: number, was?: number}[]} */
export function diceOf(rolls, minimum = null) {
  const dice = [];
  const walk = terms => {
    for ( const t of (terms ?? []) ) {
      if ( Array.isArray(t?.terms) ) walk(t.terms);
      if ( Array.isArray(t?.rolls) ) for ( const r of t.rolls ) walk(r?.terms);
      if ( !Array.isArray(t?.results) || !Number(t?.faces) ) continue;
      const floored = (t.modifiers ?? []).some(m => /^min\d+$/i.test(m));
      for ( const r of t.results ) {
        if ( (r?.active === false) || (r?.discarded === true) ) continue;
        const face = Number(r?.result), counted = Number.isFinite(Number(r?.count)) ? Number(r.count) : face;
        if ( !Number.isFinite(face) ) continue;
        const raised = floored && Number.isFinite(minimum) && (face < minimum) && (counted > face);
        dice.push(raised ? { faces: Number(t.faces), v: counted, was: face } : { faces: Number(t.faces), v: counted });
      }
    }
  };
  for ( const roll of (rolls ?? []) ) walk(roll?.terms);
  return dice.slice(0, DICE_CAP);
}

/** One style's chips: the dice, then a flat bonus as its own chip; a floor's gain follows the dice.
 * @param {{gain: number, raised?: object[]}} entry
 * @param {{faces: number, v: number, was?: number}[]} dice
 * @returns {{chips: {label: string, was?: string, up?: boolean, flat?: boolean, faces?: number}[], after: string}} */
export function chipsOf(entry, dice) {
  const floor = !!entry?.raised?.length;
  const chips = (dice ?? []).map(d => (floor && Number.isFinite(d.was))
    ? { label: String(d.v), was: String(d.was), up: true, faces: d.faces }
    : { label: String(d.v), faces: d.faces });
  if ( !floor && (entry?.gain > 0) ) chips.push({ label: `+${entry.gain}`, flat: true, up: true });
  return { chips, after: floor ? `+${entry.gain}` : "" };
}

