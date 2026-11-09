// @ts-check
/** By the Books — DECISION layer (ARCHITECTURE.md §2): the REBUKE, a Reaction aimed at the creature that
 * damaged the bearer (the table is registry.js REBUKES, the machine rebukes.js). */

/** The reach in feet: the row's `range`, else the activity's; null offers nothing (never guessed).
 * @param {{range?: number, self?: boolean}} row
 * @param {number|null} activityFeet
 * @returns {number|null} */
export function rebukeReach(row, activityFeet) {
  if ( row?.self ) return Infinity;                       // aimed at nobody: no reach to measure
  if ( Number(row?.range) > 0 ) return Number(row.range);
  return (Number(activityFeet) > 0) ? Number(activityFeet) : null;
}

/**
 * Does the damage's type answer a `types` row? No `types`: every damage. A card the module cannot read
 * (`damageTypes` empty) COUNTS the row — never a guessed exemption.
 * @param {readonly string[]|null|undefined} types
 * @param {readonly string[]} damageTypes */
export function rebukeTypesAdmit(types, damageTypes) {
  if ( !types?.length ) return true;
  const dealt = (damageTypes ?? []).map(t => String(t ?? "").toLowerCase()).filter(Boolean);
  if ( !dealt.length ) return true;
  const wanted = new Set(types.map(t => String(t).toLowerCase()));
  return dealt.some(t => wanted.has(t));
}

/** The cards an emanation deals its damage on (emanations.js), each naming its Emanations row (`key`): a trigger's (enter,
 * a turn's start or end, the area moved onto it), a move's (Spike Growth), a pulse's. A save trigger's damage roll chains
 * to its demand (`system.origin`). */
export const ZONE_CARD_FLAGS = Object.freeze(["emanationTrigger", "areaMove", "emanationPulse"]);

/** The Emanations row keys a card's module flags name through its zone flags.
 * @param {Record<string, any>|null|undefined} flags the card's `flags[MODULE_ID]`
 * @returns {string[]} */
export function zoneKeysOf(flags) {
  return ZONE_CARD_FLAGS.map(f => flags?.[f]?.key).filter(k => (typeof k === "string") && k);
}

/**
 * Was this damage a PLACED area's — an Emanations row of kind `area` (Cloud of Daggers, Moonbeam, Spike Growth, Wall of
 * Fire), not a creature's own blow (RULINGS, the rebukes against a standing area)? The rows a zone card or its chain
 * names, and the row of the card's own item (the area appearing on a creature at the cast), are read. A ring carried
 * on its source (`spell` or `feature`: Spirit Guardians, a monster's aura) is its bearer's blow, and so is every
 * other card — a Fireball, a Shatter, a spell attack, a weapon. A key the table does not know counts as a blow.
 * @param {readonly ({kind?: string}|null|undefined)[]} rows
 * @returns {boolean} */
export function placedAreaDamage(rows) {
  return (rows ?? []).some(r => r?.kind === "area");
}

/** Does this row answer the DEALER (a rebuke aimed back at it), so a zone's damage skips it? A `self` row (Misty Escape)
 * answers the damage itself, wherever it came from.
 * @param {{self?: boolean}} row */
export function rebukeAimsAtDealer(row) {
  return !row?.self;
}

/** Why this rebuke may not be offered now, or null. A null fact is a rule that does not apply (no uses,
 * not a spell, no `while`, no `equipped`, not a ward); a ward asks only when the damager is on another side.
 * @param {{self: boolean, hp: number, reactionSpent: boolean, distance: number|null, reach: number|null, usesLeft: number|null,
 *   slot: boolean|null, whileStands: boolean|null, equipped: boolean|null, side?: boolean|null}} f
 * @returns {string|null} */
export function rebukeBlocked({ self, hp, reactionSpent, distance, reach, usesLeft, slot, whileStands, equipped, side = null }) {
  if ( self ) return "self";
  if ( side === false ) return "an ally";
  if ( !(Number(hp) > 0) ) return "down";
  if ( reactionSpent ) return "reaction spent";
  if ( whileStands === false ) return "not active";
  if ( equipped === false ) return "not held";
  if ( (usesLeft !== null) && (usesLeft !== undefined) && !(Number(usesLeft) > 0) ) return "no uses left";
  if ( slot === false ) return "no spell slot";
  if ( reach === Infinity ) return null;                  // a `self` row: nothing to reach
  if ( (reach === null) || (reach === undefined) ) return "no reach";
  if ( (distance === null) || (distance === undefined) ) return "distance unknown";
  if ( Number(distance) > Number(reach) ) return "out of reach";
  return null;
}

/** The cost the button names ("a Reaction · 2 of 3 uses left").
 * @param {{usesLeft?: number|null, usesMax?: number|null, spell?: boolean}} f */
export function rebukeCost({ usesLeft = null, usesMax = null, spell = false }) {
  if ( spell ) return "a Reaction, a spell slot";
  if ( (usesLeft !== null) && (Number(usesMax) > 0) ) {
    return `a Reaction · ${usesLeft} of ${usesMax} use${Number(usesMax) === 1 ? "" : "s"} left`;
  }
  return "a Reaction";
}

/** The card's line for a rebuke record — source, then result (law 6).
 * @param {{actorName?: string, sourceName?: string, answer?: string|null, choice?: string|null,
 *          timedOut?: boolean, distance?: number|null, ward?: boolean, targetName?: string, miss?: boolean}} flag */
export function rebukeLine(flag) {
  const who = flag?.actorName ?? "The creature";
  const at = flag?.sourceName ?? "the creature that damaged it";
  if ( flag?.ward ) {
    const hurt = flag.targetName ?? "someone else";
    if ( flag.answer === "use" ) return `${flag.choice} — ${who} strikes ${at} for hitting ${hurt}`;
    if ( flag.answer === "pass" ) return `${who} lets ${at}'s hit on ${hurt} go${flag.timedOut ? " (timer)" : ""}`;
    const near = Number.isFinite(Number(flag?.distance)) && (flag?.distance !== null) ? ` (${flag.distance} ft)` : "";
    return `${who} may strike ${at}${near} — it hit ${hurt}`;
  }
  if ( flag?.miss ) {
    if ( flag.answer === "use" ) return `${flag.choice} — ${who} answers ${at}'s miss`;
    if ( flag.answer === "pass" ) return `${who} lets ${at}'s miss go${flag.timedOut ? " (timer)" : ""}`;
    return `${who} may answer ${at} — it missed`;
  }
  if ( flag?.answer === "use" ) return `${flag.choice} — ${who} answers ${at}`;
  if ( flag?.answer === "pass" ) return `${who} lets ${at}'s damage go${flag.timedOut ? " (timer)" : ""}`;
  const feet = Number.isFinite(Number(flag?.distance)) && (flag?.distance !== null) ? ` (${flag.distance} ft)` : "";
  return `${who} may answer ${at}${feet}`;
}
