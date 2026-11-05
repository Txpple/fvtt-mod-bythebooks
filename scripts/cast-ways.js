// @ts-check
/**
 * By the Books — SERVICE (ARCHITECTURE.md §7): the WAY A SPELL IS PAID (decide/cast-ways.js). A granted spell's free
 * cast is one of dnd5e's two shapes. A copy carries a use and a "(free casting)" forward activity spending it, and the
 * slots cast the same spell through its main activity, on that copy or another (the Warlock's own copy beside Fiendish
 * Legacy's, Kartor's "Divine Smite - Free Cast" beside the Paladin's). Or a feature's "cast" activity puts its own copy
 * of the spell on the sheet (`cachedFor`), which spends what the activity names: the feature's uses (Favored Enemy's
 * Hunter's Mark), another pool's (Shadow Arts' Focus, War God's Blessing's Channel Divinity), or nothing (an Eldritch
 * Invocation's at will); dnd5e never lets that copy spend a slot, so a slot cast through it is named and spent here.
 * Every cast the module drives asks here which copy, which activity and which slot, the player's pick first; the
 * sheet's own cast window shows the same ways (free-casts.js), and so does a summon spell's (summons.js).
 */
import { log, resolveUuid } from "./core.js";
import { asksWay, castWays, chooseCastWay, wayPill } from "./decide/cast-ways.js";
import { payPillsHTML } from "./decide/present.js";

/** An item's compendium source, by whichever key its version keeps it under. */
const sourceOf = item => item?._stats?.compendiumSource ?? item?.flags?.dnd5e?.sourceId ?? item?.flags?.core?.sourceId ?? null;
const lower = v => String(v ?? "").toLowerCase();

/** Every copy of this spell on the actor, the given one first: the same identifier, the same source or the same name.
 * @param {any} actor
 * @param {any} item
 * @returns {any[]} */
export function spellCopies(actor, item) {
  if ( item?.type !== "spell" ) return [];
  const id = item.system?.identifier || null;
  const source = sourceOf(item);
  const name = lower(item.name);
  const same = other => (other.type === "spell") && (Number(other.system?.level) === Number(item.system?.level))
    && ((id && (other.system?.identifier === id)) || (source && (sourceOf(other) === source)) || (lower(other.name) === name));
  return [item, ...(actor?.items ?? []).filter(i => (i.id !== item.id) && same(i))];
}

/** Does this activity spend its own item's uses (a forward's free cast, a statblock's x/day)?
 * @param {any} activity
 * @param {any} item */
const spendsOwnUses = (activity, item) => !!activity?.consumption?.targets?.some?.(t => (t.type === "itemUses") && (!t.target || (t.target === item.id)));

/** The copy's "(free casting)" forward to this activity (or to any, with none given): a forward spending the copy's uses.
 * @param {any} copy
 * @param {any} [activity] */
export function freeForwardOf(copy, activity = null) {
  for ( const a of copy?.system?.activities ?? [] ) {
    if ( (a.type !== "forward") || !spendsOwnUses(a, copy) ) continue;
    if ( activity && a.activity?.id && (a.activity.id !== activity.id) ) continue;
    return a;
  }
  return null;
}

/** The copy's activity that is the one clicked on another copy: the same id (one pack's spell), else name, else type.
 * @param {any} copy
 * @param {any} activity */
export function matchingActivity(copy, activity) {
  const acts = [...(copy?.system?.activities ?? [])].filter(a => a.type !== "forward");
  if ( !activity ) return acts[0] ?? null;
  return acts.find(a => (a.id === activity.id) && (a.type === activity.type))
    ?? acts.find(a => a.name && (a.name === activity.name))
    ?? acts.find(a => a.type === activity.type) ?? null;
}

/** The feature's "cast" activity a copy of a spell stands for (dnd5e's `cachedFor`: Favored Enemy's Hunter's Mark), or null.
 * @param {any} copy */
export const linkedCastOf = copy => (copy?.getFlag?.("dnd5e", "cachedFor") ? (copy.system?.linkedActivity ?? null) : null);

/** The item a consumption target names: by id, identifier or compendium source (a pack's feature names its pool so).
 * @param {any} actor
 * @param {string} ref */
