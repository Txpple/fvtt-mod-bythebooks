/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): the Battle Master's Bonus Action maneuvers (RULINGS
 * *The rest of the maneuvers*) — each a USE whose consequence lands on a sheet, and for Lunging
 * and Feinting a die that rides the next hit. The pool is spent by the activity's own consumption.
 */
import { MODULE_ID, readFlag, canAnswerFor, drivesMomentFor, queueFlagWrite, claimLanding, claimHolds, statContext, decisionWindow, stampedSourceOf, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { ruleHTML } from "./rule-text.js";
import { cardItem, lower, featureNamed, activityNamed, resolveDie } from "./lookup.js";
import { superiorityUseEntries, listedNames } from "./decide/registry.js";
import { chipData, hitTargets, placeOf, poolSpendsOn, chipSpendsOn } from "./shared.js";
import { bfCard, holdBarHTML, riderMenuHTML, ruleLine, spendPhrase, esc } from "./decide/present.js";
import { MANEUVER_FEATURE_NAMES, SUPERIORITY_USES, answers, tableIndex } from "./decide/registry.js";
import { CHIP_FLAG, chipClock } from "./decide/chips.js";
import { riderPartFormula } from "./decide/clock.js";
import { armAskTimer, subjectOwns, openMomentPopup, registerResumable, registerOfferPart, pendingRow, pickInputs, closePopup } from "./ui.js";
import { attackMessageForDamage } from "./auto-damage.js";
import { applyEffectsWithReceipt } from "./effect-riders.js";
import { SURFACES } from "./surfaces.js";
import { closeLedger, effectsNamed, landingSteps } from "./ledger.js";
import { CARD, isCard, targetsOf } from "./decide/card.js";
import { listen } from "./dispatch.js";

const listed = () => listedNames(superiorityUseEntries());
const { rowFor } = tableIndex(SUPERIORITY_USES);
const useRowFor = activity => {
  const row = rowFor(activity?.item);
  if ( !row || !listed().has(lower(row.key)) ) return null;
  return (lower(activity.name) === lower(row.use)) ? row : null;
};

/** The Superiority Die as this activity names it, resolved on the actor. */
function dieOf(actor, activity) {
  const part = activity?.damage?.parts?.[0];
  const raw = activity?.roll?.formula || (part ? riderPartFormula({ number: part.number, denomination: part.denomination, custom: part.custom, bonus: part.bonus }) : null);
  return resolveDie(actor, raw);
}

/** The fighter's standing use-chip for a row, or null. */
const chipFor = (actor, key) => actor?.effects?.find(e => (readFlag(e, CHIP_FLAG) === "use") && (readFlag(e, "useKey") === key)) ?? null;

// The use: the native follow-up off, the consequence on.

// ⚠ THE CAST SLICE MUST NOT APPLY A MANEUVER'S EFFECTS (Bait and Switch ships TWELVE, one per
// face): polish.js's birth stamp is removed here, one hook later, on every maneuver card.
listen("preCreateChatMessage", "superiority-uses", doc => {
  try {
    if ( !isCard(doc, CARD.usage) || !readFlag(doc, "castApply") ) return;
    const item = cardItem(doc);
    if ( !item || (item.type !== "feat") || ![...MANEUVER_FEATURE_NAMES].some(n => answers(n, item)) ) return;
    doc.updateSource({ [`flags.${MODULE_ID}.-=castApply`]: null });
  } catch(err) { log.warn(`Could not keep the cast slice off a maneuver's card.`, err); }
});

// A damage-typed use (Feinting, Lunging): the die is the HIT's, so dnd5e's follow-up damage
// dialog is switched off at the use.
listen("dnd5e.preUseActivity", "superiority-uses", (activity, usageConfig) => {
  try {
    if ( useRowFor(activity) && (activity.type === "damage") ) usageConfig.subsequentActions = false;
  } catch(err) { log.warn(`Could not claim a maneuver's use.`, err); }
});

listen("dnd5e.postUseActivity", "superiority-uses", (activity, _usageConfig, results) => {
  try {
    const row = useRowFor(activity);
    if ( !row ) return;
    const actor = activity.actor;
    if ( !actor?.isOwner ) return;
    const message = (results?.message instanceof ChatMessage) ? results.message : null;
    if ( !message || readFlag(message, "superiorityUse") ) return;
    void drive(row, activity, actor, message);
  } catch(err) {
    log.error(`A maneuver's use failed — apply it by hand.`, err);
  }
});

async function drive(row, activity, actor, message) {
  const item = activity.item;
  const die = dieOf(actor, activity);
  const targets = targetsOf(message).map(t => ({ uuid: t.uuid, name: t.name }));
  const base = { ...statContext(actor.uuid), key: row.key, die, rule: row.rule, itemImg: item.img ?? null };
  if ( row.bonus ) {
    // Evasive Footwork: the die rolled in the open, the number on the sheet until the start of the next turn.
    const roll = die ? await new Roll(die).evaluate() : null;
    if ( roll ) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${item.name} — the die` });
    const stale = actor.effects.filter(e => (readFlag(e, CHIP_FLAG) === "use") && (readFlag(e, "useKey") === row.key));
    if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id));
    const clock = chipClock(row.bonus.window, placeOf(actor));
    const effect = roll ? await ActiveEffect.implementation.create({
      name: item.name, img: item.img ?? "icons/svg/shield.svg",
      description: `${await ruleHTML(row.rule)}<p>Written by By the Books when ${esc(item.name)} was used: ${row.bonus.what} +${roll.total} until the start of ${esc(actor.name)}'s next turn.</p>`,
      origin: item.uuid, disabled: false, transfer: false,
      changes: [{ key: row.bonus.key, type: "add", value: String(roll.total) }],
      ...(clock ? chipData(clock) : {}),
      flags: { [MODULE_ID]: { [CHIP_FLAG]: "use", useKey: row.key } }
    }, { parent: actor }) : null;
    await message.setFlag(MODULE_ID, "superiorityUse", { ...base, total: roll?.total ?? null, effectId: effect?.id ?? null,
      line: roll ? `${row.bonus.what} +${roll.total} until the start of your next turn` : "the die could not be read — apply the bonus by hand" });
    return;
  }
  if ( row.choice ) {
    // Bait and Switch: WHO wears the die is the fighter's choice (a popup, the fighter by
    // default); the pack's own "+N" effect is applied on the answer.
    const roll = die ? await new Roll(die).evaluate() : null;
    if ( roll ) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${item.name} — the die` });
    const other = targets.find(t => t.uuid !== actor.uuid) ?? null;
    const options = [{ uuid: actor.uuid, name: actor.name }, ...(other ? [other] : [])];
    const window = decisionWindow();
    await message.setFlag(MODULE_ID, "superiorityUse", { ...base, total: roll?.total ?? null,
      line: roll ? `${row.choice.what} +${roll.total} until the start of your next turn — yours or the other creature's` : "the die could not be read — apply the bonus by hand" });
    if ( !roll ) return;
    // ⚠ `rule` rides this flag too: the popup and the card quote it.
    await message.setFlag(MODULE_ID, "baitSwitch", { ...statContext(actor.uuid), status: "pending", key: row.key, rule: row.rule, itemUuid: item.uuid, itemImg: item.img ?? null,
      total: roll.total, effectName: `${row.choice.effectPrefix}${roll.total}`, options, chosen: null, resolved: null,
      ...(window && other ? { window, deadline: Date.now() + (window * 1000) } : {}) });
    // Nobody else to choose: the fighter wears it, no question asked.
    if ( !other ) await chooseBait(message, actor.uuid);
    return;
  }
  if ( row.chip ) {
    // Lunging Attack: a chip until the end of the turn; the next melee hit's offer ticks the die.
    const stale = actor.effects.filter(e => (readFlag(e, CHIP_FLAG) === "use") && (readFlag(e, "useKey") === row.key));
    if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id));
    const clock = chipClock(row.chip.window, placeOf(actor));
    await ActiveEffect.implementation.create({
      name: item.name, img: item.img ?? "icons/svg/aura.svg",
      description: `${await ruleHTML(row.rule)}<p>Written by By the Books when ${esc(item.name)} was used; the next melee hit this turn may add the die.</p>`,
      origin: item.uuid, disabled: false, transfer: false,
      ...(clock ? chipData(clock) : {}),
      flags: { [MODULE_ID]: { [CHIP_FLAG]: "use", useKey: row.key, die } }
    }, { parent: actor });
    await message.setFlag(MODULE_ID, "superiorityUse", { ...base, line: `Dash; the ${die ?? "die"} rides the next melee hit this turn — ${row.rider.caveat}` });
    return;
  }
  if ( row.marker ) {
    // Feinting Attack: the pack's marker on the target, the fighter as its source; the gate reads
    // it as Advantage for the fighter alone, and the next attack at that target spends it.
    const effect = [...(activity.effects ?? [])].map(e => e.effect).find(e => e && (lower(e.name) === lower(row.marker.effect)))
      ?? item.effects.find(e => lower(e.name) === lower(row.marker.effect)) ?? null;
    const target = targets.find(t => t.uuid !== actor.uuid) ?? null;
    if ( !effect || !target ) {
      await message.setFlag(MODULE_ID, "superiorityUse", { ...base, line: !target ? "no creature targeted — target the creature to feint, then use it again" : "the pack's marker is missing from the sheet — feint by hand" });
      return;
    }
    await applyEffectsWithReceipt(message, [effect], [target], { source: actor.uuid, marker: "feintDone" });
    await message.setFlag(MODULE_ID, "superiorityUse", { ...base, target: target.name,
      line: `Advantage on your next attack roll against ${target.name} this turn; the ${die ?? "die"} rides that hit` });
  }
}

