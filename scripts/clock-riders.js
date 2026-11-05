/**
 * By the Books — damage riders on the combat clock: a feature's extra damage rides the hit when the round or the turn says so.
 */
import { MODULE_ID, readFlag, TITLE, activeCombatFor, canAnswerFor, drivesMomentFor, queueFlagWrite, statContext, resolveUuid, log } from "./core.js";
import { ruleHTML } from "./rule-text.js";
import { lower, featureNamed, itemNamed, activityNamed, activityOfType, asiAssigned, cardActivity, dealtTypesOf, pactWeaponFits, wieldsAs, wornNamed } from "./lookup.js";
import { coatSaveAbility } from "./decide/chips.js";
import { clockRiderEntries, listedNames } from "./decide/registry.js";
import { forceStatus, grantingActor, hitTargets, namedPart, poolOf, statSourceOf, turnChitStands, writeTurnChit, withTargets, attackIdOf, d20FoldSpends } from "./shared.js";
import { applyActivityEffectsOnHit, applyItemEffectOnHit } from "./effect-riders.js";
import { momentButton, registerResumable, registerOfferPart, postCard, pickInputs } from "./ui.js";
import { bfCard, optionAskHTML, riderMenuHTML, ruleLine, esc } from "./decide/present.js";
import { CLOCK_RIDERS, answers } from "./decide/registry.js";
import { riderDue, riderPartFormula, riderUsesFrom, standingForm, targetsAnswer } from "./decide/clock.js";
import { attackMessageForDamage } from "./auto-damage.js";
import { applyDamagesWithReceipt, hasReceipt, receiptEntries } from "./auto-apply.js";
import { creaturesWithin, feetOf, tokenOf } from "./geometry.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";

// Clock riders (registry CLOCK_RIDERS) use hit-riders' seam — `preRollDamage` on the roller's client, the
// rider its own part, crit-doubled with the weapon's dice. ⚠ An unresolved token in the dice rolls ZERO in
// silence (NOTES §2), so it is refused and the card says so.

/** Where a rider's limited uses live, or null: the ACTIVITY's own, else the ITEM its consumption names
 * (the item itself for an empty target); the spend writes back there. */
function usesOf(attacker, activity, row) {
  const pool = (row.uses && activity) ? poolOf(attacker, activity) : null;
  const read = riderUsesFrom({ activity: activity?.uses ?? null, item: pool?.system?.uses ?? null, uses: !!row.uses });
  return read ? { ...read, item: (read.on === "item") ? pool : null } : null;
}

/** C1 — the actor that summoned this one (the platform's summon origin: the activity, its item's actor), or null. */
function summonerOf(actor) {
  try {
    const origin = actor?.getFlag?.("dnd5e", "summon")?.origin ?? null;
    const doc = origin ? resolveUuid(origin) : null;
    const owner = doc?.actor ?? doc?.item?.actor ?? doc?.parent?.actor ?? null;
    return (owner instanceof Actor) && (owner.uuid !== actor?.uuid) ? owner : null;
  } catch { return null; }
}

/** C1 — does this creature wear `name` (Hunter's Mark, Hex) placed by `bearer`? The effect's origin leads to the bearer. */
function wearsMarkOf(target, bearer, name) {
  if ( !(target instanceof Actor) || !bearer ) return false;
  return target.effects.some(e => e.active && (lower(e.name) === lower(name)) && (grantingActor(e)?.uuid === bearer.uuid));
}

/** The flag a form chip wears — the transformation a `transformed` row reads (Necrotic Shroud). */
const FORM_FLAG = "formChip";

/** Which of a `transformed` row's forms stands on this bearer (decide/clock.js standingForm), or null. */
function formOn(actor, row) {
  if ( !row.forms ) return null;
  return standingForm(row, (actor?.effects ?? []).map(e => ({ name: e.name, active: !!e.active,
    chip: readFlag(e, FORM_FLAG)?.form ?? null })));
}

/** A row's extra damage as a formula: the row's own `amount` (the text's token), else its activity's first part. */
function riderFormulaOf(row, act) {
  if ( row.amount ) return row.amount;
  const part = act?.damage?.parts?.[0];
  return part ? riderPartFormula({ number: part.number, denomination: part.denomination, custom: part.custom, bonus: part.bonus }) : null;
}

/** RAVENLOFT — the actor whose item put the mark of that name on the (first) hit creature, or null (Path to the Grave: the
 * cleric is the bearer whoever's hit it was). */
function markerOf(hits, name) {
  const target = hits.length ? resolveUuid(hits[0].uuid) : null;
  const mark = target?.effects?.find(e => e.active && (lower(e.name) === lower(name)) && e.origin);
  const origin = mark ? resolveUuid(mark.origin) : null;
  const actor = origin?.actor ?? ((origin instanceof Actor) ? origin : null);
  return (actor instanceof Actor) ? actor : null;
}

/** The item carries this feature's enchantment (a copy, never the feature's own source effect). */
const enchantedBy = (item, feature) => !!item && (item.id !== feature.id)
  && item.effects.some(e => (e.type === "enchantment") && (lower(e.name) === lower(feature.name)));

/** An `enchant` row's item: the one its enchantment rides, or — none on the sheet — the row's `spell`. */
function enchantedFor(attacker, item, feature, row) {
  if ( enchantedBy(item, feature) ) return true;
  const anywhere = attacker.items.some(i => enchantedBy(i, feature));
  return !anywhere && !!row.spell && answers(row.spell, item);
}

/** THE DMG — "roll a 20 on the d20": the attack's kept d20 shows 20, or a fold made it one (Stroke of Luck's twenty, a
 * reroll that landed a 20). */
function naturalTwentyOf(attackMessage) {
  const face = attackMessage?.rolls?.[0]?.dice?.[0]?.results?.find(r => (r.active !== false) && !r.discarded)?.result ?? null;
  if ( face === 20 ) return true;
  const spends = d20FoldSpends(attackMessage);
  return spends.some(s => Number.isFinite(s?.twenty?.total) || (s?.reroll?.isCritical === true));
}

/** Is this creature shape-shifted: a shapechanger by its type, or under a transformation (the platform's flags)? */
const shapeshiftedOf = actor => !!actor && (
  /shapechanger/i.test(String(actor.system?.details?.type?.subtype ?? ""))
  || !!(actor.getFlag?.("dnd5e", "isPolymorphed") || actor.isPolymorphed || actor.getFlag?.("dnd5e", "transformed")
    || actor.getFlag?.("dnd5e", "originalActor")));

/** The hit creatures as `targetsAnswer` reads them; a character with no type of its own is a Humanoid. */
const hitFactsOf = hits => hits.map(h => {
  const actor = resolveUuid(h.uuid);
  const type = actor?.system?.details?.type?.value || ((actor?.type === "character") ? "humanoid" : null);
  return { name: h.name ?? actor?.name, type, hp: Number(actor?.system?.attributes?.hp?.value), shapeshifted: shapeshiftedOf(actor) };
});

/** The hit target's Hit Points below their maximum (true / false), or null when none can be read. */
function targetDamagedOf(hits) {
  const actor = hits[0] ? resolveUuid(hits[0].uuid) : null;
  const hp = actor?.system?.attributes?.hp;
  if ( !hp || !Number.isFinite(Number(hp.value)) || !(Number(hp.max) > 0) ) return null;
  return Number(hp.value) < Number(hp.max);
}

