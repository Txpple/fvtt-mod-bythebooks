/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): Riposte, the `riposte` fold. An enemy's melee miss
 * answered with a real driven attack, the superiority die riding its damage (why a fold: precision.js).
 */
import { MODULE_ID, readFlag, isActiveGM, queueFlagWrite, canAnswerFor, statContext, decisionWindow, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { cardActivity, usableManeuver, maneuverDieFormula, meleeOptions, preferredMeleeOption } from "./lookup.js";
import { maneuverFoldEntries } from "./decide/registry.js";
import { RULE_TEXT } from "./decide/registry.js";
import { hitTargets, namedPart, reactionSpent, spendReaction } from "./shared.js";
import { bfCard, holdBarHTML, ruleLine, esc } from "./decide/present.js";
import { SURFACES } from "./surfaces.js";
import { CARD, activityUuidOf, isCard, originData, originIdInData, targetsOf } from "./decide/card.js";
import { openMomentPopup, scheduleBarSync, armAskTimer, disarmAskTimer, electOwns, registerRelay, pendingRow, closePopup, postCard, postAnswer } from "./ui.js";
import { listen } from "./dispatch.js";
import { tokenOf } from "./geometry.js";


const riposteTimers = new Map();
const riposteInFlight = new Set();

/** One-shot armed dice for the injection below: reactor uuid → {formula, type, armedAt}. */
const riposteDie = new Map();
const RIPOSTE_DIE_TTL_MS = 60_000;

/** Stamp: the elect, on the ENEMY's attack message — the Graze miss-path template. */
listen("createChatMessage", "riposte", async message => {
  try {
    if ( !isActiveGM() ) return;
    if ( !isCard(message, CARD.attack) ) return;
    if ( readFlag(message, "riposte") ) return;               // never re-stamp
    if ( readFlag(message, "riposteFor") ) return;            // a driven attack never chains re-offers
    const entry = maneuverFoldEntries().find(e => e.kind === "riposte");
    if ( !entry ) return;
    const attackActivity = cardActivity(message, activityUuidOf(message));
    if ( attackActivity?.attack?.type?.value !== "melee" ) return;     // melee misses only (P3)
    const attacker = message.getAssociatedActor?.();
    if ( !attacker ) return;

    const hitSet = new Set(hitTargets(message).map(t => t.uuid));      // as rolled — Graze's no-reopen
    const reactors = [];
    for ( const t of targetsOf(message) ) {
      if ( hitSet.has(t.uuid) ) continue;
      const actor = await resolveUuidAsync(t.uuid);
      if ( !(actor instanceof Actor) ) continue;
      if ( (actor.system.attributes?.hp?.value ?? 0) <= 0 ) continue;  // the dead don't riposte
      if ( actor.uuid === attacker.uuid ) continue;
      // ⚠ NOT a budget test: the CLICK-VOLUME GUARD (DESIGN §8) only declines to OFFER again this turn.
      if ( reactionSpent(actor) ) continue;
      const found = usableManeuver(actor, entry.name);
      const dieFormula = found ? maneuverDieFormula(found.activity) : null;
      if ( !found || !dieFormula ) continue;
      if ( !meleeOptions(actor).length ) continue;                     // nothing to swing back with
      reactors.push({
        uuid: t.uuid, name: t.name,
        itemId: found.item.id, activityId: found.activity.id,
        itemName: found.item.name, itemImg: found.item.img,
        dieFormula, answer: null
      });
    }
    if ( !reactors.length ) return;

    const window = decisionWindow();
    await message.setFlag(MODULE_ID, "riposte", {
      status: "pending",
      attackerUuid: attacker.uuid, attackerName: attacker.name,
      ...statContext(attacker.uuid),
      ...(window ? { window, deadline: Date.now() + (window * 1000) } : {}),
      reactors
    });
    armRiposteTimer(message);
  } catch(err) {
    log.error(`Riposte stamp failed.`, err);
  }
});

/** The elect's clock while any reactor is unanswered: the stamp sits on the enemy's attack, another user's message. */
function armRiposteTimer(message) {
  armAskTimer(riposteTimers, message, "riposte", live => fireRiposteTimer(live.id),
    { owns: electOwns, pending: f => (f.status === "pending") && (f.reactors ?? []).some(r => !r.answer) });
}

const disarmRiposteTimer = messageId => disarmAskTimer(riposteTimers, messageId);

/** Expiry DECLINES: a reaction nobody took is a reaction not taken. */
async function fireRiposteTimer(messageId) {
  try {
    const message = game.messages.get(messageId);
    if ( !message ) return;
    await queueFlagWrite(message, "riposte", current => {
      if ( current.status !== "pending" ) return;
      for ( const r of current.reactors ?? [] ) {
        if ( !r.answer ) { r.answer = "declined"; r.timedOut = true; }
      }
      if ( (current.reactors ?? []).every(r => r.answer) ) current.status = "resolved";
    });
  } catch(err) {
    log.error(`Riposte buzzer failed.`, err);
  }
}

/** One reactor's answer; "riposte" executes on this client. ⚠ A PLAYER cannot update the enemy's
 * message, so their answer relays as their OWN message; the elect's 20s crash-resume covers a dead client. */
async function answerRiposte(message, uuid, answer, { weaponId = null, weaponName = null } = {}) {
  if ( !message.isOwner ) {
    const live = readFlag(message, "riposte");
    const reactor = live?.reactors?.find(x => x.uuid === uuid);
    if ( !reactor || reactor.answer || (live.status !== "pending") ) return;
    const actor = resolveUuid(uuid);
    await postAnswer("riposteAnswer", {
      actor,
      card: bfCard({
        img: reactor.itemImg, eyebrow: `Maneuver — ${reactor.itemName}`,
        tone: (answer === "riposte") ? "good" : "neutral",
        title: (answer === "riposte")
          ? `${reactor.itemName} — ${reactor.name} strikes back${weaponName ? ` with ${weaponName}` : ""}`
          : `${reactor.itemName} — ${reactor.name} declines`,
        subtitle: `${live.attackerName}'s melee attack missed`
      }),
      flags: { [MODULE_ID]: { riposteAnswer: {
        messageId: message.id, uuid, answer, weaponId, weaponName
      } } }
    });
    if ( answer === "riposte" ) await resolveRiposte(message, uuid, weaponId, { trusted: true });
    return;
  }
  let claimed = false;
  await queueFlagWrite(message, "riposte", current => {
    const r = (current.reactors ?? []).find(x => x.uuid === uuid);
    if ( !r || r.answer || (current.status !== "pending") ) return;
    r.answer = answer;
    r.answeredAt = Date.now();   // the crash-resume horizon
    if ( weaponId ) { r.weaponId = weaponId; r.weaponName = weaponName; }
    if ( (current.reactors ?? []).every(x => x.answer) ) current.status = "resolved";
    claimed = true;
  });
  if ( !claimed || (answer !== "riposte") ) return;
  await resolveRiposte(message, uuid, weaponId);
}

/** A relayed answer landing: the ELECT folds it in, idempotently, by the direct path's claim rules. */
registerRelay("riposteAnswer", {
  flagKey: "riposte",
  targetOf: a => a.messageId,
  owns: () => isActiveGM(),
  fold: (current, a) => {
    const r = (current.reactors ?? []).find(x => x.uuid === a.uuid);
    if ( !r || r.answer || (current.status !== "pending") ) return;
    r.answer = a.answer;
    r.answeredAt = Date.now();
    if ( a.weaponId ) { r.weaponId = a.weaponId; r.weaponName = a.weaponName; }
    if ( (current.reactors ?? []).every(x => x.answer) ) current.status = "resolved";
  }
});

/** Has this reactor's driven attack already been made? The provenance flags ARE the receipt. */
const riposteDriven = (messageId, uuid) => game.messages.contents.some(m =>
  (readFlag(m, "riposteFor") === messageId) && (readFlag(m, "riposteBy") === uuid));

/** The accept path: use the maneuver, spend the reaction, arm the die, drive the attack. `trusted`:
 * the relay branch trusts its own just-posted answer rather than wait for the elect's fold. */
async function resolveRiposte(message, uuid, weaponId, { trusted = false } = {}) {
  const key = `${message.id}|${uuid}`;
  if ( riposteInFlight.has(key) ) return;
  riposteInFlight.add(key);
  try {
    const flag = readFlag(message, "riposte");
    const reactor = flag?.reactors?.find(r => r.uuid === uuid);
    if ( !reactor ) return;
    if ( !trusted && (reactor.answer !== "riposte") ) return;
    if ( riposteDriven(message.id, uuid) ) return;   // idempotent — the attack already exists
    const actor = await resolveUuidAsync(uuid);
    if ( !(actor instanceof Actor) ) return;
    const attackerToken = tokenOf(flag.attackerUuid);

    // Aim first, so every card in the sequence says who it is aimed at.
    const priorTargets = [...game.user.targets].map(t => t.id);
    if ( attackerToken ) {
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: false }); });
      attackerToken.setTarget(true, { releaseOthers: true });
    }

    try {
      // Use the maneuver and SPEND the reaction here (the hold's setter runs only under reactionHold).
      const item = actor.items.get(reactor.itemId);
      const activity = item?.system.activities?.contents?.find(a => a.id === reactor.activityId);
      if ( !activity ) return;
      // ⚠ subsequentActions:false, or dnd5e parks the maneuver's own damage dialog over everything.
      await activity.use({ subsequentActions: false }, { configure: false }, {
        data: { flags: { [MODULE_ID]: { riposteUse: message.id } } }
      });
      void spendReaction(actor, { origin: activity.item?.uuid ?? null, what: activity.item?.name ?? "the riposte" });

      // Arm the one-shot die, THEN drive the attack. ⚠ Provenance in FLAT message data: nested is
      // invisible to the riders.
      const options = meleeOptions(actor);
      const wantId = weaponId ?? reactor.weaponId ?? null;   // the stored choice survives a crash-resume
      const chosen = options.find(o => o.itemId === wantId) ?? preferredMeleeOption(actor, options);
      if ( !chosen ) return;
      const weapon = actor.items.get(chosen.itemId);
      const weaponAct = weapon?.system.activities?.contents?.find(a => a.id === chosen.activityId);
      if ( !weaponAct ) return;
      riposteDie.set(uuid, {
        formula: reactor.dieFormula,
        type: [...(weapon.system.damage?.base?.types ?? [])][0] ?? "",
        armedAt: Date.now()
      });
      const use = await weaponAct.use({ subsequentActions: false }, { configure: false }, {});
      const usageId = use?.message?.id ?? null;
      await weaponAct.rollAttack({}, { configure: false }, {
        data: {
          ...originData(usageId ?? message.id),
          flags: { [MODULE_ID]: { riposteFor: message.id, riposteBy: uuid } }
        }
      });
    } finally {
      // Put the table back the way the reactor had it.
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: false }); });
      for ( const id of priorTargets ) tokenOf(id)?.setTarget(true, { releaseOthers: false });
    }
  } catch(err) {
    log.error(`Riposte resolution failed.`, err);
  } finally {
    riposteInFlight.delete(key);
  }
}

