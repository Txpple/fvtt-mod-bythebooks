/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): the DAMAGE HOLD — an `any` reduction (Stone's
 * Endurance), an `ally` guard's (Interception) or a BYSTANDER's die off the damage (Cutting Words'
 * "makes a damage roll", a `roll` row with `damage`; RULINGS *The asks widened*), asked before ANY
 * module-applied damage lands. A share claimed at auto-apply.js `registerDamageClaim` WAITS on its
 * own card; the keeper lands it short by the roll (`held`, never claimed twice). ⚠ Card buttons and
 * sheet edits are never held (RULINGS *Where the table bends the rule*). Order: save multiplier,
 * reduction, resistances.
 */
import { MODULE_ID, readFlag, TITLE, keepsMessage, queueFlagWrite, canAnswerFor, statContext, decisionWindow, resolveUuid, resolveUuidAsync, log, claimLanding, claimHolds } from "./core.js";
import { lower, itemNamed, reductionFor, holdsFor, featureNamed, activityNamed, bystanderRows, bystanderDie } from "./lookup.js";
import { alliesWithin, nearestFeet, tokenOf } from "./geometry.js";
import { interruptEntries } from "./decide/registry.js";
import { INTERRUPT_MULTIPLIERS, INTERRUPT_REDUCTIONS, INTERRUPT_ROLLS } from "./decide/registry.js";
import { dieMaxOf, reductionKeepsUp } from "./decide/rescue-hit.js";
import { applyItemEffectOnHit } from "./effect-riders.js";
import { reduceDamages } from "./decide/verdict.js";
import { reductionRise } from "./decide/dice-chips.js";
import { poolOf, poolUsesOf, reactionSpent, spendReaction, spendSuperiorityDie, spendPoolUses, resolveAttackMessage,
  bystanderMuted, muteBystander, muteScopesFor, holdTargets } from "./shared.js";
import { applyDamagesWithReceipt, registerDamageClaim } from "./auto-apply.js";
import { closeLedger, effectsNamed, hitPointsOf, landingSteps } from "./ledger.js";
import { bfCard, esc, holdBarHTML, ruleLine } from "./decide/present.js";
import { openMomentPopup, armAskTimer, disarmAskTimer, keeperOwns, registerRelay, registerResumable, pendingRow, closePopup, postCard, postAnswer, choicePopup } from "./ui.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";

const HOLD_FLAG = "damageHold";
const timers = new Map();
const answering = new Set();
const NOT_DAMAGE = new Set(["healing", "temphp"]);
/** `receiptId|targetUuid` → when it was claimed; a second pass inside the window is the same share. */
const claimedShares = new Map();
const CLAIM_WINDOW_MS = 30_000;

/** The listed any-damage reduction this actor can take now — `{ name, row, item, activity, formula, pool }` or null. */
function anyReductionOf(actor) {
  for ( const entry of interruptEntries() ) {
    const name = entry.name;
    const key = Object.keys(INTERRUPT_REDUCTIONS).find(k => lower(k) === lower(name));
    const row = key ? INTERRUPT_REDUCTIONS[key] : null;
    if ( row?.any ) {
      const item = itemNamed(actor, key);
      const found = item ? reductionFor(item, key) : null;
      if ( !found ) continue;
      const pool = row.pool ? poolOf(actor, found.activity) : null;
      if ( row.pool && !(Number(pool?.system?.uses?.value ?? 0) > 0) ) continue;
      return { name: key, row, item, activity: found.activity, formula: found.formula, pool };
    }
    // C1 — a MULTIPLIER row on any damage (Superior Hunter's Defense): the share halved, no roll; the reaction activity is the item's.
    const mKey = Object.keys(INTERRUPT_MULTIPLIERS).find(k => lower(k) === lower(name));
    const mRow = mKey ? INTERRUPT_MULTIPLIERS[mKey] : null;
    if ( !mRow?.any ) continue;
    const mItem = itemNamed(actor, mKey);
    if ( !mItem ) continue;
    const activity = (mRow.activity ? activityNamed(mItem, mRow.activity) : null)
      ?? [...(mItem.system?.activities ?? [])].find(a => a.activation?.type === "reaction") ?? null;
    if ( mRow.uses && !(Number(mItem.system?.uses?.value ?? 0) > 0) ) continue;
    return { name: mKey, row: mRow, item: mItem, activity, formula: null, pool: null, halve: Number(mRow.multiplier) || 0.5 };
  }
  return null;
}

/** C1 — the pack's typed effect a multiplier row lands with its answer (`effects: "type"`): "Hunter's Defense: Fire" for fire. */
function typedEffectFor(row, item, damages) {
  if ( row?.effects !== "type" || !item ) return null;
  const type = (damages ?? []).map(d => d.type).find(t => t && !NOT_DAMAGE.has(t)) ?? null;
  if ( !type ) return null;
  const want = lower(`${row.effectPrefix ?? ""}${type}`);
  const effect = item.effects.find(e => lower(e.name) === want) ?? null;
  return effect ? { name: effect.name, from: effect.name, id: `bfTypedRes${type.slice(0, 6).padEnd(6, "0")}` } : null;
}

