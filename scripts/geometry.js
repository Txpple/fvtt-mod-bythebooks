/**
 * By the Books — EDGE layer (ARCHITECTURE.md §2): which token a subject stands as, containment, token
 * distance in FEET and measured cover — the Foundry half; the arithmetic is decide/geometry.js and decide/cover.js.
 * ⚠ No hooks, no flags, no writes.
 */
import { readFlag, stampedSourceOf, resolveUuid, log } from "./core.js";
import { measureCover } from "./decide/cover.js";
import { lengthUnitKey, rectsOverlap, tokenSamplePoints } from "./decide/geometry.js";

/* THE TOKEN (ARCHITECTURE §7 *The shared readers*): which token a subject stands as, by one rule, read here and
 * nowhere else (tools/check-lookups.mjs). A subject is an actor; an actor's or a token's uuid; a token's id on the
 * viewed scene; a token document; or a token on the canvas. */

/** A string with a dot is a uuid; one without is a token's id on the viewed scene. */
const isUuid = s => s.includes(".");

/**
 * The token document a subject stands as, or null. An actor: its own token when it is a token's synthetic actor;
 * else, for a use (`activity`), the token dnd5e's own `Activity#getUsageToken` answers; else its token this client
 * controls; else its first linked token drawn on the viewed scene; else its first linked token there. ⚠ A world
 * actor's UNLINKED token is another creature (its own synthetic actor), never this actor's token. A uuid answers
 * for the document behind it, a token's id for that token on the viewed scene, a token on the canvas for its
 * document; a token document is itself.
 * @param {any} subject
 * @param {{ activity?: any }} [opts]
 * @returns {any}
 */
export function tokenDocOf(subject, { activity = null } = {}) {
  if ( !subject ) return null;
  if ( typeof subject === "string" ) {
    return isUuid(subject) ? tokenDocOf(resolveUuid(subject), { activity }) : (canvas?.tokens?.get?.(subject)?.document ?? null);
  }
  if ( subject.documentName === "Token" ) return subject;
  if ( subject.document?.documentName === "Token" ) return subject.document;
  if ( subject.documentName !== "Actor" ) return null;
  if ( subject.token ) return subject.token;
  try {
    const used = activity?.getUsageToken?.() ?? null;
    if ( used ) return used;
    const controlled = canvas?.tokens?.controlled?.find(t => t.actor?.uuid === subject.uuid);
    if ( controlled ) return controlled.document;
    return subject.getActiveTokens?.(true)?.[0]?.document ?? subject.getActiveTokens?.(true, true)?.[0] ?? null;
  } catch { return null; }
}

/**
 * The token on the canvas a subject stands as (tokenDocOf's rule), or null when it is not drawn; a token on the
 * canvas is itself, a token's id the viewed scene's token of that id.
 * @param {any} subject
 * @param {{ activity?: any }} [opts]
 * @returns {any}
 */
export function tokenOf(subject, opts = {}) {
  if ( !subject ) return null;
  if ( (typeof subject === "string") && !isUuid(subject) ) return canvas?.tokens?.get?.(subject) ?? null;
  if ( subject.document?.documentName === "Token" ) return subject;
  return tokenDocOf(subject, opts)?.object ?? null;
}

/**
 * The subject's token document on a named scene, or null: the scene's first token whose actor carries the
 * subject's uuid (a token's synthetic actor stands on its own scene alone). No controlled-first: the same token on
 * every client.
 * @param {any} subject   an actor, or its uuid
 * @param {any} scene
 * @returns {any}
 */
export function tokenOnScene(subject, scene) {
  const uuid = (typeof subject === "string") ? subject : (subject?.uuid ?? null);
  if ( !uuid || !scene?.tokens ) return null;
  return scene.tokens.find(t => t.actor?.uuid === uuid) ?? null;
}

/**
 * Every token the actor stands as on the viewed scene, drawn: its linked tokens (a token's synthetic actor: its
 * own). `all` adds a world actor's unlinked tokens; `documents` answers their documents, drawn or not. [] when none.
 * @param {any} actor
 * @param {{ all?: boolean, documents?: boolean }} [opts]
 * @returns {any[]}
 */
export function tokensOf(actor, { all = false, documents = false } = {}) {
  try { return actor?.getActiveTokens?.(!all, documents) ?? []; } catch { return []; }
}

/** Who could GUARD a token (Interception, Protection): its side, alive, not Incapacitated, within
 * `feet`. A neutral or secret token has no side: nobody.
 * @param {Token} guarded
 * @param {number} feet
 * @param {string[]} [exclude]  actor uuids
 * @returns {Token[]} */
