// @ts-check
/**
 * By the Books — DECISION layer (ARCHITECTURE.md §2): THE MASTERY RECORD — how many weapon kinds a
 * character may master, what its list holds, and what fills the gap (issue #3). The
 * allowance is dnd5e's own data: each class ships mastery-mode Trait advancements (the PHB's
 * Fighter 3 at 1, +1 at 4, 10 and 16; Barbarian 2, +1 at 4 and 10; Paladin, Ranger, Rogue 2 at 1;
 * the Weapon Master feat +1); the list is `system.traits.weaponProf.mastery.value`, the set the
 * system reads before it stamps a mastery on an attack. ⚠ PURE: no `game`, no imports.
 */

/**
 * The kinds a character may master: every grant at or below its item's level, counted.
 * @typedef {object} MasteryGrant  one mastery-mode Trait advancement, as the sheet holds it
 * @property {number} level        the level it is granted at (a feat's is 0)
 * @property {number} at           the level the granting item stands at (the class's levels; a feat's the character level)
 * @property {number} grants       `configuration.grants.size`
 * @property {number} choices      the sum of `configuration.choices[].count`
 * @param {MasteryGrant[]} grants
 */
export function allowanceOf(grants) {
  let n = 0;
  for ( const g of grants ?? [] ) {
    if ( !(Number(g.at) >= Number(g.level)) ) continue;
    n += (Number(g.grants) || 0) + (Number(g.choices) || 0);
  }
  return n;
}

/**
 * What the fill writes: the equipped, proficient weapons whose kind has a mastery and is not yet
 * chosen, in sheet order, one per kind, capped at the open slots. An empty list when nothing is
 * open or nothing qualifies. A list already at or over the allowance is never touched.
 * @typedef {object} WeaponRow      a weapon on the sheet, as plain facts
 * @property {string} id
 * @property {string} name
 * @property {string|null} base     `system.type.baseItem` — the kind the set is keyed by
 * @property {string|null} mastery  `system.mastery` — the kind's mastery, or null for a weapon with none
 * @property {boolean} equipped
 * @property {boolean} proficient
 * @property {number} [sort]
 * @param {{ allowance: number, chosen: string[], weapons: WeaponRow[] }} facts
 * @returns {{ base: string, mastery: string, name: string }[]}
 */