/**
 * THE GUARDS (Interception): allies within the row's `ally` reach able to reduce for the defender —
 * `{ name, row, guards: [{ actorUuid, actorName, itemId, activityId, formula, passed }] }` or null.
 */
function interceptorsFor(defender, attacker, { attackDamage = true } = {}) {
  const guarded = tokenOf(defender?.uuid);
  if ( !guarded ) return null;
  for ( const entry of interruptEntries() ) {
    const key = Object.keys(INTERRUPT_REDUCTIONS).find(k => lower(k) === lower(entry.name));
    const row = key ? INTERRUPT_REDUCTIONS[key] : null;
    if ( !row?.ally ) continue;
    if ( !attackDamage && !row.any ) continue;   // a plain guard answers an attack's hit alone
    const guards = [];
    for ( const token of alliesWithin(guarded, row.ally, [attacker?.uuid]) ) {
      const actor = token.actor;
      const item = itemNamed(actor, key);
      const found = item ? reductionFor(item, key) : null;
      if ( !found || reactionSpent(actor) || !holdsFor(actor, row.holding) ) continue;
      // B4 — a WARD guard (Projected Ward): the guard's own ward pool must hold hit points.
      const ward = (row.pool === "ward") ? wardPoolOf(actor, row.of) : null;
      if ( (row.pool === "ward") && !(ward?.left > 0) ) continue;
      // A paid guard (Protective Field's Psionic Energy Dice) with none left is never asked.
      if ( row.pool && (row.pool !== "ward") && !(Number(poolOf(actor, found.activity)?.system?.uses?.value ?? 0) > 0) ) continue;
      guards.push({ actorUuid: actor.uuid, actorName: token.document?.name ?? actor.name, itemId: item.id,
        activityId: found.activity.id, formula: found.formula, passed: false, ...(ward ? { ward } : {}) });
    }
    if ( guards.length ) return { name: key, row, guards };
  }
  return null;
}

/**
 * THE BYSTANDERS' DAMAGE HALF (Cutting Words; RULINGS *The asks widened*): a `roll` row with `damage`, held by a
 * creature on the DEFENDER's side within the row's feet of the ATTACKER (the creature making the damage roll), its
 * Reaction free, a use left — asked HERE, where the damage and the defender's Hit Points are known. A mute (shared.js
 * `bystanderMuted`) silences a trivial ask; an ask that can keep the defender ABOVE 0 Hit Points is always made
 * (`keepsUp`, decide/rescue-hit.js). BOTH HALVES ASK (RULINGS *The asks widened*): a bystander the ATTACK hold asked
 * at the roll, who passed, is asked again here once the damage is known — a pass at the roll means "not at the roll",
 * not "not this hit", since the damage is unknown there; a hit inside the die's reach would otherwise never show its
 * damage half but through the down guard. The mutes are the brake. An attack's damage only: a save's share has no
 * attacker's roll to stand beside.
 * @returns {{name: string, row: any, guards: object[]}|null}
 */
function cuttersFor(defender, attacker, amount) {
  const guarded = tokenOf(defender?.uuid), from = tokenOf(attacker?.uuid);
  if ( !guarded || !from || !(Number(amount) > 0) ) return null;
  const side = guarded.document?.disposition;
  if ( ((side !== 1) && (side !== -1)) || (from.document?.disposition === side) ) return null;
  const hp = Number(defender.system?.attributes?.hp?.value ?? 0), temp = Number(defender.system?.attributes?.hp?.temp ?? 0);
  for ( const key of bystanderRows("attack") ) {
    const row = INTERRUPT_ROLLS[key];
    if ( !row?.damage ) continue;
    const guards = [];
    for ( const token of (canvas.tokens?.placeables ?? []) ) {
      if ( token.document?.disposition !== side ) continue;
      const actor = token.actor;
      if ( !actor || (actor.uuid === attacker.uuid) || guards.some(g => g.actorUuid === actor.uuid) ) continue;
      if ( ((actor.system?.attributes?.hp?.value ?? 0) <= 0) || actor.statuses?.has?.("incapacitated") ) continue;
      const feet = nearestFeet(token, from);
      if ( (feet === null) || (feet > row.bystander) ) continue;
      const item = featureNamed(actor, key);
      const activity = item ? activityNamed(item, row.activity) : null;
      if ( !item || !activity || (row.reaction && reactionSpent(actor)) ) continue;
      const pool = poolOf(actor, activity) ?? item;
      if ( row.uses && !(Number(poolUsesOf(pool)?.value ?? 0) > 0) ) continue;
      const die = bystanderDie(actor, row);
      const dieMax = dieMaxOf(die);
      if ( !dieMax ) continue;
      const keepsUp = reductionKeepsUp({ amount, hp, temp, dieMax });
      if ( !keepsUp && bystanderMuted(actor, key) ) continue;
      guards.push({ actorUuid: actor.uuid, actorName: token.document?.name ?? actor.name, itemId: item.id, activityId: activity.id,
        formula: die, passed: false, reaction: key, bystander: true, ...(keepsUp ? { keepsUp: true } : {}) });
    }
    if ( guards.length ) return { name: key, row, guards };
  }
  return null;
}