/** Every hit target at or below `maxSize` (true / false), or null when a size cannot be read (the table judges). */
function targetsFit(hits, maxSize) {
  const sizes = CONFIG.DND5E.actorSizes ?? {};
  const cap = sizes[maxSize]?.numerical;
  if ( !Number.isFinite(cap) || !hits.length ) return null;
  let unknown = false;
  for ( const h of hits ) {
    const n = sizes[resolveUuid(h.uuid)?.system?.traits?.size]?.numerical;
    if ( !Number.isFinite(n) ) { unknown = true; continue; }
    if ( n > cap ) return false;
  }
  return unknown ? null : true;
}

/** The flag a feature keeps its OPTION in — the choice the sheet never records (Hunter's Prey). */
const OPTION_FLAG = "option";
const optionOf = feature => readFlag(feature, OPTION_FLAG) ?? null;

/**
 * An `inspired` row: the attacker's own Inspired die, granted by a bard who holds the row's feature (Combat
 * Inspiration) — the effect, the bard's feature, and the die read off the BARD (d20-folds.js BARDIC's read).
 */
function inspiredFrom(attacker, featureName) {
  for ( const effect of attacker.effects ) {
    if ( !effect.active || (lower(effect.name) !== "inspired") ) continue;
    const bard = grantingActor(effect);
    const feature = bard ? featureNamed(bard, featureName) : null;
    if ( !feature ) continue;
    const scale = foundry.utils.getProperty(bard.getRollData(), "scale.bard.inspiration");
    const die = scale?.formula ?? scale?.die ?? null;
    if ( (typeof die !== "string") || !die.trim() ) continue;   // a die nobody can read is never guessed
    return { effect, bard, feature, die: die.trim() };
  }
  return null;
}

/** The damage types a built damage config deals — its rolls' own types. */
const dealtTypesOfRolls = rolls => [...new Set((rolls ?? []).flatMap(r => r?.options?.types ?? (r?.options?.type ? [r.options.type] : [])))];

/** The activity among a row's `activities` (ability → name) for the ability the feat raised (its ASI record), else the
 * higher modifier among those the sheet carries (REST_GRANTS' Inspiring Leader pick). */
function pickedActivityOf(actor, feature, activities) {
  const offered = Object.entries(activities).filter(([, n]) => activityNamed(feature, n)).map(([a]) => a);
  const ability = coatSaveAbility({ offered, assigned: asiAssigned(feature),
    mods: Object.fromEntries(offered.map(a => [a, actor.system?.abilities?.[a]?.mod ?? 0])) });
  return ability ? activityNamed(feature, activities[ability]) : null;
}

/**
 * Every listed clock rider on this attacker's sheet, judged for THIS hit. `roll` (at the damage roll):
 * the built parts' types stand over the activity's, and the roll's own crit counts (a Paralyzed target's).
 * @param {ChatMessage} attackMessage
 * @param {object} activity   the ATTACK activity that hit
 * @param {{dealt?: string[], critical?: boolean}} [roll]
 */