export function alliesWithin(guarded, feet, exclude = []) {
  const side = guarded?.document?.disposition;
  if ( !guarded || ((side !== 1) && (side !== -1)) ) return [];
  const skip = new Set([guarded.actor?.uuid, ...exclude].filter(Boolean));
  const out = [];
  for ( const other of (canvas.tokens?.placeables ?? []) ) {
    if ( (other === guarded) || (other.document?.disposition !== side) ) continue;
    const actor = other.actor;
    if ( !actor || skip.has(actor.uuid) ) continue;
    if ( ((actor.system?.attributes?.hp?.value ?? 0) <= 0) || actor.statuses?.has?.("incapacitated") ) continue;
    const d = nearestFeet(other, guarded);
    if ( (d !== null) && (d <= feet) ) out.push(other);
  }
  return out;
}

/** Every OTHER creature within `feet` of a token, any side, with Hit Points (a corpse's Emanation — Death
 * Throes: "each creature in a 30-foot Emanation originating from the balor"); the 0-HP are the dead-target
 * gate's, skipped. Edge to edge, as an Emanation measures.
 * @param {Token} origin
 * @param {number} feet
 * @returns {Token[]} */
export function creaturesWithin(origin, feet) {
  if ( !origin || !(Number(feet) >= 0) ) return [];
  const out = [];
  for ( const other of (canvas.tokens?.placeables ?? []) ) {
    if ( (other === origin) || (other.actor?.uuid === origin.actor?.uuid) ) continue;
    const actor = other.actor;
    if ( !actor?.system?.attributes?.hp || ((actor.system.attributes.hp.value ?? 0) <= 0) ) continue;
    const d = nearestFeet(other, origin);
    if ( (d !== null) && (d <= feet) ) out.push(other);
  }
  return out;
}

/** Every occupied square's center, from the committed SOURCE. ⚠ While a token animates, the
 * document's `x`/`y` are INTERIM; `_source` holds the destination. */
function documentSquares(doc) {
  const grid = doc.parent?.grid?.size;
  if ( !grid ) return [];
  const x = doc._source?.x ?? doc.x, y = doc._source?.y ?? doc.y;
  const w = Math.max(1, Math.round(doc.width ?? 1)), h = Math.max(1, Math.round(doc.height ?? 1));
  if ( (w === 1) && (h === 1) ) return [{ x: x + grid / 2, y: y + grid / 2 }];
  // No `object`, so the pure reader never falls back to the drawn center.
  return tokenSamplePoints({ parent: doc.parent, width: doc.width, height: doc.height, x, y });
}

/** A length in the scene's or an item's units, as FEET through the system's own table — or null. */
export function feetOf(n, units) {
  const unit = lengthUnitKey(units);
  const value = Number(n);
  if ( !unit || !Number.isFinite(value) ) return null;
  const feet = (unit === "ft") ? value : dnd5e.utils.convertLength(value, unit, "ft", { strict: false });
  return Number.isFinite(feet) ? feet : null;
}

/** Who put this Grappled on its bearer: the module's source stamp, else the origin's actor, or null. */
export function grapplerOf(effect) {
  const stamped = stampedSourceOf(effect);
  if ( stamped ) return stamped;
  const origin = resolveUuid(effect?.origin);
  return (origin instanceof Actor) ? origin.uuid : (origin?.actor?.uuid ?? null);
}

/**
 * The creatures this one grapples — `[{ uuid, tokenUuid, name, certain }]`: a Grappled the module or the
 * origin traces to the actor is certain; an untraceable grappler within 5 feet counts, uncertain.
 * @param {Actor} actor
 * @param {Token|null} token   the grappler's token, for the 5-foot guess
 */
export function grappledBy(actor, token) {
  const out = [];
  for ( const other of (canvas.tokens?.placeables ?? []) ) {
    const a = other.actor;
    if ( !a || (a.uuid === actor.uuid) || !a.statuses?.has?.("grappled") ) continue;
    const effects = [...(a.effects ?? [])].filter(e => e.active && e.statuses?.has?.("grappled"));
    const by = effects.map(grapplerOf);
    const certain = by.includes(actor.uuid);
    const unknown = !certain && by.some(x => !x) && token && ((nearestFeet(token, other) ?? Infinity) <= 5);
    if ( certain || unknown ) out.push({ uuid: a.uuid, tokenUuid: other.document.uuid, name: other.document.name ?? a.name, certain });
  }
  return out;
}

