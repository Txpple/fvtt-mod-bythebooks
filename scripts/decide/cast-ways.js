// @ts-check
/** By the Books — DECISION layer (ARCHITECTURE.md §2): the WAYS A SPELL IS PAID when the caster holds a free cast of it.
 * A feat, a species or a feature grants a spell "without a spell slot" and leaves the slots for the rest (Fiendish
 * Legacy, Magic Initiate, Fey Touched, Paladin's Smite, Familiar Friend; Favored Enemy's Hunter's Mark). dnd5e builds
 * it two ways: a copy of the spell with a use and a "(free casting)" forward spending it, or a feature's "cast"
 * activity whose copy of the spell spends the feature's uses — or another pool's (Shadow Arts' Focus, War God's
 * Blessing's Channel Divinity), or nothing (an Eldritch Invocation's at will). Every way the sheet holds, in the order
 * the module picks: at will, the free casts, each slot from the lowest (a Pact slot before a numbered one of its level:
 * it comes back on a Short Rest), then another pool. The player may pick any way left; the first is picked for them
 * (the machine is cast-ways.js). */

/**
 * @typedef {object} CastCopy  one copy of the spell on the caster's sheet
 * @property {string} id
 * @property {string} method        its casting method ("spell", "pact", "innate", ...)
 * @property {boolean} slotted      a slot can cast it (a levelled spell of a slot method whose activity spends one)
 * @property {{left: number, max: number, forwardId: string|null, atWill?: boolean}|null} free  its free cast, if it carries
 *   one (`atWill`: no count, never spent)
 * @property {{left: number, max: number, cost: number, name: string}|null} [pool]  another pool its cast spends (Monk's
 *   Focus, Channel Divinity), `cost` a cast
 * @property {string} [grant]       what granted the free cast or the pool's cast (Fiendish Legacy, Favored Enemy)
 * @property {boolean} [cached]     a feature's copy (its "cast" activity's): a slot goes through another copy first
 *
 * @typedef {{key: string, kind: "free", copyId: string, forwardId: string|null, left: number, max: number, grant: string, off: boolean, atWill?: boolean}
 *   | {key: string, kind: "slot", copyId: string, slot: string, slotLevel: number, left: number, max: number, off: boolean}
 *   | {key: string, kind: "pool", copyId: string, left: number, max: number, cost: number, name: string, grant: string, off: boolean}} PayWay
 *
 * @typedef {PayWay | {kind: "none", why: string}} CastWay
 *
 * Every way this spell can be paid, in the module's order, each `off` when none is left (shown greyed: the sheet's
 * standing at a glance): at will, then a pill per free cast, then one per slot that can cast it (`max` above 0, its
 * level at least the spell's), from the lowest, a Pact slot first on a tie, then each other pool (off below its cost).
 * A slot is cast through the copy whose method owns it (a Pact slot through the Pact Magic copy), else any copy a slot
 * can cast; with no such copy there is no slot way.
 * @param {{copies: ReadonlyArray<CastCopy>, slots: ReadonlyArray<{key: string, level: number, value: number, max: number}>, level: number}} f
 * @returns {PayWay[]}
 */
export function castWays({ copies, slots, level }) {
  const want = Math.max(1, Number(level) || 0);
  const list = copies ?? [];
  /** @type {PayWay[]} */
  const out = [];
  for ( const c of list ) {
    if ( !c.free?.atWill ) continue;
    out.push({ key: `free:${c.id}`, kind: "free", copyId: c.id, forwardId: c.free.forwardId ?? null, left: 0, max: 0,
      grant: String(c.grant ?? ""), off: false, atWill: true });
  }
  for ( const c of list ) {
    if ( !c.free || c.free.atWill ) continue;
    const left = Math.max(0, Number(c.free.left) || 0);
    out.push({ key: `free:${c.id}`, kind: "free", copyId: c.id, forwardId: c.free.forwardId ?? null, left,
      max: Number(c.free.max) || 0, grant: String(c.grant ?? ""), off: !(left > 0) });
  }
  const pools = list.filter(c => c.pool).map(c => {
    const pool = /** @type {{left: number, max: number, cost: number, name: string}} */ (c.pool);
    const left = Math.max(0, Number(pool.left) || 0);
    const cost = Math.max(1, Number(pool.cost) || 1);
    return /** @type {PayWay} */ ({ key: `pool:${c.id}`, kind: "pool", copyId: c.id, left, max: Number(pool.max) || 0, cost,
      name: String(pool.name ?? ""), grant: String(c.grant ?? ""), off: left < cost });
  });
  const slotted = list.filter(c => c.slotted);
  if ( !slotted.length ) return [...out, ...pools];
  const usable = (slots ?? []).filter(s => (Number(s?.max) > 0) && ((Number(s?.level) || 0) >= want))
    .sort((a, b) => (Number(a.level) - Number(b.level)) || (Number(b.key === "pact") - Number(a.key === "pact")));
  for ( const s of usable ) {
    const owner = (s.key === "pact") ? "pact" : "spell";
    const copy = slotted.find(c => (c.method === owner) && !c.cached) ?? slotted.find(c => !c.cached)
      ?? /** @type {CastCopy} */ (slotted[0]);
    const left = Math.max(0, Number(s.value) || 0);
    out.push({ key: `slot:${s.key}`, kind: "slot", copyId: copy.id, slot: String(s.key), slotLevel: Number(s.level) || 0,
      left, max: Number(s.max) || 0, off: !(left > 0) });
  }
  return [...out, ...pools];
}

