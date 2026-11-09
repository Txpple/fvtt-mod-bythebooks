// @ts-check
/**
 * By the Books — the reaction hold's READERS (`hold/` part 1, ARCHITECTURE.md §7): eligibility, the
 * item a reaction IS, its AC and art, whether it landed, and the self-cast effect applier. No hooks.
 */
import { MODULE_ID, readFlag, S, setting, resolveUuidAsync, log } from "../core.js";
import { limitedUses, isReactionItem, isTextOnlyFeature } from "../decide/eligible.js";
import { INTERRUPT_MULTIPLIERS, INTERRUPT_REDUCTIONS, INTERRUPT_ROLLS, DUPLICATES, STORED_DICE, answers, duplicateEntries, listedNames } from "../decide/registry.js";
import { repeatRowFor } from "../decide/repeat-saves.js";
import { standingDuplicates, seesThrough } from "../decide/duplicates.js";
import { bystanderMatters, d20ModeOf, dieMaxOf, liveRows, plainRule, rescueRows, signFor } from "../decide/rescue-hit.js";
import { interruptEntries } from "../decide/registry.js";
import { lower, activityNamed, cardActivity, reductionFor, holdsFor, itemsNamed, featureNamed, bystanderRows, bystanderDie, d20FactsOf, dealtTypesOf, wornNamed } from "../lookup.js";
import { alliesWithin, nearestFeet, tokenOf } from "../geometry.js";
import { reactionSpent, poolOf, placeOf, chipData, effectSourceOf, bystanderMuted, grantingActor, storedChipOf, storedFacesUsable, storedFacesOf } from "../shared.js";
import { facesThatTurn } from "../decide/stored-dice.js";
import { chipClock } from "../decide/chips.js";
import { applyEffectsTo } from "../effect-riders.js";
import { castWayOf } from "../cast-ways.js";

/** The item types a reaction's or a spell's row means: a spell or a monster's feature, never the
 * +1 Shield armor that shares the Shield spell's identifier. */
export const SPELL_ROW_TYPES = ["spell", "feat"];

/** Is a slot of at least `level` available (including pact magic)? */
function hasSpellSlot(actor, level) {
  if ( !level ) return true; // cantrip / at-will
  for ( const [key, slot] of Object.entries(actor.system.spells ?? {}) ) {
    // ⚠ Both: an NPC's derived max can recompute to 0 under a stale `value`.
    if ( !slot?.value || !slot?.max ) continue;
    const numbered = /^spell(\d+)$/.exec(key);
    const slotLevel = numbered ? Number(numbered[1]) : slot.level;
    if ( Number.isFinite(slotLevel) && (slotLevel >= level) ) return true;
  }
  return false;
}

/** The item that IS this reaction on this actor, a spell or a feature. ⚠ One row can match several
 * (a statblock's feature and a cast activity's cached SPELL), hence the preference order.
 * @param {any} actor
 * @param {string} reactionName
 * @param {{itemId?: string|null, activityId?: string|null}} [ids] */
export function reactionItem(actor, reactionName, { itemId, activityId } = {}) {
  if ( !actor || !reactionName ) return null;
  const cached = activityId
    ? actor.items.get(itemId)?.system.activities?.get(activityId)?.cachedSpell
    : null;
  if ( cached ) return cached;
  const matches = itemsNamed(actor, reactionName, { types: SPELL_ROW_TYPES });
  return matches.find(i => isReactionItem(i) && i.effects.size)
    ?? matches.find(i => isReactionItem(i))
    ?? matches.find(i => i.effects.size)
    ?? matches[0] ?? null;
}

/** `{ item, activity }` through which this actor can use the named reaction now, or null.
 * Conservative: a hold the target cannot answer is a false stop. */