function clockRidersFor(attackMessage, activity, roll = {}) {
  const attacker = activity?.actor ?? attackMessage?.getAssociatedActor();
  const item = activity?.item;
  if ( !attacker || !item ) return [];
  const listed = listedNames(clockRiderEntries());
  if ( !listed.size ) return [];
  const combat = activeCombatFor(attacker);
  const weaponType = [...(item.system?.damage?.base?.types ?? [])][0] ?? null;
  const hits = attackMessage ? hitTargets(attackMessage) : [];
  const facts = {
    inCombat: !!combat, round: combat?.round ?? null,
    sneakArmed: !!readFlag(attackMessage, "sneak")?.armed,
    raging: attacker.effects.some(e => e.active && ((lower(e.name) === "rage") || e.statuses?.has?.("raging"))),
    reckless: attacker.effects.some(e => e.active && (lower(e.name) === "reckless")),
    targetDamaged: targetDamagedOf(hits),
    weapon: item.type === "weapon",
    dealt: roll.dealt ?? dealtTypesOf(activity),
    // a Critical Hit: the attack's own d20, or the damage roll made critical (a Paralyzed target's)
    critical: !!attackMessage?.rolls?.[0]?.isCritical || (roll.critical === true),
    // an Opportunity Attack: one the module drove says so; an off-turn melee attack in combat may be one
    opportunity: readFlag(attackMessage, "opportunity") ? "driven"
      : (combat?.started && combat.combatant && (combat.combatant.actor?.uuid !== attacker.uuid)
        && (activity?.attack?.type?.value === "melee")) ? "offTurn" : null
  };
  const out = [];
  // C1 — the facts the band-C rows read: a melee attack, the attacker in Wild Shape (the platform's transformation flag).
  facts.melee = activity?.attack?.type?.value === "melee";
  facts.wildShape = !!(attacker.getFlag?.("dnd5e", "isPolymorphed") || attacker.isPolymorphed || attacker.getFlag?.("dnd5e", "transformed") || attacker.getFlag?.("dnd5e", "originalActor"));
  // D1 — Elemental Epitome: an Unarmed Strike (or Elemental Attunement's own Elemental Strike), the attunement active — the
  // pack's enchantment ("Active Attunement…") standing on the Elemental Attunement item itself.
  const attunement = featureNamed(attacker, "Elemental Attunement");
  facts.unarmed = (activity?.attack?.type?.classification === "unarmed") || (!!attunement && (item.id === attunement.id));
  // ⚠ The item always carries the enchantment's TEMPLATES (transfer false); the APPLIED copy is the transferred one.
  facts.attuned = !!attunement?.effects?.some(e => !e.disabled && (e.isAppliedEnchantment ?? e.transfer) && lower(e.name).startsWith("active attunement"));
  // THE DMG — "roll a 20 on the d20", and the hit creatures as a `targets` row reads them (once per hit).
  facts.natural = naturalTwentyOf(attackMessage);
  /** @type {ReturnType<typeof hitFactsOf>|null} */
  let hitFacts = null;
  const hitFactsNow = () => { if ( !hitFacts ) hitFacts = hitFactsOf(hits); return hitFacts; };
  const summoner = summonerOf(attacker);
  for ( const [key, row] of Object.entries(CLOCK_RIDERS) ) {
    if ( !listed.has(lower(row.feature)) ) continue;
    // An `inspired` row's feature is the granting BARD's; its die rides on the attacker's own Inspired effect.
    const inspired = row.inspired ? inspiredFrom(attacker, row.feature) : null;
    if ( row.inspired && !inspired ) continue;
    // C1 — an `owner: "summoner"` row (Bestial Fury): the feature, its dice and its mark are the SUMMONER's.
    // RAVENLOFT — `owner: "marker"` (Path to the Grave): the bearer is whoever's item put the `marked` effect on the target.
    const bearer = (row.owner === "summoner") ? summoner : (row.owner === "marker") ? markerOf(hits, row.marked) : attacker;
    if ( !bearer ) continue;
    // A `self` row's item is whatever the pack typed it (Chaos Blade is a weapon); a feature row's is a feat.
    // THE DMG — a `wields` row's item is the ATTACK's own weapon, wearing the template's enchantment (or named it).
    // A `worn` row's item is a WORN item on the attacker (Blood Amulet: equipped, attuned where required), riding any attack.
    const feature = inspired ? inspired.feature : row.wields ? (wieldsAs(item, row.feature) ? item : null)
      : row.worn ? wornNamed(attacker, row.feature)
      : row.self ? itemNamed(attacker, row.feature) : featureNamed(bearer, row.feature);
    if ( !feature ) continue;
    // C1 — `marked`: every hit target wears the bearer's mark of that name (its origin the bearer's own spell).
    const marked = row.marked ? (hits.length ? hits.every(h => wearsMarkOf(resolveUuid(h.uuid), bearer, row.marked)) : null) : null;
    // RAVENLOFT — `targetStatus` (Ominous Strikes): every hit creature wears the status.
    const targetStatus = row.targetStatus ? (hits.length ? hits.every(h => !!resolveUuid(h.uuid)?.statuses?.has?.(row.targetStatus)) : null) : null;
    // An `option` row rides only the option the character took; none recorded yet, the offer asks.
    const option = row.option ? optionOf(feature) : null;
    if ( option && (lower(option) !== lower(row.option)) ) continue;
    const unpicked = !!row.option && !option;
    if ( unpicked && row.weapon && !facts.weapon ) continue;
    // A `self` row rides its OWN attack alone (a monster's Chaos Blade): the activity is the attack's, no extra dice.
    if ( row.self && (item.id !== feature.id) ) continue;
    // `activities` (Fairy Trickster): one save per ability the feat may raise — the ASI's pick, else the higher modifier.
    const act = row.self ? activity : row.activities ? pickedActivityOf(bearer, feature, row.activities)
      : (row.activity ? activityNamed(feature, row.activity) : null);
    const part = row.self ? null : act?.damage?.parts?.[0];
    const raw = (row.self || row.save) ? null : inspired ? inspired.die : riderFormulaOf(row, act);
    let formula = null;
    try {
      const resolved = raw ? Roll.replaceFormulaData(raw, bearer.getRollData()) : null;
      formula = (resolved && Roll.validate(resolved)) ? resolved : null;
    } catch { formula = null; }
    const form = formOn(attacker, row);
    const type = row.retypes ? row.retypes : (row.type === "weapon") ? weaponType : row.type ? row.type : form ? form.type : ([...(part?.types ?? [])][0] ?? null);
    const uses = usesOf(bearer, act, row);
    const usesLeft = uses ? uses.left : null;
    const wearing = row.wearing ? attacker.effects.some(e => e.active && (lower(e.name) === lower(row.wearing))) : null;
    const judged = riderDue(row, { ...facts, usesLeft, form: form?.form ?? null, chitStands: turnChitStands(attacker, "rider", key), marked, targetStatus, wearing,
      fits: row.maxSize ? targetsFit(hits, row.maxSize) : null,
      enchanted: row.enchant ? enchantedFor(attacker, item, feature, row) : false,
      typed: row.targets ? targetsAnswer(row.targets, hitFactsNow()) : null,
      chargesLeft: (row.charges && act?.uses && (act.uses.max !== "") && (act.uses.max !== null) && (act.uses.max !== undefined))
        ? (Number(act.uses.value) || 0) : null });
    // THE DMG — the weapon carries no such activity (Giants' Bane without its paired attunement's enchantment).
    if ( row.wields && row.activity && !act && judged.due ) { judged.due = false; judged.why = `${row.activity} is not on the weapon`; }
    // B4 — `enchantBy` (Lifedrinker): the pact weapon bonded through ANOTHER feature; none bonded, any weapon with the caveat.
    const pact = row.enchantBy ? pactWeaponFits(attacker, item, row.enchantBy) : null;
    if ( pact && !pact.fits ) { judged.due = false; judged.why = `not the weapon bonded through ${row.enchantBy}`; }
    // C1 — `follow` (Stalker's Flurry): the follow-up offered once the rider rides, when its feature is on the sheet.
    const follow = (row.follow && featureNamed(attacker, row.follow.feature)) ? row.follow : null;
    out.push({ key, row, feature, activity: act, formula, type, usesLeft, uses, ...judged, unpicked, bearer, ...(follow ? { follow } : {}),
      ...(pact?.caveat ? { pactCaveat: pact.caveat } : {}),
      ...(inspired ? { inspired: { effectId: inspired.effect.id, bard: inspired.bard.name } } : {}),
      // an effect-only row (no dice: Hamstring, a crit's mark, Piercer's extra die) says what it does
      says: (!raw && row.says) ? row.says : null,
      label: row.label ?? (row.activity === "Damage" ? row.feature : row.activity) });
  }
  return out;
}

/** Is any listed clock rider due on this hit, or an option to ask? The offer opens for it whatever the auto-damage setting. */
function clockRidersDue(attackMessage, activity) {
  // A `spread` row (Superior Hunter's Prey) is a pick on the damage card, never a die on the roll.
  // An `always` row (a magic item's property) rides without a pick: it never opens the offer.
  return clockRidersFor(attackMessage, activity).some(r => !r.row.always && ((r.due && !r.row.spread) || r.unpicked));
}

/** The option asks among these riders, one per feature: every option its rows name, and what it does now. */
function optionAsks(riders) {
  const byFeature = new Map();
  for ( const r of riders.filter(x => x.unpicked) ) {
    const ask = byFeature.get(r.feature.id) ?? { featureId: r.feature.id, feature: r.feature.name, item: r.feature, options: [] };
    byFeature.set(r.feature.id, ask);
    for ( const name of (r.row.options ?? [r.row.option]) ) {
      if ( ask.options.some(o => o.value === name) ) continue;
      const mine = (lower(name) === lower(r.row.option));
      ask.options.push({ value: name, key: mine ? r.key : null, due: mine && r.due,
        note: mine ? (r.due ? `${r.formula ?? ""} rides this hit (${r.why})`.trim() : `not this hit — ${r.why}`) : "its own reminder, from the next attack" });
    }
  }
  return [...byFeature.values()];
}

/**
 * The damage offer's rows for the due riders (ticked checkboxes), and its fire-time commit: the pick is
 * written on the attack message BEFORE the roll. An unreadable rider is a line, not a row.
 * @param {ChatMessage} attackMessage
 * @param {object} activity
 */