/** The guards of two finders on one share: Interception's beside Cutting Words', each guard naming its own row. */
function mergeGuards(...found) {
  const live = found.filter(f => f?.guards?.length);
  if ( !live.length ) return null;
  return { name: live[0].name, row: live[0].row, guards: live.flatMap(f => f.guards.map(g => ({ reaction: f.name, ...g }))) };
}

/** A guard's own row: a reduction's (Interception) or a `roll` row's damage half (Cutting Words). */
const rowOf = name => INTERRUPT_REDUCTIONS[name] ?? INTERRUPT_ROLLS[name] ?? null;

/** B4 — a guard's ward pool (WARD_POOLS `uses`): `{ itemId, left, max }` or null. */
function wardPoolOf(actor, featureName) {
  const item = featureNamed(actor, featureName);
  if ( !item || !(Number(item.system?.uses?.max) > 0) ) return null;
  return { itemId: item.id, left: Number(item.system.uses.value ?? 0), max: Number(item.system.uses.max) };
}

/** The damage's plain, serializable shape — and back. */
const packDamages = damages => damages.map(d => ({ value: Number(d.value) || 0, type: d.type ?? null, properties: [...(d.properties ?? [])] }));
const unpackDamages = damages => (damages ?? []).map(d => ({ ...d, properties: new Set(d.properties ?? []) }));

/* --- the claim: before the share lands ------------------------------------------------------- */

registerDamageClaim((receiptMessage, target, actor, damages, { multiplier = 1, note } = {}) => {
  const own = listed(), guarded = guardsListed();
  if ( !own && !guarded ) return false;
  if ( !damages?.length || damages.every(d => NOT_DAMAGE.has(d.type)) ) return false;
  // ⚠ ONE CLAIM PER SHARE: a save's damage reaches the applier twice, before any receipt exists.
  const key = `${receiptMessage.id}|${target.uuid}`;
  const at = claimedShares.get(key);
  if ( at && ((Date.now() - at) < CLAIM_WINDOW_MS) ) return true;
  // ⚠ A share whose hold card stands unlanded is that card's, whoever stamped it: the claim above dies with its client,
  // and a landing re-driven over a dead claim (ledger.js) reaches here again with the same share.
  if ( heldOnCard(receiptMessage.id, target.uuid) ) return true;
  if ( !(Number(actor.system?.attributes?.hp?.value ?? 0) > 0) ) return false;
  const attack = resolveAttackMessage(receiptMessage);
  // An attack hit the attack hold already asked this target about stays the hold's.
  const heldByAttack = holdTargets(attack).some(t => t.uuid === target.uuid);
  const found = (own && !reactionSpent(actor) && !heldByAttack) ? anyReductionOf(actor) : null;
  if ( !found ) {
    // An ATTACK's damage to a creature with a guard beside it is held for the guards to answer (an `any` guard on any damage);
    // a bystander with a die to take off an attack's damage (Cutting Words) is a guard of the same share.
    const source = attack?.getAssociatedActor?.() ?? receiptMessage.getAssociatedActor?.() ?? null;
    const amount = Math.floor(damages.reduce((n, d) => n + (Number(d.value) || 0), 0) * multiplier);
    const guards = mergeGuards(guarded ? interceptorsFor(actor, source, { attackDamage: !!attack }) : null,
      (attack && cuttersListed()) ? cuttersFor(actor, source, amount) : null);
    if ( !guards ) return false;
    claimedShares.set(key, Date.now());
    void stampHold(receiptMessage, target, actor, damages, { multiplier, note }, guards, { guarded: true })
      .catch(async err => {
        log.error(`${guards.name}'s hold could not be stamped — the damage lands whole.`, err);
        await applyDamagesWithReceipt(receiptMessage, [target], damages, { multiplier, ...(note ? { note } : {}), held: true });
      });
    return true;
  }
  claimedShares.set(key, Date.now());
  void stampHold(receiptMessage, target, actor, damages, { multiplier, note }, found)
    .catch(async err => {
      log.error(`${found.name}'s hold could not be stamped — the damage lands whole.`, err);
      await applyDamagesWithReceipt(receiptMessage, [target], damages, { multiplier, ...(note ? { note } : {}), held: true });
    });
  return true;
});

