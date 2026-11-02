// @ts-check
/**
 * By the Books — DECISION (ARCHITECTURE.md §2): THE CAST RIDERS (registry.js CAST_RIDERS — Wild Magic Surge,
 * Inspiring Smite): which spell a rider answers, the surge's outcome and its words, a hand-out's arithmetic. Pure.
 */

/**
 * Whose spell it is: the item's own class (dnd5e 6 `classIdentifier`, else its `sourceItem` "class:x"), else the
 * caster's one class — metamagic's reading (A4, Psychic Spells).
 * @param {{classIdentifier?: string|null, sourceItem?: string|null, casterClasses?: string[]}} facts
 * @returns {string|null}
 */
export function spellClassOf({ classIdentifier = null, sourceItem = null, casterClasses = [] }) {
  if ( classIdentifier ) return String(classIdentifier);
  const source = String(sourceItem ?? "");
  if ( source.startsWith("class:") ) return source.slice(6);
  return (casterClasses?.length === 1) ? String(casterClasses[0]) : null;
}

/**
 * "Cast with a spell slot": a levelled spell, not innate or at will, whose use spent a slot.
 * @param {{level: number, method?: string|null, spendsSlot: boolean}} facts
 */
export function castWithSlot({ level, method = null, spendsSlot }) {
  return (Number(level) > 0) && !["innate", "atwill"].includes(String(method ?? "")) && !!spendsSlot;
}

/**
 * THE SURGE (Wild Magic Surge + Tides of Chaos): Tides spent — the table rolls automatically and Tides comes back;
 * else the d20, the table on its `surgeOn` face. Once per turn in a combat (`used`: this turn's roll already made).
 * @param {{tidesSpent: boolean, used: boolean, d20?: number|null, surgeOn?: number}} facts
 * @returns {{roll: boolean, surged: boolean, tides: boolean, why: string}}
 */
export function surgeOutcome({ tidesSpent, used, d20 = null, surgeOn = 20 }) {
  if ( tidesSpent ) return { roll: false, surged: true, tides: true, why: "Tides of Chaos was spent" };
  if ( used ) return { roll: false, surged: false, tides: false, why: "already rolled this turn" };
  if ( !Number.isFinite(d20) ) return { roll: true, surged: false, tides: false, why: "roll the d20" };
  return { roll: true, surged: Number(d20) >= Number(surgeOn), tides: false, why: `d20: ${d20}` };
}

/**
 * The cast card's line for a surge.
 * @param {{feature: string, d20?: number|null, surged: boolean, tides?: boolean, result?: string|null}} r
 */
export function surgeLine(r) {
  const effect = r.result ? ` — ${r.result}` : "";
  // D1 — a cast whose d20 was already rolled this turn, carried for Tamed Surge's pick alone.
  if ( !r.tides && !r.surged && !Number.isFinite(r.d20) ) return `${r.feature} — the d20 was rolled this turn`;
  if ( r.tides ) return `${r.feature} — Tides of Chaos spent: the surge rolls${effect}; Tides of Chaos regained`;
  if ( r.surged ) return `${r.feature} — d20: ${r.d20}, a SURGE${effect}`;
  return `${r.feature} — d20: ${r.d20}, nothing`;
}

/**
 * A hand-out SPLIT EVENLY among the creatures picked (Inspiring Smite, RULINGS *The class features, reviewed*): the total
 * divided by the number picked, rounded down, the points left over one each down the list (13 among three: 5, 4, 4); a
 * share of 0 is no pick. A pick is a uuid or a `{ uuid }` (the split's own output reads back the same).
 * @param {{total: number, picks: (string|{uuid: string})[], allowed?: Set<string>|null}} facts
 * @returns {{uuid: string, n: number}[]}
 */
export function evenSplit({ total, picks, allowed = null }) {
  const sum = Math.max(0, Math.floor(Number(total) || 0));
  const uuids = [];
  for ( const p of (picks ?? []) ) {
    const uuid = (typeof p === "string") ? p : p?.uuid;
    if ( !uuid || uuids.includes(uuid) || (allowed && !allowed.has(uuid)) ) continue;
    uuids.push(uuid);
  }
  if ( !uuids.length ) return [];
  const each = Math.floor(sum / uuids.length);
  const over = sum % uuids.length;
  return uuids.map((uuid, i) => ({ uuid, n: each + ((i < over) ? 1 : 0) })).filter(p => p.n > 0);
}
