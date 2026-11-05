// @ts-check
/**
 * By the Books — the reaction hold, part 5: THE ANSWER. `answerHold` and its relay fold, the cast
 * that IS the answer, and the popup's Cast button (natively, or Parry's die rolled in the open).
 */
import { MODULE_ID, readFlag, TITLE, queueFlagWrite, canAnswerFor, isContinuingClient, resolveUuidAsync, log } from "../core.js";
import { isTextOnlyFeature } from "../decide/eligible.js";
import { interruptEntries } from "../decide/registry.js";
import { joinEffectReceipt } from "../decide/receipt.js";
import { bfCard } from "../decide/present.js";
import { reductionRise } from "../decide/dice-chips.js";
import { INTERRUPT_MULTIPLIERS, INTERRUPT_ROLLS, answers, tableIndex } from "../decide/registry.js";
import { d20Faces, d20ModeOf, dieOutcome, disadvantageOutcome, guardSign, needsSecondD20, neutraliseOutcome, rescueSpendText } from "../decide/rescue-hit.js";
import { lower, holdsFor, activityNamed, bystanderDie, d20FactsOf, meleeOptions, preferredMeleeOption, featureNamed } from "../lookup.js";
import { riderPartFormula } from "../decide/clock.js";
import { applyDamagesWithReceipt } from "../auto-apply.js";
import { spendReaction, poolOf, spendSuperiorityDie, spendPoolUses, reactionSpent, muteBystander, withTargets, spendStoredFace } from "../shared.js";
import { setOutcome } from "../decide/stored-dice.js";
import { registerRelay, openMomentPopup, postAnswer } from "../ui.js";
import { originData } from "../decide/card.js";
import { SPELL_ROW_TYPES, reactionItem, reactionItemFor, applyReactionEffect, reactionACArrived, reactionImg } from "./lookup.js";
import { listen } from "../dispatch.js";
import { tokenOf } from "../geometry.js";
import { castWayOf, castBy } from "../cast-ways.js";

/**
 * ONE ANSWER AMONG SEVERAL ASKED (RULINGS *The fighting styles*): the first that ACTS settles it;
 * a PASS only once everyone asked has passed. `by` is the guard's uuid, null for the target.
 * @param {any} target
 * @param {string} answer
 * @param {string|null} [by]
 * @returns {boolean|"partial"}  "partial" when a pass was only recorded
 */
export function recordAnswer(target, answer, by = null) {
  if ( !target || target.answer ) return false;
  const guard = by ? (target.guards ?? []).find(g => g.uuid === by) : null;
  if ( by && (!guard || guard.passed) ) return false;
  if ( answer === "pass" ) {
    if ( guard ) guard.passed = true;
    else if ( target.selfPassed ) return false;
    else target.selfPassed = true;
    const selfDone = (target.selfAsk === false) || (target.selfPassed === true);
    if ( !selfDone || !(target.guards ?? []).every(g => g.passed) ) return "partial";
  }
  target.answer = answer;
  if ( guard && (answer !== "pass") ) target.guardedBy = { uuid: guard.uuid, name: guard.name, itemId: guard.itemId };
  return true;
}

/**
 * Record an answer for one held target: an owner writes the hold, anyone else sends its OWN message.
 * @param {any} attackMessage
 * @param {string} uuid
 * @param {string} answer
 * @param {{appliedEffects?: object[], reduceBy?: number|null, poolSpend?: object|null, bent?: object|null,
 *   rescue?: string|null, by?: string|null}} [opts]
 */
