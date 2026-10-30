// @ts-check
/**
 * By the Books — DECISION: an emanation's reach, range and member effect, the SOURCE's numbers read in
 * (the platform would resolve against the wearer). Pure (ARCHITECTURE.md §2); RULINGS *Emanations*.
 */

/** CONST.TOKEN_DISPOSITIONS, plain here on purpose. */
export const DISPOSITION = Object.freeze({ SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 });

/**
 * Does this REACH touch the creature? Helpful: own side + neutrals; harmful: the other side. Never SECRET.
 * "summoner" reads as helpful here; the area's `only` narrows it to the one creature (`groupMembers`).
 * @param {"helpful"|"harmful"|"all"|"summoner"} reach
 * @param {number} sourceDisposition
 * @param {number} targetDisposition
 */
export function reachAdmits(reach, sourceDisposition, targetDisposition) {
  if ( (targetDisposition === DISPOSITION.SECRET) || (sourceDisposition === DISPOSITION.SECRET) ) return false;
  if ( reach === "all" ) return true;
  if ( (reach === "helpful") || (reach === "summoner") ) return (targetDisposition === sourceDisposition) || (targetDisposition === DISPOSITION.NEUTRAL);
  if ( reach === "harmful" ) {
    if ( sourceDisposition === DISPOSITION.NEUTRAL ) return targetDisposition !== DISPOSITION.NEUTRAL;
    return targetDisposition === -sourceDisposition;
  }
  return false;
}

/**
 * Does an area's `target.affects.type` take in this creature? The caster's own token is the caller's to leave out.
 * @param {string|null} affects
 * @param {number} casterDisposition
 * @param {number} targetDisposition
 */
export function affectsAdmits(affects, casterDisposition, targetDisposition) {
  if ( affects === "enemy" ) {
    if ( (targetDisposition === DISPOSITION.SECRET) || (casterDisposition === DISPOSITION.SECRET) ) return true;
    return targetDisposition !== casterDisposition;
  }
  if ( affects === "ally" ) return targetDisposition === casterDisposition;
  return true;
}

/**
 * Is this an Emanation from its user (a `radius` or `emanation` template at range self)? Its area
 * leaves out the origin creature (PHB *Emanation*), listed row or not (Arms of Hadar).
 * @param {{ target?: { template?: { type?: string } }, range?: { units?: string } }|null|undefined} activity
 */
export function selfEmanation(activity) {
  const type = activity?.target?.template?.type ?? "";
  if ( !["radius", "emanation"].includes(type) ) return false;
  return (activity?.range?.units ?? "self") === "self";
}

/**
 * The listed PULSE row whose form this use is (its damage is the pulse's at turn end, never the use's).
 * @param {Record<string, {pulse?: object|null, item?: string, activity?: string}>} table   EMANATIONS
 * @param {{ itemName: string|null|undefined, activityName: string|null|undefined }} use
 * @param {Set<string>} listed   lower-cased
 * @returns {string|null}
 */
export function pulseFormKey(table, { itemName, activityName }, listed) {
  const item = String(itemName ?? "").toLowerCase();
  const act = String(activityName ?? "").toLowerCase();
  if ( !item || !act ) return null;
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    if ( !row?.pulse || !row.activity || !listed?.has?.(key.toLowerCase()) ) continue;
    if ( (String(row.item ?? key).toLowerCase() === item) && (String(row.activity).toLowerCase() === act) ) return key;
  }
  return null;
}

/**
 * Walk a dotted path through roll data; a scale value (`{ value: 10 }`) yields its number.
 * @param {Record<string, any>} data
 * @param {string} path
 * @returns {number|string|null}
 */
export function lookupRollData(data, path) {
  let cur = data;
  for ( const part of path.split(".") ) {
    if ( (cur === null) || (cur === undefined) || (typeof cur !== "object") ) return null;
    cur = cur[part];
  }
  if ( (cur === null) || (cur === undefined) ) return null;
  if ( typeof cur === "object" ) return (typeof cur.value === "number") ? cur.value : (cur.value ?? null);
  return cur;
}

/**
 * Replace every `@path`; an unresolved one is reported so the EDGE refuses a silent zero (NOTES §2).
 * @param {string} formula
 * @param {Record<string, any>} data
 * @returns {{ text: string, unresolved: string[] }}
 */
export function resolveFormula(formula, data) {
  const unresolved = [];
  const text = String(formula ?? "").replace(/@([a-zA-Z0-9_.-]+)/g, (whole, path) => {
    const v = lookupRollData(data, path);
    if ( (v === null) || (v === undefined) || (v === "") ) { unresolved.push(path); return whole; }
    return String(v);
  });
  return { text, unresolved };
}