/** Is this receipt's share to this creature already held on an unlanded hold card (the recent log)? */
const heldOnCard = (receiptId, uuid) => game.messages.contents.slice(-200).some(m => {
  const h = readFlag(m, HOLD_FLAG);
  return !!h && (h.receiptId === receiptId) && (h.target?.uuid === uuid) && !h.applied;
});

const listed = () => interruptEntries().some(e => INTERRUPT_REDUCTIONS[Object.keys(INTERRUPT_REDUCTIONS).find(k => lower(k) === lower(e.name))]?.any
  || INTERRUPT_MULTIPLIERS[Object.keys(INTERRUPT_MULTIPLIERS).find(k => lower(k) === lower(e.name))]?.any);
const guardsListed = () => interruptEntries().some(e => INTERRUPT_REDUCTIONS[Object.keys(INTERRUPT_REDUCTIONS).find(k => lower(k) === lower(e.name))]?.ally);
const cuttersListed = () => bystanderRows("attack").some(k => INTERRUPT_ROLLS[k]?.damage);

async function stampHold(receiptMessage, target, actor, damages, { multiplier, note }, found, { guarded = false } = {}) {
  const window = decisionWindow();
  const amount = Math.floor(damages.reduce((n, d) => n + (Number(d.value) || 0), 0) * multiplier);
  const source = receiptMessage.getAssociatedActor?.() ?? null;
  // A guarded share has no reactor yet; the guard who intercepts becomes it at the answer.
  const who = guarded ? { actorUuid: null, actorName: null, itemId: null, activityId: null, formula: null, guards: found.guards }
    : { actorUuid: actor.uuid, actorName: target.name ?? actor.name, itemId: found.item.id, activityId: found.activity?.id ?? null, formula: found.formula,
      // C1 — a multiplier row on any damage (Superior Hunter's Defense): the share halved, the pack's typed effect landed with the answer.
      ...(found.halve ? { halve: found.halve, uses: !!found.row.uses, lands: typedEffectFor(found.row, found.item, damages), clock: found.row.clock ?? null } : {}) };
  const flag = {
    status: "pending", ...who,
    reaction: found.name, label: found.row?.label ?? found.name,
    receiptId: receiptMessage.id, target: { uuid: target.uuid, name: target.name ?? actor.name },
    damages: packDamages(damages), multiplier, note: note ?? null, amount,
    sourceName: source?.name ?? null, answer: null, reduceBy: 0, applied: false,
    ...statContext(source?.uuid ?? null),
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
  };
  // Each guard may answer with its own row's word ("intercept", "cut"); one that can keep the defender up says so.
  const guardWords = guarded ? found.guards.map(g => `${g.actorName} may ${rowOf(g.reaction ?? found.name)?.verb ?? "intercept"}`).join(", ") : null;
  const keepsUp = guarded && found.guards.some(g => g.keepsUp);
  const message = await postCard({
    actor,
    card: bfCard({ img: guarded ? (resolveUuid(found.guards[0].actorUuid)?.items?.get(found.guards[0].itemId)?.img ?? null) : found.item.img,
      eyebrow: `Reaction — ${guarded ? [...new Set(found.guards.map(g => g.reaction ?? found.name))].join(" · ") : found.name}`, tone: "pending",
      title: `${target.name ?? actor.name} is about to take ${amount} damage`,
      subtitle: guarded ? `${guardWords}${source ? ` · from ${source.name}` : ""}` : (source ? `from ${source.name}` : "the damage waits for the answer"),
      lines: keepsUp ? [`<strong>A Reaction here can keep ${esc(target.name ?? actor.name)} from hitting 0 Hit Points.</strong>`] : [] }),
    flags: { [MODULE_ID]: { [HOLD_FLAG]: flag } }
  });
  if ( message ) armTimer(message);
}

/* --- the keeper: the author, or the GM when the author has gone -------------------------------- */


function armTimer(message) {
  armAskTimer(timers, message, HOLD_FLAG, live => queueFlagWrite(live, HOLD_FLAG, current => {
    if ( current.status !== "pending" ) return false;
    current.status = "resolved"; current.answer = "pass"; current.timedOut = true; current.answeredAt = Date.now();
  }), { owns: keeperOwns });
}

/* --- the answer ------------------------------------------------------------------------------- */

/**
 * One answer folded onto the hold (the keeper's write and the relay's fold share it). On a guarded
 * share the first guard to intercept becomes the reactor; it lands whole once every guard passed.
 */