export async function usableReaction(actor, name) {
  if ( !actor || !name ) return null;

  // ⚠ Statblock first: its "Spellcasting" `cast` ACTIVITY holds the uses; the linked spell has none.
  const cast = await findCastActivity(actor, name);
  if ( cast ) return { item: cast.item, activity: cast.activity };
  // ⚠ EVERY spell or feature answering the row: a worn shield shares the Shield spell's name.
  for ( const item of itemsNamed(actor, name, { types: SPELL_ROW_TYPES }) ) {
    // A text-only feature (Uncanny Dodge) counts; the answer spends the Reaction chip itself.
    if ( !isReactionItem(item) && !isTextOnlyFeature(item) ) continue;

    // A levelled spell is paid the shared way (cast-ways.js): a free cast spent still leaves the slots (Magic Initiate's Shield).
    const route = (item.type === "spell") ? castWayOf(actor, item) : null;
    const uses = limitedUses(item);
    if ( !route && (uses === "spent") ) continue;     // limited-use feature, none left
    if ( item.type === "spell" ) {
      // ⚠ `prepared` is a PC concept: every levelled spell on a 2024 statblock reads prepared 0.
      if ( (actor.type === "character") && !item.system.prepared ) continue;
      if ( route ) { if ( route.way.kind === "none" ) continue; }
      // ⚠ A statblock spell can be paid by its OWN x/day uses instead of a slot.
      else if ( (uses === "none") && !hasSpellSlot(actor, item.system.level) ) continue;
    }
    return { item, activity: null };
  }
  // THE DMG — a `worn` reduction row (Gloves of Missile Snaring): the magic item equipped (and attuned), its reaction activity.
  const reduction = /** @type {any} */ (Object.entries(INTERRUPT_REDUCTIONS).find(([k]) => lower(k) === lower(name))?.[1] ?? null);
  if ( reduction?.worn ) {
    const item = wornNamed(actor, name);
    if ( item ) return { item, activity: null };
  }
  return null;
}

/**
 * The first listed interrupt usable now; `spentOk` looks past a spent Reaction (a greyed row).
 * @returns {Promise<{entry: any, item: any, activity: any, reduce?: any}|null>}
 */
export async function findInterrupt(actor, /** @type {{isCritical: boolean, spentOk?: boolean, ranged?: boolean|null, dealt?: string[]|null}} */ { isCritical, spentOk = false, ranged = null, dealt = null }) {
  if ( !actor || (!spentOk && reactionSpent(actor)) ) return null;
  for ( const entry of interruptEntries() ) {
    // `roll` rows are never THE reaction: they ride beside it (rollRescuesOf).
    if ( entry.kind === "roll" ) continue;
    const found = await usableReaction(actor, entry.name);
    if ( !found ) continue;
    const reduce = reductionFor(found.item, entry.name);
    // A reduction for ANOTHER creature (Interception) is the guards' (damage-holds.js).
    if ( reduce?.row?.ally ) continue;
    // A reduction for RANGED hits only (Deflect Missile): a melee hit, or one whose mode is unknown, never holds for it.
    if ( reduce?.row?.ranged && (ranged !== true) ) continue;
    // A reduction for some damage types only (Deflect Attacks): an unread type counts; `anyType` lifts it.
    if ( reduce?.row?.types && dealt?.length && !dealt.some(t => reduce.row.types.includes(t))
      && !(reduce.row.anyType && featureNamed(actor, reduce.row.anyType)) ) continue;
    const kind = reduce ? "damage" : entry.kind;
    // A natural 20 hits regardless of AC.
    if ( isCritical && (kind === "ac") ) continue;
    if ( reduce ) {
      const pool = reduce.row.pool ? poolOf(actor, reduce.activity) : null;
      if ( pool && !(Number(pool.system?.uses?.value ?? 0) > 0) ) continue;
      // The row's voice rides the hold flag; `maneuver` decides the resolve's `maneuver` word.
      const row = reduce.row;
      return { entry: { ...entry, kind }, ...found, reduce: { formula: reduce.formula, activityId: reduce.activity.id,
        eyebrow: row.eyebrow ?? "Maneuver", spend: row.spend ?? "Superiority Die", hit: row.hit ?? "melee attack",
        by: row.by ?? "the die plus your modifier", maneuver: (row.eyebrow ?? "Maneuver") === "Maneuver" } };
    }
    // A standing `ac` reaction is not re-offered (no stacking) — here only: the spell trigger
    // keeps asking, or damage a standing Shield negates would apply.
    if ( (entry.kind === "ac") && hasReactionEffect(actor, entry.name,
      { itemId: found.item.id, activityId: found.activity?.id }) ) continue;
    return { entry, ...found };
  }
  return null;
}

