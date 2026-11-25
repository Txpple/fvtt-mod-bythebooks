/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): the Topple demand, the `topple` flag's lifecycle off
 * mastery.js's card (supersede, dialog, buzzer, fold, Prone press, GM button). Neither imports the other.
 */
import { MODULE_ID, readFlag, isActiveGM, drivesMomentFor, canApplyTo, whisperNoGM, queueFlagWrite,
  canAnswerFor, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { forceStatus, rollConfigFor } from "./shared.js";
import { popupKey, bfCard, momentBarHTML, ruleLine } from "./decide/present.js";
import { SURFACES } from "./surfaces.js";
import { CARD, abilityOf, isCard, originData, originIdOf } from "./decide/card.js";
import { DialogCarried, momentButton, armAskTimer, disarmAskTimer, subjectOwns, dramaticVerdictPause, registerDemand, demandAnsweredBy, pendingRow,
  closePopup, frontPopup, postCard } from "./ui.js";
import { listen } from "./dispatch.js";

/* ⚠ The twin-ask supersede: `isActiveGM()` is per-USER, so two sessions on one account both stamp
 * the ask. An ask with an ELDER twin (timestamp, then id) deletes itself, the same on every client. */
listen("createChatMessage", "topple", message => {
  const flag = readFlag(message, "topple");
  if ( !flag?.sourceMessageId ) return;
  if ( !drivesMomentFor(flag?.attackerUuid) ) return;
  const elder = game.messages.contents.some(m => {
    if ( m.id === message.id ) return false;
    if ( readFlag(m, "topple")?.sourceMessageId !== flag.sourceMessageId ) return false;
    return (m.timestamp < message.timestamp)
      || ((m.timestamp === message.timestamp) && (m.id < message.id));
  });
  if ( elder ) {
    disarmToppleTimer(message.id);
    message.delete().catch(() => { /* the other twin got there first */ });
  }
});

// Dialogs on their way up, between the call and the render that adopts them.
const toppleDialogsOpening = new Set();

/**
 * The Topple save in the system's OWN save dialog, the demand riding `dialog.options` (ui.js
 * drawDemandFieldset). Dismissing is not an answer: the card's Roll button recalls it.
 */
async function showTopplePopup(message, _topple, target) {
  if ( frontPopup(message, `topple:${target.uuid}`) ) return;
  const key = popupKey(message.id, `topple:${target.uuid}`);
  if ( toppleDialogsOpening.has(key) ) return;
  toppleDialogsOpening.add(key);
  try {
    const flag = readFlag(message, "topple");
    const entry = flag?.targets?.find(t => t.uuid === target.uuid);
    if ( !entry || entry.done ) return;
    const actor = await resolveUuidAsync(target.uuid);
    if ( !(actor instanceof Actor) || !canAnswerFor(actor) ) return;
    const demand = new DialogCarried({
      cardId: message.id, key, failed: null,
      owed: card => { const e = readFlag(card, "topple")?.targets?.find(t => t.uuid === target.uuid); return !!e && !e.done; },
      present: card => ({
        img: readFlag(card, "topple")?.weapon?.img ?? null,
        eyebrow: "Weapon Mastery — Topple",
        title: `${target.name}: Constitution save, DC ${flag.dc}`,
        subtitle: `${flag.weapon?.name ?? "The weapon"} demands it.`,
        lines: [ruleLine("On a failed save, the creature has the Prone condition.")],
        tone: "pending"
      }),
      // The topple flag has no `status`; holdBarHTML gates on one, so hand it a pending view.
      bar: card => ({ status: "pending", ...readFlag(card, "topple") })
    });
    const rolls = await actor.rollSavingThrow(
      { ability: flag.ability || "con", target: flag.dc },
      { configure: true, options: { bfSaveDemand: demand } },
      { data: originData(message.id) }
    );
    // Fails pressed: no roll, recorded as a failure.
    if ( !rolls?.length && demand.failed ) await markToppleAutoFailed(message, target.uuid, demand.failed);
  } catch(err) {
    log.error(`Topple save dialog failed — roll it from the sheet.`, err);
  } finally {
    toppleDialogsOpening.delete(key);
  }
}

/** A save the rules fail before the roll, recorded as a failure (`total` null) and pressed the same. */
async function markToppleAutoFailed(message, uuid, sources = []) {
  let claimed = false;
  await queueFlagWrite(message, "topple", live => {
    const own = live.targets?.find(t => !t.done && (t.uuid === uuid));
    if ( !own ) return false;
    claimed = true;
    own.done = true;
    own.outcome = "prone";
    own.total = null;
    own.autoFailed = true;
    own.autoFailedBy = sources.filter(s => s.autoFail).map(s => s.statusName).join(", ") || null;
    own.answeredAt = Date.now();
  });
  if ( !claimed ) return;
  if ( (readFlag(message, "topple")?.targets ?? []).every(t => t.done) ) disarmToppleTimer(message.id);
  await applyToppleFailure(message, uuid);
}

/** Roll one pending topple target's save, chained to the card; the buzzer passes `timedOut`. */
async function rollToppleSave(message, target, { mode = null, bonus = null, timedOut = false } = {}) {
  const flag = readFlag(message, "topple");
  const entry = flag?.targets?.find(t => t.uuid === target.uuid);
  if ( !entry || entry.done ) return;
  const actor = await resolveUuidAsync(target.uuid);
  if ( !(actor instanceof Actor) ) return;
  await actor.rollSavingThrow(
    { ability: flag.ability || "con", target: flag.dc,
      ...rollConfigFor(mode, bonus) },
    { configure: false },
    { data: {
      ...originData(message.id),
      ...(timedOut ? { flags: { [MODULE_ID]: { timedOut: true } } } : {})   // nested: a roll hook's nested stamp would displace a dotted key
    } });
}

/* The buzzer: a demanded save is mandatory, so at the deadline the elect ROLLS it. An answer in the
 * log beats the clock; a vanished target is voided so the demand never sits pending. */
const toppleTimers = new Map();

function armToppleTimer(message) {
  armAskTimer(toppleTimers, message, "topple", live => fireToppleTimer(live.id),
    { owns: subjectOwns(f => f.attackerUuid), pending: f => (f.targets ?? []).some(t => !t.done) });
}

const disarmToppleTimer = messageId => disarmAskTimer(toppleTimers, messageId);

async function fireToppleTimer(messageId) {
  try {
    const card = game.messages.get(messageId);
    const flag = readFlag(card, "topple");
    if ( !flag ) return;
    for ( const t of (flag.targets ?? []) ) {
      if ( t.done ) continue;
      const landed = game.messages.contents.find(m =>
        isCard(m, CARD.save)
        && (originIdOf(m) === card.id)
        && (m.getAssociatedActor?.()?.uuid === t.uuid));
      if ( landed ) { void foldToppleSave(landed); continue; }
      const actor = await resolveUuidAsync(t.uuid);
      if ( !(actor instanceof Actor) ) {
        // Through the serializer: this loop walks every target, so it races itself.
        await queueFlagWrite(card, "topple", live => {
          const gone = live.targets?.find(x => !x.done && (x.uuid === t.uuid));
          if ( !gone ) return false;
          gone.done = true;
          gone.outcome = "gone";
          gone.applied = true; // nothing to press
          gone.answeredAt = Date.now();
        });
        continue;
      }
      await rollToppleSave(card, t, { timedOut: true });
    }
  } catch(err) {
    log.error(`Topple buzzer failed.`, err);
  }
}

/* The card folds its own save against its DC; a failure presses Prone. A save chained to any OTHER
 * message is never a Topple answer; a bare sheet roll may be. */
listen("createChatMessage", "topple", message => {
  if ( !isCard(message, CARD.save) ) return;
  // Reachable without a GM; the Prone press guards itself.
  if ( !isActiveGM() && game.users.activeGM ) return;
  void foldToppleSave(message);
});

/** The failure's press, announcement and `applied` receipt; idempotent by `applied`, so crash-resume re-drives it. */
async function applyToppleFailure(card, uuid) {
  const flag = foundry.utils.deepClone(readFlag(card, "topple"));
  const entry = flag?.targets?.find(t => t.uuid === uuid);
  if ( !entry || (entry.outcome !== "prone") || entry.applied ) return;
  const actor = resolveUuid(uuid);
  // ⚠ The press is GM-only: with no GM the verdict stands and the driver is told.
  if ( (actor instanceof Actor) && !canApplyTo(actor) ) {
    await whisperNoGM(`Topple's Prone on ${entry.name}`,
      `The save failed (${entry.total ?? "?"} vs DC ${flag.dc}) and the card says so — set Prone by hand.`);
    return;
  }
  if ( actor instanceof Actor ) await forceStatus(actor, "prone", { origin: flag.attackerUuid ?? null });
  await postCard({
    speaker: card.speaker,
    card: bfCard({
      img: flag.weapon?.img, eyebrow: "Weapon Mastery — Topple", tone: "good",
      title: `${entry.name} falls Prone`,
      subtitle: entry.autoFailed
        ? `Constitution save fails automatically — ${entry.autoFailedBy ?? "the condition"}`
        : `Constitution save ${entry.total ?? "?"} vs DC ${flag.dc}`
          + `${entry.timedOut ? " — rolled by the timer" : ""}`
    })
  });
  // ⚠ Re-checked INSIDE the serializer: a fold may have written the flag during the awaits.
  await queueFlagWrite(card, "topple", live => {
    const own = live.targets?.find(t => t.uuid === uuid);
    if ( !own || own.applied ) return false;
    own.applied = true;
  });
}

// Priority 2 (last): a BARE roll defers to a pending concentration ask or save demand.
// ⚠ `answering: null`: another machine's STAMPED answer is never Topple's (one roll, two verdicts).
registerDemand("topple", {
  priority: 2, chained: true, answering: null,
  pendingEntry: (flag, f) => (!(flag?.dc > 0) || (flag.ability && (f.ability !== flag.ability)))
    ? null : (flag.targets ?? []).find(t => !t.done && (t.uuid === f.actorUuid)) ?? null,
  pendingFor: (flag, uuid) => (flag?.dc > 0) ? (flag.targets ?? []).find(t => !t.done && (t.uuid === uuid)) ?? null : null
});

async function foldToppleSave(saveMessage) {
  try {
    const actor = saveMessage.getAssociatedActor?.();
    const total = saveMessage.rolls?.[0]?.total;
    if ( !actor || (typeof total !== "number") ) return;
    const found = demandAnsweredBy(saveMessage);
    if ( found?.flagKey !== "topple" ) return;
    // Whole-log; the oldest pending card answers first.
    for ( const { card } of found.matches ) {
      const flag = foundry.utils.deepClone(readFlag(card, "topple"));
      if ( !(flag?.dc > 0) ) continue;
      if ( flag.ability && (abilityOf(saveMessage) !== flag.ability) ) continue;
      const entry = flag.targets?.find(t => !t.done && (t.uuid === actor.uuid));
      if ( !entry ) continue;
      const success = total >= flag.dc;
      // ⚠ Claim re-found under `!done` inside the serializer: two saves can land in one tick.
      let claimed = false;
      await queueFlagWrite(card, "topple", live => {
        const own = live.targets?.find(t => !t.done && (t.uuid === actor.uuid));
        if ( !own ) return false;
        claimed = true;
        own.done = true;
        own.outcome = success ? "saved" : "prone";
        own.total = total;
        if ( readFlag(saveMessage, "timedOut") ) own.timedOut = true;
        // answeredAt is crash-resume's clock; a success has nothing to resume.
        own.answeredAt = Date.now();
        if ( success ) own.applied = true;
      });
      if ( !claimed ) continue;
      // ⚠ Re-read, not `flag`: the pre-write clone still shows this target pending.
      if ( (readFlag(card, "topple")?.targets ?? []).every(t => t.done) ) {
        disarmToppleTimer(card.id);
      }
      if ( !success ) {
        await dramaticVerdictPause(saveMessage);
        await applyToppleFailure(card, entry.uuid);
      } else {
        // A SUCCESS ANNOUNCES TOO: a public ask resolving in silence reads as a dropped machine.
        await dramaticVerdictPause(saveMessage);
        const stander = resolveUuid(entry.uuid);
        await postCard({
          actor: (stander instanceof Actor) ? stander : undefined, speaker: card.speaker,
          card: bfCard({
            img: flag.weapon?.img, eyebrow: "Weapon Mastery — Topple", tone: "neutral",
            title: `Topple — ${entry.name} stays standing`,
            subtitle: `Constitution save ${total} vs DC ${flag.dc}`
              + `${readFlag(saveMessage, "timedOut") ? " — rolled by the timer" : ""}`
          })
        });
      }
      return; // one save answers one card
    }
  } catch(err) {
    log.error(`Topple fold failed.`, err);
  }
}

// Every client closes a done entry's popup; the buzzer disarms when nothing is pending.
listen("updateChatMessage", "topple", message => {
  const topple = readFlag(message, "topple");
  if ( topple ) {
    for ( const t of (topple.targets ?? []) ) {
      if ( !t.done ) continue;
      void closePopup(message, `topple:${t.uuid}`);
    }
    if ( !(topple.targets ?? []).some(t => !t.done) ) disarmToppleTimer(message.id);
    else armToppleTimer(message);
  }
});

// The shown-latches ride ui.js's one delete-sweep; only this machine's clock disarms here.
listen("deleteChatMessage", "topple", message => {
  disarmToppleTimer(message.id);
});

// The Topple card's rows: the bar, a Roll button per target, the GM's Prone button.
listen("dnd5e.renderChatMessage", "topple", (message, html) => {
  const topple = readFlag(message, "topple");
  if ( topple?.targets?.length ) {
    // The buzzer re-arms on render from the absolute deadline, so a reload resumes the clock.
    if ( topple.deadline && topple.targets.some(t => !t.done) ) {
      const bar = document.createElement("div");
      pendingRow(message, bar, { bar: momentBarHTML(topple, "to roll"), arm: armToppleTimer });
      if ( bar.innerHTML.trim() ) html.querySelector(SURFACES.messageContent)?.appendChild(bar);
    }
    for ( const t of topple.targets ) {
      // Crash-resume: a folded failure whose press died with its client, stale past any live pause.
      if ( (t.outcome === "prone") && t.answeredAt && !t.applied && drivesMomentFor(topple?.attackerUuid)
        && (Date.now() - t.answeredAt > 20_000) ) void applyToppleFailure(message, t.uuid);
      if ( t.done ) continue;
      const actor = resolveUuid(t.uuid);

      // ⚠ The native [[/save]] enricher rolls for the SELECTED token (the attacker); this popup aims right.
      if ( topple.dc && canAnswerFor(actor) ) {
        const content = html.querySelector(SURFACES.messageContent);
        pendingRow(message, content, {
          latch: { sub: `topple:${t.uuid}`, show: () => showTopplePopup(message, topple, t) },
          answer: !!content && { label: `Roll save — ${t.name}`, show: () => showTopplePopup(message, readFlag(message, "topple"), t) }
        });
      }

      if ( game.user.isGM ) {
        html.querySelector(SURFACES.messageContent)?.appendChild(momentButton(`${t.name} failed — Prone`, async () => {
          const live = await resolveUuidAsync(t.uuid);
          if ( live instanceof Actor ) await forceStatus(live, "prone",
            { origin: readFlag(message, "topple")?.attackerUuid ?? null });
          await queueFlagWrite(message, "topple", live2 => {
            const entry = live2.targets?.find(x => x.uuid === t.uuid);
            if ( !entry ) return false;
            entry.done = true;
            entry.outcome = "prone";
            entry.applied = true;
            entry.answeredAt = Date.now();
          });
        }));
      }
    }
  }
});