function foldAnswer(current, { answer, reduceBy = 0, poolSpend = null, who = null }) {
  if ( current.status !== "pending" ) return false;
  if ( current.guards?.length ) {
    const guard = current.guards.find(g => g.actorUuid === who);
    if ( !guard || guard.passed ) return false;
    if ( answer !== "cast" ) {
      guard.passed = true;
      if ( current.guards.every(g => g.passed) ) Object.assign(current, { status: "resolved", answer: "pass", answeredAt: Date.now() });
      return;
    }
    Object.assign(current, { status: "resolved", answer, reduceBy: Number(reduceBy) || 0, poolSpend,
      actorUuid: guard.actorUuid, actorName: guard.actorName, itemId: guard.itemId, activityId: guard.activityId,
      formula: guard.formula, answeredAt: Date.now(),
      // The answering guard's own row names the receipt (Cutting Words beside Interception on one share).
      ...(guard.reaction ? { reaction: guard.reaction, label: rowOf(guard.reaction)?.label ?? guard.reaction } : {}) });
    return;
  }
  Object.assign(current, { status: "resolved", answer, reduceBy: Number(reduceBy) || 0, poolSpend, answeredAt: Date.now() });
}

/** What lands after the reduction, " — 5 → 2"; nothing when the share is unknown. */
const landedLine = (amount, by) => Number.isFinite(Number(amount)) ? ` — ${Number(amount)} → ${Math.max(0, Number(amount) - (Number(by) || 0))}` : "";

/** Cast: the roll in the open, the use and the Reaction spent HERE (their dice), the number folded or relayed. */
async function answerHold(message, answer, who = null) {
  if ( answering.has(message.id) ) return;
  answering.add(message.id);
  try {
    const flag = readFlag(message, HOLD_FLAG);
    if ( flag?.status !== "pending" ) return;
    // A guard answers for itself: its item, its formula, its Reaction.
    const guard = who ? (flag.guards ?? []).find(g => g.actorUuid === who) : null;
    if ( flag.guards?.length && !guard ) return;
    const mine = guard ?? flag;
    const actor = resolveUuid(mine.actorUuid);
    const key = mine.reaction ?? flag.reaction;
    let reduceBy = 0;
    let poolSpend = null;
    if ( (answer === "cast") && (actor instanceof Actor) ) {
      const item = actor.items.get(mine.itemId);
      const activity = item?.system?.activities?.get(mine.activityId) ?? null;
      const pool = activity ? poolOf(actor, activity) : null;
      if ( pool && !(Number(poolUsesOf(pool)?.value ?? 0) > 0) ) {
        ui.notifications.warn(`${TITLE}: ${actor.name} has no uses of ${(pool !== item) ? pool.name : (flag.label ?? key)} left.`);
        answer = "pass";
      } else if ( mine.bystander ) {
        // THE BYSTANDER'S DIE OFF THE DAMAGE (Cutting Words): rolled in the open, the use and the Reaction spent — the roll
        // half's receipts (hold/answer.js `bystanderReaction`), the number folded here.
        try {
          const roll = await new Roll(String(mine.formula)).evaluate();
          const rise = reductionRise({ roll: roll.toJSON(), from: actor.uuid, to: flag.target?.uuid ?? null, amount: flag.amount });
          await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${key} — off ${flag.target?.name ?? "the"}'s damage`,
            ...(rise ? { flags: { [MODULE_ID]: { diceRise: rise } } } : {}) });
          reduceBy = Math.max(0, Number(roll.total) || 0);
        } catch(err) {
          log.error(`${key}'s die could not be rolled — reduce by hand.`, err);
        }
        const row = INTERRUPT_ROLLS[key];
        if ( row?.uses && (pool ?? item) ) poolSpend = await spendPoolUses(actor, pool ?? item, key, 1, (pool && (pool !== item)) ? pool.name : null).catch(() => null);
        if ( row?.reaction ) await spendReaction(actor, { origin: item?.uuid ?? null, what: key });
      } else if ( mine.halve ) {
        // C1 — the multiplier's answer (Superior Hunter's Defense): the share halved, no roll; the Reaction (and a use) spent.
        const share = Math.floor(unpackDamages(flag.damages).reduce((n, d) => n + (Number(d.value) || 0), 0) * Number(flag.multiplier ?? 1));
        reduceBy = Math.max(0, share - Math.floor(share * Number(mine.halve)));
        if ( mine.uses && item ) await spendPoolUses(actor, item, flag.reaction).catch(() => null);
        await spendReaction(actor, { origin: item?.uuid ?? null, what: flag.reaction });
      } else if ( mine.ward ) {
        // B4 — the WARD absorbs (Projected Ward): as much of the share as the ward holds, spent from the ward's item.
        const wardItem = actor.items.get(mine.ward.itemId);
        const held = Number(wardItem?.system?.uses?.value ?? 0);
        const share = Math.floor(unpackDamages(flag.damages).reduce((n, d) => n + (Number(d.value) || 0), 0) * Number(flag.multiplier ?? 1));
        reduceBy = Math.max(0, Math.min(held, share));
        if ( reduceBy > 0 && wardItem ) {
          await wardItem.update({ "system.uses.spent": Number(wardItem.system.uses.spent ?? 0) + reduceBy });
          poolSpend = { pool: wardItem.name, spent: reduceBy, left: Math.max(0, held - reduceBy), max: Number(wardItem.system.uses.max ?? 0), ability: flag.reaction, actorUuid: actor.uuid, at: Date.now() };
        }
        await spendReaction(actor, { origin: item?.uuid ?? null, what: flag.reaction });
      } else {
        try {
          const roll = await new Roll(Roll.replaceFormulaData(String(mine.formula), actor.getRollData())).evaluate();
          // A reaction that modifies a roll: the dice rise off the reducer toward the protected.
          const rise = reductionRise({ roll: roll.toJSON(), from: actor.uuid, to: flag.target?.uuid ?? null, amount: flag.amount });
          await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${flag.label ?? flag.reaction} — the die, plus the modifier`,
            ...(rise ? { flags: { [MODULE_ID]: { diceRise: rise } } } : {}) });
          reduceBy = Math.max(0, Number(roll.total) || 0);
        } catch(err) {
          log.error(`${flag.label ?? flag.reaction}'s reduction could not be rolled — reduce by hand.`, err);
        }
        if ( pool ) poolSpend = await spendSuperiorityDie(actor, pool, flag.reaction).catch(() => null);
        await spendReaction(actor, { origin: item?.uuid ?? null, what: flag.reaction });
      }
    }
    if ( keepsMessage(message) ) {
      await queueFlagWrite(message, HOLD_FLAG, current => foldAnswer(current, { answer, reduceBy, poolSpend, who }));
      return;
    }
    const name = mine.actorName ?? actor?.name ?? "";
    await postAnswer("damageHoldAnswer", {
      actor,
      card: bfCard({ img: actor?.items.get(mine.itemId)?.img ?? null, eyebrow: `Reaction — ${flag.label ?? flag.reaction}`,
        tone: (answer === "cast") ? "good" : "neutral",
        title: (answer === "cast") ? `${flag.label ?? flag.reaction} — ${name} reduces the damage${guard ? ` to ${flag.target?.name}` : ""} by ${reduceBy}${landedLine(flag.amount, reduceBy)}`
          : guard ? `${name} lets it land` : `${name} takes it` }),
      flags: { [MODULE_ID]: { damageHoldAnswer: { messageId: message.id, answer, reduceBy, poolSpend, ...(who ? { who } : {}) } } }
    });
  } finally {
    answering.delete(message.id);
  }
}