function clockRiderOfferParts(attackMessage, activity) {
  const all = clockRidersFor(attackMessage, activity);
  const due = all.filter(r => r.due && !r.unpicked && !r.row.spread && !r.row.always);
  const asks = optionAsks(all);
  if ( !due.length && !asks.length ) return null;
  const chosen = new Set(due.filter(r => (r.formula || r.says) && !r.row.unticked).map(r => r.key));
  const options = new Map();                               // feature id → the option picked in this offer
  return {
    riders: due,
    lines: due.filter(r => !r.formula && !r.says).map(r => `<strong>${esc(r.label)}</strong> is due, but its dice could not be read off the sheet — add them by hand.`),
    html: optionAskHTML(asks.map(a => ({ featureId: a.featureId, feature: a.feature, options: a.options.map(o => ({ value: o.value, note: o.note })) })))
      + riderMenuHTML(due.map(r => ({ key: r.key, label: r.label, formula: r.formula, says: r.says, type: r.type, why: r.why, rule: r.row.rule,
        usesLeft: r.usesLeft, caveat: r.row.caveat, unticked: !!r.row.unticked }))),
    wire(element) {
      for ( const box of pickInputs(element, "bf-rider") ) {
        box.addEventListener("change", () => { if ( box.checked ) chosen.add(box.value); else chosen.delete(box.value); });
      }
      for ( const a of asks ) {
        for ( const radio of pickInputs(element, `bf-option-${a.featureId}`) ) {
          radio.addEventListener("change", () => { if ( radio.checked ) options.set(a.featureId, radio.value); });
        }
      }
    },
    /** The pick, on the attack message: WHICH due riders ride. An absent pick (no offer opened) rides all but
     * the unticked. An option picked is kept on its feature first, and its rider joins the pick when due. */
    async commit() {
      for ( const a of asks ) {
        const picked = options.get(a.featureId);
        if ( !picked ) continue;
        try {
          await a.item.setFlag(MODULE_ID, OPTION_FLAG, picked);
          const o = a.options.find(x => x.value === picked);
          if ( o?.due && o.key ) chosen.add(o.key);
        } catch(err) {
          log.error(`Could not keep the ${a.feature} option — it will be asked again.`, err);
        }
      }
      try {
        await attackMessage.setFlag(MODULE_ID, "clockPick", [...chosen]);
      } catch(err) {
        log.error(`Could not record the rider pick — every due rider rides.`, err);
      }
    }
  };
}

// A due rider opens the damage offer whatever the auto-damage setting — the choice lives there.
registerOfferPart({
  key: "clock",
  due: clockRidersDue,
  parts: (attackMessage, activity) => {
    const clock = clockRiderOfferParts(attackMessage, activity);
    return clock ? { html: clock.html, lines: clock.lines, wire: clock.wire, commit: clock.commit } : null;
  }
});

/* --- the rider: the clock's extra damage rides the weapon's roll ---------------------------- */

listen("dnd5e.preRollDamage", "clock-riders", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "attack" ) return;
    const attackMessage = attackMessageForDamage(config, message);
    if ( !attackMessage ) return;
    // Only ticked riders ride; no pick recorded (a driven roll, no offer): every due rider rides.
    const pick = readFlag(attackMessage, "clockPick");
    const picked = Array.isArray(pick) ? new Set(pick) : null;
    const riders = clockRidersFor(attackMessage, activity, { dealt: dealtTypesOfRolls(config.rolls),
      critical: (config.isCritical === true) || (config.rolls?.[0]?.options?.isCritical === true) })
      .filter(r => r.due && !r.unpicked && !r.row.spread && (r.row.always || (picked ? picked.has(r.key) : !r.row.unticked)));
    if ( !riders.length ) return;
    const attacker = activity.actor;
    const record = [];
    const spends = [];
    for ( const r of riders ) {
      // dnd5e's own crit bonus die on the first roll — never doubled
      if ( r.row.bonusDice && config.rolls?.[0] ) {
        config.rolls[0].options ??= {};
        const opts = config.rolls[0].options;
        opts.critical ??= {};
        opts.critical.bonusDice = (Number(opts.critical.bonusDice) || 0) + Number(r.row.bonusDice);
      }
      // An `inspired` die has no type of its own: it adds to the attack's damage, so it takes the first roll's.
      const type = r.type ?? (r.inspired ? (config.rolls?.[0]?.options?.types?.[0] ?? config.rolls?.[0]?.options?.type ?? null) : null);
      // A `retypes` row (Sacred Weapon's Radiant) adds no dice: the weapon's own rolls are dealt as its type.
      if ( r.row.retypes ) {
        const own = Number(foundry.utils.getProperty(message, `data.flags.${MODULE_ID}.weaponRolls`)) || 1;
        for ( const roll of (config.rolls ?? []).slice(0, own) ) {
          roll.options ??= {};
          roll.options.type = r.row.retypes;
          roll.options.types = [r.row.retypes];
        }
      }
      if ( r.formula ) {
        config.rolls.push({
          // No `properties`: a feature's extra damage never bypasses physical resistance as the weapon's magic.
          data: foundry.utils.deepClone(config.rolls[0]?.data ?? {}),
          parts: [namedPart(r.formula, r.label)],
          options: { type, types: type ? [type] : [] }
        });
      }
      // The Inspired die is spent as it rides: the effect is the die (d20-folds.js BARDIC's spend).
      if ( r.inspired ) void attacker.effects.get(r.inspired.effectId)?.delete()
        .catch(err => log.warn(`Could not spend the Inspired die — delete it by hand.`, err));
      record.push({ key: r.key, label: r.label, formula: r.formula, type, why: r.why, rule: r.row.rule,
        ...(r.says ? { says: r.says } : {}),
        ...(r.inspired ? { spent: `${r.inspired.bard}'s Inspired die spent` } : {}),
        ...(r.row.option ? { option: r.row.option, featureUuid: r.feature.uuid, optionOf: r.feature.name } : {}),
        ...(r.row.lands ? { lands: r.row.lands, clock: r.row.clock ?? null, featureUuid: r.feature.uuid } : {}),
        // RAVENLOFT — `endsMark` (Path to the Grave): the mark comes off the hit creatures once the rider rode.
        ...(r.row.endsMark && r.row.marked ? { endsMark: r.row.marked, bearerUuid: r.bearer?.uuid ?? null } : {}),
        ...(r.row.caveat ? { caveat: r.pactCaveat ? `${r.row.caveat}; ${r.pactCaveat}` : r.row.caveat } : (r.pactCaveat ? { caveat: r.pactCaveat } : {})),
        ...(r.row.offers ? { offers: { activity: r.row.offers.activity, label: r.row.offers.label ?? r.row.offers.activity }, featureUuid: r.feature.uuid } : {}),
        // C1 — `follow` (Stalker's Flurry): the follow-up's options, offered on the damage card once the rider rode.
        ...(r.follow ? { follow: { feature: r.follow.feature, rule: r.follow.rule ?? null, options: r.follow.options.map(o => ({ label: o.label, says: o.says ?? null, activity: o.activity ?? null, radius: !!o.radius })), picked: null } } : {}),
        ...(r.usesLeft !== null ? { usesLeft: r.usesLeft - 1 } : {}),
        // the activity's own effects land once the damage message exists (settleRiderEffects)
        ...(r.row.effects && r.activity ? { effects: true, clock: r.row.clock ?? null, featureUuid: r.feature.uuid, activityId: r.activity.id } : {}),
        // one of them, by the die (Chaos Blade's d4) — rolled when it lands
        ...(r.row.random && r.activity ? { random: { die: Number(r.row.random.die) }, clock: r.row.clock ?? null, featureUuid: r.feature.uuid, activityId: r.activity.id } : {}),
        // THE DMG — the item's property, said on the damage card; its save, its temp HP, its Exhaustion, its destroy
        ...(r.row.always ? { always: true } : {}),
        ...(r.row.save && r.activity ? { save: true, ...(r.row.saveOnly ? { saveOnly: true } : {}), featureUuid: r.feature.uuid, activityId: r.activity.id } : {}),
        ...(r.row.tempHp ? { tempHp: Number(r.row.tempHp) } : {}),
        ...(r.row.exhaustion ? { exhaustion: Number(r.row.exhaustion) } : {}),
        ...(r.row.destroy ? { destroy: Number(r.row.destroy) } : {}) });
      // Out of combat there is no turn, so no chit is written.
      if ( r.row.when === "oncePerTurn" ) {
        void writeTurnChit(attacker, "rider", { name: `${r.label} — used this turn`, img: r.feature.img ?? null,
          description: `${r.label} has ridden a hit this turn (${r.feature.name}). Once per turn; this chit ends with the turn.`,
          origin: r.feature.uuid, riderKey: r.key })
          .catch(err => log.warn(`Could not write the ${r.label} chit.`, err));
      }
      if ( r.row.uses && r.activity && r.uses ) {
        const spent = r.uses.spent + 1;
        const write = r.uses.item
          ? r.uses.item.update({ "system.uses.spent": spent })
          : r.feature.update({ [`system.activities.${r.activity.id}.uses.spent`]: spent });
        void write.catch(err => log.warn(`Could not spend a use of ${r.label}.`, err));
        // The uniform pool-spend record (shared.js poolSpendsOn).
        const max = r.uses.max;
        if ( max > 0 ) spends.push({ pool: r.uses.item ? r.uses.item.name : (r.activity.name || r.feature.name), spent: 1, left: Math.max(0, max - spent), max,
          ability: r.label, actorUuid: attacker?.uuid ?? null, at: Date.now() });
      }
    }
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.clockRiders`,
      { ...statContext(attacker?.uuid ?? null), attackId: attackMessage.id, riders: record });
    if ( spends.length ) foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.poolSpend`, spends);
  } catch(err) {
    log.error(`Clock rider failed to ride — add its damage by hand.`, err);
  }
});