export async function answerHold(attackMessage, uuid, answer, { appliedEffects = [], reduceBy = null, poolSpend = null, bent = null, rescue = null, by = null } = {}) {
  const hold = readFlag(attackMessage, "hold");
  if ( hold?.status !== "pending" ) return;
  // A throwaway copy asks whether this answer records at all; the owner's write repeats it under the lock.
  const target = foundry.utils.deepClone(hold.targets?.find(t => t.uuid === uuid) ?? null);
  const recorded = recordAnswer(target, answer, by);     // idempotent: the first act wins
  if ( !recorded ) return;

  // A player cannot update someone else's message: the answer travels as their OWN (ARCHITECTURE.md §3).
  const actor = await resolveUuidAsync(uuid);
  const ac = actor?.system?.attributes?.ac?.value ?? null;

  if ( !attackMessage.isOwner && by ) {
    // A GUARD's answer (Protection): its own card, in its own voice.
    const guard = await resolveUuidAsync(by);
    const guarding = answer === "roll";
    const entry = (target.guards ?? []).find(g => g.uuid === by);
    const verb = entry?.bystander ? "bends the roll against" : "protects";
    await postAnswer("respondsTo", {
      card: bfCard({
        img: guard?.items?.get(entry?.itemId)?.img ?? null,
        eyebrow: guarding ? `Reaction — ${rescue}` : "Reaction — passed",
        title: guarding ? rescue : "Lets it land",
        subtitle: guarding ? `${guard?.name ?? "A guard"} ${verb} ${target.name}` : `${guard?.name ?? "A guard"} · ${target.name}`,
        lines: guarding ? [rescueSpendLine(rescue, poolSpend), ...(Number(reduceBy) > 0 ? [`the damage reduced by <strong>${Number(reduceBy)}</strong>`] : [])].filter(Boolean)
          : [`No reaction — ${guard?.name ?? "the guard"} lets it land.`],
        tone: guarding ? "good" : "neutral"
      }),
      actor: guard,
      flags: { [MODULE_ID]: { respondsTo: attackMessage.id, uuid, answer, by, ac,
        ...(Number(reduceBy) > 0 ? { reduceBy: Number(reduceBy) } : {}),
        ...(poolSpend ? { poolSpend } : {}),
        ...(bent ? { bent } : {}), ...(rescue ? { rescue } : {}) } }
    });
    return;
  }
  if ( !attackMessage.isOwner ) {
    // ⚠ Quote the AC only once it has ARRIVED: the effect exists before derived data recomputes.
    const cast = answer === "cast";
    const negate = target.kind === "negate";   // no AC story: the spell simply does nothing
    const bending = answer === "roll";   // the defender's card carries the spend; the verdict is the attack card's
    const effectLanded = (negate || bending) ? true : reactionACArrived(actor, target);
    const lines = bending ? [rescueSpendLine(rescue, poolSpend)] : negate
      ? [cast ? `<strong>${hold.spell}</strong> does nothing to them.`
              : `No reaction — the <strong>${hold.spell}</strong> lands.`]
      : cast
        ? [effectLanded ? `AC is now <strong>${ac}</strong>.`
                        : `<em>Its AC has not landed yet — the verdict will use the real number.</em>`]
        : [`No reaction — the attack lands.`];
    await postAnswer("respondsTo", {
      card: bfCard({
        img: bending ? reactionImg(actor, rescue, {}) : reactionImg(actor, target.reaction, target),
        eyebrow: bending ? `Reaction — ${rescue}` : cast ? "Reaction — cast" : "Reaction — passed",
        title: bending ? rescue : cast ? target.reaction : "Lets it land",
        subtitle: target.name,
        lines,
        tone: (cast || bending) ? "good" : "neutral"
      }),
      actor,
      // The receipt rides in the standard effectReceipt shape, so receipts.js renders it.
      flags: { [MODULE_ID]: { respondsTo: attackMessage.id, uuid, answer, ac, effectLanded,
        ...(Number(reduceBy) > 0 ? { reduceBy: Number(reduceBy) } : {}),
        ...(poolSpend ? { poolSpend } : {}),
        // Envelope fields are additive only (ARCHITECTURE §4 *The relay*).
        ...(bent ? { bent } : {}),
        ...(rescue ? { rescue } : {}),
        ...(appliedEffects.length ? { effectReceipt: { targets: appliedEffects } } : {}) } }
    });
    return;
  }
  if ( appliedEffects.length ) {
    // ⚠ Through the serializer: one casting answers many holds in one tick on one card.
    await queueFlagWrite(attackMessage, "effectReceipt", flag => {
      for ( const entry of appliedEffects ) joinEffectReceipt(flag, entry);
    });
  }
  // The owner's fold, through the serializer (ARCHITECTURE §4 law 2): the GM answering a monster
  // shares this flag with the relay folding a player's answer; the guards repeat INSIDE the lock.
  await queueFlagWrite(attackMessage, "hold", flag => {
    if ( flag.status !== "pending" ) return false;
    const live = flag.targets?.find(t => t.uuid === uuid);
    const now = recordAnswer(live, answer, by);
    if ( !now ) return false;
    if ( now === true ) live.answeredAt = Date.now();   // the crash-resume horizon
    if ( Number(reduceBy) > 0 ) live.reduceBy = Number(reduceBy);   // Parry's roll, at the answer
    if ( poolSpend ) live.poolSpend = poolSpend;                      // Parry's die, the spend record
    if ( bent ) live.bent = bent;
    if ( rescue ) live.rescue = rescue;
    live.acAtAnswer = ac;
    // The moment event fires on the ANSWERING user's client, even when the answer is relayed.
    live.answeredBy = game.user.id;
  });
}