registerRelay("damageHoldAnswer", {
  flagKey: HOLD_FLAG,
  targetOf: a => a.messageId,
  owns: (_flag, target) => keepsMessage(target),
  fold: (current, a) => foldAnswer(current, { answer: a.answer, reduceBy: a.reduceBy, poolSpend: a.poolSpend ?? null, who: a.who ?? null })
});

/* --- the landing: the keeper applies the share, short by the roll ------------------------------ */

async function landHeld(message) {
  if ( !(await claimLanding(message, HOLD_FLAG, current => current.status === "resolved")) ) return;
  const flag = readFlag(message, HOLD_FLAG);
  const receipt = game.messages.get(flag.receiptId) ?? message;
  const multiplier = Number(flag.multiplier ?? 1);
  let damages = unpackDamages(flag.damages);
  let note = flag.note ?? undefined;
  let applyMultiplier = multiplier;
  const by = Number(flag.reduceBy) || 0;
  if ( (flag.answer === "cast") && (by > 0) ) {
    // The save's multiplier first, then the reduction; the system's resistances apply as it lands.
    if ( multiplier !== 1 ) damages = damages.map(d => ({ ...d, value: Math.floor((Number(d.value) || 0) * multiplier) }));
    damages = reduceDamages(damages, by);
    applyMultiplier = 1;
    note = `${note ? `${note} · ` : ""}${flag.label ?? flag.reaction}${flag.guards?.length ? ` (${flag.actorName})` : ""} — reduced by ${by}`;
  }
  // THE LEDGER (ledger.js): a re-drive over a dead claim lands the share and its typed effect once.
  const steps = landingSteps(message, HOLD_FLAG, "land");
  try {
    const target = await resolveUuidAsync(flag.target?.uuid);
    await steps.step("damage", {
      witness: () => hitPointsOf(target),
      run: async () => { await applyDamagesWithReceipt(receipt, [flag.target], damages, { multiplier: applyMultiplier, ...(note ? { note } : {}), held: true }); }
    });
    // C1 — the multiplier's typed effect (Superior Hunter's Defense): the Resistance of that type on the reactor, for the turn.
    if ( (flag.answer === "cast") && flag.lands ) {
      const actor = resolveUuid(flag.actorUuid);
      const item = actor?.items?.get(flag.itemId) ?? null;
      if ( item ) await steps.step("effect", {
        witness: () => effectsNamed(target, flag.lands.name),
        run: async () => { await applyItemEffectOnHit(receipt, item, flag.lands, [flag.target], { clock: flag.clock ?? null, attacker: actor }); }
      }).catch(err => log.warn(`${flag.reaction}'s effect could not land — apply it by hand.`, err));
    }
  } finally {
    await queueFlagWrite(message, HOLD_FLAG, current => { current.applied = true; current.applying = false; closeLedger(current, "land"); });
  }
}

