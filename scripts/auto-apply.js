// @ts-check
/**
 * By the Books — auto-apply damage, the shared receipt applier, and the payout pipeline. Split shape (ARCHITECTURE.md §7).
 */
import { MODULE_ID, readFlag, drivesMomentFor, canApplyTo, whisperNoGM, queueFlagWrite, statContext, isActiveGM, resolveUuidAsync, writableTargets, log } from "./core.js";
import { receiptEntry, joinDamageReceipt } from "./decide/receipt.js";
import { interruptMultiplier, reduceDamages } from "./decide/verdict.js";
import { INTERRUPT_MULTIPLIERS } from "./decide/registry.js";
import { hitTargets, resolveAttackMessage, damagePartsOf, statSourceOf, holdOf, holdTargets, attackHoldClaims, attackHoldReleased } from "./shared.js";
import { missShareFor } from "./lookup.js";
import { CARD, isCard, targetsOf } from "./decide/card.js";
import { DICE_CHANGE_FLAG, DICE_CHANGE_WAITS } from "./decide/dice-changers.js";
import { registerResumable } from "./ui.js";
import { applyEffectRiders, applyItemEffectOnHit } from "./effect-riders.js";
import { resolveHitMastery } from "./mastery.js";
import { sequenceBashOffer } from "./bash-offer.js";

/* --- The receipt's readers (ARCHITECTURE §4 *Who reads a record*) ------------------------------ */

/**
 * Does the card carry a damage receipt: its damage landed (or was reverted since)?
 * @param {any} message
 */
export function hasReceipt(message) {
  return !!readFlag(message, "receipt");
}

/**
 * The receipt's entries, one per target the damage landed on (`uuid`, `taken`, `prior`, `reverted`, …); [] when none.
 * @param {any} message
 * @returns {any[]}
 */
export function receiptEntries(message) {
  return readFlag(message, "receipt")?.targets ?? [];
}

/**
 * Dice rolled on an attack every judged target was missed on: `{ why, at }` (the card says nothing landed, and why), or null.
 * @param {any} message
 */
export function notAppliedOf(message) {
  return readFlag(message, "notApplied") ?? null;
}

/* --- Auto-apply damage to hit targets ---------------------------------------------------------- */

/** The payout's subject is the ATTACKER (the chain writes on the attack message); null means GM-only. */
function payoutSubject(message) {
  try { return resolveAttackMessage(message)?.getAssociatedActor?.()?.uuid ?? null; }
  catch { return null; }
}

// FLAGLESS resumable, judged at creation; a hold or a pending dice changer holds it, and each
// settling write is the bus event. ⚠ The `attackDamage|<id>` latch guards re-entry: over-applying is the worst failure.
const eitherWaits = message => DICE_CHANGE_WAITS.includes(readFlag(message, DICE_CHANGE_FLAG)?.status);
registerResumable("attackDamage", {
  flagless: true,
  pending: (_flag, message, cause) => (cause === "create")
    || (attackHoldReleased(message) && !readFlag(message, "receipt"))
    || (!!readFlag(message, DICE_CHANGE_FLAG) && !eitherWaits(message) && !readFlag(message, "receipt")),
  drives: (_flag, message) => drivesMomentFor(payoutSubject(message)),
  drive: resolveAttackDamage
});

async function resolveAttackDamage(message) {
  if ( !isCard(message, CARD.damage) ) return; // healing is typed "healing"
  const attackMessage = resolveAttackMessage(message);
  if ( !attackMessage ) return;
  if ( attackHoldClaims(message) ) {
    // Claimed for a hold: a hold already RESOLVED (released before this roll landed) applies now.
    const hold = holdOf(attackMessage);
    if ( !hold || (hold.status === "pending") ) return;
  }
  if ( eitherWaits(message) ) return;
  if ( readFlag(message, "receipt") ) return;
  const hits = hitTargets(attackMessage);
  // A miss that still pays (Potent Cantrip): the judged targets the roll missed take the row's share.
  const share = missShareFor(attackMessage.getAssociatedActivity?.() ?? message.getAssociatedActivity?.() ?? null);
  const missed = share ? await missedTargets(attackMessage, hits) : [];
  if ( !hits.length && !missed.length ) {
    // Every judged target was missed (a Portent face, a Shield, a plain miss) and someone rolled the damage anyway: the
    // dice do nothing, and the card says so (receipts.js draws `notApplied`) instead of looking like a hit's damage.
    await stampNotApplied(message, attackMessage);
    return;
  }
  if ( hits.length ) await resolveDamagePayouts(message, attackMessage, hits);
  if ( share && missed.length ) {
    await applyDamagesWithReceipt(message, missed, damagePartsOf(message.rolls),
      { multiplier: share.share, note: `missed — ${share.by}, half damage` });
  }
}