// A player's answer message: the CONTINUING CLIENT (not the elect) folds it into the hold.
// ⚠ The envelope is FLAT beside its `effectReceipt`; nesting it is a wire-format change.
registerRelay("respondsTo", {
  flagKey: "hold",
  targetOf: response => response,
  owns: hold => (hold.status === "pending") && isContinuingClient(hold),
  // ⚠ A per-target write to a shared array: the guards repeat INSIDE the lock.
  fold: (flag, _response, message) => {
    if ( flag.status !== "pending" ) return false;
    const target = flag.targets?.find(t => t.uuid === readFlag(message, "uuid"));
    const recorded = recordAnswer(target, readFlag(message, "answer"), readFlag(message, "by") ?? null);
    if ( !recorded ) return false;
    if ( recorded === "partial" ) return;   // a guard's pass, recorded: the others are still asked
    target.answeredAt = Date.now();   // the crash-resume horizon
    target.answeredBy = message.author?.id ?? null;   // the gate publishes this moment on THAT user's client
    const reduceBy = Number(readFlag(message, "reduceBy"));
    if ( reduceBy > 0 ) target.reduceBy = reduceBy;
    const poolSpend = readFlag(message, "poolSpend");
    if ( poolSpend ) target.poolSpend = poolSpend;
    const bent = readFlag(message, "bent");        // a `roll` answer
    if ( bent ) target.bent = bent;
    const rescue = readFlag(message, "rescue");
    if ( rescue ) target.rescue = rescue;
  }
});

// The cast IS the answer: a listed reaction cast from the sheet answers its own hold.
listen("dnd5e.postUseActivity", "hold/answer", activity => {
  const actor = activity?.actor;
  // A `roll` row (Lucky's "Disadvantage" is no Reaction) is checked before the activation gate.
  const bends = rollRowUsed(activity);
  if ( !actor || (!bends && (activity.activation?.type !== "reaction")) ) return;
  if ( !canAnswerFor(actor) ) return;

  void (async () => {
    if ( bends ) return bendFromTheSheet(actor, bends);
    // ⚠ Match on what was CAST: a statblock's Shield lives on "Spellcasting".
    const cast = await reactionItemFor(activity);
    if ( !interruptEntries().some(e => answers(e.name, cast, SPELL_ROW_TYPES)) ) return;
    await answerHoldsFor(activity, actor);
  })();
});

/** Fold a real cast into every hold it answers. */
async function answerHoldsFor(activity, actor) {
  // ⚠ Collect every hold, THEN apply once: concurrent applications each pass the duplicate
  // check (+10 AC). The WHOLE log, never a tail: one round can emit dozens of messages.
  const answering = [];
  for ( const message of game.messages.contents ) {
    const hold = readFlag(message, "hold");
    if ( !hold || (hold.status !== "pending") ) continue;
    const target = hold.targets.find(t => (t.uuid === actor.uuid) && !t.answer);
    if ( target ) answering.push({ message, uuid: target.uuid, reaction: target.reaction });
  }
  if ( !answering.length ) return;

  const applied = await applyReactionEffect(activity, actor, answering[0]?.reaction);
  for ( const [i, { message, uuid }] of answering.entries() ) {
    await answerHold(message, uuid, "cast", { appliedEffects: i === 0 ? applied : [] });
  }
}

/* THE `roll` ANSWER (RULINGS *Rescuing the hit*): the cost paid BY HAND (a use() would post a
 * card, and Warding Flare's would place its emanation), the second d20 rolled in the open. */

const ROLL_INDEX = tableIndex(INTERRUPT_ROLLS);
const rollRowAt = key => key ? { key, row: INTERRUPT_ROLLS[key] } : null;

/** The INTERRUPT_ROLLS row a name keys, case-insensitively. */
const rollRow = name => rollRowAt(ROLL_INDEX.keyNamed(name));

function rescueSpendLine(rescue, poolSpend) {
  const found = rollRow(rescue);
  return found ? rescueSpendText({ row: found.row, poolSpend }) : "";
}