/** The die injection — the hit-riders push idiom, gated on the armed one-shot. */
listen("dnd5e.preRollDamage", "riposte", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "attack" ) return;
    const actor = activity.item?.actor;
    if ( !actor ) return;
    const armed = riposteDie.get(actor.uuid);
    if ( !armed ) return;
    if ( (Date.now() - armed.armedAt) > RIPOSTE_DIE_TTL_MS ) { riposteDie.delete(actor.uuid); return; }
    // A chained damage roll must lead to OUR driven attack; a chainless one falls back to actor+TTL.
    const originId = originIdInData(message?.data);
    if ( originId ) {
      const origin = game.messages.get(originId);
      if ( origin ) {
        const chainAttacks = isCard(origin, CARD.attack)
          ? [origin] : (origin.getAssociatedRolls?.("attack") ?? []);
        if ( !chainAttacks.some(a => readFlag(a, "riposteFor")) ) return;
      }
    }
    riposteDie.delete(actor.uuid);   // one-shot, consumed
    // The die folds INTO the base roll (one group, crit-doubles by rule); the typed push is a fallback.
    const base = (config.rolls ?? []).find(r => r.base === true);
    if ( base ) base.parts = [...(base.parts ?? []), namedPart(armed.formula, "Riposte")];
    else config.rolls.push({
      data: config.rolls[0]?.data ?? {},
      parts: [namedPart(armed.formula, "Riposte")],
      options: { type: armed.type, types: armed.type ? [armed.type] : [] }
    });
  } catch(err) {
    log.error(`Riposte die injection failed.`, err);
  }
});

