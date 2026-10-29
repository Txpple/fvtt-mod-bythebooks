/**
 * By the Books — DECISION (ARCHITECTURE.md §2): THE EFFECT VIEW's rows (RULINGS *The effect view*):
 * which effects are listed, what each row says, how it is toned. Pure; the edge reads and draws.
 * ⚠ The token paints an icon only for a CLOCKED effect or a condition; other rows are tagged no-icon.
 */

/** The module's marks that sit on a VICTIM — debuffs by nature. */
export const MARK_KEYS = Object.freeze(["vex", "sap", "slow"]);

/** The statuses the module puts on its OWN effects as markers, never a condition. */
export const MARKER_STATUSES = Object.freeze(["bfEmanation"]);

/*
 * One effect, as the edge read it off the sheet.
 * @typedef {object} EffectFact
 * @property {string} id
 * @property {string} name
 * @property {string|null} img
 * @property {boolean} active        not disabled, not suppressed
 * @property {boolean} temporary     core's `isTemporary` (a bare status does NOT count)
 * @property {boolean} worn          a transfer effect from an item on the sheet
 * @property {boolean} [aura]        a worn effect that is the bearer's OWN standing aura
 * @property {string[]} statuses
 * @property {string|null} chipKey   `flags.<module>.mastery` on the module's chips
 * @property {string} clock          the platform's duration label
 * @property {string|null} origin
 * @property {boolean} [onItem]
 * @property {boolean} [disabled]    the sheet's toggle is OFF (not merely suppressed)
 * @property {boolean} [style]       a fighting style's FACE; off means the module disabled it
 * @property {boolean} [feat]        a face kept for a general feat, titled by the feat alone
 * @property {string|null} [styleFeat]  the Fighting Style feat an item effect rides
 * @property {string|null} [detail]  the face's hover line
 * @property {{key: string, mode: number, value: string|number}[]} [changes]
 * @property {boolean|null} [hostileOrigin]  null when unknown
 * @property {{attacker?: string|null, target?: string|null, checks?: string|null}|null} [bend]  the effect's
 *   bend row (EFFECT_BENDS), its sides only: what the bearer's rolls, and the rolls against it, take
 */

/*
 * @typedef {object} EffectRow
 * @property {string} id
 * @property {string} name
 * @property {string|null} img
 * @property {"buff"|"debuff"|"concentration"} tone
 * @property {string} clock
 * @property {string} [detail]      a value with no clock glyph (the sheet rows)
 * @property {boolean} noIcon
 */

/** Foundry's `ActiveEffect#showIcon` values (CONST.ACTIVE_EFFECT_SHOW_ICON). */
const SHOW_ICON = Object.freeze({ NEVER: 0, CONDITIONAL: 1, ALWAYS: 2 });

/**
 * Whether the token draws the effect, by Foundry's own rule (Token#_drawEffects): `showIcon` ALWAYS, or
 * CONDITIONAL (the default) while the effect has a duration. A condition is drawn because the system creates
 * it ALWAYS, not because it is a condition. A fact with no `showIcon` reads the old way: temporary or a status.
 * @param {{ showIcon?: number|null, temporary?: boolean, statuses?: string[] }} fact
 */
export function drawsOnToken(fact) {
  const show = fact?.showIcon;
  if ( (show === null) || (show === undefined) ) return (fact?.temporary === true) || !!(fact?.statuses ?? []).length;
  return (show === SHOW_ICON.ALWAYS) || ((show === SHOW_ICON.CONDITIONAL) && (fact.temporary === true));
}

/** The module's flags that mark a fighting style's face: worn passives, never drawn on the token. */
const STYLE_KEYS = Object.freeze(["fightingStyle", "fightingStyleTakenOver"]);

/**
 * Whether an effect By the Books writes on a creature is drawn ALWAYS (RULINGS *The effect view*): one on an
 * actor (not an item's transfer), carrying the module's flag, and no fighting style's face. The caller's own
 * `showIcon` stands. Foundry draws a CONDITIONAL effect only while it has a duration, so a companion, a summon
 * standing "until dispelled", a lit lantern or an aura's mark would otherwise never show on the token.
 * @param {{ onActor: boolean, transfer?: boolean, showIconSet?: boolean, moduleFlags?: object|null }} facts
 */