export function fillPicks({ allowance, chosen, weapons }) {
  const open = allowance - (chosen?.length ?? 0);
  if ( !(open > 0) ) return [];
  const have = new Set(chosen ?? []);
  const out = [];
  const rows = [...(weapons ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  for ( const w of rows ) {
    if ( !w.equipped || !w.proficient || !w.base || !w.mastery || have.has(w.base) ) continue;
    have.add(w.base);
    out.push({ base: w.base, mastery: w.mastery, name: w.name });
    if ( out.length >= open ) break;
  }
  return out;
}

/**
 * Where a character's list stands against its allowance.
 * @param {{ allowance: number, chosen: string[], unproficient?: string[] }} facts
 *   `unproficient`: chosen kinds the sheet shows a weapon of that the character is not proficient
 *   with (the machine reads it off the sheet; a kind with no weapon on the sheet is not judged).
 * @returns {{ state: "none"|"open"|"full"|"over", open: number, unproficient: string[] }}
 *   `none`: the class grants no mastery · `open`: fewer chosen than allowed · `full` · `over`:
 *   more chosen than allowed (never trimmed — the module cannot know which to drop).
 */
export function recordState({ allowance, chosen, unproficient = [] }) {
  const n = chosen?.length ?? 0;
  if ( !(allowance > 0) ) return { state: "none", open: 0, unproficient };
  if ( n > allowance ) return { state: "over", open: 0, unproficient };
  if ( n < allowance ) return { state: "open", open: allowance - n, unproficient };
  return { state: "full", open: 0, unproficient };
}

/**
 * The attack card's line: an attack with a weapon whose kind has a mastery the wielder has not
 * chosen. Null when the system stamped a mastery (the wielder has it), the weapon has none, or the
 * wielder's class grants none — the line is for a pick gone missing, not for a Wizard's staff.
 * @param {{ stamped: string|null, weapon: { base: string|null, mastery: string|null }, allowance: number, chosen: string[] }} facts
 * @returns {{ base: string, mastery: string, open: number }|null}
 */
export function missingPick({ stamped, weapon, allowance, chosen }) {
  if ( stamped || !weapon?.base || !weapon?.mastery ) return null;
  if ( !(allowance > 0) ) return null;
  if ( (chosen ?? []).includes(weapon.base) ) return null;   // chosen but unstamped: a system-side case, not a pick
  return { base: weapon.base, mastery: weapon.mastery, open: Math.max(0, allowance - (chosen?.length ?? 0)) };
}

/**
 * The long-rest swap, judged: one chosen kind out, one proficient kind in (the PHB: "whenever you
 * finish a Long Rest, you can change one of your chosen kinds"). The new list, or null when the
 * swap is not one the rule allows.
 * @param {{ chosen: string[], out: string|null, into: string|null, proficientBases?: Set<string>|string[]|null }} facts
 */
export function swapList({ chosen, out, into, proficientBases = null }) {
  const list = [...(chosen ?? [])];
  if ( !out || !into || (out === into) ) return null;
  if ( !list.includes(out) || list.includes(into) ) return null;
  if ( proficientBases && !new Set(proficientBases).has(into) ) return null;
  return list.map(b => (b === out ? into : b));
}

/**
 * The long-rest trim of an over-long list: exactly the surplus dropped, every dropped kind chosen.
 * The new list, or null when the drop is not the one the allowance asks for.
 * @param {{ chosen: string[], drop: string[], allowance: number }} facts
 */
export function trimList({ chosen, drop, allowance }) {
  const list = [...(chosen ?? [])];
  const out = [...new Set(drop ?? [])];
  const surplus = list.length - (Number(allowance) || 0);
  if ( !(surplus > 0) || (out.length !== surplus) ) return null;
  if ( out.some(b => !list.includes(b)) ) return null;
  return list.filter(b => !out.includes(b));
}

/**
 * The Long Rest's change: open slots filled from `adds` (unique, not chosen, at most the open count),
 * then the one swap when both ends are named (`swapList`). The new list, or null when the adds or
 * the swap are not what the rule allows; the unchanged list when nothing was asked.
 * @param {{ chosen: string[], adds?: string[], out?: string|null, into?: string|null, allowance: number }} facts
 */
export function restList({ chosen, adds = [], out = null, into = null, allowance }) {
  let list = [...(chosen ?? [])];
  const open = (Number(allowance) || 0) - list.length;
  const unique = [...new Set(adds ?? [])].filter(Boolean);
  if ( unique.length ) {
    if ( (unique.length > Math.max(0, open)) || unique.some(b => list.includes(b)) ) return null;
    list = [...list, ...unique];
  }
  if ( out || into ) {
    const swapped = swapList({ chosen: list, out, into });
    if ( !swapped ) return null;
    list = swapped;
  }
  return list;
}

/**
 * The Long Rest's answer judged against the list as it stands: the list to write (null: none) and the card's word —
 * `trimmed` or `changed` when it moves, `kept` when nothing would, `stale` when the answer no longer fits the list.
 * Judged once, before the write: a re-driven landing finds the list it already wrote and says what it did.
 * @param {{ chosen: string[], allowance: number, drop?: string[]|null, adds?: string[]|null, out?: string|null, into?: string|null }} facts
 * @returns {{ list: string[]|null, outcome: "trimmed"|"changed"|"kept"|"stale" }}
 */
export function swapLanding({ chosen, allowance, drop = null, adds = null, out = null, into = null }) {
  const list = drop ? trimList({ chosen, drop, allowance }) : restList({ chosen, adds: adds ?? [], out, into, allowance });
  if ( !list ) return { list: null, outcome: "stale" };
  if ( JSON.stringify(list) === JSON.stringify(chosen) ) return { list: null, outcome: "kept" };
  return { list, outcome: drop ? "trimmed" : "changed" };
}