/* --- the rider's own effects on the hit ------------------------------------------------------- */

/** A rider row with `effects` or `lands` lands them on the hit targets once the damage message exists,
 * on the elect, receipted — the hit menu's path, the row's `clock` pinned to the attacker. */
async function settleRiderEffects(message) {
  const cr = readFlag(message, "clockRiders");
  const rows = (cr?.riders ?? []).filter(r => r.effects || r.lands || r.random || r.save || r.tempHp || r.exhaustion || r.endsMark);
  if ( !rows.length || cr.effectsApplied ) return;
  if ( !drivesMomentFor(cr.sourceUuid ?? null) ) return;
  try {
    let claimed = false;
    await queueFlagWrite(message, "clockRiders", current => {
      if ( current.effectsApplied ) return false;
      current.effectsApplied = true;
      claimed = true;
    });
    if ( !claimed ) return;
    const attackMessage = game.messages.get(cr.attackId);
    const hits = attackMessage ? hitTargets(attackMessage) : [];
    const attacker = resolveUuid(cr.sourceUuid ?? null) ?? attackMessage?.getAssociatedActor?.() ?? null;
    for ( const r of rows ) {
      // RAVENLOFT — `endsMark`: the curse ends on the hit creatures (the marker's own effect of that name).
      if ( r.endsMark ) {
        for ( const h of hits ) {
          const target = resolveUuid(h.uuid);
          const marker = r.bearerUuid ? resolveUuid(r.bearerUuid) : null;
          const gone = (target?.effects ?? []).filter(e => (lower(e.name) === lower(r.endsMark)) && (!marker || wearsMarkOf(target, marker, r.endsMark))).map(e => e.id);
          if ( gone.length ) await target.deleteEmbeddedDocuments("ActiveEffect", gone).catch(err => log.warn(`${r.label}: the mark could not be removed — end it by hand.`, err));
        }
        if ( !r.save && !r.effects && !r.lands && !r.random && !r.tempHp && !r.exhaustion ) continue;
      }
      // THE DMG — the attacker's Temporary Hit Points, receipted on the damage card (revertable with it).
      if ( r.tempHp && attacker ) {
        await applyDamagesWithReceipt(message, [{ uuid: attacker.uuid, name: attacker.name }], [{ value: r.tempHp, type: "temphp", properties: new Set() }], { note: r.label });
        if ( !r.save && !r.effects && !r.exhaustion ) continue;
      }
      // THE DMG — Exhaustion levels on the hit creatures (the elect drives; capped at the platform's 6).
      if ( r.exhaustion ) {
        for ( const h of hits ) {
          const target = resolveUuid(h.uuid);
          if ( !(target instanceof Actor) ) continue;
          const now = Number(target.system?.attributes?.exhaustion ?? 0) || 0;
          await target.update({ "system.attributes.exhaustion": Math.min(6, now + r.exhaustion) });
        }
        if ( !r.save && !r.effects ) continue;
      }
      // live only: the rider FEATURE is never used up, so the sheet is the truth
      const feature = resolveUuid(r.featureUuid);
      // THE DMG — the weapon's own SAVE activity used at the hit creatures: the saves machine takes the usage card.
      if ( r.save ) {
        const save = feature?.system?.activities?.get?.(r.activityId) ?? null;
        const tokens = hits.map(h => tokenOf(h.uuid)).filter(Boolean);
        // ⚠ `riderSave`: the save alone. An enchantment's legacy `system.damage.parts` change (Sword of Wounding's 2d6) lands on
        // EVERY activity of the weapon, the save's too — the hit already dealt it; the card never rolls it again.
        if ( save && tokens.length ) await withTargets(tokens, () => save.use({ consume: false }, { configure: false },
          r.saveOnly ? { data: { flags: { [MODULE_ID]: { riderSave: true } } } } : {}));
        continue;
      }
      if ( r.lands ) {
        await applyItemEffectOnHit(message, feature, r.lands, hits, { clock: r.clock ?? null, attacker, source: statSourceOf(message) });
        continue;
      }
      const activity = feature?.system?.activities?.get?.(r.activityId) ?? null;
      if ( r.random ) {
        // The die decides (R1): the effect whose name opens with its face — "1: Charmed" — lands; the card says which.
        const roll = await new Roll(`1d${r.random.die}`).evaluate();
        const face = roll.total;
        const landed = await applyActivityEffectsOnHit(message, activity, hits,
          { clock: r.clock ?? null, attacker, source: statSourceOf(message), only: e => new RegExp(`^${face}\\s*:`).test(String(e?.name ?? "")) });
        await queueFlagWrite(message, "clockRiders", current => {
          const row = current.riders?.find(x => x.key === r.key);
          if ( row ) row.random = { ...row.random, face, landed: (landed ?? []).map(e => e.name) };
        });
        continue;
      }
      await applyActivityEffectsOnHit(message, activity, hits, { clock: r.clock ?? null, attacker, source: statSourceOf(message) });
    }
  } catch(err) {
    log.error(`A clock rider's effect failed to apply — apply it by hand.`, err);
  }
}

// Resumed on arrival and on reload, never on an update.
registerResumable("clockRiders", {
  pending: (flag, _message, cause) => (cause !== "update") && !!flag.riders?.some?.(r => r.effects || r.lands || r.random || r.save || r.tempHp || r.exhaustion)
    && !flag.effectsApplied,
  drives: flag => drivesMomentFor(flag.sourceUuid ?? null),
  drive: settleRiderEffects
});

/* --- THE DMG: the destroy after the receipt (Mace of Smiting), and the item's lines on the damage card ---- */