/** The row's key when this use is a listed `roll` row's own activity (Lucky ships two), else null. */
function rollRowUsed(activity) {
  const found = rollRowAt(ROLL_INDEX.keyFor(activity?.item));
  if ( !found || !interruptEntries().some(e => (e.kind === "roll") && (lower(e.name) === lower(found.key))) ) return null;
  return lower(activity?.name) === lower(found.row.activity) ? found.key : null;
}

/**
 * Disadvantage on a roll already made: a second d20 with the attack's die modifiers minus
 * keep/drop; on an Advantage roll nothing is rolled (the two cancel).
 */
async function bendTheRoll(attackMessage, actor, name) {
  const roll = attackMessage.rolls?.[0];
  const d20 = roll?.dice?.[0] ?? null;
  const { kept, plain } = d20Faces(d20?.results ?? []);
  if ( !roll || (kept === null) || !Number.isFinite(kept) ) return null;
  const mode = d20ModeOf({ number: d20?.number, modifiers: d20?.modifiers });
  let second = null;
  if ( needsSecondD20(mode) ) {
    try {
      const mods = (d20?.modifiers ?? []).filter(m => !/^(k|d)[hl]?\d*$/i.test(String(m)));
      const die = await new Roll(`1d20${mods.join("")}`).evaluate();
      await die.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${name} — the second d20 (Disadvantage)` });
      second = Number(die.total);
    } catch(err) {
      log.error(`${name}'s second d20 could not be rolled — the first stands.`, err);
    }
  }
  const faces = (d20?.results ?? []).filter(r => !r?.rerolled).map(r => r.result);
  return disadvantageOutcome({ mode, kept, plain, second, total: Number(roll.total), faces,
    critAt: Number(d20?.options?.criticalSuccess ?? roll.options?.criticalSuccess ?? 20),
    fumbleAt: Number(d20?.options?.criticalFailure ?? roll.options?.criticalFailure ?? 1) });
}

/**
 * The popup's answer for a `roll` row. A row spent since the popup opened answers nothing.
 * @param {ChatMessage} attackMessage
 * @param {object} target  the hold's target entry
 * @param {string} name
 */
export async function rescueReaction(attackMessage, target, name) {
  const actor = await resolveUuidAsync(target.uuid);
  const found = rollRow(name);
  const record = (target.rescues ?? []).find(r => lower(r.name) === lower(name));
  const item = actor?.items.get(record?.itemId) ?? null;
  if ( !found || !item ) {
    ui.notifications.warn(`${TITLE}: could not find ${name} on ${target.name}.`);
    return;
  }
  const { key, row } = found;
  if ( row.reaction && reactionSpent(actor) ) {
    ui.notifications.warn(`${TITLE}: ${target.name}'s Reaction is already spent this round.`);
    return;
  }
  if ( row.uses && !(Number(item.system?.uses?.value ?? 0) > 0) ) {
    ui.notifications.warn(`${TITLE}: ${target.name} has no ${row.point ? `${row.point}s` : `uses of ${key}`} left.`);
    return;
  }
  let poolSpend = null;
  if ( row.uses ) poolSpend = await spendPoolUses(actor, item, key, 1, row.point ? `${row.point}s` : null)
    .catch(err => { log.warn(`Could not spend a use of ${key}.`, err); return null; });
  if ( row.reaction ) await spendReaction(actor, { origin: item.uuid, what: key });
  const bent = await bendTheRoll(attackMessage, actor, key);
  // B4 — a `heal` row (Improved Warding Flare): the named feature's heal activity lands on the flared creature with the answer.
  if ( row.heal ) void landRowHeal(attackMessage, actor, row.heal).catch(err => log.error(`${row.heal} could not land — apply it by hand.`, err));
  return answerHold(attackMessage, target.uuid, "roll", { poolSpend, bent, rescue: key });
}

