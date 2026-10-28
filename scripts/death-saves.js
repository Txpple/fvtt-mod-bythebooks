/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): THE DEATH SAVING THROW. A creature at 0 Hit Points that makes death
 * saves (a player character; an NPC marked important, the system's own population) owes one at the start of each of
 * its turns, and the module asks for it: a card for the table, the system's own roll dialog for whoever owns the
 * creature (Players Roll Their Own Saves: a prompt, or the dice at once on the roller's client), the Decision Timer
 * rolling for anyone who walks away. The roll is the sheet's (`Actor5e#rollDeathSave`, the skull on the sheet, so a
 * roll made there answers the card too): the system writes the tally, the 1 Hit Point on a 20 and Dead at the third
 * failure in combat; the card says what happened, and every screen hears a 1, a 20, Stable and death. The third
 * success presses the system's own Stable status, which it defines and never applies, with its `autoDowned` flag so
 * the heal removes it; a Stable creature is asked nothing. Damage at 0 Hit Points ends Stable and is a failure (two
 * from a Critical Hit, death when the damage meets the maximum), written on the applying client with a card and a
 * Revert. Out of combat the system presses no status at three failures; the module presses its mapping as
 * drop-to-one.js does at the drop. The precedents are the saves machine's demand (the dialog adopted) and the
 * turn-start grant (the driver, the place).
 */
import { MODULE_ID, readFlag, drivesMomentFor, canAnswerFor, keepsMessage, canApplyTo, rollerUserFor, leadsWindow,
  statContext, decisionWindow, queueFlagWrite, resolveUuid, resolveUuidAsync, savesRollThemselves, log } from "./core.js";
import { d20FactsOf } from "./lookup.js";
import { clearStatus, deathSaveFoldOf } from "./shared.js";
import { subKindOf, originData } from "./decide/card.js";
import { bfCard, esc, holdBarHTML, ruleLine, popupKey } from "./decide/present.js";
import { downedOutcome } from "./decide/drop-to-one.js";
import { DEATH_SAVE_RULE, makesDeathSaves, deathSaveOwed, deathSaveDue, deathSaveResult, damageAtZero, foldedDeathSave, deathSaveTally,
  deathSaveAsk, deathSaveToast, deathSaveFloat, damageAtZeroWords, deathSaveCardLine } from "./decide/death-saves.js";
import { armAskTimer, disarmAskTimer, subjectOwns, pendingRow, closePopup, frontPopup, adoptManagedPopup, DialogCarried,
  scheduleBarSync, postCard, dramaticVerdictPause, momentButton, registerWithheld } from "./ui.js";
import { tokensOf } from "./geometry.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";

const DEATH_FLAG = "deathSave";
/** On the roll's own card: which card it answers, and whether the buzzer rolled it. */
const ROLL_FLAG = "deathSaveRoll";
/** On the roll's own card: its withheld tally is written (the `death-save` machine). */
const ROLL_WRITTEN = "deathSaveWritten";
const HP = "system.attributes.hp.value";
const FAILURE = "system.attributes.death.failure";

const timers = new Map();
/** The turns this client has asked on: `combat|round|turn|actor`. The log is the durable copy. */
const asked = new Set();
/** Dialogs between the call and the render that enrols them. */
const opening = new Set();
/** Cards whose roll this client has in flight (the render's latch and the buzzer can volunteer in one tick). */
const rolling = new Set();
/** Damage at 0 Hit Points, stamped before the write and read after it: actor uuid → the facts. */
const atZero = new Map();
/** The roll cards and damage cards this client has already said. */
const told = new Set();

/* --- the readers ---------------------------------------------------------------------------------------------- */

const hpOf = actor => Number(actor?.system?.attributes?.hp?.value ?? 0) || 0;
const hpMaxOf = actor => Number(actor?.system?.attributes?.hp?.effectiveMax ?? actor?.system?.attributes?.hp?.max ?? 0) || 0;
const tallyOf = actor => ({
  success: Number(actor?.system?.attributes?.death?.success ?? 0) || 0,
  failure: Number(actor?.system?.attributes?.death?.failure ?? 0) || 0
});
/** The creature as decide/death-saves.js reads it. */
const factsOf = actor => ({ type: actor.type, important: !!actor.system?.traits?.important, hp: hpOf(actor),
  dead: actor.statuses?.has?.("dead") ?? false, stable: actor.statuses?.has?.("stable") ?? false, ...tallyOf(actor) });
/** The card still waiting for this creature's roll, if any stands in the log. */
const pendingCardFor = uuid => game.messages.contents.findLast(m => {
  const f = readFlag(m, DEATH_FLAG);
  return (f?.status === "pending") && (f.actorUuid === uuid);
}) ?? null;
const askedAt = place => game.messages.contents.some(m => readFlag(m, DEATH_FLAG)?.place === place);
/** The actor a system roll card speaks for. */
const cardActorOf = message => message?.getAssociatedActor?.() ?? null;
/** The system's death save card: a `save` whose `system.type` is `death` (decide/card.js). */
const isDeathCard = message => subKindOf(message) === "death";
/** A roll of the creature's made since the ask: its fold is on the way, so the ask is not moot (a 20's heal replicates first). */
const rollInFlightFor = (card, flag) => game.messages.contents.some(m => isDeathCard(m) && (m.timestamp >= (card.timestamp ?? 0))
  && (cardActorOf(m)?.uuid === flag.actorUuid));

/* --- the ask at the turn start ------------------------------------------------------------------------------- */

// The turn moved: the current combatant, if it owes a Death Saving Throw, is asked on its driver, once per turn.
listen("updateCombat", "death-saves", (combat, changes, options) => {
  try {
    if ( !("turn" in changes) && !("round" in changes) ) return;
    if ( !combat.started || (options?.direction === -1) ) return;
    const actor = combat.combatant?.actor ?? null;
    if ( !(actor instanceof Actor) || !drivesMomentFor(actor.uuid) ) return;
    const place = `${combat.id}|${combat.round}|${combat.turn}|${actor.uuid}`;
    const due = deathSaveDue({ ...factsOf(actor), pending: !!pendingCardFor(actor.uuid), asked: asked.has(place) || askedAt(place) });
    if ( !due.due ) return;
    asked.add(place);
    void ask(actor, combat, place);
  } catch(err) {
    log.error(`The Death Saving Throw could not be asked — roll it from the sheet.`, err);
  }
});

/** The card: public, spoken by the creature, the clock on it. */
async function ask(actor, combat, place) {
  try {
    const window = decisionWindow();
    const { success, failure } = tallyOf(actor);
    const words = deathSaveAsk({ name: actor.name, success, failure, round: combat.round });
    await postCard({
      actor,
      card: bfCard({ img: actor.img ?? null, eyebrow: "Death saving throw", tone: "pending", title: words.title, subtitle: words.subtitle,
        lines: [ruleLine(DEATH_SAVE_RULE)] }),
      flags: { [MODULE_ID]: { [DEATH_FLAG]: { status: "pending", cause: "turn", place, combatId: combat.id, round: combat.round, turn: combat.turn,
        actorUuid: actor.uuid, actorName: actor.name, before: { success, failure }, ...statContext(actor.uuid),
        ...(window ? { window, deadline: Date.now() + (window * 1000) } : {}) } } }
    });
  } catch(err) {
    log.error(`The Death Saving Throw's card could not post — roll it from the sheet.`, err);
  }
}

/** The creature while it still owes the card's roll, else null; a card whose roll is no longer owed is settled moot on its keeper. */
async function owedBy(card) {
  const flag = readFlag(card, DEATH_FLAG);
  if ( flag?.status !== "pending" ) return null;
  const actor = await resolveUuidAsync(flag.actorUuid);
  if ( !(actor instanceof Actor) ) return null;
  const owed = deathSaveOwed(factsOf(actor));
  // A roll made since the ask answers it, its tally on the way (a d20 fold's offer withholds it): never a second roll.
  if ( rollInFlightFor(card, flag) ) return null;
  if ( owed.owed ) return { flag, actor };
  if ( keepsMessage(card) ) await settleMoot(card, owed.why);
  return null;
}

const settleMoot = (card, why) => queueFlagWrite(card, DEATH_FLAG, current => {
  if ( current.status !== "pending" ) return false;
  Object.assign(current, { status: "moot", why, answeredAt: Date.now() });
});

/** A heal, a death or Stable landing while the card waits: the keeper settles it moot. */
function settleIfMoot(card) {
  const flag = readFlag(card, DEATH_FLAG);
  if ( (flag?.status !== "pending") || !keepsMessage(card) ) return;
  const actor = resolveUuid(flag.actorUuid);
  if ( !(actor instanceof Actor) ) return;
  const owed = deathSaveOwed(factsOf(actor));
  if ( owed.owed || rollInFlightFor(card, flag) ) return;
  void settleMoot(card, owed.why).catch(err => log.warn(`The Death Saving Throw's card could not be settled.`, err));
}

listen("updateActor", "death-saves", (actor, changes) => {
  try {
    if ( !(actor instanceof Actor) || !foundry.utils.hasProperty(changes, HP) ) return;
    const card = pendingCardFor(actor.uuid);
    if ( card ) settleIfMoot(card);
  } catch(err) { log.warn(`The Death Saving Throw's card could not be checked.`, err); }
});

listen("createActiveEffect", "death-saves", effect => {
  try {
    const actor = effect?.parent;
    if ( !(actor instanceof Actor) || !(effect.statuses?.has?.("dead") || effect.statuses?.has?.("stable")) ) return;
    const card = pendingCardFor(actor.uuid);
    if ( card ) settleIfMoot(card);
  } catch(err) { log.warn(`The Death Saving Throw's card could not be checked.`, err); }
});

/* --- the roll: the system's dialog on the owner's client, or the dice at once -------------------------------- */

/** The roll's message data: chained to the card, the card named, the buzzer's mark. */
const rollData = (card, timedOut) => ({ data: { ...originData(card.id),
  flags: { [MODULE_ID]: { [ROLL_FLAG]: { cardId: card.id, ...(timedOut ? { timedOut: true } : {}) } } } } });

/** The system's own dialog for the card's creature, adopted as the moment's popup; dismissing it is not an answer. */
async function openDeathDialog(card) {
  if ( frontPopup(card, DEATH_FLAG) ) return;
  const key = popupKey(card.id, DEATH_FLAG);
  if ( opening.has(key) ) return;
  opening.add(key);
  try {
    const owed = await owedBy(card);
    if ( !owed?.actor?.isOwner ) return;
    await owed.actor.rollDeathSave({}, { configure: true, options: { bfDeathSave: new DialogCarried({ cardId: card.id }) } }, rollData(card, false));
  } catch(err) {
    log.error(`The Death Saving Throw's dialog failed — roll it from the sheet.`, err);
  } finally {
    opening.delete(key);
  }
}

/** The ask above the dialog's configuration, the bar with it. */
function drawDeathAsk(app, element, carried) {
  const card = game.messages.get(carried.cardId);
  if ( !card ) return;
  const flag = readFlag(card, DEATH_FLAG);
  // ⚠ Withdrawn before this first render: close here, the answered-popup sweep already ran.
  if ( flag?.status !== "pending" ) { void app.close(); return; }
  adoptManagedPopup(popupKey(card.id, DEATH_FLAG), card, app);
  if ( element.querySelector("[data-bf-death-save]") ) return;
  const actor = resolveUuid(flag.actorUuid);
  const words = deathSaveAsk({ name: flag.actorName, success: flag.before?.success ?? 0, failure: flag.before?.failure ?? 0, round: flag.round ?? null });
  const host = document.createElement("div");
  host.innerHTML = `<fieldset data-bf-death-save><legend>The demand</legend>${bfCard({
    img: actor?.img ?? null, eyebrow: "Death saving throw", tone: "pending", title: words.title, subtitle: words.subtitle,
    lines: ["10 or higher is a success; a 20 brings you back with 1 Hit Point; a 1 is two failures.", ruleLine(DEATH_SAVE_RULE)]
  })}${holdBarHTML(flag, "to roll")}</fieldset>`;
  const fieldset = host.firstElementChild;
  const configuration = element.querySelector(SURFACES.dialogConfiguration);
  if ( configuration ) configuration.insertAdjacentElement("beforebegin", fieldset);
  else element.querySelector("form")?.prepend(fieldset);
  scheduleBarSync(element);
}

// On every render (the dropdowns re-render); the entry order keeps polish.js and reminders.js first.
listen("renderRollConfigurationDialog", "death-saves", (app, element) => {
  try {
    const carried = app.options?.bfDeathSave ?? null;
    if ( carried ) drawDeathAsk(app, element, carried);
  } catch(err) {
    log.error(`The Death Saving Throw's section failed to draw.`, err);
  }
});

/** The dice at once, no dialog: the auto roll on the roller's client, and the buzzer's roll on the clock's owner. */
async function rollItself(card, { timedOut = false } = {}) {
  if ( rolling.has(card.id) ) return;
  rolling.add(card.id);
  try {
    const owed = await owedBy(card);
    if ( !owed?.actor?.isOwner ) return;
    await owed.actor.rollDeathSave({}, { configure: false }, rollData(card, timedOut));
  } catch(err) {
    log.error(`The Death Saving Throw did not roll — roll it from the sheet.`, err);
  } finally {
    rolling.delete(card.id);
  }
}

/** The buzzer: expiry ROLLS (a mandatory roll), on the creature's driver. */
function armDeathTimer(message) {
  armAskTimer(timers, message, DEATH_FLAG, live => rollItself(live, { timedOut: true }), { owns: subjectOwns(f => f.actorUuid) });
}

/* --- the withheld roll: a d20 fold offered on it (d20-folds.js) -------------------------------------------------- */

/** The roll as it stands after its folds, when a fold was offered on it; else null. */
function foldedOf(message) {
  const flag = deathSaveFoldOf(message);
  const roll = message?.rolls?.[0];
  if ( !flag || !roll ) return null;
  return foldedDeathSave({ base: { total: Number(roll.total) || 0, isCritical: roll.isCritical === true, isFumble: roll.isFumble === true },
    target: Number(flag.dc ?? roll.options?.target ?? 10) || 10, foldedTotal: flag.foldedTotal ?? null, spends: flag.spends ?? [] });
}

/** Writing a withheld roll's tally: one writer per card on this client. */
const writing = new Set();

/**
 * The system's own steps after the roll (`Actor5e#rollDeathSave`), run once the fold's offer is answered: the tally from the
 * roll as it now stands, the card's deltas and outcome (every client then says the result), and `dnd5e.postRollDeathSave`.
 */
registerWithheld("death-save", {
  resume: async (ctx, message) => {
    if ( !message?.id || writing.has(message.id) ) return;
    if ( readFlag(message, ROLL_WRITTEN) ) return;
    writing.add(message.id);
    try {
      const actor = await resolveUuidAsync(ctx?.uuid ?? cardActorOf(message)?.uuid);
      if ( !(actor instanceof Actor) ) return;
      const owed = deathSaveOwed(factsOf(actor));
      if ( !owed.owed ) { log.warn(`${actor.name}'s Death Saving Throw was not written — ${owed.why}.`); return; }
      const roll = message.rolls?.[0];
      const folded = foldedOf(message) ?? { isSuccess: (Number(roll?.total) || 0) >= (Number(roll?.options?.target ?? 10) || 10),
        isCritical: roll?.isCritical === true, isFumble: roll?.isFumble === true };
      // The system's own arithmetic where it has it; the same rule here where it does not.
      const fields = globalThis.dnd5e?.dataModels?.actor?.AttributesFields;
      const { outcome, updates } = (typeof fields?.applyDeathSaveResult === "function")
        ? fields.applyDeathSaveResult(actor.system.attributes.death, folded) : deathSaveTally(tallyOf(actor), folded);
      // The card's deltas as the system computes them (its field class, reached through the save card's schema).
      const deltasField = CONFIG.ChatMessage?.dataModels?.save?.schema?.fields?.deltas?.constructor;
      const deltas = (typeof deltasField?.getDeltas === "function") ? deltasField.getDeltas(actor, { actor: updates, item: [] }) : null;
      await message.setFlag(MODULE_ID, ROLL_WRITTEN, true);
      if ( Object.keys(updates).length ) await actor.update(updates);
      await message.update({ ...(deltas ? { "system.deltas": deltas } : {}), "system.outcome": outcome ?? null });
      Hooks.callAll("dnd5e.postRollDeathSave", message.rolls ?? [], { message, subject: actor });
    } catch(err) {
      log.error(`The Death Saving Throw could not be written after its fold — tick it on the sheet.`, err);
    } finally {
      writing.delete(message.id);
    }
  }
});

/* --- the fold: the roll's card answers the ask ------------------------------------------------------------------ */

/** The system's card, with its outcome and the sheet's tally, as plain facts. */
function resultOf(message, actor) {
  const roll = message.rolls?.[0];
  if ( !roll ) return null;
  const facts = d20FactsOf(roll);
  // A fold on the roll: the total it composed, and the natural that stands (a reroll's 20 or 1, the roll's own else).
  const folded = foldedOf(message);
  const total = folded ? folded.total : (Number(roll.total) || 0);
  const face = !folded ? (facts.kept ?? null)
    : folded.isCritical ? (facts.critAt ?? 20) : folded.isFumble ? (facts.fumbleAt ?? 1)
    : ((deathSaveFoldOf(message)?.spends ?? []).some(s => s?.reroll || s?.twenty) ? null : (facts.kept ?? null));
  return { ...deathSaveResult({ face, total, target: Number(roll.options?.target ?? 10) || 10,
    critAt: facts.critAt, fumbleAt: facts.fumbleAt, outcome: message.system?.outcome ?? null, ...tallyOf(actor) }),
    face, total };
}

// The system updates its card with the deltas and the outcome once the sheet is written: every client says the result,
// and the card's keeper folds it onto the ask.
listen("updateChatMessage", "death-saves", (message, changes) => {
  try {
    if ( !isDeathCard(message) || !changes?.system || (!("deltas" in changes.system) && !("outcome" in changes.system)) ) return;
    const actor = cardActorOf(message);
    if ( !(actor instanceof Actor) ) return;
    const result = resultOf(message, actor);
    if ( !result ) return;
    void tell(message, actor, result);
    const stamp = readFlag(message, ROLL_FLAG);
    const card = (stamp?.cardId ? game.messages.get(stamp.cardId) : null) ?? pendingCardFor(actor.uuid);
    if ( !card || !keepsMessage(card) ) return;
    void queueFlagWrite(card, DEATH_FLAG, current => {
      if ( current.status !== "pending" ) return false;
      Object.assign(current, { status: "resolved", rollMessageId: message.id, face: result.face, total: result.total, result: result.result,
        natural: result.natural, outcome: result.outcome, after: { success: result.success, failure: result.failure },
        timedOut: !!stamp?.timedOut, answeredAt: Date.now() });
    }).catch(err => log.error(`The Death Saving Throw could not be recorded on its card.`, err));
  } catch(err) {
    log.error(`The Death Saving Throw's result could not be read.`, err);
  }
});

// On the rolling client, after the system's writes: the third success presses Stable (the system's own status, which it
// never applies), and a third failure out of combat presses Dead (the system presses it in combat alone).
listen("dnd5e.postRollDeathSave", "death-saves", (_rolls, data) => {
  try {
    const actor = data?.subject;
    if ( !(actor instanceof Actor) ) return;
    const outcome = data?.message?.system?.outcome ?? null;
    if ( outcome === "stable" ) void markStable(actor);
    else if ( (outcome === "death") && !actor.inCombat ) void downOutOfCombat(actor);
  } catch(err) {
    log.error(`The Death Saving Throw's outcome could not be pressed — set the status by hand.`, err);
  }
});

/** The system's Stable status, flagged as its downed statuses are so the heal removes it. */
async function markStable(actor) {
  try {
    if ( !canApplyTo(actor) || actor.statuses?.has?.("stable") ) return;
    const effect = await ActiveEffect.implementation.fromStatusEffect("stable");
    effect.updateSource({ flags: { dnd5e: { autoDowned: true } } });
    await ActiveEffect.implementation.create(effect, { parent: actor, keepId: true });
  } catch(err) {
    log.warn(`Stable could not be pressed on ${actor.name} — set it by hand.`, err);
  }
}

/** Out of combat, the third failure: dnd5e's own mapping under its own setting, with its flag (RULINGS *Session zero's combat*). */
async function downOutOfCombat(actor) {
  try {
    if ( !canApplyTo(actor) ) return;
    const conditions = actor.effects.filter(e => e.type === "condition" || e.statuses?.size);
    const toApply = downedOutcome({ setting: game.settings.get("dnd5e", "autoApplyDowned"), type: actor.type,
      important: !!actor.system?.traits?.important, failedDeathSaves: true,
      isDead: conditions.some(e => e.statuses?.has?.("dead")), isUnconscious: conditions.some(e => e.statuses?.has?.("unconscious")) });
    if ( toApply !== "dead" ) return;
    const effect = await ActiveEffect.implementation.fromStatusEffect("dead");
    if ( actor.statuses?.has?.("dead") ) return;
    effect.updateSource({ flags: { dnd5e: { autoDowned: true }, core: { overlay: true } } });
    await ActiveEffect.implementation.create(effect, { parent: actor, keepId: true });
  } catch(err) {
    log.warn(`Dead could not be pressed on ${actor.name} out of combat — set it by hand.`, err);
  }
}

/* --- every screen hears it ------------------------------------------------------------------------------------- */

/** Display only, once per card, live updates only: the notice and the float over the creature's token. */
async function tell(message, actor, result) {
  if ( told.has(message.id) ) return;
  told.add(message.id);
  try {
    await dramaticVerdictPause(message);
    const toast = deathSaveToast({ name: actor.name, ...result });
    if ( toast ) ui.notifications?.[toast.level]?.(toast.text);
    floatOver(actor, deathSaveFloat(result));
  } catch(err) { log.warn(`The Death Saving Throw's notice could not show.`, err); }
}

function floatOver(actor, { text, fill }) {
  if ( !canvas?.interface?.createScrollingText ) return;
  for ( const token of tokensOf(actor) ) {
    if ( !token.visible || token.document.isSecret ) continue;
    canvas.interface.createScrollingText(token.center, text, {
      anchor: CONST.TEXT_ANCHOR_POINTS.CENTER, direction: CONST.TEXT_ANCHOR_POINTS.TOP,
      distance: 2 * token.h, fontSize: 28, fill, stroke: 0x000000, strokeThickness: 4, jitter: 0.25
    });
  }
}

/* --- damage at 0 Hit Points: a failure on the applying client -------------------------------------------------- */

/** Was the damage a Critical Hit? Its own card's rolls say. */
const criticalOf = options => !!(options?.originatingMessage?.rolls ?? []).some(r => r?.isCritical === true);

// Before the write, with the Hit Points still as they were: damage reaching a creature already at 0 is stamped.
listen("dnd5e.preApplyDamage", "death-saves", (actor, amount, _updates, options) => {
  try {
    if ( !(actor instanceof Actor) || !makesDeathSaves({ type: actor.type, important: !!actor.system?.traits?.important }) ) return;
    if ( (hpOf(actor) > 0) || actor.statuses?.has?.("dead") || !(Number(amount) > 0) ) return;
    const temp = Number(actor.system?.attributes?.hp?.temp ?? 0) || 0;
    if ( !(Number(amount) - Math.min(temp, Number(amount)) > 0) ) return;   // the Temporary Hit Points took it all
    atZero.set(actor.uuid, { amount: Number(amount), critical: criticalOf(options), max: hpMaxOf(actor),
      sourceUuid: options?.originatingMessage?.getAssociatedActor?.()?.uuid ?? null });
  } catch(err) {
    log.error(`Damage at 0 Hit Points could not be read.`, err);
  }
});

// After the write: the failure, on the client that applied the damage.
listen("dnd5e.applyDamage", "death-saves", actor => {
  const hit = atZero.get(actor?.uuid);
  if ( !hit ) return;
  atZero.delete(actor.uuid);
  void failAtZero(actor, hit);
});

/** Stable ends, the failure is written (two from a Critical Hit, death when the damage meets the maximum), the card says it. */
async function failAtZero(actor, hit) {
  try {
    if ( !canApplyTo(actor) ) return;
    const wasStable = actor.statuses?.has?.("stable") ?? false;
    if ( wasStable ) await clearStatus(actor, "stable");
    const before = tallyOf(actor);
    const verdict = damageAtZero({ failure: before.failure, critical: hit.critical, amount: hit.amount, max: hit.max });
    await actor.update({ [FAILURE]: verdict.failure });
    if ( (verdict.outcome === "death") && !actor.inCombat ) await downOutOfCombat(actor);
    const words = damageAtZeroWords({ name: actor.name, amount: hit.amount, critical: hit.critical, wasStable, success: before.success, ...verdict });
    await postCard({
      actor,
      card: bfCard({ img: actor.img ?? null, eyebrow: "Damage at 0 Hit Points", tone: verdict.outcome ? "bad" : "neutral",
        title: words.title, subtitle: words.subtitle, lines: [ruleLine(DEATH_SAVE_RULE)] }),
      flags: { [MODULE_ID]: { [DEATH_FLAG]: { status: "resolved", cause: "damage", actorUuid: actor.uuid, actorName: actor.name,
        amount: hit.amount, critical: hit.critical, massive: verdict.massive, wasStable, steps: verdict.steps, result: "failure",
        outcome: verdict.outcome, before, after: { success: before.success, failure: verdict.failure }, applied: true,
        ...statContext(hit.sourceUuid) } } }
    });
  } catch(err) {
    log.error(`The failure for damage at 0 Hit Points could not be written — tick it on the sheet.`, err);
  }
}

// The damage card lands: every screen says it.
listen("createChatMessage", "death-saves", message => {
  try {
    const flag = readFlag(message, DEATH_FLAG);
    if ( (flag?.cause !== "damage") || told.has(message.id) ) return;
    told.add(message.id);
    const actor = resolveUuid(flag.actorUuid);
    const words = damageAtZeroWords({ name: flag.actorName, amount: flag.amount, critical: !!flag.critical, wasStable: !!flag.wasStable,
      failure: flag.after?.failure ?? 0, steps: flag.steps ?? 1, massive: !!flag.massive, outcome: flag.outcome ?? null, success: flag.after?.success ?? 0 });
    ui.notifications?.[words.toast.level]?.(words.toast.text);
    if ( actor instanceof Actor ) floatOver(actor, words.float);
  } catch(err) { log.warn(`The damage at 0 Hit Points could not be announced.`, err); }
});

/** Revert the tick (R5): the tally back to what it was, Dead off if the tick pressed it; Stable is not put back. */
async function revertAtZero(message) {
  try {
    const flag = readFlag(message, DEATH_FLAG);
    const actor = resolveUuid(flag?.actorUuid);
    if ( (flag?.cause !== "damage") || flag.reverted || !(actor instanceof Actor) || !canApplyTo(actor) ) return;
    if ( flag.outcome === "death" ) await clearStatus(actor, "dead");
    await actor.update({ [FAILURE]: Number(flag.before?.failure ?? 0) || 0 });
    await queueFlagWrite(message, DEATH_FLAG, current => {
      if ( current.reverted ) return false;
      current.reverted = true;
    });
  } catch(err) {
    log.error(`The tick could not be reverted — set the tally on the sheet.`, err);
  }
}

/* --- the card's line ------------------------------------------------------------------------------------------- */

listen("dnd5e.renderChatMessage", "death-saves", (message, html) => {
  try {
    const flag = readFlag(message, DEATH_FLAG);
    if ( !flag ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-death-save-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-death-save-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-skull" data-tooltip="Death Saving Throw"></i> ${esc(deathSaveCardLine(flag))}`;
    if ( flag.status === "pending" ) {
      settleIfMoot(message);
      const actor = resolveUuid(flag.actorUuid);
      if ( savesRollThemselves() ) {
        // Rolled automatically: the elected roller rolls once, no popup and no button.
        const rolls = (actor instanceof Actor) && (rollerUserFor(actor)?.isSelf ?? false) && leadsWindow();
        pendingRow(message, div, { bar: holdBarHTML(flag, "to roll"), latch: rolls && { sub: DEATH_FLAG, show: () => rollItself(message) }, arm: armDeathTimer });
      } else {
        const may = canAnswerFor(actor);
        pendingRow(message, div, {
          bar: holdBarHTML(flag, "to roll"),
          latch: may && { sub: DEATH_FLAG, show: () => openDeathDialog(message) },
          answer: may && "Roll",
          arm: armDeathTimer
        });
      }
    } else if ( (flag.cause === "damage") && !flag.reverted && canApplyTo(resolveUuid(flag.actorUuid)) ) {
      div.appendChild(momentButton("Revert", () => { void revertAtZero(message); }));
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The Death Saving Throw's line could not render.`, err); }
});

// An answer anywhere closes the dialog everywhere (law 4); the clock stands down with it.
listen("updateChatMessage", "death-saves", message => {
  const flag = readFlag(message, DEATH_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armDeathTimer(message); return; }
  disarmAskTimer(timers, message.id);
  void closePopup(message, DEATH_FLAG);
});

listen("deleteChatMessage", "death-saves", message => { disarmAskTimer(timers, message.id); });