/**
 * The `roll` rows on this sheet with live uses, spent ones included (greyed). ⚠ A uses row needs
 * uses on the item: the 2014 Halfling "Lucky" shares the name and has none.
 * @returns {{name: string, row: object, item: Item, activity: object|null, left: number|null, max: number|null}[]}
 */
export function rollRescuesOf(actor) {
  if ( !actor ) return [];
  const out = [];
  for ( const entry of interruptEntries() ) {
    if ( entry.kind !== "roll" ) continue;
    const key = Object.keys(INTERRUPT_ROLLS).find(k => lower(k) === lower(entry.name));
    const row = key ? INTERRUPT_ROLLS[key] : null;
    if ( !key || !row ) continue;   // a `roll` entry the table has no cost shape for: nothing to spend, never guessed
    if ( row.ally ) continue;   // Protection's Disadvantage is for another creature: a guard's row (protectionGuardsOf)
    if ( row.bystander ) continue;   // another creature's roll, bent from outside: a bystander's row (bystandersOf)
    const item = itemsNamed(actor, key, { types: ["feat"] })
      .find(i => !row.uses || (Number(i.system?.uses?.max) > 0));
    if ( !item ) continue;
    const max = row.uses ? Number(item.system.uses.max) : null;
    out.push({ name: key, row, item, activity: activityNamed(item, row.activity),
      left: row.uses ? Math.max(0, Number(item.system.uses.value ?? 0)) : null, max });
  }
  return out;
}

/** What the attack was: RANGED (the attack's own mode — a ranged weapon, a thrown one — else its activity's type), a SPELL attack,
 * and the damage types its activity deals. */
export function attackFactsOf(attackMessage) {
  const mode = String(attackMessage?.system?.mode ?? "");
  const activity = cardActivity(attackMessage);
  const ranged = (mode === "ranged") || mode.startsWith("thrown") || (activity?.attack?.type?.value === "ranged");
  const spellAttack = (activity?.item?.type === "spell") || (activity?.attack?.type?.classification === "spell");
  return { ranged, spellAttack, dealt: activity ? dealtTypesOf(activity) : [] };
}

/**
 * THE DUPLICATES standing on a defender (DUPLICATES, Mirror Image), read against this attacker: the row, the
 * count, the effects in the row's order, and whether the attacker sees through them. Null with none.
 * @returns {{key: string, at: number|null, die: number|null, count: number, of: number, ids: string[], names: string[], img: string|null, seenThrough: string|null, feature?: boolean, reflectAt?: number|null,
 *   save?: {ability: string, dc: number, activityUuid: string, effectId: string, turn: string|null}}|null}
 */
export function duplicatesOf(defender, attacker, { ranged = false, spellAttack = false } = {}) {
  if ( !defender ) return null;
  const listed = listedNames(duplicateEntries());
  // The defender's OWN trait (Reflective Carapace): one "duplicate" that stands, for the hits the row names.
  for ( const [key, base] of Object.entries(DUPLICATES) ) {
    const row = /** @type {any} */ (base);
    if ( (row.match !== "feature") || !listed.has(lower(key)) ) continue;
    if ( (row.only === "rangedSpellAttack") && !(ranged && spellAttack) ) continue;
    const item = featureNamed(defender, key);
    if ( !item ) continue;
    const seen = seesThrough(row, { statuses: attacker?.statuses ?? [], senses: attacker?.system?.attributes?.senses ?? {} });
    return { key, at: row.at, die: row.die, count: 1, of: 1, ids: [], names: [key], img: item.img ?? null, seenThrough: seen.why,
      feature: true, reflectAt: row.reflectAt ?? null };
  }
  for ( const effect of defender.effects ) {
    if ( !effect.active ) continue;
    const item = effectSourceOf(effect)?.item ?? null;
    const row = repeatRowFor({ table: DUPLICATES, item, effectName: effect.name, listed, answers });
    if ( !row ) continue;
    // C1 — a `save` row (Unbreakable Majesty): one "duplicate" that is never destroyed; the ATTACKER's save (the pack's
    // activity on the defender's item) instead of a die, once per attacker per turn (a stamp on the effect).
    if ( row.save ) {
      const activity = item ? activityNamed(item, row.save) : null;
      const dc = activity?.save?.dc?.value;
      const ability = [...(activity?.save?.ability ?? [])][0] ?? null;
      if ( !activity || !(dc > 0) || !ability ) continue;
      const turn = game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
      const asked = readFlag(effect, "recoiled") ?? {};
      if ( attacker?.uuid && turn && (asked[recoilKey(attacker.uuid)] === turn) ) continue;
      return { key: row.key, at: null, die: null, count: 1, of: 1, ids: [effect.id], names: [effect.name], img: item?.img ?? effect.img ?? null, seenThrough: null,
        feature: true, save: { ability, dc, activityUuid: activity.uuid, effectId: effect.id, turn } };
    }
    const standing = standingDuplicates(row, defender.effects.contents);
    if ( !standing.length ) return null;
    const seen = seesThrough(row, { statuses: attacker?.statuses ?? [], senses: attacker?.system?.attributes?.senses ?? {} });
    return { key: row.key, at: row.at, die: row.die, count: standing.length, of: Array.isArray(row.effect) ? row.effect.length : 1,
      ids: standing.map(e => e.id), names: standing.map(e => e.name), img: item?.img ?? effect.img ?? null, seenThrough: seen.why };
  }
  return null;
}