registerResumable(HOLD_FLAG, {
  pending: flag => (flag?.status === "resolved") && !flag.applied && !claimHolds(flag.applying),
  drives: (_flag, message) => keepsMessage(message),
  drive: landHeld
});

/* --- the popup and the card ------------------------------------------------------------------- */

/** A guard's button: the row's verb (Protective Field "Reduce"), Interception's "Intercept" by default. */
const verbLabel = row => { const v = row?.verb ?? "intercept"; return v.charAt(0).toUpperCase() + v.slice(1); };

/**
 * A bystander's own popup (Cutting Words' damage half; RULINGS *The asks widened*): the hit, the damage, the die off it; the
 * mutes unless this ask can keep the defender above 0 Hit Points — then the popup says so and offers no mute.
 */
async function showCutterPopup(message, guard, flag, actor, key, row) {
  const item = actor?.items.get(guard.itemId) ?? null;
  const activity = item?.system?.activities?.get(guard.activityId) ?? null;
  const pool = (activity ? poolOf(actor, activity) : null) ?? item;
  const left = Number(poolUsesOf(pool)?.value ?? 0);
  const tag = [row?.reaction ? "a Reaction" : null, row?.uses ? `${(pool && (pool !== item)) ? `${pool.name} ` : ""}${left} left` : null].filter(Boolean).join(" · ");
  const target = flag.target?.name ?? "the target";
  const mute = async until => {
    await muteBystander(actor, key, { img: item?.img ?? null, until }).catch(err => log.warn(`Could not mute ${key}.`, err));
    void answerHold(message, "pass", guard.actorUuid);
  };
  // THE CHOICES AS RADIOS (RULINGS *The asks widened*): cut, "Pass just this time" checked, the mutes (none on a down-saver); Apply.
  const rows = [{ key: "cast", name: `${verbLabel(row)} the damage`, dice: `−${guard.formula}`, tag: "", off: null, rule: row?.rule ?? "" }];
  await choicePopup(message, `${HOLD_FLAG}|${guard.actorUuid}`, actor, {
    title: `${key} — ${flag.sourceName ?? "the attacker"}'s hit on ${target}`, icon: "fa-solid fa-comment-dots", width: 460,
    content: bfCard({ img: item?.img ?? actor?.img ?? null, eyebrow: `Reaction — ${key}`, tone: "pending",
      title: `${flag.sourceName ?? "The attacker"} hits ${target} for ${flag.amount} — ${row?.verb ?? "cut"} the damage?`,
      subtitle: `within ${row?.bystander ?? "?"} ft of ${flag.sourceName ?? "the attacker"}${tag ? ` · ${tag}` : ""}`,
      lines: guard.keepsUp ? [`<strong>You can keep ${esc(target)} from hitting 0 Hit Points.</strong>`] : [] })
      + holdBarHTML(flag, "to answer"),
    name: "bf-cutter", rows, mutes: guard.keepsUp ? [] : muteScopesFor(actor),
    answer: choice => {
      if ( choice === "cast" ) { void answerHold(message, "cast", guard.actorUuid); return; }
      if ( choice.startsWith("mute-") ) { void mute((choice === "mute-turn") ? "turn" : "combat"); return; }
      void answerHold(message, "pass", guard.actorUuid);
    }
  });
}

/** A guard's own popup, keyed apart, closed by any intercept or its own pass. */
async function showGuardPopup(message, guard) {
  const flag = readFlag(message, HOLD_FLAG);
  if ( (flag?.status !== "pending") || guard.passed ) return;
  const actor = resolveUuid(guard.actorUuid);
  const key = guard.reaction ?? flag.reaction;
  if ( guard.bystander ) return showCutterPopup(message, guard, flag, actor, key, INTERRUPT_ROLLS[key]);
  const row = INTERRUPT_REDUCTIONS[key];
  await openMomentPopup(message, `${HOLD_FLAG}|${guard.actorUuid}`, actor, {
    title: `Reaction — ${flag.label ?? flag.reaction}`, icon: "fa-solid fa-shield-halved",
    content: bfCard({ img: actor?.items.get(guard.itemId)?.img ?? null, eyebrow: `Reaction — ${flag.label ?? flag.reaction}`, tone: "pending",
      title: `${flag.sourceName ?? "An attacker"} hits ${flag.target?.name} for ${flag.amount} — ${row?.verb ?? "intercept"}?`,
      subtitle: `${flag.target?.name} is ${(Number(row?.ally) > 5) ? `within ${row.ally} ft of you` : "beside you"} · a Reaction${row?.pool ? ` · a ${row.spend}` : ""}`,
      lines: [ruleLine(row?.rule ?? ""), `Reduce by ${esc(row?.by ?? guard.formula)}.`] })
      + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "cast", label: verbLabel(row), default: true, callback: () => { void answerHold(message, "cast", guard.actorUuid); } },
      { action: "pass", label: "Pass", callback: () => { void answerHold(message, "pass", guard.actorUuid); } }
    ]
  });
}