export function drawnAlways({ onActor, transfer = false, showIconSet = false, moduleFlags = null }) {
  if ( !onActor || transfer || showIconSet || !moduleFlags || (typeof moduleFlags !== "object") ) return false;
  return !STYLE_KEYS.some(k => k in moduleFlags);
}

/** Listed: ACTIVE and clocked, a condition, or applied; never a worn passive, except the bearer's
 * own aura (the floor marks everyone in the ring but the bearer). */
export function listed(fact) {
  if ( fact?.active !== true ) return false;
  return fact.temporary === true || (fact.statuses ?? []).length > 0 || fact.worn !== true || fact.aura === true;
}

/** Foundry's ActiveEffect change modes, by number. */
const MODE = Object.freeze({ CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 });

/**
 * What one change does: a penalty (negative ADD, MULTIPLY below one, DOWNGRADE, disadvantage),
 * the mirror bonus, or nothing readable (OVERRIDE, CUSTOM).
 * @param {{key?: string, mode?: number, value?: string|number}} change
 * @returns {"penalty"|"bonus"|null}
 */
export function changeSign(change) {
  if ( !change ) return null;
  const key = String(change.key ?? "").toLowerCase();
  if ( /disadvantage/.test(key) ) return "penalty";
  if ( /advantage/.test(key) ) return "bonus";
  const mode = Number(change.mode);
  if ( mode === MODE.DOWNGRADE ) return "penalty";
  if ( mode === MODE.UPGRADE ) return "bonus";
  const n = Number(String(change.value ?? "").trim());
  if ( !Number.isFinite(n) ) return null;
  if ( mode === MODE.ADD ) return n < 0 ? "penalty" : (n > 0 ? "bonus" : null);
  if ( mode === MODE.MULTIPLY ) return n < 1 ? "penalty" : (n > 1 ? "bonus" : null);
  return null;
}

/**
 * What a bend row does to its BEARER: Disadvantage on its own rolls, or Advantage on the rolls against
 * it, is a penalty (Helped, Guiding Bolt, Mocked); the mirror a bonus; both at once (Reckless) nothing.
 * @param {{attacker?: string|null, target?: string|null, checks?: string|null}|null} bend
 * @returns {"penalty"|"bonus"|null}
 */
export function bendSign(bend) {
  if ( !bend ) return null;
  const signs = [
    bend.attacker === "disadvantage" || bend.checks === "disadvantage" || bend.target === "advantage" ? "penalty" : null,
    bend.attacker === "advantage" || bend.checks === "advantage" || bend.target === "disadvantage" ? "bonus" : null
  ].filter(Boolean);
  return signs.length === 1 ? signs[0] : null;
}

/**
 * THE TONE, a pattern not a list: concentration; a condition or mark is a debuff; then the changes
 * (a penalty outranks a bonus); then the effect's bend row; then a hostile origin is a debuff; else a buff.
 * @param {EffectFact} fact @returns {"buff"|"debuff"}
 */
export function toneOf(fact) {
  if ( (fact.statuses ?? []).includes("concentrating") ) return "concentration";
  // The module's own MARKER status is not a condition: its changes decide.
  if ( (fact.statuses ?? []).some(s => !MARKER_STATUSES.includes(s)) ) return "debuff";
  if ( fact.chipKey && MARK_KEYS.includes(fact.chipKey) ) return "debuff";
  const signs = (fact.changes ?? []).map(changeSign).filter(Boolean);
  if ( signs.includes("penalty") ) return "debuff";
  if ( signs.includes("bonus") ) return "buff";
  const bend = bendSign(fact.bend);
  if ( bend ) return bend === "penalty" ? "debuff" : "buff";
  if ( fact.hostileOrigin === true ) return "debuff";
  return "buff";
}

/** @param {EffectFact[]} facts @returns {EffectRow[]} debuffs first, then buffs, each in sheet order */
export function effectRows(facts) {
  const rows = (facts ?? []).filter(listed).map(rowOf);
  return ["concentration", "debuff", "buff"].flatMap(tone => rows.filter(r => r.tone === tone));
}

/**
 * THE SHEET ROWS: Temporary HP and Heroic Inspiration, buffs dnd5e keeps as NUMBERS, not effects.
 * @param {{tempHp?: number|null, inspiration?: boolean}} sheet
 * @returns {EffectRow[]}
 */