/**
 * The pack's effect changes with the source's numbers read in, plain arithmetic folded.
 * @param {Array<Record<string, any>>} changes   plain typed copies (decide/changes.js `changeCopy`)
 * @param {Record<string, any>} data     the SOURCE's roll data
 * @returns {{ changes: Array<Record<string, any>>, unresolved: string[] }}
 */
export function resolveChanges(changes, data) {
  const unresolved = [];
  const out = (changes ?? []).map(c => {
    const value = String(c.value ?? "");
    if ( !value.includes("@") ) return { ...c, value };
    const r = resolveFormula(value, data);
    unresolved.push(...r.unresolved);
    return { ...c, value: foldArithmetic(r.text) };
  });
  return { changes: out, unresolved };
}

/** `3`, `-1`, `2 + 1`, `10 - 2 * 3` → their number as text; anything else unchanged. */
export function foldArithmetic(text) {
  const t = String(text).trim();
  if ( !/^[-+*/()\d.\s]+$/.test(t) || !/\d/.test(t) ) return t;
  try {
    // Closed grammar (digits, + - * / and parentheses): no identifier reaches here.
    const n = Function(`"use strict"; return (${t});`)();
    return Number.isFinite(n) ? String(n) : t;
  } catch { return t; }
}

/**
 * Reach in feet: the activity's template size, else the row's range (number or formula); null when content gives none.
 * @param {{ range?: number|string|null }} row
 * @param {Record<string, any>} rollData
 * @param {number|string|null|undefined} activitySize
 * @returns {number|null}
 */
export function emanationRange(row, rollData, activitySize = null) {
  const fromActivity = Number(activitySize);
  if ( Number.isFinite(fromActivity) && (fromActivity > 0) ) return fromActivity;
  const r = row?.range ?? null;
  if ( typeof r === "number" ) return r > 0 ? r : null;
  if ( typeof r === "string" ) {
    const { text, unresolved } = resolveFormula(r, rollData ?? {});
    if ( unresolved.length ) return null;
    const n = Number(foldArithmetic(text));
    return (Number.isFinite(n) && (n > 0)) ? n : null;
  }
  return null;
}

/**
 * Is an area's HEAL due for this member now? ⚠ No "dead" guard: the 0-HP creature is the one the text names.
 * @param {{heal?: {on: string, when?: string}|null}} row
 * @param {{cause: string, hp?: number|null}} facts
 * @returns {{due: boolean, why: string}}
 */
export function healTriggerDue(row, { cause, hp = null }) {
  const h = row?.heal ?? null;
  if ( !h ) return { due: false, why: "no heal on the row" };
  if ( h.on !== cause ) return { due: false, why: `not at ${h.on}` };
  if ( (h.when === "zeroHP") && (Number(hp) !== 0) ) return { due: false, why: `${hp} Hit Points — not at 0` };
  return { due: true, why: (h.when === "zeroHP") ? "at 0 Hit Points at the start of its turn" : `at ${cause}` };
}

/**
 * Is a triggered save due now? Once per turn in combat, every time out of it.
 * @param {{ inCombat: boolean, chitStands: boolean }} facts
 */
export function triggerDue({ inCombat, chitStands }) {
  if ( inCombat && chitStands ) return { due: false, why: "already saved this turn" };
  return { due: true, why: inCombat ? "once this turn" : "out of combat — every time" };
}

/**
 * The scenes play is on NOW: the active scene and every scene a connected user views. ⚠ A GM's view
 * (Assistant GM included) counts ONLY with no player connected: a preview of an old scene would bleed in.
 * @param {string|null} activeSceneId
 * @param {Array<{ sceneId: string|null, name?: string|null, isGM?: boolean }>} viewers   CONNECTED users only
 * @returns {Map<string, string>}   scene id → why it is live
 */
export function liveScenes(activeSceneId, viewers = []) {
  const live = new Map();
  if ( activeSceneId ) live.set(activeSceneId, "the active scene");
  const connected = (viewers ?? []).filter(Boolean);
  const players = connected.filter(v => !v.isGM);
  for ( const v of (players.length ? players : connected) ) {
    if ( !v.sceneId || live.has(v.sceneId) ) continue;
    live.set(v.sceneId, `${v.name || "a connected user"} is viewing it`);
  }
  return live;
}

/**
 * Does an emanation on this scene apply now? Only on a LIVE scene: a linked actor spans scenes.
 * @param {string|null} regionSceneId
 * @param {Map<string, string>|null} live   `liveScenes`' answer
 * @returns {{ applies: boolean, why: string }}
 */
