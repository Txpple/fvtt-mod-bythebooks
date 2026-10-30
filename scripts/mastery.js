/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): weapon mastery riders — the payouts, the mastery
 * ask, the reminders and the Cleave arm. topple.js owns the `topple` flag's lifecycle;
 * chip-spend.js owns the spend, the expiry tidy and the combat sweep.
 */
import { MODULE_ID, readFlag, TITLE, S, setting, drivesMomentFor, canApplyTo, whisperNoGM, queueFlagWrite, canAnswerFor, combatStamp, activeCombatFor, statContext, decisionWindow, resolveUuid, resolveUuidAsync, writableTargets, log } from "./core.js";
import { effectRecord, joinEffectReceipt, takenOf } from "./decide/receipt.js";
import { MASTERY_KINDS, MASTERY_NATIVE, MASTERY_RULES } from "./decide/registry.js";
import { CHIP_FLAG, chipClock, chipIsDead } from "./decide/chips.js";
import { chipData, chitStampOf, hitTargets, masteryLabel, placeOf, turnPlace } from "./shared.js";
import { bfCard, holdBarHTML, momentBarHTML, ruleLine, foldedRuleHTML, esc } from "./decide/present.js";
import { openMomentPopup, acknowledgeMoment, momentAcknowledged, armAskTimer, disarmAskTimer, electOwns, registerOfferPart, pendingRow, closePopup, postCard } from "./ui.js";
import { applyDamagesWithReceipt, receiptEntries } from "./auto-apply.js";
import { messageActivity } from "./effect-riders.js";
import { SURFACES } from "./surfaces.js";
import { CARD, isCard, masteryOf, targetsOf } from "./decide/card.js";
import { listen } from "./dispatch.js";

// The system stamps a mastery on the attack message only when the wielder has it (eligibility is
// pre-solved; the owner is always the attacking player). Vex/Sap/Slow = chips, Topple = save card,
// Push = announce, Graze = pays on a MISS, Cleave = reminder + arm; Nick stays native. No d20 is
// touched (DESIGN R1); chip windows: RULINGS *Chips and clocks*. The ask is a miniature hold.

/** Masteries already warned about — once per session, not once per swing. */
const warnedMasteries = new Set();

listen("ready", "mastery", () => {
  const mod = game.modules.get(MODULE_ID);
  if ( mod ) mod.api = Object.assign(mod.api ?? {}, { mastery: { answerMasteryPick } });
});

/** The authored payout effects. Nothing ships these — the system's masteries are labels. */
const MASTERY_EFFECTS = {
  vex: {
    name: "Vexed", img: "icons/svg/target.svg",
    description: attacker => `${attacker.name} has Advantage on their next attack roll against this creature (Vex, before the end of ${attacker.name}'s next turn).`
  },
  sap: {
    name: "Sapped", img: "icons/svg/downgrade.svg",
    description: attacker => `Disadvantage on its next attack roll (Sap, before the start of ${attacker.name}'s next turn).`
  },
  slow: {
    name: "Slowed", img: "icons/svg/net.svg",
    description: attacker => `Speed reduced by 10 feet until the start of ${attacker.name}'s next turn (Slow).`,
    changes: () => [
      { key: "system.attributes.movement.walk", type: "add", value: "-10" },
      { key: "system.attributes.movement.fly", type: "add", value: "-10" }
    ]
  }
};

/** Attacker, weapon and attack ability behind an attack message — or null. */
function masteryContext(attackMessage) {
  const activity = messageActivity(attackMessage);
  const weapon = activity?.item;
  const attacker = weapon?.actor;
  if ( !activity || !weapon || !attacker ) return null;
  return { activity, weapon, attacker, ability: activity.ability || "str" };
}

/** What this target TOOK (Vex/Slow's gate): the receipt, else the roll total (blind to immunity). */
function dealtFor(damageMessage, uuid) {
  const entry = receiptEntries(damageMessage).find(t => t.uuid === uuid);
  if ( entry ) return takenOf(entry);
  return damageMessage?.rolls?.reduce((n, r) => n + r.total, 0) ?? 0;
}

/**
 * Route a hit's mastery to its payout or its ask. Runs on the elect, after application. With
 * Tactical Master on the wielder the pick is asked here, at the hit (RULINGS *Weapon Mastery — the
 * record*, the bend): the stamped key waits for `masteryPick`, and `picked` is the answer's road back.
 */
