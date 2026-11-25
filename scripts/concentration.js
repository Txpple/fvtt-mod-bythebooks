/**
 * By the Books — the concentration assist (a machine, ARCHITECTURE.md §7): damage → ask → roll →
 * verdict → break. The save is mandatory: one answer (roll), and the clock's expiry rolls. A
 * failure presses `endConcentration`, whose `dependentOn` cascade strips every riding effect.
 * ⚠ dnd5e never ends concentration at 0 HP or on Incapacitated; this machine does (no save).
 */
import { MODULE_ID, readFlag, TITLE, S, setting, rollerUserFor, leadsWindow, canAnswerFor, drivesMomentFor, canApplyTo, whisperNoGM, statContext, decisionWindow, savesRollThemselves, ownersAndGmIds, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { cardItem, featureNamed, lower, wieldedNamed } from "./lookup.js";
import { concentrationEnding, CONCENTRATION_ASKED, rollConfigFor } from "./shared.js";
import { concentrationExemptEntries, damageRuleEntries, listedNames } from "./decide/registry.js";
import { CONCENTRATION_EXEMPTS, DAMAGE_RULES } from "./decide/registry.js";
import { ruleLine } from "./decide/present.js";
import { popupKey, bfCard, esc, holdBarHTML } from "./decide/present.js";
import { DialogCarried, armAskTimer, disarmAskTimer, electOwns, dramaticVerdictPause, registerDemand, demandAnsweredBy, registerWithheld, withholds,
  pendingRow, forgetShown, closePopup, frontPopup, postCard, confirmPopup } from "./ui.js";
import { SAVE_FOLDS, foldedSave, foldsFrom } from "./decide/verdict.js";
import { SURFACES } from "./surfaces.js";
import { isConcentrationPrompt } from "./decide/card.js";
import { listen } from "./dispatch.js";

/**
 * What last hit whom, for the ask card: preApplyDamage is the one seam that knows the message.
 * ⚠ Healing rides the same hook, hence the amount > 0 guard.
 */
const recentDamageCauses = new Map();

/**
 * The GM-private roll mode, by Foundry 14's id. ⚠ `CONST.DICE_ROLL_MODES.PRIVATE` still reads
 * "gmroll", an unknown `messageMode` that makes the roll PUBLIC (NOTES §2).
 */
const PRIVATE_ROLL_MODE = "gm";

listen("dnd5e.preApplyDamage", "concentration", (actor, amount, _updates, options) => {
  if ( !(Number(amount) > 0) || !actor?.uuid ) return;
  const message = options?.originatingMessage;
  if ( !(message instanceof ChatMessage) ) return;
  const source = cardItem(message)?.name ?? null;
  const dealer = message.getAssociatedActor?.() ?? null;
  const attacker = dealer?.name ?? null;
  if ( actor.concentration?.effects?.size ) {
    recentDamageCauses.set(actor.uuid, { at: Date.now(), source, attacker, dealerUuid: dealer?.uuid ?? null });
  }
});

function takeRecentCause(actorUuid) {
  const cause = recentDamageCauses.get(actorUuid);
  recentDamageCauses.delete(actorUuid);
  if ( !cause || ((Date.now() - cause.at) > 3000) ) return null;
  return (cause.source || cause.attacker)
    ? { source: cause.source, attacker: cause.attacker, ...(cause.dealerUuid ? { dealerUuid: cause.dealerUuid } : {}) } : null;
}

/**
 * The concentration BREAKER (Mage Slayer, RULINGS *The PHB feats — groups 4–6*): the dealer's
 * listed row that `breaks` concentration puts every roll of the ask at Disadvantage.
 * @param {Actor|null} concentrator
 * @param {string|null} dealerUuid
 * @returns {{feat: string, by: string, uuid: string, rule: object|string|null}|null}
 */
function breakerFor(concentrator, dealerUuid) {
  if ( !dealerUuid || (dealerUuid === concentrator?.uuid) ) return null;
  const dealer = resolveUuid(dealerUuid);
  if ( !(dealer instanceof Actor) ) return null;
  const listed = listedNames(damageRuleEntries());
  for ( const [name, row] of Object.entries(DAMAGE_RULES) ) {
    if ( (row.breaks !== "concentration") || !listed.has(lower(name)) ) continue;
    // A `wields` row (Mage Breaker): the dealer holds the weapon of that name, attuned where it requires it.
    const carrier = row.wields ? wieldedNamed(dealer, name) : featureNamed(dealer, name);
    if ( carrier ) return { feat: name, by: dealer.name, uuid: dealer.uuid, rule: row.rule };
  }
  return null;
}

/** ⚠ `disadvantage` alone, never `advantage: false` (that out-votes War Caster, not nets). */
const breakerRolls = ask => ask?.breaker ? { rolls: [{ options: { disadvantage: true } }] } : {};

/** What the actor is concentrating on, by name — the system's own fallback chain. */
function concentratingOn(actor) {
  return [...(actor?.concentration?.effects ?? [])].map(e => {
    const data = e.getFlag("dnd5e", "item");
    return data?.name ?? actor.items.get(data?.id)?.name ?? e.name;
  });
}

/** The trigger, mirroring the native prompt's guard: a max-HP reduction is not damage. */
listen("dnd5e.damageActor", "concentration", (actor, changes) => {
  // Gated on the SUBJECT: with no GM the concentrator's own client stamps, rolls and breaks.
  if ( !drivesMomentFor(actor?.uuid) ) return;
  if ( !(actor instanceof Actor) ) return;
  if ( !actor.concentration?.effects?.size ) return;
  const hp = actor.system.attributes?.hp;
  if ( !hp ) return;
  if ( !((changes.temp < 0) || (hp.value < hp.effectiveMax)) ) return;
  // C1 — an exempt row (Relentless Hunter): every spell held is the row's, the feature on the sheet — no demand, a card.
  const exempt = concentrationExemptFor(actor);
  if ( exempt ) { void exemptCard(actor, exempt, changes); return; }
  void stampConcentrationAsk(actor, changes);
});

/** The CONCENTRATION_EXEMPTS row that spares this concentrator now: `{ key, row, item }` or null. */
function concentrationExemptFor(actor) {
  const on = listedNames(concentrationExemptEntries());
  const held = [...(actor?.concentration?.effects ?? [])];
  const names = concentratingOn(actor).map(lower);
  if ( !names.length ) return null;
  // A `school` row (Focused Conjuration): every spell held is of that school, read off the concentrated items.
  const schools = held.map(e => { const data = e.getFlag("dnd5e", "item"); return actor.items.get(data?.id)?.system?.school ?? data?.system?.school ?? null; });
  for ( const [key, row] of Object.entries(CONCENTRATION_EXEMPTS) ) {
    if ( !on.has(lower(key)) ) continue;
    if ( row.spell && !names.every(n => n === lower(row.spell)) ) continue;
    if ( row.school && !(schools.length && schools.every(s => s === row.school)) ) continue;
    const item = featureNamed(actor, key);
    if ( item ) return { key, row, item };
  }
  return null;
}

/** The card for a spared save: what was held, why nothing is asked (R5 — the record on the card). */
async function exemptCard(actor, { key, row, item }, changes) {
  try {
    const damage = -changes.total;
    await postCard({
      actor,
      card: bfCard({ img: item.img ?? null, eyebrow: "Concentration check", tone: "good",
        title: `${key} — no save for ${row.spell}`,
        subtitle: `${actor.name} took ${damage} damage; its Concentration on ${row.spell} holds`,
        lines: [ruleLine(row.rule)] }),
      flags: { [MODULE_ID]: { concentrationExempt: { ...statContext(actor.uuid), key, spell: row.spell, actorUuid: actor.uuid, damage } } }
    });
  } catch(err) { log.warn(`${key}'s card could not post.`, err); }
}

// Incapacitated breaks concentration, no save; dnd5e does not end it when the status lands.
function breakOnIncapacitated(effect) {
  try {
    if ( effect?.disabled || !effect?.statuses?.has?.("incapacitated") ) return;
    const actor = effect.parent;
    if ( !(actor instanceof Actor) || !actor.concentration?.effects?.size ) return;
    if ( !drivesMomentFor(actor.uuid) ) return;
    void breakConcentration(actor, { names: concentratingOn(actor), reason: "incapacitated" });
  } catch(err) {
    log.error(`Incapacitated concentration break failed.`, err);
  }
}
listen("createActiveEffect", "concentration", effect => breakOnIncapacitated(effect));
listen("updateActiveEffect", "concentration", (effect, changes) => { if ( changes?.disabled === false ) breakOnIncapacitated(effect); });

/** The concentration ability exactly as rollConcentration will resolve it (actor.mjs:1728). */
function concAbility(actor) {
  const conc = actor.system.attributes?.concentration;
  return (conc?.ability in CONFIG.DND5E.abilities) ? conc.ability
    : CONFIG.DND5E.defaultAbilities.concentration;
}

async function stampConcentrationAsk(actor, changes) {
  const damage = -changes.total;
  const names = concentratingOn(actor);

  if ( (actor.system.attributes.hp.value ?? 0) <= 0 ) {
    await breakConcentration(actor, { names, reason: "down" });
    return;
  }

  const dc = actor.getConcentrationDC(damage);
  const cause = takeRecentCause(actor.uuid);
  const breaker = breakerFor(actor, cause?.dealerUuid ?? null);
  const window = decisionWindow();
  const abilityLabel = CONFIG.DND5E.abilities[concAbility(actor)]?.label ?? "Constitution";

  await postCard({
    card: bfCard({
      img: actor.img ?? null,
      eyebrow: "Concentration check",
      title: `${abilityLabel} save, DC ${dc}`,
      subtitle: `${actor.name} — concentrating on ${names.join(", ") || "a spell"}`,
      lines: [causeLine(cause, damage), ...(breaker ? [breakerLine(breaker)] : [])],
      tone: "pending"
    }),
    actor,
    to: setting(S.concVisibility) ? null : ownersAndGmIds(actor),
    flags: { [MODULE_ID]: { concentration: {
      status: "pending",
      actorUuid: actor.uuid,
      actorName: actor.name,
      ...statContext(actor.uuid),
      ability: concAbility(actor),
      dc, damage, names,
      // The effects at stake, snapshotted: the break ends exactly these.
      effectIds: [...actor.concentration.effects].map(e => e.id),
      ...(cause ? { cause } : {}),
      ...(breaker ? { breaker } : {}),
      ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
    } } }
  });
}

const breakerLine = breaker => `<strong>${esc(breaker.feat)}</strong> (${esc(breaker.by)}) — the save is made at Disadvantage.`;

/** "Took 12 damage from the Ogre's Greatclub.", with whatever parts the cause has. */
function causeLine(cause, damage) {
  let from = "";
  if ( cause?.attacker && cause?.source && (cause.attacker !== cause.source) ) {
    from = ` from ${cause.attacker}'s ${cause.source}`;
  } else if ( cause?.source ?? cause?.attacker ) {
    from = ` from ${cause.source ?? cause.attacker}`;
  }
  return `Took <strong>${damage}</strong> damage${from}.`;
}

/** Same-client re-entry latch (render resume + create watcher can volunteer in one tick). */
const concRollsInFlight = new Set();

/**
 * Roll the save that answers an ask, with no dialog; the DC rides as `target`. ⚠ The mode goes
 * through the advantage/disadvantage booleans: dnd5e recomputes `advantageMode` from them.
 */
async function rollConcentrationAnswer(askMessage, { timedOut = false, mode = null, bonus = null } = {}) {
  if ( concRollsInFlight.has(askMessage.id) ) return;
  concRollsInFlight.add(askMessage.id);
  try {
    const ask = readFlag(askMessage, "concentration");
    if ( !ask || (ask.status !== "pending") ) return;
    // ⚠ A landed answer wins though the ask still reads pending; whole-log by flag, never a tail.
    if ( game.messages.some(m => readFlag(m, "respondsTo") === askMessage.id) ) return;
    const actor = await resolveUuidAsync(ask.actorUuid);
    if ( !(actor instanceof Actor) || !actor.isOwner ) return;
    // A breaker's Disadvantage rides the straight roll too, unless a mode was pressed.
    const config = rollConfigFor(mode, bonus);
    if ( ask.breaker && !mode ) {
      config.rolls ??= [{}];
      config.rolls[0].options = { ...(config.rolls[0].options ?? {}), disadvantage: true };
    }
    await actor.rollConcentration(
      { target: ask.dc,
        ...config },
      { configure: false },
      {
        data: { flags: { [MODULE_ID]: {
          respondsTo: askMessage.id,
          ...(timedOut ? { timedOut: true } : {})
        } } },
        ...(setting(S.concVisibility) ? {} : { rollMode: PRIVATE_ROLL_MODE })
      }
    );
  } catch(err) {
    log.error(`Concentration roll failed — roll it from the sheet.`, err);
  } finally {
    concRollsInFlight.delete(askMessage.id);
  }
}

/** Every still-pending ask for one actor, oldest first — the popup queue and the fold order. */
function pendingConcAsks(actorUuid) {
  return game.messages
    .filter(m => {
      const c = readFlag(m, "concentration");
      return c && (c.status === "pending") && (c.actorUuid === actorUuid);
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * A bare sheet-rolled save matching actor and ability answers the OLDEST pending ask; priority 0,
 * concentration's before anyone's.
 */
registerDemand("concentration", {
  priority: 0, chained: false,
  answering: flag => flag ? {} : null,
  pendingEntry: (flag, f) => ((f.rollType === "save") && (flag.status === "pending") && (flag.actorUuid === f.actorUuid)
    && (flag.ability === f.ability)) ? {} : null,
  pendingFor: (flag, uuid) => ((flag.status === "pending") && (flag.actorUuid === uuid)) ? {} : null
});
function concAskAnsweredBy(message) {
  const found = demandAnsweredBy(message);
  return (found?.flagKey === "concentration") ? found.matches[0]?.card.id ?? null : null;
}

/** Same-client fold latch — the create watcher and the render resume can race in one tick. */
const concFolds = new Set();

/**
 * Fold a roll into its ask and act on the verdict. ⚠ The ask's DC rules: a sheet-rolled save
 * carries rollConcentration's default target of 10.
 */
async function foldConcentrationRoll(askMessage, rollMessage) {
  if ( !askMessage || concFolds.has(askMessage.id) ) return;
  concFolds.add(askMessage.id);
  try {
    const ask = foundry.utils.deepClone(readFlag(askMessage, "concentration") ?? {});
    if ( ask.status !== "pending" ) return;
    const roll = rollMessage.rolls?.[0];
    if ( !roll ) return;

    // WITHHELD: a failure waits for a rescue offer (never the clock's own roll); the ask records
    // the paused roll so its buzzer folds that one rather than rolling a second save.
    if ( !readFlag(rollMessage, "timedOut")
      && await withholds(rollMessage, { by: "concentration", card: askMessage, uuid: ask.actorUuid, total: roll.total, dc: ask.dc }) ) {
      if ( ask.withheld !== rollMessage.id ) await askMessage.setFlag(MODULE_ID, "concentration", { ...ask, withheld: rollMessage.id });
      return;
    }
    const judged = foldedSave({ total: roll.total, dc: ask.dc, folds: foldsFrom(key => readFlag(rollMessage, key), SAVE_FOLDS) });

    const actor = await resolveUuidAsync(ask.actorUuid);
    // ⚠ Visibility frozen AT VERDICT TIME (a flip during the pause must not re-address), and stored.
    const whisper = setting(S.concVisibility) ? null : ownersAndGmIds(actor);

    ask.status = "done";
    ask.outcome = {
      total: judged.total,
      success: judged.outcome === "saved",
      ...(readFlag(rollMessage, "timedOut") ? { timedOut: true } : {}),
      rollMessageId: rollMessage.id,
      // Crash-resume contract: a stale outcome with `answeredAt` and no `applied` is re-driven.
      answeredAt: Date.now(),
      ...(whisper ? { whisperIds: whisper } : {})
    };
    disarmAskTimer(concTimers, askMessage.id);
    await askMessage.setFlag(MODULE_ID, "concentration", ask);

    await dramaticVerdictPause(rollMessage);

    if ( ask.outcome.success ) {
      if ( actor?.concentration?.effects?.size ) await announceConcentrationHolds(actor, ask, whisper);
    } else {
      await breakConcentration(actor, { names: ask.names, effectIds: ask.effectIds, ask });
    }
    await markConcApplied(askMessage);
  } finally {
    concFolds.delete(askMessage.id);
  }
}

// A verdict this machine paused for a rescue offer is finished by the same fold, handed back by the spine.
registerWithheld("concentration", {
  resume: ({ cardId }, rollMessage) => {
    const card = game.messages.get(cardId);
    return card ? foldConcentrationRoll(card, rollMessage) : undefined;
  }
});

/** The resume contract's receipt. */
async function markConcApplied(askMessage) {
  const live = game.messages.get(askMessage.id);
  const cur = foundry.utils.deepClone(readFlag(live, "concentration") ?? null);
  if ( !cur?.outcome || cur.outcome.applied ) return;
  cur.outcome.applied = true;
  await live.setFlag(MODULE_ID, "concentration", cur);
}

const concResumes = new Set();

/**
 * Crash-resume: the client died inside the verdict pause, so the break never happened. Ending
 * gone effects no-ops; a duplicate card after a real crash beats silence.
 */
async function resumeConcOutcome(askMessage) {
  if ( concResumes.has(askMessage.id) ) return;
  concResumes.add(askMessage.id);
  try {
    const ask = foundry.utils.deepClone(readFlag(askMessage, "concentration") ?? {});
    if ( (ask.status !== "done") || !ask.outcome?.answeredAt || ask.outcome.applied ) return;
    const actor = await resolveUuidAsync(ask.actorUuid);
    const whisper = ask.outcome.whisperIds ?? null;
    if ( ask.outcome.success ) {
      if ( actor?.concentration?.effects?.size ) await announceConcentrationHolds(actor, ask, whisper);
    } else {
      await breakConcentration(actor, { names: ask.names, effectIds: ask.effectIds, ask });
    }
    await markConcApplied(askMessage);
  } catch(err) {
    log.error(`Concentration outcome resume failed.`, err);
  } finally {
    concResumes.delete(askMessage.id);
  }
}

/** Quiet good news, visibility-scoped (ARCHITECTURE.md §6); `whisper` is fixed at verdict time. */
async function announceConcentrationHolds(actor, ask, whisper = null) {
  await postCard({
    card: bfCard({
      img: actor?.img ?? null,
      eyebrow: "Concentration",
      title: `${ask.names?.join(", ") || "Concentration"} holds`,
      subtitle: `${ask.outcome.total} vs DC ${ask.dc}`
        + `${ask.outcome.timedOut ? " — rolled by the timer" : ""}`,
      tone: "good"
    }),
    alias: TITLE,
    to: whisper
  });
}

/**
 * End concentration the system's way and say so in public (DESIGN.md R5). Breaking off: announce only.
 */
async function breakConcentration(actor, { names = [], effectIds = null, ask = null, reason = null } = {}) {
  // Ending is a write to the concentrator: a PC's own client may do it; an NPC with no GM cannot.
  const blocked = (actor instanceof Actor) && !canApplyTo(actor);
  if ( (actor instanceof Actor) && !blocked ) {
    const targets = effectIds ?? [...(actor.concentration?.effects ?? [])].map(e => e.id);
    for ( const id of targets ) {
      try { await actor.endConcentration(id); }
      catch(err) { log.error(`Could not end concentration.`, err); }
    }
  }
  if ( blocked ) {
    await whisperNoGM(`the end of ${actor.name}'s concentration`,
      "The save and its verdict stand — end the effect from their sheet.");
  }
  const what = names.length ? names.join(", ") : "concentration";
  await postCard({
    card: bfCard({
      img: actor?.img ?? null,
      eyebrow: "Concentration broken",
      title: `${what} ends`,
      subtitle: reason === "down"
        ? `${actor?.name ?? "The concentrator"} is down — no save at 0 HP`
        : reason === "incapacitated"
        ? `${actor?.name ?? "The concentrator"} is Incapacitated — Concentration is broken, no save`
        : ask ? `${ask.outcome.total} vs DC ${ask.dc} — ${actor?.name ?? "the concentrator"} loses concentration`
        : `${actor?.name ?? "The concentrator"} loses concentration`,
      lines: [],
      tone: "bad"
    }),
    alias: TITLE
  });
}

// The ask's clock, answer channel, and views.
const concTimers = new Map();

/** Expiry ROLLS; the buzzer first folds an answer that already landed. */
const armConcTimer = message => armAskTimer(concTimers, message, "concentration", fireConcTimer, { owns: electOwns });

async function fireConcTimer(askMessage) {
  // A roll paused for a rescue offer is THE answer.
  const withheld = readFlag(askMessage, "concentration")?.withheld;
  const paused = withheld ? game.messages.get(withheld) : null;
  if ( paused ) return foldConcentrationRoll(askMessage, paused);
  const landed = game.messages.find(m => readFlag(m, "respondsTo") === askMessage.id);
  if ( landed ) return foldConcentrationRoll(askMessage, landed);
  const ask = readFlag(askMessage, "concentration");
  const actor = await resolveUuidAsync(ask?.actorUuid ?? "");
  if ( !(actor instanceof Actor) ) {
    const gone = foundry.utils.deepClone(ask ?? {});
    gone.status = "done";
    gone.outcome = { voided: true };
    await askMessage.setFlag(MODULE_ID, "concentration", gone);
    return;
  }
  await rollConcentrationAnswer(askMessage, { timedOut: true });
}

// The answer channel: whoever drives the ask's subject folds any roll that answers it.
listen("createChatMessage", "concentration", message => {
  {
    const askId = concAskAnsweredBy(message);
    const askMsg = askId ? game.messages.get(askId) : null;
    const subject = readFlag(askMsg, "concentration")?.actorUuid ?? null;
    if ( askMsg && drivesMomentFor(subject) ) void foldConcentrationRoll(askMsg, message);
  }
  // A fresh ask: arm the clock; in auto mode the elected roller rolls, no popup.
  const ask = readFlag(message, "concentration");
  if ( ask?.status === "pending" ) {
    armConcTimer(message);
    if ( savesRollThemselves() ) void autoRollConcentration(message);
  }
});

async function autoRollConcentration(askMessage) {
  const ask = readFlag(askMessage, "concentration");
  const actor = await resolveUuidAsync(ask?.actorUuid ?? "");
  if ( !(actor instanceof Actor) ) return;
  if ( !(rollerUserFor(actor)?.isSelf ?? false) || !leadsWindow() ) return;
  await rollConcentrationAnswer(askMessage);
}

// A resolved ask closes its popup; the queue advances by re-rendering the actor's next ask.
listen("updateChatMessage", "concentration", message => {
  const ask = readFlag(message, "concentration");
  if ( !ask ) return;
  if ( ask.status !== "pending" ) void closePopup(message, "concentration");
  if ( ask.status !== "pending" ) {
    disarmAskTimer(concTimers, message.id);
    const next = pendingConcAsks(ask.actorUuid)[0];
    if ( next ) {
      forgetShown(next, "concentration");
      try { ui.chat?.updateMessage?.(next); } catch { /* row refreshes next render */ }
    }
  }
});

// The shown-latch rides ui.js's one delete-sweep; only this machine's clock disarms here.
listen("deleteChatMessage", "concentration", message => {
  disarmAskTimer(concTimers, message.id);
});

/**
 * The ask's row, stateless, and the resume point: re-arms the clock, folds a landed answer,
 * re-volunteers, re-drives a stale unapplied outcome.
 */
listen("dnd5e.renderChatMessage", "concentration", (message, html) => {
  const ask = readFlag(message, "concentration");
  if ( !ask ) return;

  if ( (ask.status === "done") && ask.outcome?.answeredAt && !ask.outcome.applied
    && drivesMomentFor(ask.actorUuid) && (Date.now() - ask.outcome.answeredAt > 20_000) ) void resumeConcOutcome(message);

  const row = document.createElement("div");
  row.className = "bythebooks-concentration";

  if ( ask.status === "pending" ) {
    if ( drivesMomentFor(ask.actorUuid) ) {
      const landed = game.messages.find(m => readFlag(m, "respondsTo") === message.id);
      if ( landed ) void foldConcentrationRoll(message, landed);
    }
    if ( savesRollThemselves() ) void autoRollConcentration(message);

    const may = !savesRollThemselves() && canAnswerFor(resolveUuid(ask.actorUuid));
    const show = () => showConcPopup(message, readFlag(message, "concentration"));
    pendingRow(message, row, {
      bar: holdBarHTML(ask, "to roll"),
      // Auto-show only the OLDEST pending ask (asks queue); the button recalls any.
      latch: may && (pendingConcAsks(ask.actorUuid)[0]?.id === message.id) && { sub: "concentration", show },
      answer: may && { label: "Roll", style: { margin: "0.25rem 0 0" }, show: () => { forgetShown(message, "concentration"); return show(); } },
      arm: armConcTimer
    });
  } else {
    const o = ask.outcome ?? {};
    const line = document.createElement("div");
    line.textContent = o.voided ? "The concentrator is gone — nothing to roll."
      : o.autoFailed ? `fails automatically — ${o.autoFailedBy ?? "the condition"} — broken`
      : `${o.total} vs DC ${ask.dc} — ${o.success ? "holds" : "broken"}${o.timedOut ? " (timer)" : ""}`;
    Object.assign(line.style, {
      marginTop: "0.3rem", fontSize: "var(--font-size-11, 11px)",
      fontWeight: "bold", opacity: "0.8"
    });
    row.appendChild(line);
  }
  html.querySelector(SURFACES.messageContent)?.appendChild(row);
});

// Dialogs between the call and the render that adopts them.
const concDialogsOpening = new Set();

/**
 * The popup IS dnd5e's own save dialog, the ask riding it as a DialogCarried (RULINGS *The gate
 * before the roll*). Dismissing is not an answer: the buzzer still rolls.
 */
async function showConcPopup(message, ask) {
  if ( !ask || (ask.status !== "pending") ) return;
  if ( frontPopup(message, "concentration") ) return;
  const key = popupKey(message.id, "concentration");
  if ( concDialogsOpening.has(key) || concRollsInFlight.has(message.id) ) return;
  concDialogsOpening.add(key);
  try {
    if ( game.messages.some(m => readFlag(m, "respondsTo") === message.id) ) return;
    const actor = await resolveUuidAsync(ask.actorUuid);
    if ( !(actor instanceof Actor) || !canAnswerFor(actor) ) return;
    const abilityLabel = CONFIG.DND5E.abilities[ask.ability]?.label ?? "Constitution";
    const demand = new DialogCarried({
      cardId: message.id, key, failed: null,
      owed: card => readFlag(card, "concentration")?.status === "pending",
      present: () => ({
        img: actor.img ?? null,
        eyebrow: "Concentration check",
        title: `${abilityLabel} save, DC ${ask.dc}`,
        subtitle: `${ask.actorName} — concentrating on ${ask.names?.join(", ") || "a spell"}`,
        lines: [
          causeLine(ask.cause, ask.damage),
          ...(ask.breaker ? [breakerLine(ask.breaker)] : []),
          `A failed save ends <strong>${ask.names?.join(", ") || "the spell"}</strong>.`
        ],
        tone: "pending"
      }),
      bar: card => readFlag(card, "concentration")
    });
    const rolls = await actor.rollConcentration(
      { target: ask.dc, ...breakerRolls(ask) },
      { configure: true, options: { bfSaveDemand: demand } },
      {
        data: { flags: { [MODULE_ID]: { respondsTo: message.id } } },
        ...(setting(S.concVisibility) ? {} : { rollMode: PRIVATE_ROLL_MODE })
      }
    );
    if ( !rolls?.length && demand.failed ) await foldConcentrationAutoFail(message, demand.failed);
  } catch(err) {
    log.error(`Concentration dialog failed — roll it from the sheet.`, err);
  } finally {
    concDialogsOpening.delete(key);
  }
}

/** The fold without a die: the dialog's Fails; `total` null, the condition named, then the break. */
async function foldConcentrationAutoFail(askMessage, sources = []) {
  if ( !askMessage || concFolds.has(askMessage.id) ) return;
  concFolds.add(askMessage.id);
  try {
    const ask = foundry.utils.deepClone(readFlag(askMessage, "concentration") ?? {});
    if ( ask.status !== "pending" ) return;
    const actor = await resolveUuidAsync(ask.actorUuid);
    const whisper = setting(S.concVisibility) ? null : ownersAndGmIds(actor);
    ask.status = "done";
    ask.outcome = {
      total: null, success: false, autoFailed: true,
      autoFailedBy: sources.filter(s => s.autoFail).map(s => s.statusName).join(", ") || null,
      answeredAt: Date.now(),
      ...(whisper ? { whisperIds: whisper } : {})
    };
    disarmAskTimer(concTimers, askMessage.id);
    await askMessage.setFlag(MODULE_ID, "concentration", ask);
    await breakConcentration(actor, { names: ask.names, effectIds: ask.effectIds, ask });
    await markConcApplied(askMessage);
  } finally {
    concFolds.delete(askMessage.id);
  }
}

/**
 * dnd5e's concentration prompts are VETOED (NOTES §2 *the 6.0 pass*) by TYPE, and only with an
 * active GM: a GM-less table falls back to the native prompt, not silence.
 */
listen("preCreateChatMessage", "concentration", doc => {
  if ( !game.users.activeGM ) return;
  if ( !isConcentrationPrompt(doc) ) return;
  return false;
});

/* --- a cast that ends Concentration asks first (RULINGS *Summons*) ---------------------------------- */

/**
 * Ask before a cast that ends the caster's Concentration: "Casting X will end your Concentration on Y.
 * Proceed?" `go` false when the caster says no; `end` the effect to end, for the use's
 * `concentration.end` (null when the cast ends none).
 * ⚠ dnd5e asks this only in its usage dialog; a cast the module takes past that dialog (a summon's
 * menu) must ask here, or the old spell ends without a word.
 * @returns {Promise<{ go: boolean, end: string|null }>}
 */
async function askConcentrationEnd(activity) {
  const ending = concentrationEnding(activity);
  if ( !ending ) return { go: true, end: null };
  const spell = activity.item?.name ?? "this";
  const yes = await confirmPopup(activity.uuid, "concentrationEnd", {
    title: "End Concentration?", icon: "fa-solid fa-head-side-brain",
    content: `<p>Casting <b>${esc(spell)}</b> will end your Concentration on <b>${esc(ending.name)}</b>.</p><p>Proceed?</p>`
  });
  return { go: !!yes, end: ending.id };
}

// Any other cast that skips dnd5e's usage dialog (`configure: false`) and would end the caster's
// Concentration on ANOTHER spell asks first, on the caster's client; yes uses it again, the end named.
// A use already asked (CONCENTRATION_ASKED), or beginning none, passes; the same spell's own re-use
// (an automation using it again) ends nothing new and passes.
// ⚠ dnd5e fills `concentration.end` itself before this hook, so a set `end` says nothing about the caller.
listen("dnd5e.preUseActivity", "concentration", (activity, usageConfig, dialogConfig, messageConfig) => {
  try {
    if ( (dialogConfig?.configure !== false) || !activity?.actor?.isOwner || (activity.item?.type !== "spell") ) return;
    if ( usageConfig?.[MODULE_ID]?.[CONCENTRATION_ASKED] || (usageConfig?.concentration?.begin === false) ) return;
    const ending = concentrationEnding(activity);
    if ( !ending || ending.same ) return;
    const live = activity.actor.items.get(activity.item.id)?.system?.activities?.get(activity.id) ?? null;
    if ( !live ) return;
    void (async () => {
      const { go, end } = await askConcentrationEnd(activity);
      if ( !go ) return;
      await live.use({ ...usageConfig, concentration: { ...(usageConfig?.concentration ?? {}), begin: true, end },
        [MODULE_ID]: { ...(usageConfig?.[MODULE_ID] ?? {}), [CONCENTRATION_ASKED]: true } }, dialogConfig, messageConfig);
    })().catch(err => log.error(`The cast could not go on after the Concentration question — cast it again.`, err));
    return false;
  } catch(err) { log.warn(`Could not check the cast against Concentration — it is cast as usual.`, err); }
});