/** C1 — the `recoiled` stamp's key for an attacker: its uuid with the dots folded (a dotted flag key expands into nested objects). */
export const recoilKey = uuid => String(uuid ?? "").replaceAll(".", "|");

/**
 * The guards: allies in reach who could answer with a `roll` row for ANOTHER creature (Protection).
 * @returns {{uuid: string, name: string, row: string, itemId: string, activityId: string|null, passed: boolean}[]}
 */
export function protectionGuardsOf(defender, attacker) {
  const rows = interruptEntries().filter(e => e.kind === "roll")
    .map(e => Object.keys(INTERRUPT_ROLLS).find(k => lower(k) === lower(e.name)))
    .filter(k => k && INTERRUPT_ROLLS[k].ally);
  if ( !rows.length || !defender ) return [];
  const guarded = tokenOf(defender.uuid);
  if ( !guarded ) return [];
  const out = [];
  for ( const key of rows ) {
    const row = INTERRUPT_ROLLS[key];
    for ( const token of alliesWithin(guarded, row.ally, [attacker?.uuid]) ) {
      const actor = token.actor;
      if ( out.some(g => g.uuid === actor.uuid) ) continue;
      const item = featureNamed(actor, key);
      if ( !item || reactionSpent(actor) || !holdsFor(actor, row.holding) ) continue;
      out.push({ uuid: actor.uuid, name: token.document?.name ?? actor.name, row: key, itemId: item.id,
        activityId: activityNamed(item, row.activity)?.id ?? null, passed: false });
    }
  }
  return out;
}

/**
 * THE BYSTANDERS (RULINGS *The full release — the order*, Q2 option A), for a HIT (`on: "hit"` — creatures on the
 * DEFENDER's side, the bend turning it to a miss) or a MISS (`on: "miss"` — creatures on the ATTACKER's side,
 * the bend turning it to a hit; the attacker itself when the row is `self`, with no Reaction): within a row's
 * feet of the ATTACKER, their Reaction free, a use left, not muted (shared.js `bystanderMuted`). ASKED (a popup)
 * when the bend can change the verdict — the margin gate; else not listed. A row's damage half (`damage`, Cutting
 * Words) is the DAMAGE hold's to ask, once the damage is known (damage-holds.js; RULINGS *The asks widened*).
 * Sight is never judged; the side and the distance are. The hit creature's own answer skips the sides: an ally's
 * hit, or a hit on a neutral, still asks it (Combat Inspiration's Defense), and asks nobody else.
 * @returns {{uuid: string, name: string, row: string, itemId: string, activityId: string|null, passed: boolean,
 *   bystander: boolean, self?: boolean, die: string|null}[]}
 */