export async function resolveHitMastery(damageMessage, attackMessage, hits, { picked = null } = {}) {
  try {
    const stamped = masteryOf(attackMessage);
    const ctx = masteryContext(attackMessage);
    if ( !ctx ) return;
    if ( !picked && stamped ) {
      const options = tacticalOptions(ctx);
      if ( options && !readFlag(attackMessage, MASTERY_PICK_FLAG) ) {
        await stampMasteryPick(attackMessage, damageMessage, ctx, options, stamped, hits);
        return;
      }
    }
    const key = picked ?? stamped;
    if ( !key ) return;

    // The dead are skipped — except for Cleave, where a kill is exactly when it matters.
    const struck = [];
    for ( const t of hits ) {
      const actor = await resolveUuidAsync(t.uuid);
      if ( actor instanceof Actor ) struck.push({ uuid: t.uuid, name: t.name, actor });
    }
    const live = struck.filter(t => (t.actor.system.attributes?.hp?.value ?? 0) > 0);
    if ( !live.length && (key !== "cleave") ) return;

    switch ( key ) {
      case "vex": {
        const dealt = live.filter(t => dealtFor(damageMessage, t.uuid) > 0);
        if ( !dealt.length ) return;
        await applyMasteryEffect(damageMessage ?? attackMessage, ctx, "vex", dealt);
        return postMasteryNotice(ctx, "vex", dealt);
      }
      case "sap":
        await applyMasteryEffect(damageMessage ?? attackMessage, ctx, "sap", live);
        return postMasteryNotice(ctx, "sap", live);
      case "cleave": {
        // A reminder once per turn (a chit on the attacker); the extra attack stays native.
        if ( !struck.length ) return;
        if ( await cleaveChitStands(ctx) ) return;
        // `struck`, not `live` — the corpse still anchors "within 5 feet of".
        return postMasteryNotice(ctx, "cleave", struck);
      }
      case "slow": {
        const eligible = live.filter(t => (dealtFor(damageMessage, t.uuid) > 0)
          && (((t.actor.system.attributes?.movement?.walk ?? 0) > 0)
            || ((t.actor.system.attributes?.movement?.fly ?? 0) > 0)));
        return askOrTake(attackMessage, damageMessage, ctx, "slow", eligible);
      }
      case "topple": {
        const eligible = live.filter(t => !t.actor.statuses?.has?.("prone"));
        return askOrTake(attackMessage, damageMessage, ctx, "topple", eligible);
      }
      case "push":
        return askOrTake(attackMessage, damageMessage, ctx, "push", live);
      default:
        // Nick is native. ⚠ Anything else is a NEW system mastery — warn loudly (DESIGN R4 tripwire).
        if ( !MASTERY_NATIVE.has(key) && !warnedMasteries.has(key) ) {
          warnedMasteries.add(key);
          log.warn(`Weapon mastery "${key}" is not one this module resolves (${[...MASTERY_KINDS].join("/")}) — left native. If the system added it, that is a NEW KIND against the R4 tripwire (DESIGN.md R4).`);
        }
        return;
    }
  } catch(err) {
    log.error(`Mastery rider failed.`, err);
  }
}

// Graze pays on the MISS (no damage message), read as rolled: a later Shield does not re-open it
// (RULINGS *Where the table bends the rule*).
listen("createChatMessage", "mastery", message => {
  if ( !isCard(message, CARD.attack) ) return;
  if ( masteryOf(message) !== "graze" ) return;
  if ( !drivesMomentFor(masteryContext(message)?.attacker?.uuid ?? null) ) return;
  void resolveMissMastery(message);
});

async function resolveMissMastery(attackMessage) {
  try {
    const ctx = masteryContext(attackMessage);
    if ( !ctx ) return;
    // Graze alone rides the RESOLVER mode: a miss has no damage button to fall back on.
    if ( (ctx.attacker.system.abilities?.[ctx.ability]?.mod ?? 0) <= 0 ) return;

    const hitSet = new Set(hitTargets(attackMessage).map(t => t.uuid));
    const missed = [];
    for ( const t of targetsOf(attackMessage) ) {
      if ( hitSet.has(t.uuid) ) continue;
      const actor = await resolveUuidAsync(t.uuid);
      if ( (actor instanceof Actor) && ((actor.system.attributes?.hp?.value ?? 0) > 0) )
        missed.push({ uuid: t.uuid, name: t.name });
    }
    if ( missed.length ) await askOrTake(attackMessage, null, ctx, "graze", missed);
  } catch(err) {
    log.error(`Graze failed.`, err);
  }
}

/** The optional masteries go through the gate: auto takes them, ask stamps the question. */
async function askOrTake(attackMessage, damageMessage, ctx, key, targets) {
  if ( !targets.length ) return; // hopeless: nothing left worth asking about
  const clean = targets.map(t => ({ uuid: t.uuid, name: t.name }));
  if ( setting(S.masteryAsk) === "auto" ) {
    return executeMasteryPayout(key, attackMessage, damageMessage, ctx, clean);
  }
  await stampMasteryAsk(attackMessage, damageMessage, ctx, key, clean);
}

async function executeMasteryPayout(key, attackMessage, damageMessage, ctx, targets) {
  switch ( key ) {
    case "slow": return applyMasteryEffect(damageMessage ?? attackMessage, ctx, "slow", targets);
    case "topple": return toppleCard(ctx, targets, damageMessage ?? attackMessage);
    case "push": return pushCard(ctx, targets);
    case "graze": return grazePayout(attackMessage, ctx, targets);
  }
}