/** The feature's first heal activity rolled on the answerer's numbers and landed on it, receipted on the attack card. */
async function landRowHeal(attackMessage, actor, featureName) {
  const feature = featureNamed(actor, featureName);
  if ( !feature ) return;
  const activity = [...(feature.system?.activities ?? [])].find(a => a.type === "heal") ?? null;
  const h = activity?.healing ?? null;
  const raw = h ? riderPartFormula({ number: h.number, denomination: h.denomination, custom: h.custom, bonus: h.bonus }) : null;
  if ( !raw ) { log.warn(`${featureName}: no healing part on the sheet — apply it by hand.`); return; }
  const roll = await new Roll(raw, activity.getRollData?.() ?? feature.getRollData?.() ?? {}).evaluate();
  const type = [...(h.types ?? [])][0] ?? "healing";
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${featureName} — ${type === "temphp" ? "Temporary Hit Points" : "healing"} with the Flare` });
  await applyDamagesWithReceipt(attackMessage, [{ uuid: actor.uuid, name: actor.name }], [{ value: Math.max(0, Number(roll.total) || 0), type, properties: new Set() }], { note: featureName });
}

/**
 * A GUARD's answer (Protection), recorded on the protected target; refused when the Reaction or
 * the Shield is gone since the ask.
 * @param {ChatMessage} attackMessage
 * @param {object} target  the protected creature's entry
 * @param {object} guard
 */
export async function protectReaction(attackMessage, target, guard) {
  const actor = await resolveUuidAsync(guard.uuid);
  const found = rollRow(guard.row);
  const item = actor?.items.get(guard.itemId) ?? null;
  if ( !actor || !found || !item ) {
    ui.notifications.warn(`${TITLE}: could not find ${guard.row} on ${guard.name}.`);
    return;
  }
  if ( reactionSpent(actor) ) {
    ui.notifications.warn(`${TITLE}: ${guard.name}'s Reaction is already spent this round.`);
    return;
  }
  if ( !holdsFor(actor, found.row.holding) ) {
    ui.notifications.warn(`${TITLE}: ${guard.name} is not holding ${found.row.holding === "shield" ? "a Shield" : "a Shield or a weapon"} — ${found.key} cannot be used.`);
    return;
  }
  await spendReaction(actor, { origin: item.uuid, what: found.key });
  const bent = await bendTheRoll(attackMessage, actor, found.key);
  return answerHold(attackMessage, target.uuid, "roll", { bent, rescue: found.key, by: guard.uuid });
}

/**
 * A BYSTANDER's answer (Cutting Words, Restore Balance, Portent — Q2 option A): the cost paid by hand, the bend
 * rolled in the open, recorded on the target it bent. (Cutting Words' die off the DAMAGE is the damage hold's,
 * damage-holds.js.)
 * @param {ChatMessage} attackMessage
 * @param {object} target  the hit creature's entry
 * @param {object} guard   the bystander's entry
 * @param {{face?: number|null}} [opts]  `face`: the stored face picked (Portent)
 */