/* A riposte MISS announces itself, posted by the ROLLING client; the hit half is offerDamageRoll's. */
listen("dnd5e.rollAttack", "riposte", async rolls => {
  try {
    const message = rolls?.[0]?.parent;
    if ( !(message instanceof ChatMessage) ) return;
    const riposteFor = readFlag(message, "riposteFor");
    if ( !riposteFor ) return;
    if ( hitTargets(message).length ) return;   // the hit's moment is the damage offer
    const reactor = message.getAssociatedActor?.();
    const held = readFlag(game.messages.get(riposteFor), "riposte");
    const r = held?.reactors?.find(x => x.uuid === readFlag(message, "riposteBy"));
    await postCard({
      actor: reactor,
      card: bfCard({
        img: r?.itemImg ?? null, eyebrow: `Maneuver — ${r?.itemName ?? "Riposte"}`,
        tone: "neutral",
        title: `${r?.itemName ?? "Riposte"} — the strike back misses`,
        subtitle: `${reactor?.name ?? "The reactor"}'s answer to ${held?.attackerName ?? "the attacker"}`
          + `${r?.weaponName ? ` — ${r.weaponName}` : ""}`
      })
    });
  } catch(err) {
    log.error(`Riposte miss announce failed.`, err);
  }
});

/** The Riposte/Pass popup: two controls plus the weapon choice (an input, not an answer). */
async function showRipostePopup(message, flag, reactor) {
  const actor = resolveUuid(reactor.uuid);
  // The weapon choice defaults to the weapon last attacked with; a single equipped melee weapon
  // skips the dropdown and is simply NAMED.
  const options = actor ? meleeOptions(actor) : [];
  const preferred = actor ? preferredMeleeOption(actor, options) : null;
  const selectHTML = (options.length > 1) ? `
    <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;">
      <label style="flex:1;font-size:var(--font-size-12,12px);">Riposte with</label>
      <select name="bf-riposte-weapon" style="flex:1;min-width:0;">${options
        .map(o => `<option value="${o.itemId}"${o.itemId === preferred?.itemId ? " selected" : ""}>${esc(o.label)}</option>`)
        .join("")}</select>
    </div>` : "";
  let dialog;
  const answer = kind => {
    const chosenId = dialog?.element?.querySelector('select[name="bf-riposte-weapon"]')?.value
      ?? preferred?.itemId ?? null;
    return answerRiposte(message, reactor.uuid, kind, {
      weaponId: chosenId,
      // The clean name, never the display label — "(stowed)" is popup dressing, not card record.
      weaponName: options.find(o => o.itemId === chosenId)?.name ?? preferred?.name ?? null
    });
  };
  dialog = await openMomentPopup(message, `riposte:${reactor.uuid}`, actor, {
    title: `Riposte — ${reactor.name}`, icon: "fa-solid fa-reply",
    content: bfCard({
      img: reactor.itemImg, eyebrow: `Maneuver — ${reactor.itemName}`, tone: "pending",
      title: `${flag.attackerName} missed you`,
      // The rule line is the maneuver's own text; the one-weapon note is the module's hint.
      lines: [ruleLine(RULE_TEXT.riposte),
        ...((options.length === 1) ? [`Riposte with <strong>${esc(preferred?.label ?? "your weapon")}</strong> — your one melee weapon.`] : [])]
    }) + selectHTML + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "riposte", label: preferred && (options.length === 1) ? `Riposte with ${preferred.label}` : "Riposte",
        default: true, callback: () => answer("riposte") },
      { action: "pass", label: "Pass", callback: () => answer("declined") }
    ]
  });
}