/** Apply one authored chip per target and join the effect receipt; a same-weapon copy is refreshed,
 * never stacked. Not applyEffectsTo: these chips have no source document. */
async function applyMasteryEffect(receiptMessage, ctx, key, targets) {
  const def = MASTERY_EFFECTS[key];
  if ( !def ) return;
  // ⚠ With no GM connected the chip cannot be written; the reminder card still posts.
  const writable = writableTargets(targets);
  const blocked = targets.filter(t => !writable.includes(t));
  if ( blocked.length === targets.length ) {
    return whisperNoGM(`the ${masteryLabel(key)} chip on ${blocked.map(t => t.name).join(", ")}`,
      "The reminder card still stands, and the gate still meets the next roll.");
  }
  // ⚠ Pinned to the ATTACKER's combatant: the platform's own stamp is whoever's turn it is (wrong
  // for an opportunity attack). A clock on a combat that is not `game.combat` is born Unavailable.
  const clock = chipClock(key, placeOf(ctx.attacker));
  if ( !clock ) return;
  // ⚠ Entries merge inside the serializer at the end; reading the flag earlier loses other writers.
  const context = statContext(ctx.attacker.uuid); // the data-plane stamp, once per payout
  const entries = [];
  for ( const t of targets ) {
    const actor = (t.actor instanceof Actor) ? t.actor : await resolveUuidAsync(t.uuid);
    if ( !(actor instanceof Actor) ) continue;

    // Sweep dead chips first: an expired chip stays under Unavailable Effects and hides the live one.
    // ⚠ ONE batched delete: a synthetic actor rebuilds from the delta per write (NOTES §1).
    const dead = actor.effects.filter(e => readFlag(e, CHIP_FLAG) && chipIsDead(e.duration ?? {}));
    if ( dead.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", dead.map(e => e.id));

    const existing = actor.effects.find(e =>
      (readFlag(e, CHIP_FLAG) === key) && (e.origin === ctx.weapon.uuid));
    let applied;
    if ( existing ) {
      // ⚠ `?? existing`: Document#update returns UNDEFINED on an empty diff. The window restarts here.
      applied = (await existing.update({ ...chipData(clock), disabled: false })) ?? existing;
    } else {
      applied = await ActiveEffect.implementation.create({
        name: def.name, img: def.img,
        description: def.description(ctx.attacker),
        origin: ctx.weapon.uuid, disabled: false, transfer: false,
        ...chipData(clock),
        changes: def.changes?.() ?? [],
        flags: { [MODULE_ID]: { [CHIP_FLAG]: key } }
      }, { parent: actor });
    }
    if ( !applied ) continue;
    entries.push({ uuid: t.uuid, name: t.name, img: actor.img ?? null,
      effects: [effectRecord({ id: applied.id, name: applied.name,
        img: applied.img, description: applied.description }, context)] });
  }
  if ( entries.length && receiptMessage ) {
    await queueFlagWrite(receiptMessage, "effectReceipt", flag => {
      for ( const entry of entries ) joinEffectReceipt(flag, entry);
    });
  }
}

/**
 * Does a Cleave chit stand this turn? If not, write one and answer false (remind).
 * ⚠ Live by STAMP COMPARISON (`combatStamp`), not the GM-written `expired` mark — on a no-GM table
 * that mark never lands. The `turnEnd` expiry only tidies the document.
 */
async function cleaveChitStands(ctx) {
  const attacker = ctx.attacker;
  const chits = attacker.effects.filter(e => readFlag(e, CHIP_FLAG) === "cleave");
  if ( !activeCombatFor(attacker) ) return false;
  const stamp = combatStamp();
  if ( stamp && chits.some(e => chitStampOf(e) === stamp) ) return true;
  if ( !canApplyTo(attacker) ) return false;
  // Stale chits go first — earlier turns', or a combat that ended with nobody to tidy them.
  if ( chits.length ) await attacker.deleteEmbeddedDocuments("ActiveEffect", chits.map(e => e.id));
  const clock = chipClock("cleave", turnPlace());
  if ( !clock ) return false;
  await ActiveEffect.implementation.create({
    name: "Cleave — this turn", img: ctx.weapon.img ?? "icons/svg/sword.svg",
    description: `Cleave has been offered this turn (${ctx.weapon.name}). The extra attack is once per turn; this chit ends with the turn.`,
    origin: ctx.weapon.uuid, disabled: false, transfer: false,
    ...chipData(clock),
    flags: { [MODULE_ID]: { [CHIP_FLAG]: "cleave" } }
  }, { parent: attacker });
  return false;
}

/** Topple: the demand, the native save link, and a GM affordance for the failure. */
async function toppleCard(ctx, targets, sourceMessage = null) {
  const dc = 8 + (ctx.attacker.system.attributes?.prof ?? 0)
    + (ctx.attacker.system.abilities?.[ctx.ability]?.mod ?? 0);
  const names = targets.map(t => t.name).join(", ");
  // The SAVE timer: a demanded save is mandatory, so expiry rolls; 0 waits indefinitely.
  const window = decisionWindow();
  await postCard({
    actor: ctx.attacker,
    card: bfCard({
      img: ctx.weapon.img, eyebrow: "Weapon Mastery — Topple", tone: "good",
      title: `${names}: Constitution save, DC ${dc}`,
      subtitle: `${ctx.attacker.name} — ${ctx.weapon.name}`,
      lines: [`[[/save ability=con dc=${dc} format=long]]`, "On a failure, it falls Prone."]
    }),
    flags: { [MODULE_ID]: { topple: {
      dc, ability: "con",
      attackerUuid: ctx.attacker.uuid,
      ...statContext(ctx.attacker.uuid), // the data-plane stamp
      // One swing asks once, however many clients think they are the elect (topple.js supersedes twins).
      sourceMessageId: sourceMessage?.id ?? null,
      weapon: { name: ctx.weapon.name, img: ctx.weapon.img },
      ...(window ? { window, deadline: Date.now() + (window * 1000) } : {}),
      targets: targets.map(t => ({ uuid: t.uuid, name: t.name, done: false }))
    } } }
  });
}

/** Push: announce the option. Tokens are never moved — sliding one is free at the table. */
async function pushCard(ctx, targets) {
  const names = targets.map(t => t.name).join(", ");
  await postCard({
    actor: ctx.attacker,
    card: bfCard({
      img: ctx.weapon.img, eyebrow: "Weapon Mastery — Push", tone: "good",
      title: `${ctx.attacker.name} can push ${names} 10 feet`,
      subtitle: `${ctx.weapon.name} — straight away, Large or smaller`,
      lines: ["Move the token; nothing is automated."]
    })
  });
}

/** Graze: the miss still pays the attack ability's modifier, through the shared applier. */
async function grazePayout(attackMessage, ctx, targets) {
  const mod = ctx.attacker.system.abilities?.[ctx.ability]?.mod ?? 0;
  if ( mod <= 0 ) return;
  const writable = writableTargets(targets);
  if ( !writable.length ) {
    return whisperNoGM(`Graze's ${mod} damage to ${targets.map(t => t.name).join(", ")}`,
      "Apply it by hand — the miss still pays under the rule.");
  }
  targets = writable;
  const type = [...(ctx.weapon.system.damage?.base?.types ?? [])][0] ?? "";
  await applyDamagesWithReceipt(attackMessage, targets, [{
    value: mod, type, properties: new Set(ctx.weapon.system.properties ?? [])
  }], { note: "Graze — the miss still pays" });
}

/** What each reminder card says; the roll gate does the reminding at the next roll. */
const NOTICE_TEXT = {
  vex: (_ctx, names) => ({
    title: "Vex — Advantage on your next attack",
    lines: [ruleLine(MASTERY_RULES.vex),
      `Against ${names}.`]
  }),
  sap: (_ctx, names) => ({
    title: `Sap — ${names} at Disadvantage`,
    lines: [ruleLine(MASTERY_RULES.sap),
      `The chip on ${names} carries the rule.`]
  }),
  cleave: (ctx, _names) => ({
    title: "Cleave — one extra attack available",
    lines: [ruleLine(MASTERY_RULES.cleave),
      `Press "Arm the Cleave" and the next ${esc(ctx.weapon.name)} damage roll drops the modifier for you; Dismiss to resolve it yourself — or if you've already Cleaved this turn.`]
  })
};

/** The elect posts the reminder card: the record, and the bus the owner's popup rides. */
async function postMasteryNotice(ctx, key, targets) {
  const names = targets.map(t => t.name).join(", ");
  const { title, lines } = NOTICE_TEXT[key](ctx, names);
  const subtitle = `${ctx.attacker.name} — ${ctx.weapon.name}`;
  // 0 stamps no window; the bar and the auto-close read a missing window as "until dismissed".
  const window = decisionWindow();
  await postCard({
    actor: ctx.attacker,
    card: bfCard({
      img: ctx.weapon.img, eyebrow: `Weapon Mastery — ${masteryLabel(key)}`, tone: "good",
      title, subtitle, lines
    }),
    flags: { [MODULE_ID]: { masteryNotice: {
      key, attackerUuid: ctx.attacker.uuid,
      // `id`: the Cleave arm keys on this exact weapon — a name is not an identity (two daggers).
      weapon: { id: ctx.weapon.id, name: ctx.weapon.name, img: ctx.weapon.img },
      title, subtitle, lines,
      ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
    } } }
  });
}

/** The reminder popup: OK and a drain bar (ARCHITECTURE.md §6); Cleave's is a decision, so it
 * carries Arm the Cleave / Dismiss. */
async function showMasteryNotice(message, notice) {
  const attacker = resolveUuid(notice.attackerUuid);
  // Any button acknowledges (ARCHITECTURE.md §5 law 3); the X is a non-event.
  const buttons = (notice.key === "cleave")
    ? [
      { action: "arm", label: "Arm the Cleave", default: true,
        callback: () => { void armCleave(notice); void acknowledgeMoment(message, "masteryNotice"); } },
      { action: "dismiss", label: "Dismiss",
        callback: () => acknowledgeMoment(message, "masteryNotice") }
    ]
    : [{ action: "ok", label: "OK", default: true,
        callback: () => acknowledgeMoment(message, "masteryNotice") }];
  await openMomentPopup(message, "notice", attacker, {
    title: `${masteryLabel(notice.key)} — ${notice.weapon?.name ?? ""}`, icon: "fa-solid fa-medal",
    width: 420,
    content: bfCard({
      img: notice.weapon?.img, eyebrow: `Weapon Mastery — ${masteryLabel(notice.key)}`,
      tone: "good", title: notice.title, subtitle: notice.subtitle, lines: notice.lines ?? []
    }) + momentBarHTML(notice, "reminder"),
    buttons,
    autoCloseAt: notice.deadline
  });
}

// The Cleave arm: the player DECLARES it (with Extra Attack a second swing is ordinary, never
// detected); one-shot actor flag, stale by combat-stamp mismatch, or after 60s out of combat.

const CLEAVE_ARM_TTL_MS = 60_000;   // out-of-combat only; in combat the turn stamp governs

async function armCleave(notice) {
  const attacker = resolveUuid(notice.attackerUuid);
  if ( !(attacker instanceof Actor) || !notice.weapon?.id ) return;
  await attacker.setFlag(MODULE_ID, "cleaveArm", {
    itemId: notice.weapon.id, itemName: notice.weapon.name ?? "",
    stamp: combatStamp(), armedAt: Date.now()
  });
  ui.notifications.info(`${TITLE}: Cleave armed — the next ${notice.weapon.name} damage roll drops the ability modifier.`);
}

/** Freshness, read-only — the render block asks the same question without consuming. */
function cleaveArmFresh(arm) {
  if ( !arm ) return false;
  return arm.stamp
    ? (arm.stamp === combatStamp())
    : ((combatStamp() === null) && (Date.now() - (arm.armedAt ?? 0) <= CLEAVE_ARM_TTL_MS));
}

/** The live arm on an actor, with staleness applied at read time (stale ⇒ unset, null). */
function liveCleaveArm(actor) {
  const arm = readFlag(actor, "cleaveArm");
  if ( !arm ) return null;
  if ( !cleaveArmFresh(arm) ) { void actor.unsetFlag(MODULE_ID, "cleaveArm"); return null; }
  return arm;
}

/** The arm on THIS item, or null. Read-only; the strip is the only consumer. */
function cleaveArmedFor(item) {
  if ( item?.type !== "weapon" ) return null;
  const arm = liveCleaveArm(item.actor);
  return (arm && (arm.itemId === item.id)) ? arm : null;
}

// The armed Cleave announces itself on the damage offer before the dice: a line, nothing to commit.
registerOfferPart({
  key: "cleave",
  parts: (_attackMessage, activity) => cleaveArmedFor(activity.item)
    ? { lines: ["<strong>Cleave</strong> — this is the armed Cleave swing: the ability modifier is dropped from this roll."] }
    : null
});

// THE STRIP, on whichever client rolls the damage, before the dice. A NEGATIVE modifier stays (as
// dnd5e's own off-hand rule, AttackActivity#_processDamagePart).
listen("dnd5e.preRollDamage", "mastery", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "attack" ) return;
    const item = activity.item;
    if ( item?.type !== "weapon" ) return;
    const arm = liveCleaveArm(item.actor);
    if ( !arm || (arm.itemId !== item.id) ) return;
    void item.actor.unsetFlag(MODULE_ID, "cleaveArm");   // one-shot, consumed even when skipped
    // The BASE entry, never index 0 — ammunition can splice ahead of it (probe-preroll-parts).
    const base = (config.rolls ?? []).find(r => r.base === true);
    if ( !base ) return;
    if ( (base.data?.mod ?? 0) < 0 ) return;             // the RAW corner: a penalty stays
    const ix = (base.parts ?? []).findIndex(p => String(p).includes("@mod"));
    if ( ix < 0 ) return;                                 // nothing to drop (thrown natural, offhand…)
    base.parts.splice(ix, 1);                             // "@mod" only — @magicalBonus/@ammoBonus stay
    // Message-data mutations here persist onto the damage message.
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.cleaveStripped`,
      { itemName: arm.itemName ?? item.name });
  } catch(err) {
    log.error(`Cleave strip failed.`, err);
  }
});

/* --- Tactical Master: the pick at the hit --------------------------------------------------------- */

const MASTERY_PICK_FLAG = "masteryPick";
const pickTimers = new Map();

/** The wielder's choices on this weapon beyond its own mastery (dnd5e's `masteryOptions`), or null. */
function tacticalOptions(ctx) {
  const options = ctx.weapon?.system?.masteryOptions;
  if ( !Array.isArray(options) || (options.length < 2) ) return null;
  return options.map(o => ({ key: o.value, label: masteryLabel(o.value) }));
}

async function stampMasteryPick(attackMessage, damageMessage, ctx, options, stamped, hits) {
  const window = decisionWindow();
  await attackMessage.setFlag(MODULE_ID, MASTERY_PICK_FLAG, {
    status: "pending", options, stamped,
    weapon: { name: ctx.weapon.name, img: ctx.weapon.img },
    attackerUuid: ctx.attacker.uuid,
    damageMessageId: damageMessage?.id ?? null,
    hits: hits.map(t => ({ uuid: t.uuid, name: t.name })),
    ...statContext(ctx.attacker.uuid),
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
  });
  armPickTimer(attackMessage);
}

/** One answer, first writer wins; the decider owns the attack message. `pass` takes no mastery. */
export async function answerMasteryPick(message, key, { timedOut = false } = {}) {
  const p = foundry.utils.deepClone(readFlag(message, MASTERY_PICK_FLAG) ?? {});
  if ( (p.status !== "pending") || p.answer ) return;
  if ( (key !== "pass") && !(p.options ?? []).some(o => o.key === key) ) return;
  p.answer = key;
  p.answeredAt = Date.now();
  if ( timedOut ) p.timedOut = true;
  await message.setFlag(MODULE_ID, MASTERY_PICK_FLAG, p);
}

const pickExecutions = new Set();

/** The elect claims the answer and runs the hit's mastery as if the dialog had picked it. */
async function executeMasteryPick(message) {
  if ( pickExecutions.has(message.id) ) return;
  pickExecutions.add(message.id);
  try {
    const p = foundry.utils.deepClone(readFlag(message, MASTERY_PICK_FLAG) ?? {});
    if ( (p.status !== "pending") || !p.answer ) return;
    p.status = "done";
    disarmPickTimer(message.id);
    await message.setFlag(MODULE_ID, MASTERY_PICK_FLAG, p);
    if ( p.answer === "pass" ) return;
    const damageMessage = p.damageMessageId ? game.messages.get(p.damageMessageId) : null;
    await resolveHitMastery(damageMessage, message, p.hits ?? [], { picked: p.answer });
  } finally {
    pickExecutions.delete(message.id);
  }
}

/** Expiry takes the stamped mastery — the weapon's own, or what the dialog chose. */
const armPickTimer = message =>
  armAskTimer(pickTimers, message, MASTERY_PICK_FLAG, live => answerMasteryPick(live, readFlag(live, MASTERY_PICK_FLAG)?.stamped ?? "pass", { timedOut: true }), { owns: electOwns });
const disarmPickTimer = messageId => disarmAskTimer(pickTimers, messageId);

/** The pick popup: one button per mastery (the weapon's own first), and Pass. */
async function showMasteryPickPopup(message, p) {
  const attacker = resolveUuid(p.attackerUuid);
  const buttons = (p.options ?? []).map(o => ({
    action: o.key, label: o.label, default: o.key === p.stamped,
    callback: () => answerMasteryPick(message, o.key)
  }));
  buttons.push({ action: "pass", label: "Pass", callback: () => answerMasteryPick(message, "pass") });
  await openMomentPopup(message, MASTERY_PICK_FLAG, attacker, {
    title: `Tactical Master — ${p.weapon?.name ?? ""}`, icon: "fa-solid fa-medal", width: 440,
    content: bfCard({
      img: p.weapon?.img, eyebrow: "Weapon Mastery — Tactical Master", tone: "pending",
      title: "The hit landed: which mastery?",
      subtitle: `${attacker?.name ?? "The attacker"} — ${p.weapon?.name ?? "weapon"}`,
      lines: [`Against: ${esc((p.hits ?? []).map(t => t.name).join(", "))}`, ...(p.options ?? []).map(o => `<div style="margin-top:0.25rem;"><b>${esc(o.label)}</b>${(o.key === p.stamped) ? " <span style=\"opacity:0.7;\">· the weapon's own</span>" : ""}${foldedRuleHTML(MASTERY_RULES[o.key])}</div>`)]
    }) + holdBarHTML(p),
    buttons
  });
}

// The dialog's own Mastery select goes, replaced by a note: the pick is asked on the hit.
listen("renderRollConfigurationDialog", "mastery", (_app, element) => {
  const select = element?.querySelector?.(SURFACES.dialogMastery);
  if ( !select || (select.options?.length < 2) ) return;
  const group = select.closest(SURFACES.formGroup) ?? select;
  const note = document.createElement("div");
  note.className = "bythebooks-mastery-note";
  note.innerHTML = bfCard({ eyebrow: "Weapon Mastery — Tactical Master", tone: "neutral", title: "Picked on a hit", subtitle: "Sap, Push or Slow — the popup asks when the attack lands." });
  group.replaceWith(note);
});

// The ask: stamp → row → popup → answer → execute.

const masteryTimers = new Map();

async function stampMasteryAsk(attackMessage, damageMessage, ctx, key, targets) {
  const window = decisionWindow();
  await attackMessage.setFlag(MODULE_ID, "mastery", {
    status: "pending", key,
    weapon: { name: ctx.weapon.name, img: ctx.weapon.img },
    attackerUuid: ctx.attacker.uuid,
    damageMessageId: damageMessage?.id ?? null,
    ...statContext(ctx.attacker.uuid), // the data-plane stamp — every moment flag carries it
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {}),
    targets
  });
  armMasteryTimer(attackMessage);
}

/** One answer, first writer wins. The decider owns the attack message (it is their roll). */
async function answerMastery(message, answer, { timedOut = false } = {}) {
  const m = foundry.utils.deepClone(readFlag(message, "mastery") ?? {});
  if ( (m.status !== "pending") || m.answer ) return;
  m.answer = answer;
  m.answeredAt = Date.now();   // the crash-resume horizon
  if ( timedOut ) m.timedOut = true;
  await message.setFlag(MODULE_ID, "mastery", m);
}

/** The elect claims the answer, then pays it out. ⚠ The render resume and the update watcher can
 * both call this in one tick before the claim lands (stacked chips); this latch closes that race. */
const masteryExecutions = new Set();

async function executeMasteryAnswer(message) {
  if ( masteryExecutions.has(message.id) ) return;
  masteryExecutions.add(message.id);
  try {
    const m = foundry.utils.deepClone(readFlag(message, "mastery") ?? {});
    if ( (m.status !== "pending") || !m.answer ) return;
    m.status = "done";
    m.outcome = (m.answer === "use") ? "used" : (m.timedOut ? "timed out" : "passed");
    disarmMasteryTimer(message.id);
    await message.setFlag(MODULE_ID, "mastery", m);
    if ( m.answer !== "use" ) return;
    const ctx = masteryContext(message);
    if ( !ctx ) return;
    const damageMessage = m.damageMessageId ? game.messages.get(m.damageMessageId) : null;
    await executeMasteryPayout(m.key, message, damageMessage, ctx, m.targets ?? []);
  } finally {
    masteryExecutions.delete(message.id);
  }
}

// The answer channel: every client closes an answered popup; the elect executes.
listen("updateChatMessage", "mastery", message => {
  const p = readFlag(message, MASTERY_PICK_FLAG);
  if ( p ) {
    if ( (p.status !== "pending") || p.answer ) void closePopup(message, MASTERY_PICK_FLAG);
    if ( drivesMomentFor(p?.attackerUuid) && (p.status === "pending") && p.answer ) void executeMasteryPick(message);
  }
  const m = readFlag(message, "mastery");
  if ( m ) {
    if ( (m.status !== "pending") || m.answer ) void closePopup(message, "mastery");
    if ( drivesMomentFor(m?.attackerUuid) && (m.status === "pending") && m.answer ) void executeMasteryAnswer(message);
  }

  if ( readFlag(message, "masteryNotice")?.acknowledged ) {
    void closePopup(message, "notice");
  }
});

// The shown-latches ride ui.js's one delete-sweep; only this machine's clock disarms here.
listen("deleteChatMessage", "mastery", message => {
  disarmMasteryTimer(message.id);
  disarmPickTimer(message.id);
});

/** Expiry answers Pass — the AFK fallback for a decision nobody made. */
const armMasteryTimer = message =>
  armAskTimer(masteryTimers, message, "mastery", live => answerMastery(live, "pass", { timedOut: true }), { owns: electOwns });
const disarmMasteryTimer = messageId => disarmAskTimer(masteryTimers, messageId);

/** The Use/Pass popup — the same two controls for everybody, on the hold's own bar. */
async function showMasteryPopup(message, m) {
  const attacker = resolveUuid(m.attackerUuid);
  const label = masteryLabel(m.key);
  await openMomentPopup(message, "mastery", attacker, {
    title: `${label} — ${m.weapon?.name ?? ""}`, icon: "fa-solid fa-medal", width: 420,
    content: bfCard({
      img: m.weapon?.img, eyebrow: "Weapon Mastery", tone: "neutral",
      title: `${label}: use it?`,
      subtitle: `${attacker?.name ?? "The attacker"} — ${m.weapon?.name ?? "weapon"}`,
      lines: [ruleLine(MASTERY_RULES[m.key]), `Against: ${esc((m.targets ?? []).map(t => t.name).join(", "))}`]
    }) + holdBarHTML(m),
    buttons: [
      { action: "use", label: `Use ${label}`, default: true,
        callback: () => answerMastery(message, "use") },
      { action: "pass", label: "Pass",
        callback: () => answerMastery(message, "pass") }
    ]
  });
}

// The card rows: the ask, the notice and the strip's receipt. Stateless.
listen("dnd5e.renderChatMessage", "mastery", (message, html) => {
  const p = readFlag(message, MASTERY_PICK_FLAG);
  if ( p ) {
    const row = document.createElement("div");
    row.className = "bythebooks-mastery-pick";
    const pending = p.status === "pending";
    row.innerHTML = bfCard({
      img: p.weapon?.img, eyebrow: "Weapon Mastery — Tactical Master",
      tone: pending ? "pending" : "neutral",
      title: pending ? "Which mastery?" : (p.answer === "pass") ? "No mastery" : `${masteryLabel(p.answer)} chosen`,
      subtitle: `${p.weapon?.name ?? ""} — ${(p.hits ?? []).map(t => t.name).join(", ")}${p.timedOut ? " · the timer took the weapon's own" : ""}`
    });
    html.querySelector(SURFACES.messageContent)?.appendChild(row);
    if ( pending ) {
      if ( p.answer && drivesMomentFor(p?.attackerUuid) ) void executeMasteryPick(message);
      const may = canAnswerFor(resolveUuid(p.attackerUuid)) && !p.answer;
      pendingRow(message, row, {
        bar: holdBarHTML(p),
        latch: may && { sub: MASTERY_PICK_FLAG, show: () => showMasteryPickPopup(message, p) },
        answer: may && { show: () => showMasteryPickPopup(message, readFlag(message, MASTERY_PICK_FLAG)), style: { margin: "0.25rem 0 0" } },
        arm: armPickTimer
      });
    }
  }
  const m = readFlag(message, "mastery");
  if ( m ) {
    const row = document.createElement("div");
    row.className = "bythebooks-mastery";
    const label = masteryLabel(m.key);
    const pending = m.status === "pending";
    const outcome = m.outcome === "used" ? `${label} used`
      : m.outcome === "timed out" ? "Passed (timer)" : "Passed";
    row.innerHTML = bfCard({
      img: m.weapon?.img, eyebrow: "Weapon Mastery",
      tone: pending ? "neutral" : (m.outcome === "used" ? "good" : "neutral"),
      title: pending ? `${label} — ${(m.targets ?? []).map(t => t.name).join(", ")}` : outcome,
      subtitle: `${label} — ${m.weapon?.name ?? ""}`,
      lines: pending ? [ruleLine(MASTERY_RULES[m.key])] : []
    });
    html.querySelector(SURFACES.messageContent)?.appendChild(row);

    if ( pending ) {
      // Resume an ask answered while nobody could execute; executeMasteryAnswer is claim-first.
      if ( m.answer && drivesMomentFor(m?.attackerUuid) ) void executeMasteryAnswer(message);
      // ONE input surface: the popup decides, the card recalls a dismissed popup.
      const may = canAnswerFor(resolveUuid(m.attackerUuid)) && !m.answer;
      pendingRow(message, row, {
        bar: holdBarHTML(m),
        latch: may && { sub: "mastery", show: () => showMasteryPopup(message, m) },
        answer: may && { show: () => showMasteryPopup(message, readFlag(message, "mastery")), style: { margin: "0.25rem 0 0" } },
        arm: armMasteryTimer
      });
    }
  }

  // The reminder popup rides the notice card; the deadline keeps an old log render from nagging.
  const notice = readFlag(message, "masteryNotice");
  if ( notice ) {
    // ⚠ A WINDOWLESS notice (noticeTimer 0) is live until acknowledged — never test the deadline alone.
    const live = (!notice.deadline || (notice.deadline > Date.now()))
      && !momentAcknowledged(message, "masteryNotice");
    const attacker = resolveUuid(notice.attackerUuid);
    const bar = document.createElement("div");
    pendingRow(message, bar, {
      bar: live && momentBarHTML(notice, "reminder"),
      latch: canAnswerFor(attacker) && live && { sub: "notice", show: () => showMasteryNotice(message, notice) }
    });
    if ( bar.innerHTML.trim() ) html.querySelector(SURFACES.messageContent)?.appendChild(bar);
    // Read-only: display must never consume a stale arm; the strip owns that.
    if ( notice.key === "cleave" ) {
      const arm = (attacker instanceof Actor) ? readFlag(attacker, "cleaveArm") : null;
      if ( cleaveArmFresh(arm) && (arm.itemId === notice.weapon?.id) ) {
        const armed = document.createElement("div");
        armed.innerHTML = bfCard({
          img: notice.weapon?.img, eyebrow: "Weapon Mastery — Cleave", tone: "good",
          title: "Cleave — armed",
          subtitle: `The next ${arm.itemName || "weapon"} damage roll drops the ability modifier.`
        });
        html.querySelector(SURFACES.messageContent)?.appendChild(armed);
      } else if ( canAnswerFor(attacker) && live ) {
        const content = html.querySelector(SURFACES.messageContent);
        if ( content ) pendingRow(message, content, { answer: { show: () => showMasteryNotice(message, readFlag(message, "masteryNotice")), style: { margin: "0.25rem 0 0" } } });
      }
    }
  }

  const stripped = readFlag(message, "cleaveStripped");
  if ( stripped ) {
    const line = document.createElement("div");
    line.innerHTML = bfCard({
      eyebrow: "Weapon Mastery — Cleave", tone: "neutral",
      title: "Cleave — ability modifier dropped",
      subtitle: `${stripped.itemName || "The weapon"}'s Cleave — this roll takes no ability modifier.`
    });
    html.querySelector(SURFACES.messageContent)?.appendChild(line);
  }
});