export function appliesOnScene(regionSceneId, live) {
  if ( !regionSceneId ) return { applies: false, why: "no scene" };
  const why = live?.get(regionSceneId) ?? null;
  if ( !why ) return { applies: false, why: "nobody is playing on this scene" };
  return { applies: true, why };
}

/**
 * ONE AURA across scenes (item uuid + row), so two rings of a linked bearer give ONE effect.
 * @param {string|null} itemUuid
 * @param {string|null} key
 * @param {string} regionId
 */
export function emanationGroup(itemUuid, key, regionId) {
  return (itemUuid && key) ? `${itemUuid}|${key}` : `region:${regionId}`;
}

/**
 * Who wears one aura's effect, and from which region (the first that admits it; pass the likeliest
 * first). A feature's bearer never wears its own ring (its transfer effect is on the sheet); a spell's caster does.
 * @param {Array<{ regionId: string, applies: boolean, kind: string, reach: "helpful"|"harmful"|"all"|"summoner",
 *   sourceTokenId: string|null, sourceDisposition: number, only?: string|null,
 *   inside: Array<{ tokenId: string, actorKey: string, disposition: number }> }>} areas
 * @returns {Map<string, string>}   actor key → the region whose copy it wears
 */
export function groupMembers(areas) {
  const out = new Map();
  for ( const a of areas ?? [] ) {
    if ( !a?.applies ) continue;
    for ( const t of a.inside ?? [] ) {
      if ( !t?.actorKey || out.has(t.actorKey) ) continue;
      if ( a.sourceTokenId && (t.tokenId === a.sourceTokenId) && (a.kind !== "spell") ) continue;
      if ( !reachAdmits(a.reach, a.sourceDisposition, t.disposition) ) continue;
      // a "summoner" reach: the one creature that summoned the bearer (Conjure Animals' Strength save Advantage)
      if ( (a.reach === "summoner") && (t.actorKey !== a.only) ) continue;
      out.set(t.actorKey, a.regionId);
    }
  }
  return out;
}

/**
 * What an alerted creature DID, for the reminder's title and its `why`: entered the reach (a move), or started
 * or ended its turn inside it (Unnerving Gaze; Inspiring Movement, B5).
 * @param {"moveIn"|"turnStart"|"turnEnd"|string} cause
 */
export function alertPhrase(cause) {
  if ( cause === "turnStart" ) return "started its turn within";
  if ( cause === "turnEnd" ) return "ended its turn within";
  return "entered";
}

/**
 * Whether an alert's once-guard keys on the TURN (a turn-start or turn-end alert fires once per turn) or on
 * the movement (a move-in alert fires once per move).
 * @param {string} cause
 */
export const alertKeysOnTurn = cause => (cause === "turnStart") || (cause === "turnEnd");

/**
 * THE PICK's candidates (Wrath of the Sea, B5): who stands inside a ring at its bearer's turn start and may be
 * chosen — never the bearer, only those the reach admits, in the order given.
 * @param {Array<{ tokenId: string, actorUuid: string|null, name: string, disposition: number }>} inside
 * @param {{ sourceTokenId: string|null, sourceDisposition: number, reach: "helpful"|"harmful"|"all" }} ring
 * @returns {Array<{ tokenId: string, uuid: string, name: string }>}
 */
export function pickCandidates(inside, { sourceTokenId, sourceDisposition, reach }) {
  const out = [];
  for ( const t of inside ?? [] ) {
    if ( !t?.tokenId || !t.actorUuid ) continue;
    if ( sourceTokenId && (t.tokenId === sourceTokenId) ) continue;
    if ( !reachAdmits(reach, sourceDisposition, t.disposition) ) continue;
    out.push({ tokenId: t.tokenId, uuid: t.actorUuid, name: t.name });
  }
  return out;
}

/**
 * The damage type of a multi-type part: the caster's pick, else evil → necrotic, else radiant, else the first.
 * @param {string[]} types      in the pack's order
 * @param {string|null} alignment
 * @param {string|null} chosen
 * @returns {{ type: string|null, why: string }}
 */
export function damageTypeFor(types, alignment = null, chosen = null) {
  const list = (types ?? []).map(t => String(t).toLowerCase()).filter(Boolean);
  if ( !list.length ) return { type: null, why: "no damage type on the part" };
  if ( chosen && list.includes(String(chosen).toLowerCase()) ) return { type: String(chosen).toLowerCase(), why: "chosen" };
  if ( list.length === 1 ) return { type: list[0] ?? null, why: "the part's one type" };
  const evil = /evil/i.test(String(alignment ?? ""));
  if ( evil && list.includes("necrotic") ) return { type: "necrotic", why: `the alignment reads "${alignment}"` };
  if ( list.includes("radiant") ) return { type: "radiant", why: alignment ? `the alignment reads "${alignment}"` : "no alignment on the sheet — good or neutral" };
  return { type: list[0] ?? null, why: "the part's first type" };
}