export function bystandersOf(defender, attacker, roll, ac, { on = "hit" } = {}) {
  const keys = bystanderRows("attack").filter(k => [on, "both"].includes(INTERRUPT_ROLLS[k].on ?? "hit"));
  if ( !keys.length || !defender || !attacker || !roll ) return [];
  const guarded = tokenOf(defender.uuid), from = tokenOf(attacker.uuid);
  const side = (on === "hit") ? guarded?.document?.disposition : from?.document?.disposition;
  const other = (on === "hit") ? from?.document?.disposition : guarded?.document?.disposition;
  if ( !guarded || !from ) return [];
  // The sides judge a BYSTANDER: an attack inside one side, or on a neutral, is no other creature's to bend. The hit
  // creature's own answer (Combat Inspiration's Defense) is its own, whoever swung: an ally's hit asks it too.
  const sided = ((side === 1) || (side === -1)) && (other !== side);
  if ( !sided && (on !== "hit") ) return [];
  const want = (on === "hit") ? "miss" : "hit";
  const facts = d20FactsOf(roll);
  if ( !Number.isFinite(facts.kept) ) return [];
  /** @type {any[]} */
  const out = [];
  for ( const key of keys ) {
    const row = INTERRUPT_ROLLS[key];
    for ( const token of (canvas.tokens?.placeables ?? []) ) {
      if ( token.document?.disposition !== side ) continue;
      const actor = token.actor;
      const self = !!actor && (actor.uuid === attacker.uuid);
      // On a hit, the hit creature itself answers only a `self` row; `only: "self"` lets nobody else answer.
      const hitSelf = !!actor && (on === "hit") && (actor.uuid === defender.uuid);
      if ( !sided && !hitSelf ) continue;
      if ( !actor || (self &&!((on === "miss") && row.self)) || out.some(b => (b.uuid === actor.uuid) && (b.row === key)) ) continue;
      if ( (row.only === "self") && !hitSelf ) continue;
      if ( ((actor.system?.attributes?.hp?.value ?? 0) <= 0) || actor.statuses?.has?.("incapacitated") ) continue;
      const feet = hitSelf ? 0 : nearestFeet(token, (row.reach === "target") ? guarded : from);
      if ( (feet === null) || (feet > row.bystander) ) continue;
      // An `inspired` row: the answerer's own Inspired die, granted by a bard holding the feature.
      const inspired = row.inspired ? inspiredDieOf(actor, key) : null;
      if ( row.inspired && !inspired ) continue;
      const item = inspired ? null : featureNamed(actor, key);
      // B4 — the sign follows the side ("either", Bend Luck) or the stored omen's parity ("omen", Cosmic Omen: its activity too).
      const omenFace = (row.sign === "omen") ? (storedFacesOf(storedChipOf(actor, row.stored))[0] ?? null) : null;
      const sign = signFor(row, { friendly: on === "miss", face: omenFace }) ?? NaN;
      if ( !Number.isFinite(sign) ) continue;   // an omen with no face rolled yet
      const activityName = row.omen ? ((sign > 0) ? row.omen.even : row.omen.odd) : ((self && row.selfActivity) ? row.selfActivity : row.activity);
      const activity = item ? activityNamed(item, activityName) : null;
      if ( !inspired && (!item || (!activity && !row.stored && !row.omen)) ) continue;
      // A `self` answer on your own roll takes no Reaction (Guided Strike); a hit creature's own answer does.
      if ( row.reaction && (!self || hitSelf) && reactionSpent(actor) ) continue;
      const pool = activity ? (poolOf(actor, activity) ?? item) : null;
      if ( row.uses && !(Number(pool?.system?.uses?.value ?? 0) > 0) ) continue;
      if ( bystanderMuted(actor, key) ) continue;
      // A STORED face (Portent): the faces in hand that turn the verdict — asked (RULINGS *The asks widened*).
      let faces = null;
      if ( row.bend === "set" ) {
        const chip = storedChipOf(actor, row.stored);
        if ( !chip || !storedFacesUsable(chip, STORED_DICE[row.stored]) ) continue;
        faces = facesThatTurn({ faces: storedFacesOf(chip), kept: Number(facts.kept), total: Number(roll.total),
          target: Number(ac), want, critAt: facts.critAt, fumbleAt: facts.fumbleAt });
        if ( !faces.length ) continue;
        out.push({ uuid: actor.uuid, name: token.document?.name ?? actor.name, row: key, itemId: item.id, activityId: null,
          passed: false, bystander: true, ...(hitSelf ? { hitSelf: true } : {}), die: null, faces });
        continue;
      }
      const die = (row.bend !== "die") ? null : inspired ? inspired.die : formulaBonusOf(actor, row) ?? bystanderDie(actor, row);
      if ( (row.bend === "die") && !dieMaxOf(die) ) continue;   // a die nobody can read is never guessed
      // ⚠ The margin gate judges the AC: with the math hidden it would leak it (holdWouldMatter's rule),
      // so a die bend is then asked on every hit but a natural 20 or 1.
      const matters = ((row.bend === "die") && !setting(S.holdReveal)) ? !(roll.isCritical || roll.isFumble) : bystanderMatters({ bend: row.bend, sign, dieMax: dieMaxOf(die), want,
        kept: Number(facts.kept), plain: facts.plain, total: Number(roll.total), target: Number(ac), mode: facts.mode,
        isCritical: !!roll.isCritical, isFumble: !!roll.isFumble, critAt: facts.critAt, fumbleAt: facts.fumbleAt });
      if ( !matters ) continue;
      out.push({ uuid: actor.uuid, name: token.document?.name ?? actor.name, row: key, itemId: item?.id ?? null,
        activityId: activity?.id ?? null, passed: false, bystander: true,
        ...(self ? { self: true } : {}), ...(hitSelf ? { hitSelf: true } : {}), sign,
        ...(inspired ? { inspired: { effectId: inspired.effect.id, bard: inspired.bard.name } } : {}), die });
    }
  }
  return out;
}