// THE ROWS, THE WATCHER, THE CLEANUP.

listen("dnd5e.renderChatMessage", "riposte", (message, html) => {
  // --- Riposte: one row per reactor on the enemy's attack card ------------------------------
  const r = readFlag(message, "riposte");
  if ( r?.reactors?.length ) {
    const row = document.createElement("div");
    row.className = "bythebooks-maneuver";
    const pending = r.status === "pending";
    for ( const reactor of r.reactors ) {
      const line = document.createElement("div");
      line.innerHTML = bfCard({
        img: reactor.itemImg, eyebrow: `Maneuver — ${reactor.itemName}`,
        tone: !reactor.answer ? "pending" : (reactor.answer === "riposte" ? "good" : "neutral"),
        // Source, then result; the resolved line NAMES the weapon, on the card as well as the popup.
        title: !reactor.answer ? `${reactor.itemName} — ${reactor.name} may strike back`
          : (reactor.answer === "riposte"
            ? `${reactor.itemName} — ${reactor.name} strikes back${reactor.weaponName ? ` with ${reactor.weaponName}` : ""}`
            : `${reactor.itemName} — ${reactor.name} declined${reactor.timedOut ? " (timer)" : ""}`),
        subtitle: `${r.attackerName}'s melee attack missed`
      });
      row.appendChild(line);
      if ( pending && !reactor.answer ) {
        const bar = document.createElement("div");
        bar.innerHTML = holdBarHTML(r, "to answer");
        row.appendChild(bar);
        const may = canAnswerFor(resolveUuid(reactor.uuid));
        pendingRow(message, row, {
          latch: may && { sub: `riposte:${reactor.uuid}`, show: () => showRipostePopup(message, r, reactor) },
          answer: may && { label: `Answer — ${reactor.name}`, show: () => {
            const live = readFlag(message, "riposte");
            const lr = live?.reactors?.find(x => x.uuid === reactor.uuid);
            if ( live && lr && !lr.answer ) void showRipostePopup(message, live, lr);
          } }
        });
      }
    }
    if ( pending ) { scheduleBarSync(row); armRiposteTimer(message); }
    // Crash-resume (elect, 20s): an accepted riposte with no driven attack in the log.
    if ( isActiveGM() ) {
      for ( const reactor of r.reactors ?? [] ) {
        if ( (reactor.answer === "riposte") && reactor.answeredAt
          && (Date.now() - reactor.answeredAt > 20_000)
          && !riposteDriven(message.id, reactor.uuid) ) {
          void resolveRiposte(message, reactor.uuid, null);
        }
      }
    }
    html.querySelector(SURFACES.messageContent)?.appendChild(row);
  }
});

// Every client closes answered popups; the timers disarm when nothing is pending.
listen("updateChatMessage", "riposte", message => {
  const r = readFlag(message, "riposte");
  if ( r ) {
    for ( const reactor of r.reactors ?? [] ) {
      if ( !reactor.answer ) continue;
      void closePopup(message, `riposte:${reactor.uuid}`);
    }
    if ( !(r.reactors ?? []).some(x => !x.answer) ) disarmRiposteTimer(message.id);
    else armRiposteTimer(message);
  }
});

// The shown-latches ride ui.js's one delete-sweep; only this machine's clock disarms here.
listen("deleteChatMessage", "riposte", message => {
  disarmRiposteTimer(message.id);
});