/** Do two tokens' footprints overlap (a creature standing inside another's space)? False when unreadable. */
export function tokensOverlap(a, b) {
  const da = a?.document ?? a, db = b?.document ?? b;
  const grid = da?.parent?.grid?.size ?? db?.parent?.grid?.size;
  if ( !da || !db || !grid ) return false;
  return rectsOverlap({ x: da.x, y: da.y, w: (da.width ?? 1) * grid, h: (da.height ?? 1) * grid },
    { x: db.x, y: db.y, w: (db.width ?? 1) * grid, h: (db.height ?? 1) * grid });
}

/** The shortest grid distance between two tokens' squares, IN FEET; null when unreadable.
 * ⚠ `measurePath` answers in the SCENE's units (a 1.5 m grid reads "3"). */
export function nearestFeet(a, b) {
  try {
    const pa = documentSquares(a.document), pb = documentSquares(b.document);
    if ( !pa.length || !pb.length ) return null;
    let best = Infinity;
    for ( const p of pa ) {
      for ( const q of pb ) {
        const d = canvas.grid.measurePath([p, q]).distance;
        if ( Number.isFinite(d) && (d < best) ) best = d;
      }
    }
    if ( !Number.isFinite(best) ) return null;
    const feet = feetOf(best, canvas.scene?.grid?.units ?? canvas.grid?.units);
    return (feet === null) ? null : Math.round(feet * 10) / 10;
  } catch {
    return null;
  }
}


/** The actors in the REGIONS (null = no region, unlike an empty area), by `testInsideRegion` (no
 * canvas needed). ⚠ Never `region.tokens`: a new region has not computed its membership yet. */
export function tokensInRegions(regions) {
  const docs = (regions ?? []).filter(r => r?.parent && (typeof r.parent.tokens?.filter === "function"));
  if ( !docs.length ) return null;
  const seen = new Set();
  const entries = [];
  for ( const region of docs ) {
    for ( const tok of region.parent.tokens ) {
      if ( tok.isSecret || !tok.actor ) continue;
      let inside = false;
      try { inside = tok.testInsideRegion(region); } catch(err) {
        log.warn(`Could not test ${tok.name} against an area — counted outside.`, err);
      }
      if ( !inside ) continue;
      const uuid = tok.actor.uuid;
      if ( seen.has(uuid) ) continue;
      seen.add(uuid);
      entries.push({ uuid, name: tok.name, tokenId: tok.id, disposition: tok.disposition });
    }
  }
  return entries;
}

/** A token's space from its committed SOURCE (see documentSquares), in pixels. */
function spaceOf(doc, grid) {
  const x = doc._source?.x ?? doc.x, y = doc._source?.y ?? doc.y;
  return { x, y, w: (doc.width ?? 1) * grid, h: (doc.height ?? 1) * grid };
}

/** The cover a creature's prepared AC carries; an AC OVERRIDE leaves cover out (`prepareArmorClass`). */
export function carriedCover(actor) {
  const ac = actor?.system?.attributes?.ac;
  if ( Number.isFinite(Number(ac?.override)) && (ac?.override !== null) && (ac?.override !== "") ) return 0;
  return Math.max(0, Number(ac?.cover) || 0);
}

/** MEASURED COVER (RULINGS *Measured cover*): walls by the MOVE collision test, creatures bar the
 * hidden and dead; null off one scene, on hex, or on a scene flagged `noCover` (the suites' lever:
 * their fixtures stand in a row).
 * @param {Token} attacker
 * @param {Token} target */
export function measuredCoverBetween(attacker, target) {
  try {
    const a = attacker?.document, t = target?.document;
    if ( !a || !t || (a === t) || (a.parent !== t.parent) || !canvas?.grid ) return null;
    if ( canvas.grid.isHexagonal || readFlag(a.parent, "noCover") ) return null;
    const size = canvas.grid.size;
    const grid = canvas.grid.isGridless ? 0 : size;
    const creatures = [];
    for ( const other of (canvas.tokens?.placeables ?? []) ) {
      const d = other.document;
      if ( !other.actor || (d === a) || (d === t) || d.hidden ) continue;
      if ( other.actor.statuses?.has?.("dead") ) continue;
      creatures.push({ name: other.name, rect: spaceOf(d, size) });
    }
    const backend = CONFIG.Canvas.polygonBackends.move;
    const wallBlocks = (p, q) => !!backend.testCollision(p, q, { type: "move", mode: "any" });
    return measureCover({
      attacker: spaceOf(a, size), target: spaceOf(t, size), grid, creatures, wallBlocks,
      // the platform's test ROUNDS its points to whole pixels — a pull under 2 px can land back on the edge
      inset: Math.max(2, size * 0.03)
    });
  } catch(err) {
    log.warn(`Cover could not be measured between ${attacker?.name} and ${target?.name}.`, err);
    return null;
  }
}