/** The line for dice rolled on a miss: who turned it (the hold's record), or the plain miss. Once; the owner writes. */
async function stampNotApplied(message, attackMessage) {
  if ( !message.isOwner || readFlag(message, "notApplied") ) return;
  const judged = targetsOf(attackMessage).filter(t => (t.ac !== null) && (t.ac !== undefined));
  if ( !judged.length ) return;   // nothing was judged: not a miss, just no target
  const turned = holdTargets(attackMessage)
    .filter(t => (t.verdict === "miss") && (t.rescue || t.reaction))
    .map(t => `${t.rescue ?? t.reaction}${t.guardedBy?.name ? ` (${t.guardedBy.name})` : ""} turned the hit on ${t.name} into a miss`);
  const why = turned.length ? turned.join("; ") : `the attack missed ${judged.map(t => t.name).join(", ")}`;
  await message.setFlag(MODULE_ID, "notApplied", { why, at: Date.now() })
    .catch(err => log.warn(`The not-applied line could not be written.`, err));
}

/** The judged targets this attack MISSED — never one a duplicate absorbed — still standing and writable here. */
async function missedTargets(attackMessage, hits) {
  const hit = new Set(hits.map(t => t.uuid));
  const hold = holdOf(attackMessage);
  const out = [];
  for ( const t of targetsOf(attackMessage) ) {
    if ( hit.has(t.uuid) || (t.ac === null) || (t.ac === undefined) ) continue;
    if ( hold?.targets?.find(e => e.uuid === t.uuid)?.verdict === "absorbed" ) continue;
    const actor = await resolveUuidAsync(t.uuid);
    const subject = (actor instanceof Actor) ? actor : (actor?.actor ?? null);
    if ( !subject || ((subject.system?.attributes?.hp?.value ?? 0) <= 0) || !canApplyTo(subject) ) continue;
    out.push({ uuid: t.uuid, name: t.name });
  }
  return out;
}

/** ⚠ Sequential: the mastery gates (Vex, Slow: damage DEALT) read the receipt the application writes. */
async function resolveDamagePayouts(damageMessage, attackMessage, hits) {
  // Application and effect riders write to the TARGET: gated, and said aloud when this client cannot.
  const writable = writableTargets(hits);
  const blocked = hits.length - writable.length;

  if ( writable.length ) await applyToHitTargets(damageMessage, attackMessage, writable);
  if ( blocked ) await whisperNoGM(`damage to ${blocked} target${blocked === 1 ? "" : "s"}`,
    "The roll stands — apply it from the card's damage tray.");
  // Per target: the damage riders' all-targets intersection rule does NOT apply to effects.
  if ( writable.length ) {
    await applyEffectRiders(damageMessage, attackMessage, writable);
  }
  await resolveHitMastery(damageMessage, attackMessage, hits);
  // The hit's offer opens after the damage and any pending mastery decision (decide/sequence.js).
  await sequenceBashOffer(attackMessage, { damageLanded: true });
}