const poolItemOf = (actor, ref) => actor?.items?.get?.(ref) ?? actor?.items?.find?.(i => (i.system?.identifier === ref) || (sourceOf(i) === ref)) ?? null;

/**
 * What a feature's cast activity spends a cast: nothing (at will), its own uses or the activity's (a free cast), or
 * another item's (a pool, `cost` a cast); null when it spends something the module does not read (an attribute).
 * @param {any} cast
 * @returns {{atWill: true}|{free: {left: number, max: number}}|{pool: {left: number, max: number, cost: number, name: string}}|null}
 */
function castSpendOf(cast) {
  const targets = [...(cast?.consumption?.targets ?? [])];
  if ( !targets.length ) return { atWill: true };
  const own = targets.find(t => (t.type === "itemUses") && (!t.target || (t.target === cast.item?.id)));
  if ( own ) return { free: { left: Number(cast.item.system?.uses?.value) || 0, max: Number(cast.item.system?.uses?.max) || 0 } };
  const act = targets.find(t => t.type === "activityUses");
  if ( act ) return { free: { left: Number(cast.uses?.value) || 0, max: Number(cast.uses?.max) || 0 } };
  const other = targets.find(t => t.type === "itemUses");
  const item = other ? poolItemOf(cast.actor, String(other.target)) : null;
  if ( item ) return { pool: { left: Number(item.system?.uses?.value) || 0, max: Number(item.system?.uses?.max) || 0, cost: Number(other.value) || 1, name: item.name } };
  return null;
}

/** The decision's facts for one copy, with its activity, its forward and, for a feature's cast, that activity.
 * @typedef {{fact: import("./decide/cast-ways.js").CastCopy, copy: any, act: any, forward: any, handUse: boolean, cast: any, want: any}} CopyRoute
 * @param {any} copy
 * @param {any} activity
 * @returns {CopyRoute|null} */
function copyFacts(copy, activity) {
  const act = matchingActivity(copy, activity);
  if ( !act ) return null;
  const linked = linkedCastOf(copy);
  if ( linked ) return castFacts(linked, { copy, act, want: activity });
  const method = String(copy.system?.method ?? "spell");
  const slotted = !!act.requiresSpellSlot && (act.consumption?.spellSlot !== false);
  const forward = freeForwardOf(copy, act);
  const max = Number(copy.system?.uses?.max) || 0;
  const left = Number(copy.system?.uses?.value) || 0;
  // a use of its own is a free cast: through its forward, by the activity's own target, or (neither) spent by hand
  const free = (max > 0) ? { left, max, forwardId: forward?.id ?? null } : null;
  const handUse = !!free && !forward && !spendsOwnUses(act, copy);
  return { fact: { id: copy.id, method, slotted, free, ...(free ? { grant: grantOf(copy) } : {}) }, copy, act, forward, handUse, cast: null, want: activity };
}

/**
 * A feature's cast activity as a copy: its spend the way (at will, a free cast, a pool), a slot through it when the
 * spell is levelled and the grant is not at will (Favored Enemy: "You always have the Hunter's Mark spell prepared").
 * `copy` its copy of the spell on the sheet, null before its first cast (made then).
 * @param {any} cast
 * @param {{copy: any, act: any, want: any}} on
 * @returns {CopyRoute|null}
 */
function castFacts(cast, { copy, act, want }) {
  const spend = castSpendOf(cast);
  if ( !spend ) return null;
  const id = copy?.id ?? `cast-${cast.item?.id}-${cast.id}`;
  const levelled = (act ?? want)?.requiresSpellSlot !== false;
  const free = ("atWill" in spend) ? { left: 0, max: 0, forwardId: null, atWill: true } : ("free" in spend) ? { ...spend.free, forwardId: null } : null;
  const pool = ("pool" in spend) ? spend.pool : null;
  return { fact: { id, method: "spell", slotted: levelled && !("atWill" in spend), free, pool, grant: cast.item?.name ?? "", cached: true },
    copy, act, forward: null, handUse: false, cast, want };
}

/** The feature casts of this spell whose copy is not on the sheet yet (never cast): its cast activities by the spell's
 * source or its name.
 * @param {any} actor
 * @param {any} item */