/** A row's `bonus` written as a formula ("max(1, @abilities.cha.mod)"), resolved on the answerer; null otherwise. */
function formulaBonusOf(actor, row) {
  if ( (typeof row.bonus !== "string") || !row.bonus.includes("@") ) return null;
  try {
    const resolved = Roll.replaceFormulaData(row.bonus, actor.getRollData());
    const n = Roll.validate(resolved) ? Math.floor(Number(Roll.safeEval(resolved))) : NaN;
    return Number.isFinite(n) ? String(n) : null;
  } catch { return null; }
}

/** The answerer's own Inspired die from a bard holding `featureName` — the effect, the bard, the die (the BARD's). */
export function inspiredDieOf(actor, featureName) {
  for ( const effect of actor?.effects ?? [] ) {
    if ( !effect.active || (lower(effect.name) !== "inspired") ) continue;
    const bard = grantingActor(effect);
    if ( !bard || !featureNamed(bard, featureName) ) continue;
    const scale = foundry.utils.getProperty(bard.getRollData(), "scale.bard.inspiration");
    const die = scale?.formula ?? scale?.die ?? null;
    if ( (typeof die === "string") && die.trim() ) return { effect, bard, die: die.trim() };
  }
  return null;
}

function rescueFactsOf(actor, roll) {
  const d20 = roll?.dice?.[0] ?? null;
  return { reactionSpent: reactionSpent(actor), isCritical: !!roll?.isCritical,
    mode: d20ModeOf({ number: d20?.number, modifiers: d20?.modifiers }) };
}

/** A found reaction as the plain facts its row is drawn from (decide/rescue-hit.js `rescueRows`). */
function primaryFacts(actor, found) {
  const kind = found.reduce ? "damage" : found.entry.kind;
  const item = found.item;
  const spell = (item?.type === "spell") || (found.activity?.type === "cast");
  const max = Number(item?.system?.uses?.max);
  const multiplierKey = Object.keys(INTERRUPT_MULTIPLIERS).find(k => lower(k) === lower(found.entry.name));
  // The pool: Parry's dice, or the feature's own uses (Stone's Endurance).
  const reduceActivity = found.reduce ? item?.system?.activities?.get(found.reduce.activityId) : null;
  const poolItem = reduceActivity ? poolOf(actor, reduceActivity) : null;
  const pool = found.reduce ? { spend: found.reduce.spend ?? "Superiority Die",
    left: Number(poolItem?.system?.uses?.value ?? 0), max: Number(poolItem?.system?.uses?.max ?? 0) } : null;
  return { name: found.entry.name, kind,
    bonus: (kind === "ac") ? reactionACBonus(found.entry.name, actor, { itemId: item?.id, activityId: found.activity?.id }) : null,
    spell, pool, multiplier: multiplierKey ? INTERRUPT_MULTIPLIERS[multiplierKey].multiplier : null,
    uses: (!spell && (max > 0)) ? { left: Number(item.system.uses.value ?? 0), max } : null };
}