/* --- the held spells' facets: the band, the ask, the gate, the move --------------------------- */

/** The eight compass names, clockwise from east in Foundry's frame (0° = +x, y down). */
const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

/**
 * A compass name for a direction in degrees (Foundry's frame: 0° east, 90° south).
 * @param {number} degrees
 */
export function compassName(degrees) {
  const d = ((Number(degrees) % 360) + 360) % 360;
  return COMPASS[Math.round(d / 45) % 8];
}

/**
 * The two sides of a wall placed as a `line` shape, each named by its compass direction: `plus` is the side
 * at rotation + 90°, `minus` the other.
 * @param {{rotation?: number}} shape
 */
export function wallSides(shape) {
  const r = Number(shape?.rotation) || 0;
  return { plus: compassName(r + 90), minus: compassName(r - 90) };
}

/**
 * Which side of the wall faces AWAY from a point (the caster): +1 for the rotation + 90° side, −1 for the
 * other; +1 when the point is unknown or on the line.
 * @param {{x: number, y: number, rotation?: number}} shape
 * @param {{x: number, y: number}|null} point
 * @returns {1|-1}
 */
export function awaySide(shape, point) {
  if ( !point || !shape ) return 1;
  const r = (Number(shape.rotation) || 0) * Math.PI / 180;
  const nx = -Math.sin(r), ny = Math.cos(r);   // the unit normal at rotation + 90°
  const dot = (point.x - shape.x) * nx + (point.y - shape.y) * ny;
  return dot > 0 ? -1 : 1;   // the caster stands on the plus side → the far side is minus
}

/**
 * THE BAND: the wall's region widened by `bandPx` on one side. A `line` grows its width by the band and its
 * centreline shifts half the band toward `side`; a `circle` (the ring's cylinder) burns OUTSIDE as a ring of
 * the band beyond its radius (side +1) or INSIDE as the disc itself (side −1). Any other shape stands as placed.
 * @param {Record<string, any>} shape   the region's first shape, plain
 * @param {1|-1} side
 * @param {number} bandPx
 * @returns {Record<string, any>}   the new shape data
 */
export function bandShape(shape, side, bandPx) {
  const band = Math.max(0, Number(bandPx) || 0);
  if ( !shape || !band ) return { ...shape };
  if ( shape.type === "line" ) {
    const r = (Number(shape.rotation) || 0) * Math.PI / 180;
    const nx = -Math.sin(r), ny = Math.cos(r);
    const shift = (side === -1 ? -1 : 1) * band / 2;
    return { ...shape, x: shape.x + nx * shift, y: shape.y + ny * shift, width: (Number(shape.width) || 0) + band };
  }
  if ( shape.type === "circle" ) {
    if ( side === -1 ) return { ...shape };
    return { type: "ring", x: shape.x, y: shape.y, radius: shape.radius, innerWidth: 0, outerWidth: band, ...(shape.gridBased !== undefined ? { gridBased: shape.gridBased } : {}) };
  }
  if ( shape.type === "ring" ) {
    if ( side === -1 ) return { type: "circle", x: shape.x, y: shape.y, radius: shape.radius, ...(shape.gridBased !== undefined ? { gridBased: shape.gridBased } : {}) };
    return { ...shape, innerWidth: 0, outerWidth: band };
  }
  return { ...shape };
}

/**
 * The band's two choices as the card offers them, for a shape.
 * @param {Record<string, any>} shape
 * @returns {Array<{side: 1|-1, label: string}>}
 */
export function bandOptions(shape) {
  if ( (shape?.type === "circle") || (shape?.type === "ring") ) return [{ side: 1, label: "outside the ring" }, { side: -1, label: "inside the ring" }];
  const sides = wallSides(shape);
  return [{ side: 1, label: `the ${sides.plus} side` }, { side: -1, label: `the ${sides.minus} side` }];
}

/**
 * An `ask` row's defaults: every option on.
 * @param {{options?: readonly string[]}|null|undefined} ask
 */
export const askDefaults = ask => [...(ask?.options ?? [])];

/**
 * A creature's type as dnd5e keeps it, lower-cased: a custom type falls back to its text.
 * @param {{value?: string|null, custom?: string|null, subtype?: string|null}|null|undefined} type
 */