/**
 * How this spell is paid now: the way the player picked while it is left, else the first left in the module's order
 * (the free cast, then the lowest slot). `none` names why.
 * @param {{copies: ReadonlyArray<CastCopy>, slots: ReadonlyArray<{key: string, level: number, value: number, max: number}>, level: number, pick?: string|null}} f
 * @returns {CastWay}
 */
export function chooseCastWay({ copies, slots, level, pick = null }) {
  const on = castWays({ copies, slots, level }).filter(w => !w.off);
  const way = (pick && on.find(w => w.key === pick)) || on[0];
  if ( way ) return way;
  const list = copies ?? [];
  return { kind: "none", why: (!list.some(c => c.slotted) && list.some(c => c.free || c.pool)) ? "no use left" : "no spell slot" };
}

/**
 * A way's pill: its words and what is left, in dnd5e's own words for the free cast and the Pact slot ("Free Casting
 * (Fiendish Legacy)" 1/1, "Pact Slot (Level 2)" 2/2, "Level 1 Slot" 3/4), "At Will (Armor of Shadows)" with no count,
 * another pool by its name and the cast's cost ("Channel Divinity" 2/2, "Monk's Focus ×2" 4/5).
 * @param {PayWay} way
 * @returns {{label: string, count: string}}
 */
export function wayPill(way) {
  const from = way.kind !== "slot" && way.grant ? ` (${way.grant})` : "";
  if ( (way.kind === "free") && way.atWill ) return { label: `At Will${from}`, count: "" };
  if ( way.kind === "free" ) return { label: `Free Casting${from}`, count: `${way.left}/${way.max}` };
  if ( way.kind === "pool" ) return { label: `${way.name}${(way.cost > 1) ? ` ×${way.cost}` : ""}${(way.grant && (way.grant !== way.name)) ? ` (${way.grant})` : ""}`, count: `${way.left}/${way.max}` };
  return { label: (way.slot === "pact") ? `Pact Slot (Level ${way.slotLevel})` : `Level ${way.slotLevel} Slot`, count: `${way.left}/${way.max}` };
}

/** The pills' heading: the Player's Handbook's own verb for a granted spell's slots ("cast the spell using any spell
 * slots you have"). */
export const WAYS_HEAD = "Cast using";

/**
 * What a way costs, in the button's words ("a Reaction · the free cast (1 of 1 left)", "a Reaction, a Pact slot
 * (level 2)"). `reaction` leads with the Reaction.
 * @param {CastWay} way
 * @param {{reaction?: boolean}} [options]
 */
export function castWayCost(way, { reaction = true } = {}) {
  const lead = reaction ? "a Reaction" : "";
  if ( (way?.kind === "free") && way.atWill ) return `${lead}${lead ? " · " : ""}at will`;
  if ( way?.kind === "free" ) return `${lead}${lead ? " · " : ""}the free cast (${way.left} of ${way.max} left)`;
  if ( way?.kind === "pool" ) return `${lead}${lead ? ", " : ""}${way.cost} ${way.name} (${way.left} left)`;
  if ( way?.kind === "slot" ) {
    const slot = (way.slot === "pact") ? `a Pact slot (level ${way.slotLevel})` : `a level ${way.slotLevel} slot`;
    return `${lead}${lead ? ", " : ""}${slot}`;
  }
  return lead || "nothing";
}

/**
 * Are the ways worth asking? Two or more on the sheet (a spent one counts: the player sees it is spent). One way alone
 * is cast without a pick.
 * @param {ReadonlyArray<PayWay>} ways
 */
export const asksWay = ways => (ways?.length ?? 0) > 1;