export async function bystanderReaction(attackMessage, target, guard, { face = null } = {}) {
  const actor = await resolveUuidAsync(guard.uuid);
  const found = rollRow(guard.row);
  const item = actor?.items.get(guard.itemId) ?? null;
  // An `inspired` row carries no item: its pool is the answerer's own Inspired effect.
  const inspired = guard.inspired ? (actor?.effects?.get(guard.inspired.effectId) ?? null) : null;
  if ( !actor || !found || (!item && !inspired) ) {
    ui.notifications.warn(`${TITLE}: could not find ${guard.row} on ${guard.name}${guard.inspired ? " (the Inspired die is gone)" : ""}.`);
    return;
  }
  const { key, row } = found;
  const activity = item ? (item.system?.activities?.get(guard.activityId) ?? activityNamed(item, row.activity)) : null;
  // The bystander's OWN roll (Guided Strike on yourself) takes none; a hit creature's own answer does.
  const reaction = row.reaction && (!guard.self || !!guard.hitSelf);
  if ( reaction && reactionSpent(actor) ) {
    ui.notifications.warn(`${TITLE}: ${guard.name}'s Reaction is already spent this round.`);
    return;
  }
  const pool = (activity ? poolOf(actor, activity) : null) ?? item;
  if ( row.uses && pool && !(Number(pool?.system?.uses?.value ?? 0) > 0) ) {
    ui.notifications.warn(`${TITLE}: ${guard.name} has no ${pool?.name ?? key} left for ${key}.`);
    return;
  }
  const roll = attackMessage.rolls?.[0];
  const facts = d20FactsOf(roll);
  if ( !roll || !Number.isFinite(facts.kept) ) return;
  let poolSpend = null;
  if ( row.uses ) poolSpend = await spendPoolUses(actor, pool, key, 1, (pool === item) ? null : pool.name)
    .catch(err => { log.warn(`Could not spend a use for ${key}.`, err); return null; });
  if ( reaction ) await spendReaction(actor, { origin: item?.uuid ?? inspired?.origin ?? null, what: key });
  // The Inspired die is spent as it is rolled (d20-folds.js BARDIC's spend).
  if ( inspired ) await inspired.delete().catch(err => log.warn(`Could not spend the Inspired die — delete it by hand.`, err));
  let bent = null;
  if ( row.bend === "die" ) {
    const formula = guard.die ?? bystanderDie(actor, row);
    let n = 0, die = null;
    try {
      die = await new Roll(String(formula)).evaluate();
      n = Math.max(0, Number(die.total) || 0);
    } catch(err) {
      log.error(`${key}'s die could not be rolled — bend the roll by hand.`, err);
    }
    bent = dieOutcome({ kept: Number(facts.kept), total: Number(roll.total), add: guardSign(guard, row) * n,
      critAt: facts.critAt, fumbleAt: facts.fumbleAt });
    // The dice over the attacker are the hold's (hold/dice.js), off the record landing.
    if ( die ) await die.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${key} — off the attack at ${target.name}` })
      .catch(err => log.warn(`${key}'s die could not be posted.`, err));
  } else if ( row.bend === "neutralise" ) {
    bent = neutraliseOutcome({ mode: facts.mode, kept: Number(facts.kept), plain: facts.plain, total: Number(roll.total),
      critAt: facts.critAt, fumbleAt: facts.fumbleAt, faces: facts.faces });
  } else if ( row.bend === "set" ) {
    // A stored face (Portent): struck off the bearer's chip, the d20 replaced — nothing rolled.
    const pick = Number.isFinite(Number(face)) ? Number(face) : Number(guard.faces?.[0]);
    if ( !Number.isFinite(pick) || !(await spendStoredFace(actor, row.stored, pick)) ) {
      ui.notifications.warn(`${TITLE}: ${guard.name} no longer holds a ${key} ${pick}.`);
      return;
    }
    bent = setOutcome({ kept: Number(facts.kept), total: Number(roll.total), face: pick, critAt: facts.critAt, fumbleAt: facts.fumbleAt });
  }
  const settled = await answerHold(attackMessage, target.uuid, "roll", { poolSpend, bent, rescue: key, by: guard.uuid });
  // `turned: "strike"` — the bend turned the hit to a miss against the live AC: one weapon attack at the attacker.
  const ac = Number((await resolveUuidAsync(target.uuid))?.system?.attributes?.ac?.value ?? target.ac);
  if ( (row.turned === "strike") && bent && !bent.isCritical && Number.isFinite(ac) && (Number(bent.total) < ac) ) {
    void offerStrike(attackMessage, actor, key);
  }
  return settled;
}

/** The strike after a turned hit (Glorious Defense): Use drives the answerer's weapon at the attacker; the
 * weapon's range is the table's. Riposte's driven attack. */
async function offerStrike(attackMessage, actor, key) {
  const attacker = attackMessage.getAssociatedActor?.() ?? null;
  const token = attacker ? tokenOf(attacker.uuid) : null;
  const option = preferredMeleeOption(actor, meleeOptions(actor));
  if ( !attacker || !token || !option ) return;
  await openMomentPopup(attackMessage, `strike|${actor.uuid}`, actor, {
    title: `${key} — strike back`, icon: "fa-solid fa-sword",
    content: bfCard({ img: actor.items.get(option.itemId)?.img ?? actor.img ?? null, eyebrow: `${key} — the attack misses`, tone: "good",
      title: `Strike ${token.document?.name ?? attacker.name} with ${option.name}?`,
      subtitle: "one weapon attack as part of this Reaction — if it is within your weapon's range" }),
    buttons: [
      { action: "strike", label: "Strike", default: true, callback: () => void driveStrike(actor, option, token, attackMessage.id) },
      { action: "pass", label: "Pass", callback: () => {} }
    ]
  }).catch(err => log.warn(`${key}'s strike could not be offered — attack from the sheet.`, err));
}

async function driveStrike(actor, option, token, attackId) {
  try {
    const activity = actor.items.get(option.itemId)?.system?.activities?.get(option.activityId);
    if ( !activity ) return;
    await withTargets([token], async () => {
      const used = await activity.use({ subsequentActions: false }, { configure: false }, { data: { flags: { [MODULE_ID]: { riposteFor: attackId } } } });
      const usageId = used?.message?.id ?? null;
      await activity.rollAttack({}, { configure: false }, { data: { ...(usageId ? originData(usageId) : {}), flags: { [MODULE_ID]: { riposteFor: attackId } } } });
    });
  } catch(err) {
    log.error(`The strike could not be driven — attack from the sheet.`, err);
  }
}

