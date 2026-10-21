// @ts-check
/** By the Books — DECISION (ARCHITECTURE.md §2): the rest grants given to allies. Pure. */

/**
 * TEMPORARY HIT POINTS DO NOT STACK: true when the grant is no more than what the creature holds.
 * @param {number} current
 * @param {number} amount
 * @returns {boolean}
 */
export function holdsTemp(current, amount) {
  const have = Number(current) || 0;
  const give = Number(amount) || 0;
  return !(give > have);
}

/**
 * A Chef's meal for one eater, off its LATEST Short Rest (rests land in any order): "spent" Hit
 * Dice in the same sitting, "none" spent, or still "resting". The same sitting: one Rest request
 * (`system.request`) when both name one, else within `windowMs`.
 * @param {{rest?: {at?: number, hitDice?: number, requestId?: string|null}|null,
 *          chef: {at: number, requestId?: string|null}, windowMs?: number}} facts
 * @returns {"spent"|"none"|"resting"}
 */
export function mealStanding({ rest = null, chef, windowMs = 2 * 60 * 60 * 1000 }) {
  if ( !rest || !Number.isFinite(rest.at) ) return "resting";
  const same = (rest.requestId && chef?.requestId)
    ? (rest.requestId === chef.requestId)
    : (Math.abs(Number(rest.at) - Number(chef?.at)) <= windowMs);
  if ( !same ) return "resting";
  return (Number(rest.hitDice) > 0) ? "spent" : "none";
}

/* --- the song lands (RULINGS *Musician's song lands*) ------------------------------------------------- */

/**
 * The grants nothing at the table shows as they land, so the landing says them: Heroic Inspiration is a box
 * on the sheet. A temp-HP grant shows on the token's bar; the meal posts its own card.
 */
const SHOWN_GRANTS = new Set(["inspiration"]);

/**
 * THE SONG'S CARD: who sang and who received it, in one line — "Encouraging Song — Heroic Inspiration:
 * Ilka, Tychon", sung by the singer — or null when nobody was given it or the grant shows itself.
 * @param {{ grant?: string|null, benefit?: string|null, row: string, label: string, singer: string, given?: string[]|null }} facts
 * @returns {{ eyebrow: string, title: string, subtitle: string }|null}
 */
export function songCard({ grant, benefit, row, label, singer, given }) {
  if ( !SHOWN_GRANTS.has(String(grant)) || !given?.length ) return null;
  return { eyebrow: row, title: `${benefit || row} — ${label}: ${given.join(", ")}`, subtitle: `sung by ${singer}` };
}

/**
 * THE SONG'S FLOAT: the text every client raises over each recipient's token once the grant has landed
 * ("+Heroic Inspiration"), and whom it rises over (the picks' actor uuids) — or null.
 * @param {{ grant?: string|null, applied?: boolean, picks?: Array<string|{ uuid?: string|null }>|null }|null|undefined} flag
 * @param {string} label
 * @returns {{ text: string, uuids: string[] }|null}
 */
export function songFloat(flag, label) {
  if ( !flag?.applied || !SHOWN_GRANTS.has(String(flag.grant)) ) return null;
  const uuids = [...new Set((flag.picks ?? []).map(p => (typeof p === "string") ? p : (p?.uuid ?? null)).filter(u => !!u))];
  return uuids.length ? { text: `+${label}`, uuids: /** @type {string[]} */ (uuids) } : null;
}

/* --- what a rest ends (RULINGS *Rests end the short effects*) ------------------------------------------ */

/** A rest's reach: the longest duration it ends, in seconds (a Short Rest 1 hour, a Long Rest 8). */
export const REST_REACH = Object.freeze({ short: 3600, long: 8 * 3600 });

/** Seconds a unit lasts; a round or a turn is 6 seconds, a month 30 days, a year 365. */
const UNIT_SECONDS = Object.freeze({ seconds: 1, minutes: 60, hours: 3600, days: 86400, months: 30 * 86400, years: 365 * 86400,
  rounds: 6, turns: 6 });

/** The combat and rest events that end an effect sooner than any rest (Foundry 14's `duration.expiry`). */
const SHORT_EXPIRY = new Set(["combatStart", "roundStart", "turnStart", "combatEnd", "roundEnd", "turnEnd",
  "sourceStart", "sourceEnd", "targetStart", "targetEnd"]);

/**
 * How long an effect lasts, in seconds, off Foundry 14's duration data (`value` in `units`, or an
 * `expiry` event alone): a combat or turn event alone is short (0), a rest event the rest's own
 * length, nothing at all Infinity (a feature's mark, a companion, a lit torch).
 * @param {{ value?: number|null, units?: string|null, expiry?: string|null }|null|undefined} duration
 * @returns {number}
 */
export function effectSeconds(duration) {
  const value = Number(duration?.value);
  if ( Number.isFinite(value) && (duration?.value !== null) && (duration?.value !== undefined) ) {
    const per = UNIT_SECONDS[String(duration?.units ?? "seconds")];
    return per ? value * per : Infinity;
  }
  const expiry = String(duration?.expiry ?? "");
  if ( SHORT_EXPIRY.has(expiry) ) return 0;
  if ( expiry === "shortRest" ) return REST_REACH.short;
  if ( expiry === "longRest" ) return REST_REACH.long;
  return Infinity;
}

/**
 * What a rest ends on the rester (RULINGS *Rests end the short effects*): every effect lasting no longer
 * than the rest (a Short Rest 1 hour, a Long Rest 8), Concentration or not, and on a Long Rest every
 * Concentration. Duration is duration regardless: Concentration outlasts a Short Rest only on a spell of
 * over an hour. A Concentration effect is never in `end` but in `concentration`: the caller ends it through
 * the system, whose cascade takes what depends on it. An effect with no duration stands.
 * @param {Array<{ id: string, concentration?: boolean, duration?: { value?: number|null, units?: string|null, expiry?: string|null }|null }>} effects
 * @param {"short"|"long"|string} type
 * @returns {{ end: string[], concentration: string[] }}
 */
export function restEnds(effects, type) {
  const reach = REST_REACH[/** @type {"short"|"long"} */ (type)];
  if ( !reach ) return { end: [], concentration: [] };
  const end = [];
  const concentration = [];
  for ( const e of effects ?? [] ) {
    const within = effectSeconds(e?.duration) <= reach;
    if ( e?.concentration ) { if ( (type === "long") || within ) concentration.push(e.id); }
    else if ( within ) end.push(e.id);
  }
  return { end, concentration };
}