async function applyToHitTargets(damageMessage, attackMessage, hits) {
  const damages = damagePartsOf(damageMessage.rolls);
  // A held attack lands per reactor (Uncanny Dodge's multiplier): one application per group.
  const hold = holdOf(attackMessage);
  const groups = new Map();
  for ( const target of hits ) {
    const entry = (hold?.status === "resolved") ? hold.targets?.find(t => t.uuid === target.uuid) : null;
    const found = entry ? interruptMultiplier(entry, INTERRUPT_MULTIPLIERS) : null;
    // A reaction that REDUCES by a roll (Parry; a bystander's die off the damage — Cutting Words): the number the answer carried.
    const reduce = ((entry?.answer === "cast") || (entry?.answer === "roll")) && (Number(entry.reduceBy) > 0) ? Number(entry.reduceBy) : 0;
    const note = found?.note ?? (reduce ? `${(entry.answer === "roll") ? (entry.rescue ?? entry.reaction) : entry.reaction} — reduced by ${reduce}` : undefined);
    const key = `${found?.multiplier ?? 1}|${note ?? ""}|${reduce}`;
    if ( !groups.has(key) ) groups.set(key, { multiplier: found?.multiplier ?? 1, note, reduce, hits: [] });
    groups.get(key).hits.push(target);
  }
  for ( const { multiplier, note, reduce, hits: group } of groups.values() ) {
    await applyDamagesWithReceipt(damageMessage, group, reduce ? reduceDamages(damages, reduce) : damages, { multiplier, ...(note ? { note } : {}) });
    for ( const target of group ) await landTypedEffect(attackMessage, hold, target, damages);
  }
}

/**
 * C1 — a multiplier row's typed effect (Superior Hunter's Defense, `effects: "type"`): the pack's Resistance of the
 * damage's type on the reactor until the end of the current turn, landed AFTER its halved share (damage-holds.js lands
 * the any-damage share the same way). Landed before it, the platform would halve the share a second time.
 */
async function landTypedEffect(attackMessage, hold, target, damages) {
  const entry = (hold?.status === "resolved") ? hold.targets?.find(t => t.uuid === target.uuid) : null;
  if ( !entry || (entry.answer !== "cast") ) return;
  const key = Object.keys(INTERRUPT_MULTIPLIERS).find(k => k.toLowerCase() === String(entry.reaction ?? "").toLowerCase());
  const row = key ? INTERRUPT_MULTIPLIERS[key] : null;
  if ( row?.effects !== "type" ) return;
  const actor = await resolveUuidAsync(entry.uuid);
  const item = (actor instanceof Actor) ? (actor.items.get(entry.itemId) ?? null) : null;
  const type = damages.map(d => d.type).find(t => t && !["healing", "temphp"].includes(t)) ?? null;
  const want = `${row.effectPrefix ?? ""}${type}`.toLowerCase();
  const effect = (type && item) ? item.effects.find(e => String(e.name).toLowerCase() === want) : null;
  if ( !effect ) return;
  await applyItemEffectOnHit(attackMessage, item, { name: effect.name, from: effect.name, id: `bfTypedRes${type.slice(0, 6).padEnd(6, "0")}` },
    [{ uuid: entry.uuid, name: entry.name }], { clock: row.clock ?? null, attacker: actor })
    .catch(err => log.warn(`${key}'s effect could not land — apply it by hand.`, err));
}

/**
 * THE DAMAGE CLAIMS: a machine may claim a target's share before it lands (a "when you take damage"
 * reaction) and apply it later with `held: true`, never claimed again. A throwing claim is ignored.
 * @type {Array<(receiptMessage: ChatMessage, target: {uuid: string, name: string}, actor: Actor,
 *   damages: object[], opts: {multiplier: number, note?: string}) => boolean>}
 */
const damageClaims = [];

export function registerDamageClaim(claim) {
  damageClaims.push(claim);
}

function claimed(receiptMessage, target, actor, damages, opts) {
  for ( const claim of damageClaims ) {
    try { if ( claim(receiptMessage, target, actor, damages, opts) ) return true; }
    catch(err) { log.error(`A damage claim failed — the damage lands whole.`, err); }
  }
  return false;
}

/**
 * The shared applier: Actor5e#applyDamage per target, the receipt stamped on `receiptMessage` (the
 * ATTACK card for Graze, which has no damage message).
 * @param {any} receiptMessage
 * @param {{uuid: string, name: string}[]} hits
 * @param {object[]} damages
 * @param {{note?: string, multiplier?: number, held?: boolean}} [opts]
 */