export function creatureTypeOf(type) {
  const v = String(type?.value ?? "").toLowerCase();
  if ( v && (v !== "custom") ) return v;
  return String(type?.custom ?? "").toLowerCase() || null;
}

/**
 * Does an alert or gate with `types: "chosen"` reach this creature? A row with no `types` reaches every one.
 * @param {{types?: string|null}} facet
 * @param {string[]} picked
 * @param {string|null} creatureType
 */
export function typeAdmits(facet, picked, creatureType) {
  if ( facet?.types !== "chosen" ) return true;
  if ( !creatureType ) return false;
  return (picked ?? []).map(t => String(t).toLowerCase()).includes(String(creatureType).toLowerCase());
}

/**
 * THE MOVE'S PAYOUT (Spike Growth): feet travelled inside the area, per the row's `per`, times the
 * activity's dice — one roll of every die at once.
 * @param {{per?: number}} trigger
 * @param {{feet: number, parts: Array<{number?: number|null, denomination?: number|null, bonus?: string|null, type?: string|null}>}} facts
 * @returns {{steps: number, formula: string|null, type: string|null, why: string}}
 */
export function movePayout(trigger, { feet, parts }) {
  const per = Number(trigger?.per) || 5;
  const steps = Math.floor((Number(feet) || 0) / per);
  if ( !steps ) return { steps: 0, formula: null, type: null, why: `${feet} ft inside — less than ${per}` };
  const dice = (parts ?? []).filter(p => Number(p?.number) > 0 && Number(p?.denomination) > 0)
    .map(p => `${Number(p.number) * steps}d${p.denomination}${p.bonus ? ` + ${steps} * (${p.bonus})` : ""}`);
  if ( !dice.length ) return { steps, formula: null, type: null, why: "no dice on the activity" };
  return { steps, formula: dice.join(" + "), type: parts.find(p => p?.type)?.type ?? null, why: `${feet} ft inside — ${steps} × ${per} feet` };
}

/**
 * THE CIRCLE'S GATE: a creature of a chosen type attacking a target inside the circle rolls at the gate's
 * bend. Null when the row has no gate, the attacker's type is not chosen, or the target stands outside.
 * @param {{gate?: {attacker?: string|null, types?: string|null}|null, key?: string}} row
 * @param {{attackerType: string|null, picked: string[], targetInside: boolean}} facts
 * @returns {{bend: string, label: string}|null}
 */
export function circleBend(row, { attackerType, picked, targetInside }) {
  const gate = row?.gate ?? null;
  if ( !gate?.attacker || !targetInside ) return null;
  if ( !typeAdmits(gate, picked, attackerType) ) return null;
  return { bend: String(gate.attacker), label: `${row.key ?? "the circle"} — a${/^[aeiou]/i.test(String(attackerType)) ? "n" : ""} ${attackerType} attacking into the circle` };
}

/** Text made safe for HTML. ⚠ The pure layer imports nothing: decide/present.js's `esc`, repeated. */
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * The ActiveEffect a member receives: the pack's effect named for its source, with the floor's fingerprint.
 * @param {{ key: string, rule?: object|string|null }} row   ⚠ rows carry no `name`; `key` is it
 * @param {{ name: string, img?: string|null, description?: string|null, changes: any[] }} effect   changes already resolved
 * @param {{ sourceName: string, itemUuid: string|null, regionId: string, group?: string|null, moduleId: string, flagKey: string, status?: string|null, ruleHtml?: string|null }} ids
 *        `ruleHtml` the row's rule read from the book (rule-text.js), else a quoted string rule.
 *        `status` makes the token SHOW it (Foundry draws only temporary effects; an aura has no clock).
 */
export function memberEffectData(row, effect, { sourceName, itemUuid, regionId, group = null, moduleId, flagKey, status = null, ruleHtml = null }) {
  const rule = ruleHtml ?? ((typeof row.rule === "string") && row.rule ? `<p><em>“${row.rule}”</em></p>` : "");
  return {
    name: `${effect.name} — ${sourceName}`,
    img: effect.img ?? "icons/svg/aura.svg",
    description: `${rule}<p>${row.key}: ${esc(sourceName)}'s emanation. By the Books keeps this while the creature stands inside it.</p>`,
    origin: itemUuid ?? null,
    disabled: false, transfer: false,
    ...(status ? { statuses: [status] } : {}),
    changes: effect.changes.map(c => ({ ...c })),
    flags: { [moduleId]: { [flagKey]: { regionId, key: row.key, ...(group ? { group } : {}) } } }
  };
}