// Bait and Switch: the choice (the moment spine).

async function chooseBait(card, uuid) {
  const flag = readFlag(card, "baitSwitch");
  if ( !flag || flag.chosen || !flag.options?.some(o => o.uuid === uuid) ) return;
  await queueFlagWrite(card, "baitSwitch", current => {
    if ( current.chosen ) return false;
    current.chosen = uuid;
    current.answeredAt = Date.now();
  });
}

async function showBaitPopup(card) {
  const bs = readFlag(card, "baitSwitch");
  if ( !bs || bs.chosen ) return;
  const actor = resolveUuid(bs.sourceUuid);
  // live only: Bait and Switch is a maneuver FEATURE — never used up, so the sheet is the truth
  const item = resolveUuid(bs.itemUuid);
  await openMomentPopup(card, "bait", actor, {
    title: `${bs.key} — ${actor?.name ?? ""}`, icon: "fa-solid fa-people-arrows",
    content: bfCard({ img: item?.img ?? null, eyebrow: `Maneuver — ${bs.key}`, tone: "pending",
      title: `The die rolled ${bs.total} — who gains the AC?`,
      subtitle: `${spendPhrase(poolSpendsOn(card))} · AC +${bs.total} until the start of your next turn`,
      lines: [ruleLine(bs.rule)] }) + holdBarHTML(bs, "to answer"),
    buttons: bs.options.map((o, i) => ({ action: `pick-${i}`, label: `${o.name} (+${bs.total} AC)`, default: i === 0, callback: () => chooseBait(card, o.uuid) }))
  });
}