/** Once the receipt lands: a `destroy` row's hit creature left at or below its number is destroyed (0 Hit Points, Dead). */
async function destroyAfterReceipt(message) {
  const cr = readFlag(message, "clockRiders");
  const rows = (cr?.riders ?? []).filter(r => (Number(r.destroy) > 0) && !r.destroyed);
  if ( !rows.length || !drivesMomentFor(cr.sourceUuid ?? null) ) return;
  const landed = receiptEntries(message).filter(t => !t.reverted);
  if ( !landed.length ) return;
  let claimed = false;
  await queueFlagWrite(message, "clockRiders", current => {
    const mine = (current.riders ?? []).filter(r => (Number(r.destroy) > 0) && !r.destroyed);
    if ( !mine.length ) return false;
    for ( const r of mine ) r.destroyed = [];
    claimed = true;
  });
  if ( !claimed ) return;
  for ( const r of rows ) {
    const gone = [];
    for ( const t of landed ) {
      const actor = resolveUuid(t.uuid);
      if ( !(actor instanceof Actor) ) continue;
      const hp = Number(actor.system?.attributes?.hp?.value);
      if ( !Number.isFinite(hp) || (hp > r.destroy) ) continue;
      // ⚠ The status first: the platform's own Dead at 0 Hit Points would race it.
      await forceStatus(actor, "dead");
      if ( hp > 0 ) await actor.update({ "system.attributes.hp.value": 0 });
      gone.push(t.name ?? actor.name);
    }
    await queueFlagWrite(message, "clockRiders", current => {
      const row = current.riders?.find(x => x.key === r.key);
      if ( row ) row.destroyed = gone;
    });
  }
}

listen("updateChatMessage", "clock-riders", message => {
  try {
    if ( hasReceipt(message) && readFlag(message, "clockRiders")?.riders?.some?.(r => r.destroy && !r.destroyed) ) {
      void destroyAfterReceipt(message).catch(err => log.error(`The destroy could not land — set it by hand.`, err));
    }
  } catch(err) { log.warn(`The destroy check failed.`, err); }
});

// The card says it (R5): an item's property rode this hit — what it does, and what it did.
listen("dnd5e.renderChatMessage", "clock-riders", (message, html) => {
  try {
    const cr = readFlag(message, "clockRiders");
    const rows = (cr?.riders ?? []).filter(r => r.always);
    if ( !rows.length ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-rider-always") ) return;
    const wrap = document.createElement("div");
    wrap.className = "bf-rider-always";
    wrap.innerHTML = rows.map(r => {
      const did = Array.isArray(r.destroyed) && r.destroyed.length ? ` — ${r.destroyed.join(", ")} destroyed` : "";
      const what = r.formula ? `+${r.formula}${r.type ? ` ${r.type}` : ""}${r.says ? `; ${r.says}` : ""}` : (r.says ?? "");
      return bfCard({ eyebrow: r.label, tone: "good", title: `${r.label} — ${r.why}`, subtitle: `${what}${did}`, lines: [ruleLine(r.rule)] });
    }).join("");
    content.appendChild(wrap);
  } catch(err) { log.warn(`The item's rider line could not draw.`, err); }
});

/* --- the form chip: a transformation that marks nothing on its bearer (Necrotic Shroud) --------- */

/** A `forms` row reads the FORM that stands. Necrotic Shroud lands its effect on the frightened, never on
 * the bearer, so its use writes the module's own form chip (deleted by hand to end it early). */
listen("dnd5e.postUseActivity", "clock-riders", activity => {
  try {
    const actor = activity?.actor;
    const item = activity?.item;
    if ( !actor?.isOwner || !item ) return;
    const listed = listedNames(clockRiderEntries());
    for ( const [key, row] of Object.entries(CLOCK_RIDERS) ) {
      if ( !row.forms || !listed.has(lower(row.feature)) || !answers(row.feature, item) ) continue;
      const form = row.forms.find(f => f.chip && (lower(f.form) === lower(activity.name)));
      if ( form ) void writeFormChip(actor, activity, key, row, form);
    }
  } catch(err) {
    log.error(`Could not mark the transformation — its extra damage is yours to add.`, err);
  }
});

async function writeFormChip(actor, activity, key, row, form) {
  const stale = actor.effects.filter(e => readFlag(e, FORM_FLAG)?.riderKey === key);
  if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id)).catch(() => {});
  await ActiveEffect.implementation.create({
    name: `${row.feature}: ${form.form}`, img: activity.item.img ?? "icons/svg/aura.svg",
    description: `${await ruleHTML(row.rule)}<p>Written by By the Books when ${form.form} was used: the transformation stands while this does. Delete it to end the transformation early.</p>`,
    origin: activity.item.uuid, disabled: false, transfer: false,
    duration: activity.duration?.getEffectData?.() ?? {},
    flags: { [MODULE_ID]: { [FORM_FLAG]: { riderKey: key, form: lower(form.form) } } }
  }, { parent: actor }).catch(err => log.warn(`Could not write the ${form.form} chip.`, err));
}

/* --- a spell's damage with no attack roll: the ONE target is the caster's pick ------------------ */

/* --- C1 — `follow` (Stalker's Flurry): one follow-up after the rider rode, the attacker's pick on the damage card ---- */