export function sheetRows({ tempHp = null, inspiration = false } = {}) {
  const rows = [];
  if ( Number.isFinite(tempHp) && tempHp > 0 ) rows.push({ id: "sheet:tempHp", name: "Temporary HP", img: "icons/svg/regen.svg", tone: "buff", clock: "", detail: String(tempHp), noIcon: false });
  if ( inspiration === true ) rows.push({ id: "sheet:inspiration", name: "Heroic Inspiration", img: "icons/svg/sun.svg", tone: "buff", clock: "", detail: "", noIcon: false });
  return rows;
}

/**
 * THE ACTION a row offers an owner: remove (on the creature), disable (on an item, since deleting
 * edits the item), clear (a sheet row).
 * @param {{id: string, onItem?: boolean}} row
 * @param {{owner: boolean}} viewer
 * @returns {{action: "remove"|"disable"|"clear", label: string}|null}
 */
export function rowAction(row, { owner }) {
  if ( !owner || !row ) return null;
  if ( row.style === true ) return null;   // a style's face follows the equipped boxes
  if ( String(row.id).startsWith("sheet:") ) return { action: "clear", label: "Clear" };
  if ( row.onItem === true ) return { action: "disable", label: "Disable" };
  return { action: "remove", label: "Remove" };
}

/** One row from one fact, no listing test. */
function rowOf(f) {
  return {
    id: f.id, onItem: f.worn === true || f.onItem === true,
    name: (f.style && f.feat) ? f.name : f.style ? `Fighting Style: ${f.name}` : f.styleFeat ? `Fighting Style: ${f.styleFeat}` : f.name,
    img: f.img ?? null, tone: toneOf(f), clock: f.clock ?? "",
    ...(f.style ? { style: true, why: f.detail ?? "" } : {}),
    noIcon: !drawsOnToken(f)
  };
}

/**
 * THE PANEL'S GROUPS mirror the SHEET's sections: Temporary, Passive, and Unavailable (enabled but
 * SUPPRESSED, listed so the GM can sweep it; a disabled one is not listed). Empty groups drop.
 * @param {EffectFact[]} facts
 * @param {{tempHp?: number|null, inspiration?: boolean}} [sheet]
 * @returns {{label: string, rows: EffectRow[]}[]}
 */
export function panelGroups(facts, sheet = {}) {
  const temporary = [], passive = [], unavailable = [];
  for ( const f of (facts ?? []) ) {
    if ( !f ) continue;
    // no-icon only tags in-force rows a token could be expected to show
    if ( f.active === true ) {
      if ( (f.temporary === true) || (f.statuses ?? []).length ) temporary.push(rowOf(f));
      else passive.push({ ...rowOf(f), noIcon: false });
    }
    // a style's face that is off was disabled by the module, not by choice: listed, with why
    else if ( (f.disabled !== true) || (f.style === true) ) unavailable.push({ ...rowOf(f), noIcon: false, unavailable: true });
  }
  temporary.push(...sheetRows(sheet));
  const ordered = ["concentration", "debuff", "buff"].flatMap(tone => temporary.filter(r => r.tone === tone));
  temporary.splice(0, temporary.length, ...ordered);
  return [
    { label: "Temporary", rows: temporary },
    { label: "Passive", rows: passive },
    { label: "Unavailable", rows: unavailable }
  ].filter(g => g.rows.length);
}

/** Every row the panel can show, flat. */
export function everyRow(facts, sheet = {}) {
  return panelGroups(facts, sheet).flatMap(g => g.rows);
}

/** Every row for one creature: the effects (debuffs, then buffs), then the sheet's own buffs. */
export function allRows(facts, sheet) {
  return [...effectRows(facts), ...sheetRows(sheet)];
}

/**
 * The marks a creature HOLDS on others: effects elsewhere whose origin is it or its items.
 * @param {string} holderUuid
 * @param {{bearer: string, fact: EffectFact}[]} others
 * @returns {(EffectRow & {bearer: string})[]}
 */
export function marksHeldBy(holderUuid, others) {
  if ( !holderUuid ) return [];
  return (others ?? [])
    .filter(({ fact }) => listed(fact) && typeof fact.origin === "string" && fact.origin.startsWith(holderUuid))
    .map(({ bearer, fact }) => ({ ...effectRows([fact])[0], bearer }));
}