export async function applyDamagesWithReceipt(receiptMessage, hits, damages, { note, multiplier = 1, held = false } = {}) {
  try {
    const context = statContext(statSourceOf(receiptMessage));
    const receipts = [];
    for ( const target of hits ) {
      const actor = await resolveUuidAsync(target.uuid); // the targets snapshot carries ACTOR uuids
      if ( !(actor instanceof Actor) || !actor.system.attributes?.hp ) continue;
      if ( !held && claimed(receiptMessage, target, actor, damages, { multiplier, ...(note ? { note } : {}) }) ) continue;
      const src = actor.system._source.attributes.hp;
      // the Exhaustion rides the snapshot: a rule writing a level into the damage's own update (House Rules' going-down
      // rule) is recorded here and reverted with the Hit Points
      const prior = { value: src.value, temp: src.temp, tempmax: src.tempmax, exhaustion: Number(actor.system._source.attributes.exhaustion ?? 0) };

      // calculateDamage annotates WHY (a 9 that lands as 0); never recompute di/dr/dv by hand.
      // ⚠ It fires the calculate-damage hooks a second time.
      const calc = actor.calculateDamage(damages, { multiplier, originatingMessage: receiptMessage });

      // The options object is read back: ward-pools.js writes what a ward took onto it.
      const applyOptions = { multiplier, isDelta: true, originatingMessage: receiptMessage, origin: receiptMessage };
      await actor.applyDamage(damages, applyOptions);
      const after = { ...actor.system._source.attributes.hp, exhaustion: Number(actor.system._source.attributes.exhaustion ?? 0) };
      const ward = applyOptions.bfWard ?? null;
      // damage-rules.js's block and ignored Resistance.
      const block = calc?.bfArmorBlock;
      const ignored = (calc?.bfIgnored ?? []).map(i => `${i.feature} — ignores ${i.types.join(", ")} resistance`);
      const warded = ward?.took ? `${ward.feature} took ${ward.took}${ward.left ? ` — ${ward.left} landed` : ""}` : null;
      const said = [note, block?.amount ? `${block.feature} — blocked ${block.amount}` : null, warded, ...ignored].filter(Boolean).join(" · ") || note;
      receipts.push(receiptEntry({
        uuid: target.uuid, name: target.name, img: actor.img,
        note: said, multiplier, prior, after, calc, context,
        ward: ward?.took ? { itemUuid: ward.itemUuid, took: ward.took } : null
      }));
    }
    if ( receipts.length ) {
      // ⚠ Through `queueFlagWrite`: concurrent merges would drop each other's entries.
      await queueFlagWrite(receiptMessage, "receipt", existing => {
        joinDamageReceipt(existing, receipts);
      });
    }
  } catch(err) {
    log.error(`Auto-apply failed.`, err);
  }
}

/**
 * Move ALREADY-applied damage by a reroll's difference as its own revertable receipt; lower heals
 * back. GM only. ARCHITECTURE §11 *Adding a FOLD* rule 4.
 * @param {ChatMessage} message
 * @param {{delta: number, feature: string}} outcome
 */
export async function moveAppliedDamage(message, { delta, feature }) {
  const receipt = readFlag(message, "receipt");
  const targets = (receipt?.targets ?? []).filter(t => !t.reverted);
  if ( !targets.length || !delta ) return;
  const type = message.rolls?.[0]?.options?.type ?? null;
  if ( !isActiveGM() ) {
    await whisperNoGM(`${feature} moved the damage by ${delta > 0 ? "+" : ""}${delta} on ${targets.map(t => t.name).join(", ")} — already applied; adjust by hand`);
    return;
  }
  for ( const t of targets ) {
    const multiplier = Number(t.multiplier ?? 1) || 1;
    const amount = Math.abs(delta);
    const damages = delta > 0 ? [{ value: amount, type }] : [{ value: amount, type: "healing" }];
    await applyDamagesWithReceipt(message, [{ uuid: t.uuid, name: t.name }], damages,
      { note: delta > 0 ? `${feature} — the reroll` : `${feature} — rerolled lower`, multiplier });
  }
}