listen("dnd5e.renderChatMessage", "clock-riders", (message, html) => {
  try {
    const cr = readFlag(message, "clockRiders");
    const rows = (cr?.riders ?? []).filter(r => r.follow);
    if ( !rows.length ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-rider-follow") ) return;
    const attacker = resolveUuid(cr.sourceUuid ?? null);
    for ( const r of rows ) {
      const row = document.createElement("div");
      row.className = "bf-rider-follow";
      row.style.cssText = "display:flex;gap:0.35rem;align-items:center;margin-top:0.35rem;flex-wrap:wrap;font-size:var(--font-size-11,11px);";
      const label = document.createElement("span");
      label.style.opacity = "0.8";
      if ( r.follow.picked ) {
        label.textContent = `${r.follow.feature} — ${r.follow.picked.label}${r.follow.picked.says ? `: ${r.follow.picked.says}` : ""}`;
        row.appendChild(label);
        content.appendChild(row);
        continue;
      }
      if ( !(attacker instanceof Actor) || !attacker.isOwner ) continue;
      label.textContent = `${r.follow.feature} — one of:`;
      row.appendChild(label);
      for ( const o of r.follow.options ) row.appendChild(momentButton(o.label, () => void pickThen(message, r.key, o, attacker)));
      content.appendChild(row);
    }
  } catch(err) { log.warn(`The rider's follow-up could not draw.`, err); }
});

/** The pick: a `says` option is the reminder (the card says it); an `activity` option is used at the enemies within its
 * Emanation of the attacker (`radius`) — the saves machine takes the usage card from there. Recorded on the rider. */
async function pickThen(message, key, option, attacker) {
  let won = false;
  await queueFlagWrite(message, "clockRiders", current => {
    const row = current.riders?.find(x => x.key === key);
    if ( !row?.follow || row.follow.picked ) return false;
    row.follow.picked = { label: option.label, says: option.says ?? null };
    won = true;
  });
  if ( !won || !option.activity ) return;
  try {
    const cr = readFlag(message, "clockRiders");
    const r = cr.riders.find(x => x.key === key);
    const feature = featureNamed(attacker, r.follow.feature);
    const act = feature ? activityNamed(feature, option.activity) : null;
    if ( !act ) { ui.notifications?.warn(`${TITLE}: ${r.follow.feature} — no "${option.activity}" on the sheet; use it by hand.`); return; }
    const own = tokenOf(attacker);
    const feet = feetOf(Number(act.target?.template?.size), act.target?.template?.units || "ft");
    const targets = (own && option.radius && (feet > 0))
      ? creaturesWithin(own, feet).filter(t => (t.actor?.uuid !== attacker.uuid) && (t.document.disposition !== own.document.disposition))
      : [];
    await withTargets(targets, () => act.use({ subsequentActions: false, create: { measuredTemplate: false } }, { configure: false }, {}));
  } catch(err) {
    log.error(`${option.label} could not be used — use it from the sheet.`, err);
  }
}

/**
 * A `spells` row on a spell with NO attack roll: the extra goes to ONE creature, the caster's pick (R1) —
 * a button per creature damaged on the spell's card. A pick lands on its OWN card (a keyed entry in the
 * spell's receipt would overwrite the spell's own) and spends the turn; out of combat, once per card.
 */
const SPELL_FLAG = "spellRider";

/** The listed `spells` rows due for this caster now, each with its form, value and type. */
function spellRidersFor(caster, damaged = [], sneakArmed = false) {
  if ( !caster ) return [];
  const listed = listedNames(clockRiderEntries());
  const combat = activeCombatFor(caster);
  const out = [];
  for ( const [key, row] of Object.entries(CLOCK_RIDERS) ) {
    if ( !(row.spells || row.spread) || !listed.has(lower(row.feature)) ) continue;
    const feature = featureNamed(caster, row.feature);
    if ( !feature ) continue;
    const form = formOn(caster, row);
    // RAVENLOFT — a `spread` row with no named activity (Wails from the Grave) reads the feature's first damage activity.
    const act = row.activity ? activityNamed(feature, row.activity) : (row.spread ? activityOfType(feature, "damage") : null);
    const raw = riderFormulaOf(row, act);
    let value = null;
    let formula = null;
    try {
      const resolved = raw ? Roll.replaceFormulaData(raw, caster.getRollData()) : null;
      formula = (resolved && Roll.validate(resolved)) ? resolved : null;
      value = formula && !/d\d/i.test(formula) ? Roll.safeEval(formula) : null;
    } catch { value = null; formula = null; }
    // C1 — a `spread` row (Superior Hunter's Prey): a damaged creature under the caster's mark; the candidates are the other
    // creatures within `spread` feet of it. The dice roll at the pick (the scale is a die, not a number).
    // RAVENLOFT — a `requires: "sneak"` spread (Wails from the Grave) spreads from the Sneak Attack's target: the damage card
    // of an attack whose Sneak Attack was armed, the first creature damaged.
    let candidates = null;
    if ( row.spread ) {
      const marked = row.marked ? damaged.find(t => wearsMarkOf(resolveUuid(t.uuid), caster, row.marked))
        : ((row.requires === "sneak") ? (sneakArmed ? damaged[0] : null) : damaged[0]);
      const at = marked ? tokenOf(marked.uuid) : null;
      if ( !at ) continue;
      candidates = creaturesWithin(at, row.spread).filter(t => t.actor && (t.actor.uuid !== marked.uuid) && (t.actor.uuid !== caster.uuid))
        .map(t => ({ uuid: t.actor.uuid, name: t.document?.name ?? t.actor.name }));
      if ( !candidates.length ) continue;
    }
    const uses = usesOf(caster, act, row);
    const judged = riderDue(row, { inCombat: !!combat, round: combat?.round ?? null, form: form?.form ?? null,
      chitStands: turnChitStands(caster, "rider", key), marked: row.spread ? true : null, sneakArmed, usesLeft: uses ? uses.left : null });
    if ( !judged.due || !(formula || (Number(value) > 0)) ) continue;
    const type = form?.type ?? ([...(act?.damage?.parts?.[0]?.types ?? [])][0] ?? null);
    out.push({ key, row, feature, form, value: Number(value) || null, formula, type, why: judged.why, label: row.label ?? row.feature, candidates });
  }
  return out;
}

listen("dnd5e.renderChatMessage", "clock-riders", (message, html) => {
  try {
    const picked = readFlag(message, SPELL_FLAG) ?? {};
    // What was picked, on every client (R5): the card names where the extra went.
    for ( const p of Object.values(picked) ) {
      if ( !p?.targetName ) continue;
      const line = document.createElement("div");
      line.innerHTML = bfCard({ eyebrow: "Clock rider", tone: "good",
        title: `${p.label} — +${p.value}${p.type ? ` ${p.type}` : ""} to ${p.targetName}`,
        subtitle: p.applied ? `${p.why} · landed on its own card` : `${p.why} · landing…`,
        lines: [ruleLine(p.rule)] });
      html.querySelector(SURFACES.messageContent)?.appendChild(line);
    }
    const damaged = [...new Map(receiptEntries(message).filter(t => !t.reverted && (Number(t.taken) > 0)).map(t => [t.uuid, t])).values()];
    if ( !damaged.length ) return;
    const activity = cardActivity(message);
    const caster = activity?.actor ?? message.getAssociatedActor?.() ?? null;
    if ( !canAnswerFor(caster) ) return;
    // A `spells` row reads a no-attack spell's card alone; a `spread` row any damage card of the bearer's.
    const spellCard = (activity?.item?.type === "spell") && (activity.type !== "attack");
    // RAVENLOFT — the Sneak Attack armed on the attack this damage answers (Wails from the Grave's spread).
    const sneakArmed = !!readFlag(game.messages.get(attackIdOf(message) ?? readFlag(message, "clockRiders")?.attackId ?? ""), "sneak")?.armed
      || !!readFlag(message, "sneakDamage");
    for ( const r of spellRidersFor(caster, damaged, sneakArmed) ) {
      if ( picked[r.key] || (!r.row.spread && !spellCard) ) continue;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:0.35rem;align-items:center;margin-top:0.35rem;flex-wrap:wrap;";
      const label = document.createElement("span");
      label.style.cssText = "font-size:var(--font-size-11,11px);opacity:0.8;";
      label.textContent = `${r.label} — +${r.formula ?? r.value}${r.type ? ` ${r.type}` : ""} to one ${r.row.spread ? `other creature within ${r.row.spread} ft of the marked target` : "target"} (${r.why}):`;
      row.appendChild(label);
      for ( const t of (r.candidates ?? damaged) ) row.appendChild(momentButton(t.name, () => void pickSpellRider(message, r, t, caster)));
      html.querySelector(SURFACES.messageContent)?.appendChild(row);
    }
  } catch(err) {
    log.warn(`Could not offer the spell's extra damage — add it by hand.`, err);
  }
});

// B4 — a rider's OFFER (Lifedrinker's heal): a button on the damage card, the feature's named activity used at the attacker
// (the sheet's own consumption — a Hit Point Die); the owner's, once per card.
listen("dnd5e.renderChatMessage", "clock-riders", (message, html) => {
  try {
    const cr = readFlag(message, "clockRiders");
    const offered = (cr?.riders ?? []).filter(r => r.offers && !r.offerUsed);
    if ( !offered.length ) return;
    const attacker = resolveUuid(cr.sourceUuid ?? null);
    if ( !(attacker instanceof Actor) || !attacker.isOwner ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-rider-offer") ) return;
    for ( const r of offered ) {
      const feature = resolveUuid(r.featureUuid ?? null);
      const act = feature ? activityNamed(feature, r.offers.activity) : null;
      if ( !act ) continue;
      const row = document.createElement("div");
      row.className = "bf-rider-offer";
      row.style.cssText = "display:flex;gap:0.35rem;align-items:center;margin-top:0.35rem;flex-wrap:wrap;font-size:var(--font-size-11,11px);";
      const label = document.createElement("span");
      label.style.opacity = "0.8";
      label.textContent = `${r.label} — ${r.offers.label}:`;
      row.appendChild(label);
      row.appendChild(momentButton("Use it", () => void (async () => {
        const token = tokenOf(attacker);
        await withTargets(token ? [token] : [], () => act.use({}, { configure: false }, {}));
        if ( message.canUserModify?.(game.user, "update") ) {
          await queueFlagWrite(message, "clockRiders", current => {
            const rider = current.riders?.find(x => x.key === r.key);
            if ( !rider || rider.offerUsed ) return false;
            rider.offerUsed = true;
          });
        }
      })().catch(err => log.error(`${r.offers.activity} could not be used — use it from the sheet.`, err))));
      content.appendChild(row);
    }
  } catch(err) { log.warn(`The rider's offer could not draw.`, err); }
});

/** The caster's pick, on the spell's damage card (the caster rolled it — the caster may write it). */
async function pickSpellRider(message, r, target, caster) {
  const entry = { ...statContext(caster.uuid), key: r.key, label: r.label, value: r.value, formula: r.formula ?? null, type: r.type, why: r.why, rule: r.row.rule,
    featureUuid: r.feature?.uuid ?? null, targetUuid: target.uuid, targetName: target.name, applied: false };
  await queueFlagWrite(message, SPELL_FLAG, current => {
    if ( current[r.key] ) return false;   // one pick per card
    current[r.key] = entry;
  });
}

/** On the elect: land each pick on its own card, spend the turn, mark it applied. */
async function driveSpellRider(message) {
  const picks = Object.values(readFlag(message, SPELL_FLAG) ?? {}).filter(p => p?.targetUuid && !p.applied && !p.claimed);
  for ( const p of picks ) {
    let claimed = false;
    await queueFlagWrite(message, SPELL_FLAG, current => {
      if ( !current[p.key] || current[p.key].claimed ) return false;
      current[p.key].claimed = true;
      claimed = true;
    });
    if ( !claimed ) continue;
    const caster = resolveUuid(p.sourceUuid);
    const feature = resolveUuid(p.featureUuid);
    // C1 — a `spread` pick carries a die (the mark's scale): rolled here, in the open, on the pick's own card.
    let value = Number(p.value) || 0;
    let roll = null;
    if ( p.formula && !(value > 0) ) {
      try { roll = await new Roll(p.formula).evaluate(); value = Number(roll.total) || 0; } catch { roll = null; }
    }
    const card = await postCard({
      actor: caster ?? undefined,
      rolls: roll ? [roll] : undefined,
      card: bfCard({ img: feature?.img ?? null, eyebrow: "Clock rider", tone: "good",
        title: `${p.label} — +${value}${p.type ? ` ${p.type}` : ""} to ${p.targetName}`,
        subtitle: `${p.why} · ${p.formula && roll ? `${p.formula} rolled` : "with the spell's damage"}`, lines: [ruleLine(p.rule)] }),
      flags: { [MODULE_ID]: { spellRiderCard: { ...statContext(p.sourceUuid ?? null), key: p.key, label: p.label,
        value, type: p.type, targetUuid: p.targetUuid, spellMessageId: message.id } } }
    });
    if ( card && (value > 0) ) await applyDamagesWithReceipt(card, [{ uuid: p.targetUuid, name: p.targetName }],
      [{ value, type: p.type ?? "radiant", properties: new Set(["mgc"]) }], { note: p.label });
    // RAVENLOFT — a `uses` spread row (Wails from the Grave): the feature's own use spent as the pick lands.
    if ( caster && feature && CLOCK_RIDERS[p.key]?.uses ) {
      const act = CLOCK_RIDERS[p.key].activity ? activityNamed(feature, CLOCK_RIDERS[p.key].activity) : activityOfType(feature, "damage");
      const u = usesOf(caster, act, CLOCK_RIDERS[p.key]);
      if ( u ) {
        const write = u.item ? u.item.update({ "system.uses.spent": u.spent + 1 })
          : (act ? feature.update({ [`system.activities.${act.id}.uses.spent`]: u.spent + 1 }) : Promise.resolve());
        await write.catch(err => log.warn(`Could not spend a use of ${p.label}.`, err));
      }
    }
    if ( caster && (CLOCK_RIDERS[p.key]?.when === "oncePerTurn") ) {
      await writeTurnChit(caster, "rider", { name: `${p.label} — used this turn`, img: feature?.img ?? null,
        description: `${p.label} has ridden a spell's damage this turn. Once per turn; this chit ends with the turn.`,
        origin: feature?.uuid ?? null, riderKey: p.key }).catch(err => log.warn(`Could not write the ${p.label} chit.`, err));
    }
    await queueFlagWrite(message, SPELL_FLAG, current => { if ( current[p.key] ) current[p.key].applied = true; });
  }
}

registerResumable(SPELL_FLAG, {
  pending: flag => Object.values(flag ?? {}).some(p => p?.targetUuid && !p.applied && !p.claimed),
  drives: flag => Object.values(flag ?? {}).some(p => drivesMomentFor(p?.sourceUuid ?? null)),
  drive: driveSpellRider
});

/* --- the card says it (R5) -------------------------------------------------------------------- */

listen("dnd5e.renderChatMessage", "clock-riders", (message, html) => {
  const cr = readFlag(message, "clockRiders");
  if ( !cr?.riders?.length ) return;
  for ( const r of cr.riders ) {
    const line = document.createElement("div");
    line.innerHTML = bfCard({
      eyebrow: "Clock rider", tone: (r.formula || r.says) ? "good" : "neutral",
      title: r.formula ? `${r.label} — ${r.formula}${r.type ? ` ${r.type}` : ""} rode this roll`
        : r.says ? `${r.label} — ${r.says}` : `${r.label} was due — its dice could not be read`,
      subtitle: `${r.why}${(r.usesLeft !== undefined) ? ` · ${r.usesLeft} use${r.usesLeft === 1 ? "" : "s"} left` : ""}${r.spent ? ` · ${r.spent}` : ""}${r.caveat ? ` · ${r.caveat}` : ""}`,
      lines: [ruleLine(r.rule)]
    });
    // The kept option can be changed (after a rest, the table's): the next hit asks again.
    if ( r.option && r.featureUuid ) {
      const feature = resolveUuid(r.featureUuid);
      if ( feature?.isOwner && optionOf(feature) ) {
        line.appendChild(momentButton(`Change ${r.optionOf ?? "the"} option`, () => void clearOption(feature)));
      }
    }
    html.querySelector(SURFACES.messageContent)?.appendChild(line);
  }
});

/** Forget the kept option: the next hit's offer asks which again. */
async function clearOption(feature) {
  try {
    await feature.unsetFlag(MODULE_ID, OPTION_FLAG);
    ui.notifications?.info(`${TITLE}: ${feature.name} — the next hit asks which option again.`);
  } catch(err) {
    log.error(`Could not clear the ${feature?.name} option.`, err);
  }
}