const baitTimers = new Map();
function armBaitTimer(card) {
  armAskTimer(baitTimers, card, "baitSwitch", async live => {
    try {
      await queueFlagWrite(live, "baitSwitch", current => {
        if ( current.chosen || !current.deadline || (current.deadline > Date.now()) ) return false;
        current.chosen = current.options?.[0]?.uuid ?? null;   // the fighter, by default
        current.timedOut = true;
        current.answeredAt = Date.now();
      });
    } catch(err) { log.error(`The Bait and Switch buzzer failed.`, err); }
  }, { owns: subjectOwns(bs => bs.sourceUuid), pending: bs => !bs.chosen });
}

async function settleBait(card) {
  const bs = readFlag(card, "baitSwitch");
  if ( !bs?.chosen || bs.resolved ) return;
  if ( !drivesMomentFor(bs.sourceUuid ?? null) ) return;
  if ( !(await claimLanding(card, "baitSwitch", current => !!current.chosen, { field: "resolving", done: "resolved" })) ) return;
  // THE LEDGER (ledger.js): a re-drive over a dead claim lands the AC bonus once.
  const steps = landingSteps(card, "baitSwitch", "resolve");
  const who = bs.options.find(o => o.uuid === bs.chosen) ?? null;
  let applied = false;
  try {
    // live only: Bait and Switch is a maneuver FEATURE — never used up, so the sheet is the truth
    const item = bs.itemUuid ? await resolveUuidAsync(bs.itemUuid) : null;
    const effect = item?.effects.find(e => lower(e.name) === lower(bs.effectName)) ?? null;
    if ( effect && who ) {
      const target = resolveUuid(who.uuid);
      await steps.step("effect", {
        witness: () => effectsNamed(target, effect.name),
        run: async () => { await applyEffectsWithReceipt(card, [effect], [{ uuid: who.uuid, name: who.name }], { source: bs.sourceUuid ?? null, marker: "baitDone" }); }
      });
      applied = true;
    }
  } catch(err) {
    log.error(`Bait and Switch failed to apply — apply the AC bonus by hand.`, err);
  } finally {
    await queueFlagWrite(card, "baitSwitch", current => {
      current.resolving = false;
      current.resolved = { name: who?.name ?? null, applied, effectName: bs.effectName };
      closeLedger(current, "resolve");
    });
  }
}