async function showPopup(message) {
  const flag = readFlag(message, HOLD_FLAG);
  if ( flag?.status !== "pending" ) return;
  if ( flag.guards?.length ) {
    for ( const guard of flag.guards ) if ( !guard.passed && canAnswerFor(resolveUuid(guard.actorUuid)) ) await showGuardPopup(message, guard);
    return;
  }
  const actor = resolveUuid(flag.actorUuid);
  const row = INTERRUPT_REDUCTIONS[flag.reaction];
  const pool = actor?.items.get(flag.itemId);
  const left = Number(pool?.system?.uses?.value ?? 0), max = Number(pool?.system?.uses?.max ?? 0);
  await openMomentPopup(message, HOLD_FLAG, actor, {
    title: `Reaction — ${flag.label ?? flag.reaction}`, icon: "fa-solid fa-shield-halved",
    content: bfCard({ img: pool?.img ?? null, eyebrow: `Reaction — ${flag.label ?? flag.reaction}`, tone: "pending",
      title: `${flag.label ?? flag.reaction} — ${flag.actorName} may reduce ${flag.amount} damage`,
      subtitle: `${flag.sourceName ? `from ${flag.sourceName} · ` : ""}a Reaction${max > 0 ? ` · ${left} of ${max} uses left` : ""}`,
      lines: [ruleLine(row?.rule ?? INTERRUPT_MULTIPLIERS[flag.reaction]?.rule ?? ""), flag.halve ? `The damage is halved.` : `Reduce by ${esc(row?.by ?? flag.formula)}.`] })
      + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "cast", label: flag.label ?? flag.reaction, default: true, callback: () => { void answerHold(message, "cast"); } },
      { action: "pass", label: "Take it", callback: () => { void answerHold(message, "pass"); } }
    ]
  });
}

/** The card's line — source, then result. */
function holdLine(flag) {
  const guarded = !!flag.guards?.length;
  const to = guarded ? ` to ${flag.target?.name}` : "";
  if ( flag.answer === "cast" ) return `${flag.label ?? flag.reaction} — ${flag.actorName} reduces the damage${to} by ${flag.reduceBy}${landedLine(flag.amount, flag.reduceBy)}`;
  if ( flag.answer === "pass" ) return `${guarded ? flag.target?.name : flag.actorName} takes the damage${flag.timedOut ? " (timer)" : ""}`;
  if ( guarded ) return `${flag.guards.filter(g => !g.passed).map(g => `${g.reaction ?? flag.label ?? flag.reaction} (${g.actorName})`).join(" or ")} may reduce ${flag.amount} damage${to}; it waits for the answer`;
  return `${flag.label ?? flag.reaction} — ${flag.actorName} may reduce ${flag.amount} damage; it waits for the answer`;
}

listen("dnd5e.renderChatMessage", "damage-holds", (message, html) => {
  try {
    const flag = readFlag(message, HOLD_FLAG);
    if ( !flag ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-damage-hold-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-damage-hold-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-shield-halved" data-tooltip="${esc(flag.label ?? flag.reaction)}"></i> ${esc(holdLine(flag))}`;
    if ( flag.status === "pending" ) {
      const actor = resolveUuid(flag.actorUuid);
      const mayAnswer = flag.guards?.length
        ? flag.guards.some(g => !g.passed && canAnswerFor(resolveUuid(g.actorUuid))) : canAnswerFor(actor);
      pendingRow(message, div, {
        bar: holdBarHTML(flag, "to answer"),
        latch: mayAnswer && { sub: HOLD_FLAG, show: () => showPopup(message) },
        answer: mayAnswer && "Answer",
        arm: armTimer
      });
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The damage hold's line could not render.`, err); }
});

// An answer anywhere closes the popup everywhere; the clock stands down with it.
listen("updateChatMessage", "damage-holds", message => {
  const flag = readFlag(message, HOLD_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armTimer(message); closeGuardPopups(message, flag, false); return; }
  disarmAskTimer(timers, message.id);
  void closePopup(message, HOLD_FLAG);
  closeGuardPopups(message, flag, true);
});

/** The guards' own popups: every one once the share is answered, a passed guard's at once. */
function closeGuardPopups(message, flag, all) {
  for ( const guard of (flag?.guards ?? []) ) {
    if ( !all && !guard.passed ) continue;
    void closePopup(message, `${HOLD_FLAG}|${guard.actorUuid}`);
  }
}

listen("deleteChatMessage", "damage-holds", message => { disarmAskTimer(timers, message.id); });