function uncastCastsOf(actor, item) {
  const source = sourceOf(item);
  const name = lower(item.name);
  const out = [];
  for ( const holder of actor?.items ?? [] ) {
    if ( holder.type === "spell" ) continue;
    for ( const a of holder.system?.activities ?? [] ) {
      if ( (a.type !== "cast") || !a.spell?.uuid || a.cachedSpell ) continue;
      const named = lower(resolveUuid(a.spell.uuid)?.name);
      if ( (source && (a.spell.uuid === source)) || (named && (named === name)) ) out.push(a);
    }
  }
  return out;
}

/**
 * The facts the decision reads for this spell on this actor: every copy's (a feature's cast among them), the slots, the
 * spell's level; null for an item that is no levelled spell (a feature, a cantrip: nothing to choose). A forward
 * clicked stands for its main.
 * @param {any} actor
 * @param {any} item
 * @param {any} activity
 */
function factsOf(actor, item, activity) {
  if ( (item?.type !== "spell") || !(Number(item.system?.level) > 0) ) return null;
  const main = (activity?.type === "forward") ? item.system.activities.get(activity.activity?.id) ?? null : activity;
  const want = main ?? matchingActivity(item, null);
  const all = /** @type {CopyRoute[]} */ ([...spellCopies(actor, item).map(c => copyFacts(c, want)),
    ...uncastCastsOf(actor, item).map(a => castFacts(a, { copy: null, act: null, want }))].filter(Boolean));
  if ( !all.length ) return null;
  const slots = Object.entries(actor?.system?.spells ?? {}).map(([key, s]) => ({ key, level: Number(s?.level) || 0, value: Number(s?.value) || 0, max: Number(s?.max) || 0 }));
  return { all, facts: { copies: all.map(c => c.fact), slots, level: Number(item.system.level) } };
}

/**
 * Every way this actor can pay for this spell, for the pills (decide/cast-ways.js `castWays`), with the one picked
 * for them; null for an item that is no levelled spell.
 * @param {any} actor
 * @param {any} item
 * @param {any} [activity]
 * @returns {{ways: import("./decide/cast-ways.js").PayWay[], pick: string|null}|null}
 */
export function castWaysOf(actor, item, activity = null) {
  const at = factsOf(actor, item, activity);
  if ( !at ) return null;
  const ways = castWays(at.facts);
  return { ways, pick: ways.find(w => !w.off)?.key ?? null };
}

/**
 * The pills for this spell's ways (decide/present.js `payPillsHTML`), `pick` ticked while it is left, else the
 * module's; null when there is nothing to pick (one way alone unless `always`, or no levelled spell).
 * @param {any} actor
 * @param {any} item
 * @param {any} activity
 * @param {string} name     the pills' field
 * @param {{head?: string, always?: boolean, pick?: string|null}} [options]
 */
export function payPillsFor(actor, item, activity, name, { head = "", always = false, pick = null } = {}) {
  const at = castWaysOf(actor, item, activity);
  if ( !at?.ways.length || (!always && !asksWay(at.ways)) ) return null;
  const chosen = (pick && at.ways.some(w => (w.key === pick) && !w.off)) ? pick : at.pick;
  const ways = at.ways.map(w => ({ key: w.key, off: w.off, ...wayPill(w) }));
  return { html: payPillsHTML({ name, head, pick: chosen, ways }), pick: chosen, ways: at.ways };
}

/**
 * How this actor casts this spell now, and through what: `{ way, copy, activity, forward, handUse, cast, want }`; null
 * for an item that is no levelled spell. `pick` the way the player picked (a pill's key), taken while it is left.
 * `activity` null with `cast` set: a feature's cast whose copy is made at the cast.
 * @param {any} actor
 * @param {any} item       the copy clicked or named
 * @param {any} [activity] its activity (the reaction's, the hit's); the first other than a forward when none
 * @param {{pick?: string|null}} [options]
 */
export function castWayOf(actor, item, activity = null, { pick = null } = {}) {
  const at = factsOf(actor, item, activity);
  if ( !at ) return null;
  const way = chooseCastWay({ ...at.facts, pick });
  const by = ((way.kind !== "none") && at.all.find(c => c.fact.id === way.copyId)) || /** @type {CopyRoute} */ (at.all[0]);
  return { way, copy: by.copy, activity: by.act, forward: (way.kind === "free") ? by.forward : null,
    handUse: (way.kind === "free") && by.handUse, cast: by.cast, want: by.want };
}