const rollFacts = r => ({ name: r.name, reaction: r.row.reaction, uses: r.row.uses, point: r.row.point ?? null, left: r.left });

/**
 * The rescue popup's rows, records and liveness for this defender; null with no `roll` row. A dead
 * reaction shows greyed only for a visible reason (Reaction spent, a nat 20 against AC).
 * @param {Actor} actor
 * @param {object} roll  the attack's D20Roll
 * @param {{found?: object|null, hidePrimary?: boolean}} [opts]
 */
export async function rescueStateOf(actor, roll, { found = null, hidePrimary = false } = {}) {
  const rolls = rollRescuesOf(actor);
  if ( !rolls.length ) return null;
  const facts = rescueFactsOf(actor, roll);
  let shown = found;
  if ( !found && !hidePrimary ) {
    const candidate = await findInterrupt(actor, { isCritical: false, spentOk: true });
    const kind = candidate ? (candidate.reduce ? "damage" : candidate.entry.kind) : null;
    if ( candidate && (facts.reactionSpent || (facts.isCritical && (kind === "ac"))) ) shown = candidate;
  }
  const rows = rescueRows({ primary: shown ? primaryFacts(actor, shown) : null, rolls: rolls.map(rollFacts), facts });
  return { rows, live: liveRows(rows).length > 0,
    records: rolls.map(r => ({ name: r.name, itemId: r.item.id, activityId: r.activity?.id ?? null })) };
}

/**
 * The stamped rows with `roll` costs re-read live, each with its rule pointer.
 * @param {Actor} actor
 * @param {{rows?: object[], reaction?: string, itemId?: string, activityId?: string|null}} target
 * @param {object} roll
 */
export function rescueRowsNow(actor, target, roll) {
  const stamped = target?.rows ?? [];
  const fresh = new Map(rescueRows({ primary: null, rolls: rollRescuesOf(actor).map(rollFacts),
    facts: rescueFactsOf(actor, roll) }).map(r => [r.key, r]));
  return stamped.map(r => {
    const now = (r.kind === "roll") ? (fresh.get(r.key) ?? { ...r, off: "no longer on the sheet", tag: "no longer on the sheet" }) : r;
    const rollKey = Object.keys(INTERRUPT_ROLLS).find(k => lower(k) === lower(r.key));
    // the reaction's own item as a pointer: the fold reads its first paragraph, enriched, from the book
    const item = rollKey ? null : reactionItem(actor, r.key, (r.key === target.reaction) ? target : {});
    const rule = rollKey ? INTERRUPT_ROLLS[rollKey].rule
      : item ? { item: item.name, uuid: item.uuid } : plainRule("");
    return { ...now, rule };
  });
}

/** The spell a `cast` activity casts — the link, never the activity's own name. */
async function castSpellOf(activity) {
  if ( activity?.type !== "cast" ) return null;
  const uuid = activity.spell?.uuid;
  if ( !uuid ) return null;
  return resolveUuidAsync(uuid);
}

/** Whatever a used activity should be MATCHED against: its linked spell, or its item. */
export async function reactionItemFor(activity) {
  return (await castSpellOf(activity)) ?? activity?.item ?? null;
}

/** A reaction `cast` activity for the row's spell. ⚠ No pool is AT-WILL (`uses.max: ""`). */
async function findCastActivity(actor, spellName) {
  for ( const item of actor.items ) {
    for ( const activity of item.system?.activities?.contents ?? [] ) {
      if ( activity.type !== "cast" ) continue;
      if ( activity.activation?.type !== "reaction" ) continue;
      if ( !answers(spellName, await castSpellOf(activity), SPELL_ROW_TYPES) ) continue;
      const max = Number(activity.uses?.max);
      const pooled = Number.isFinite(max) && (max > 0);
      if ( pooled && !(Number(activity.uses?.value) > 0) ) continue;   // pool exists, spent
      return { item, activity };
    }
  }
  return null;
}