// The answer's write (or the timer's) settles it; the spine's resumable registry resumes it on render.
registerResumable("baitSwitch", {
  pending: flag => !!flag.chosen && !flag.resolved && !claimHolds(flag.resolving),
  drives: flag => drivesMomentFor(flag.sourceUuid ?? null),
  drive: settleBait
});

// The offer: Lunging Attack's die is a ticked checkbox ("moved 5 feet first" is the player's fact).

const lungingRow = () => { const k = Object.keys(SUPERIORITY_USES).find(x => SUPERIORITY_USES[x].chip && SUPERIORITY_USES[x].rider); return k ? { key: k, ...SUPERIORITY_USES[k] } : null; };
function lungeFor(_attackMessage, activity) {
  const row = lungingRow();
  if ( !row || !listed().has(lower(row.key)) ) return null;
  const attacker = activity?.actor;
  if ( !attacker || (activity.attack?.type?.value !== "melee") ) return null;
  const chip = chipFor(attacker, row.key);
  if ( !chip ) return null;
  const die = readFlag(chip, "die") ?? null;
  const type = [...(activity.item?.system?.damage?.base?.types ?? [])][0] ?? null;
  return { row, chip, die, type, attacker };
}

registerOfferPart({
  key: "lunge",
  due: (attackMessage, activity) => { try { return !!lungeFor(attackMessage, activity)?.die; } catch { return false; } },
  parts: (attackMessage, activity) => {
    const l = lungeFor(attackMessage, activity);
    if ( !l ) return null;
    let ticked = !!l.die;
    return {
      html: l.die ? riderMenuHTML([{ key: "lunge", label: l.row.key, formula: l.die, type: l.type, why: l.row.rider.caveat, rule: l.row.rule }]) : "",
      lines: l.die ? [] : [`<strong>${l.row.key}</strong> stands, but its die could not be read off the sheet — add it by hand.`],
      wire(element) {
        const box = pickInputs(element, "bf-rider", "lunge")[0] ?? null;
        if ( box ) box.addEventListener("change", () => { ticked = box.checked; });
      },
      async commit() {
        try { await attackMessage.setFlag(MODULE_ID, "lungePick", ticked); }
        catch(err) { log.error(`Could not record the Lunging Attack pick.`, err); }
      }
    };
  }
});

// The rider: the die rides the hit's damage roll.

listen("dnd5e.preRollDamage", "superiority-uses", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "attack" ) return;
    const attackMessage = attackMessageForDamage(config, message);
    if ( !attackMessage ) return;
    const attacker = activity.actor;
    if ( !attacker ) return;
    const names = listed();
    const type = [...(activity.item?.system?.damage?.base?.types ?? [])][0] ?? null;
    // ⚠ Per-roll damage rules WRITE into a roll's data, so each rider gets its own copy.
    const push = formula => config.rolls.push({ data: foundry.utils.deepClone(config.rolls[0]?.data ?? {}), parts: [formula], options: { type, types: type ? [type] : [] } });
    const rode = [];
    // Lunging: the chip on the attacker, a melee hit, the offer's tick (absent: rides).
    const lunge = lungeFor(attackMessage, activity);
    if ( lunge?.die && (readFlag(attackMessage, "lungePick") !== false) ) {
      push(lunge.die);
      rode.push({ key: lunge.row.key, formula: lunge.die, type, why: lunge.row.rider.caveat, rule: lunge.row.rule });
      void lunge.chip.delete().catch(() => {});
    }
    // Feinting: the marker on EVERY hit target from this attacker (one roll serves them all), or
    // the spend the attack roll already recorded (the gate's receipt goes first, the marker second).
    for ( const [key, row] of Object.entries(SUPERIORITY_USES) ) {
      if ( !row.marker || !names.has(lower(key)) ) continue;
      const hits = hitTargets(attackMessage);
      if ( !hits.length ) continue;
      const spent = chipSpendsOn(attackMessage);
      const feinted = hits.every(t => {
        const target = resolveUuid(t.uuid);
        const marker = target?.effects?.find(e => (lower(e.name) === lower(row.marker.effect)) && (stampedSourceOf(e) === attacker.uuid));
        return !!marker || spent.some(s => (lower(s.name) === lower(row.marker.effect)) && (s.uuid === t.uuid));
      });
      if ( !feinted ) continue;
      const feat = featureNamed(attacker, key);
      const act = activityNamed(feat, row.use);
      const die = act ? dieOf(attacker, act) : null;
      if ( !die ) continue;
      push(die);
      rode.push({ key, formula: die, type, why: `the feint at ${hits.map(t => t.name).join(", ")}`, rule: row.rule });
      // ⚠ The marker is NOT deleted here: the attack roll already SPENDS it through the chip-spend
      // machine, and a second delete races it.
    }
    if ( rode.length ) foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.superiorityRide`, { ...statContext(attacker.uuid), attackId: attackMessage.id, rode });
  } catch(err) {
    log.error(`A maneuver's die failed to ride — add it by hand.`, err);
  }
});