/**
 * The mute (RULINGS *The asks widened*): the feature muted for its bearer `until` its turn or the combat's end, and this one passed.
 * @param {any} attackMessage
 * @param {any} target
 * @param {any} guard
 * @param {"turn"|"combat"} [until]
 */
export async function muteAndPass(attackMessage, target, guard, until = "combat") {
  const actor = await resolveUuidAsync(guard.uuid);
  const img = actor?.items?.get(guard.itemId)?.img ?? null;
  await muteBystander(actor, guard.row, { img, until }).catch(err => log.warn(`Could not mute ${guard.row}.`, err));
  if ( !guard.passed ) return answerHold(attackMessage, target.uuid, "pass", { by: guard.uuid });
}

/** The sheet's answer for a `roll` row: ONE hold, the oldest asking (unlike Shield, "that roll" only). */
async function bendFromTheSheet(actor, name) {
  for ( const message of game.messages.contents ) {
    const hold = readFlag(message, "hold");
    if ( !hold || (hold.status !== "pending") ) continue;
    const target = hold.targets.find(t => (t.uuid === actor.uuid) && !t.answer
      && (t.rows ?? []).some(r => (lower(r.key) === lower(name)) && !r.off));
    if ( !target ) continue;
    const bent = await bendTheRoll(message, actor, name);
    return answerHold(message, target.uuid, "roll", { bent, rescue: name });
  }
}

/**
 * The Cast button REALLY casts; the usage hook answers the hold. ⚠ Never merely record "cast":
 * the hold would resolve against an unchanged AC (ARCHITECTURE.md §6). `pay` the way the player picked to pay a
 * spell (a pill's key, cast-ways.js), the module's own pick when none.
 * @param {any} attackMessage
 * @param {any} target
 * @param {{pay?: string|null}} [options]
 */
export async function castReaction(attackMessage, target, { pay = null } = {}) {
  const actor = await resolveUuidAsync(target.uuid);
  // Parry's pack activity is a heal that would post its own card: spent by hand instead.
  if ( target.reduce?.formula ) return parryReaction(attackMessage, target, actor);
  // A TEXT-ONLY feature (Uncanny Dodge): nothing to use.
  const own = actor?.items.get(target.itemId);
  if ( own && !target.activityId && isTextOnlyFeature(own) ) {
    await spendReaction(actor, { origin: own.uuid, what: own.name });
    return answerHold(attackMessage, target.uuid, "cast");
  }
  // ⚠ Prefer the recorded activity: a statblock casts Shield from Spellcasting's `cast` activity;
  // the linked spell item reports spellSlot:true with no slots and is refused.
  let activity = target.activityId
    ? actor?.items.get(target.itemId)?.system.activities?.get(target.activityId)
    : null;
  if ( !activity ) {
    // The reaction's real item, not the first name match (a worn shield is named Shield too).
    const item = reactionItem(actor, target.reaction);
    activity = item?.system.activities?.contents?.find(a => a.activation?.type === "reaction")
      ?? item?.system.activities?.contents?.[0];
  }
  if ( !activity ) {
    ui.notifications.warn(`${TITLE}: could not find ${target.reaction} on ${target.name} to cast.`);
    return;
  }
  // A multiplier row with a cost the activity does not carry (`uses` — Beguiling Defenses' once per Long Rest, B2): spent
  // by a write first; none left casts nothing. `at: "attacker"`: the cast is aimed at the attacker (its save demand lands
  // on it); `failDamage` rides the usage card for the saves machine.
  const multiplierKey = Object.keys(INTERRUPT_MULTIPLIERS).find(k => lower(k) === lower(target.reaction));
  const multiplierRow = multiplierKey ? INTERRUPT_MULTIPLIERS[multiplierKey] : null;
  if ( multiplierRow?.uses ) {
    const ownItem = actor?.items.get(target.itemId) ?? reactionItem(actor, target.reaction);
    if ( !(Number(ownItem?.system?.uses?.value ?? 0) > 0) ) {
      ui.notifications.warn(`${TITLE}: ${actor?.name ?? target.name} has no use of ${target.reaction} left.`);
      return;
    }
    await spendPoolUses(actor, ownItem, target.reaction).catch(err => log.warn(`Could not spend a use of ${target.reaction}.`, err));
  }
  const attackerUuid = attackMessage.getAssociatedActor?.()?.uuid ?? null;
  const aim = (multiplierRow?.at === "attacker") ? tokenOf(attackerUuid) : null;
  const data = multiplierRow?.failDamage
    ? { data: { flags: { [MODULE_ID]: { failDamage: { ...multiplierRow.failDamage, attackId: attackMessage.id, takenBy: actor.uuid, by: multiplierKey } } } } }
    : {};
  // No usage dialog; the module drives what follows. A levelled spell is paid the way the player picked on the popup
  // while it is left, else the shared way (cast-ways.js): its free cast while one is left (Magic Initiate's Shield),
  // else the lowest slot, a Pact slot too.
  const route = (activity.item?.type === "spell") ? castWayOf(actor, activity.item, activity, { pick: pay }) : null;
  if ( route?.way.kind === "none" ) {
    ui.notifications.warn(`${TITLE}: ${actor?.name ?? target.name} has no way left to cast ${target.reaction} (${route.way.why}).`);
    return;
  }
  const cast = () => route
    ? castBy(route, { usage: { subsequentActions: false }, message: data })
    : activity.use({ subsequentActions: false }, { configure: false }, data);
  await (aim ? withTargets([aim], cast) : cast());
  // C1 — a multiplier row's typed effect (Superior Hunter's Defense, `effects: "type"`) lands in auto-apply.js AFTER the held
  // share has landed: landed here, the platform's Resistance would halve the share a second time on top of the hold's half.
}