/** Is the reaction's effect on this actor? By NAME too: the caster applies from an item CLONE.
 * ⚠ `active`, never `!disabled`: v14 MARKS an expired effect instead of deleting it. */
export function hasReactionEffect(actor, reactionName, ids) {
  if ( !actor || !reactionName ) return false;
  const item = reactionItem(actor, reactionName, ids);
  const names = new Set((item?.effects?.contents ?? []).map(e => e.name));
  return actor.effects.some(e => e.active && (names.has(e.name)
    || (e.origin && item && e.origin.includes(item.id))));
}

/** Put the answering reaction's own effect on its caster (Shield's +5 is a non-transfer effect; a
 * cast alone moves no AC). Receipt-shaped entries, [] on nothing. */
export async function applyReactionEffect(activity, actor, reactionName, ids) {
  try {
    // C1 — a multiplier row's typed effect (Superior Hunter's Defense, `effects: "type"`): the pack's activity carries
    // one Resistance per damage type; none of them is the answer's. The one of the damage's type lands WITH the share
    // (auto-apply.js, damage-holds.js) — applied here, all thirteen would land and the platform would halve twice.
    const multiplierKey = Object.keys(INTERRUPT_MULTIPLIERS).find(k => lower(k) === lower(reactionName ?? ""));
    if ( multiplierKey && (INTERRUPT_MULTIPLIERS[multiplierKey].effects === "type") ) return [];
    // ⚠ A cast activity's effects live on the linked spell: reactionItem, never a bare name match.
    const own = (await activity?.getApplicableEffects?.()) ?? [];   // 6.0: profiles resolve asynchronously
    let effects = own;
    if ( !effects.length && reactionName ) {
      const spell = reactionItem(actor, reactionName, ids);
      effects = (spell?.effects?.contents ?? []).filter(e => !e.transfer);
    }
    if ( !effects.length ) return [];
    // ⚠ A `turnStart` effect would be stamped on the ATTACKER's turn: it takes the Reaction chip's
    // clock, pinned to the reactor (RULINGS *Chips and clocks*).
    const sameSentence = effects.every(e => (e._source?.duration?.expiry ?? e.duration?.expiry) === "turnStart");
    const clock = sameSentence ? chipClock("reaction", placeOf(actor)) : null;
    return await applyEffectsTo([{ uuid: actor.uuid, name: actor.name }], effects, {
      activity: (effects === own) ? (activity ?? null) : null,   // the applying activity, when the effects are its own
      matchNames: true,
      extraFlags: { [MODULE_ID]: { reactionEffect: true } },
      source: actor.uuid, // the data-plane stamp's source — the reactor's own self-cast
      clock: clock?.start ? chipData(clock) : null
    });
  } catch(err) {
    log.error(`Could not apply the reaction's effect — apply it from the card.`, err);
    return [];
  }
}

/** Has the reaction's AC ARRIVED? ⚠ The derived AC lags the effect row, per client — wait on the NUMBER. */
export function reactionACArrived(actor, target) {
  if ( !hasReactionEffect(actor, target.reaction, target) ) return false;
  // Applied before the stamp: the snapshot already holds the bonus.
  if ( target.hadEffect ) return true;
  const bonus = reactionACBonus(target.reaction, actor, target);
  if ( bonus == null ) return true; // proficiency-scaled or formula bonus: not measurable here
  const liveAC = actor?.system?.attributes?.ac?.value;
  return Number.isFinite(liveAC) && (liveAC >= ((target.ac ?? 0) + bonus));
}

export function reactionImg(actor, reactionName, ids) {
  return reactionItem(actor, reactionName, ids)?.img ?? null;
}

/** The AC the reaction's own effect grants; null for a non-numeric bonus (Defensive Duelist). */
export function reactionACBonus(reactionName, actor, ids) {
  const item = reactionItem(actor, reactionName, ids);
  for ( const effect of item?.effects ?? [] ) {
    for ( const change of effect.changes ?? [] ) {
      if ( change.key !== "system.attributes.ac.bonus" ) continue;
      const value = Number(change.value);
      if ( Number.isFinite(value) ) return value;
    }
  }
  return null;
}