// The cards say it (R5).

// The choice, made on any client, withdraws Bait and Switch's popup on this one (§5 law 4): every GM screen may hold one for an unowned subject, and the latch is per client.
listen("updateChatMessage", "superiority-uses", message => {
  if ( readFlag(message, "baitSwitch")?.chosen ) void closePopup(message, "bait");
});

listen("dnd5e.renderChatMessage", "superiority-uses", (message, html) => {
  const su = readFlag(message, "superiorityUse");
  if ( su ) {
    const line = document.createElement("div");
    // The maneuver card's one shape: the art, `Maneuver — Name`, `Name — what happened`, the cost.
    const spend = spendPhrase(poolSpendsOn(message));
    line.innerHTML = bfCard({ img: su.itemImg ?? null, eyebrow: `Maneuver — ${su.key}`, tone: su.die ? "good" : "neutral",
      title: su.total !== undefined && su.total !== null ? `${su.key} — the die rolled ${su.total}` : `${su.key} — ${su.die ?? "the die"} armed`,
      subtitle: `${spend}${su.line ? ` · ${su.line}` : ""}`, lines: [ruleLine(su.rule)] });
    html.querySelector(SURFACES.messageContent)?.appendChild(line);
  }
  const bs = readFlag(message, "baitSwitch");
  if ( bs ) {
    const chosenName = bs.options?.find(o => o.uuid === bs.chosen)?.name ?? null;
    const fighterName = bs.options?.[0]?.name ?? "the fighter";
    const line = document.createElement("div");
    line.innerHTML = bfCard({ img: bs.itemImg ?? null, eyebrow: `Maneuver — ${bs.key}`, tone: bs.resolved ? "good" : "pending",
      title: bs.resolved ? `${bs.key} — ${bs.resolved.name ?? chosenName} gains AC +${bs.total}${bs.timedOut ? " (timer — the fighter)" : ""}${bs.resolved.applied ? "" : "; the pack's effect was not found — apply it by hand"}`
        : chosenName ? `${bs.key} — ${chosenName} gains AC +${bs.total}` : `${bs.key} — who gains AC +${bs.total}?`,
      subtitle: `${spendPhrase(poolSpendsOn(message))}${bs.resolved ? ` · until the start of ${fighterName}'s next turn` : ""}`,
      lines: [ruleLine(bs.rule)] });
    html.querySelector(SURFACES.messageContent)?.appendChild(line);
    const may = !bs.chosen && canAnswerFor(resolveUuid(bs.sourceUuid));
    pendingRow(message, line, {
      bar: !bs.chosen && !!bs.deadline && holdBarHTML(bs, "to answer"),
      latch: may && { sub: "bait", show: () => showBaitPopup(message) },
      answer: may && `Answer — ${bs.key}`,
      arm: armBaitTimer
    });
  }
  const sr = readFlag(message, "superiorityRide");
  if ( sr?.rode?.length ) {
    for ( const r of sr.rode ) {
      const line = document.createElement("div");
      line.innerHTML = bfCard({ eyebrow: `Maneuver — ${r.key}`, tone: "good", title: `${r.key} — ${r.formula}${r.type ? ` ${r.type}` : ""} rode this roll`, subtitle: r.why, lines: [ruleLine(r.rule)] });
      html.querySelector(SURFACES.messageContent)?.appendChild(line);
    }
  }
});