/** Parry's answer: pool and Reaction spent, the reduction rolled in the open. */
async function parryReaction(attackMessage, target, actor) {
  const item = actor?.items.get(target.itemId) ?? reactionItem(actor, target.reaction);
  const activity = item?.system?.activities?.get(target.reduce.activityId) ?? null;
  const pool = activity ? poolOf(actor, activity) : null;
  if ( pool && !(Number(pool.system?.uses?.value ?? 0) > 0) ) {
    ui.notifications.warn(`${TITLE}: ${actor.name} has no ${target.reduce.spend ?? "Superiority Die"} left for ${target.reaction}.`);
    return answerHold(attackMessage, target.uuid, "pass");
  }
  let total = 0;
  try {
    const formula = Roll.replaceFormulaData(String(target.reduce.formula), actor.getRollData());
    const roll = await new Roll(formula).evaluate();
    const rise = reductionRise({ roll: roll.toJSON(), from: actor.uuid });   // a reaction that modifies a roll: the dice, then the number, over the defender
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${target.reaction} — the die, plus the modifier`,
      ...(rise ? { flags: { [MODULE_ID]: { diceRise: rise } } } : {}) });
    total = Math.max(0, Number(roll.total) || 0);
  } catch(err) {
    log.error(`${target.reaction}'s reduction could not be rolled — reduce by hand.`, err);
  }
  let poolSpend = null;
  if ( pool ) poolSpend = await spendSuperiorityDie(actor, pool, target.reaction).catch(err => { log.warn(`Could not spend a ${target.reduce.spend ?? "Superiority Die"} for ${target.reaction}.`, err); return null; });
  await spendReaction(actor, { origin: item?.uuid ?? null, what: target.reaction });
  return answerHold(attackMessage, target.uuid, "cast", { reduceBy: total, poolSpend });
}

/**
 * `atZero` (INTERRUPT_REDUCTIONS — Deflect Attacks' Redirect): the reduction took the damage to 0, so the
 * feature's own activity is used at the attacker — the pack's save activity, its cost its own. Once per card.
 * @param {ChatMessage} damageMessage
 * @param {Actor} actor   the defender who reduced it
 * @param {{row: string, activity: string, attackerUuid: string}} offer
 */
export async function useAtZero(damageMessage, actor, offer) {
  let won = false;
  await queueFlagWrite(damageMessage, "atZero", current => {
    if ( current[actor.id] ) return false;
    current[actor.id] = { row: offer.row, activity: offer.activity, at: Date.now() };
    won = true;
  });
  if ( !won ) return;
  try {
    const item = reactionItem(actor, offer.row);
    const activity = item ? activityNamed(item, offer.activity) : null;
    const token = tokenOf(offer.attackerUuid);
    if ( !activity || !token ) { ui.notifications?.warn(`${TITLE}: ${offer.row} — ${offer.activity} or the attacker is gone; use it from the sheet.`); return; }
    await withTargets([token], () => activity.use({ subsequentActions: false }, { configure: false }));
  } catch(err) {
    log.error(`${offer.row}'s ${offer.activity} could not be used — use it from the sheet.`, err);
  }
}