/** The name of what granted a copy (Fiendish Legacy, Magic Initiate): the item its advancement came from; else, that item
 * gone (a feat taken off and on again leaves the copy's `advancementOrigin` naming it), an item on the sheet whose grant
 * added this copy or its spell (Familiar Friend's Find Familiar); else the copy's own name.
 * @param {any} copy
 * @returns {string} */
function grantOf(copy) {
  const origin = String(copy?.flags?.dnd5e?.advancementOrigin ?? "").split(".")[0];
  const named = origin ? copy.actor?.items?.get(origin)?.name : null;
  if ( named ) return named;
  const source = sourceOf(copy);
  for ( const holder of copy?.actor?.items ?? [] ) {
    if ( holder.id === copy.id ) continue;
    for ( const adv of Object.values(holder.system?.advancement ?? {}) ) {
      if ( !adv?.configuration?.spell?.uses?.max ) continue;
      const added = adv.value?.added ?? {};
      if ( (copy.id in added) || (source && Object.values(added).includes(source)) ) return holder.name;
    }
  }
  return copy.name;
}

/**
 * The use a way makes: the activity, the usage that pays it and what is spent by hand after a cast (`after`), the
 * feature's copy of the spell made first when it is not on the sheet yet. A free cast through its forward (dnd5e
 * spends the use, no slot); a slot named outright (dnd5e would default a granted copy to a level 1 slot a Warlock
 * does not have), or, through a feature's copy, named for the cast with the feature's spend off and the slot spent by
 * hand; a feature's free cast or pool through its copy (dnd5e spends what the feature names). Null for `none`.
 * @param {ReturnType<typeof castWayOf>} route
 * @returns {Promise<{activity: any, usage: object, after: () => Promise<unknown>}|null>}
 */
export async function useOf(route) {
  if ( !route || (route.way.kind === "none") ) return null;
  const none = async () => null;
  let activity = route.activity;
  if ( !activity && route.cast ) {
    // the feature's copy of the spell, as dnd5e's own CastActivity#use makes it
    let spell = route.cast.cachedSpell;
    if ( !spell ) [spell] = await route.cast.actor.createEmbeddedDocuments("Item", [await route.cast.getCachedSpellData()]);
    activity = matchingActivity(spell, route.want);
  }
  if ( !activity ) return null;
  const { way, forward, copy } = route;
  const cached = !!linkedCastOf(activity.item);
  if ( way.kind === "slot" ) {
    if ( !cached ) return { activity, usage: { spell: { slot: way.slot }, consume: { spellSlot: true } }, after: none };
    const actor = activity.actor;
    return { activity, usage: { spell: { slot: way.slot }, consume: { spellSlot: false }, cause: { resources: false } },
      after: () => actor.update({ [`system.spells.${way.slot}.value`]: Math.max(0, (Number(actor.system?.spells?.[way.slot]?.value) || 0) - 1) })
        .catch(err => log.warn(`Could not spend the ${way.slot} slot for ${activity.item.name}.`, err)) };
  }
  // what ForwardActivity#use does, made on the main activity: the forward is the cause, its use the spend
  if ( forward ) return { activity, usage: { cause: { activity: forward.relativeUUID, resources: true }, consume: { resources: false, spellSlot: false } }, after: none };
  if ( cached ) return { activity, usage: { consume: { spellSlot: false } }, after: none };
  return { activity, usage: { consume: { spellSlot: false } },
    after: route.handUse ? () => copy.update({ "system.uses.spent": (Number(copy.system.uses?.spent) || 0) + 1 })
      .catch(err => log.warn(`Could not spend the free cast of ${copy.name}.`, err)) : none };
}

/**
 * Cast by the way (`useOf`), `usage` merged over the way's own, the hand spend after a cast that went through.
 * @param {ReturnType<typeof castWayOf>} route
 * @param {{usage?: object, dialog?: object, message?: object}} [options]
 */
export async function castBy(route, { usage = {}, dialog = { configure: false }, message = {} } = {}) {
  const plan = await useOf(route);
  if ( !plan ) return null;
  const done = await plan.activity.use(foundry.utils.mergeObject(plan.usage, usage, { inplace: false }), dialog, message);
  if ( done ) await plan.after();
  return done;
}
