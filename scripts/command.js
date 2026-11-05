/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): Commander's Strike, the `command` fold — the
 * fighter's die on an ally's Reaction attack.
 */
import { MODULE_ID, readFlag, isActiveGM, queueFlagWrite, canAnswerFor, statContext, decisionWindow, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { ruleHTML } from "./rule-text.js";
import { resolveDie, foldEntryFor, maneuverDieFormula } from "./lookup.js";
import { maneuverFoldEntries } from "./decide/registry.js";
import { RULE_TEXT } from "./decide/registry.js";
import { chipData, namedPart, placeOf, poolSpendsOn, spendReaction } from "./shared.js";
import { bfCard, momentBarHTML, ruleLine, spendPhrase, esc } from "./decide/present.js";
import { CHIP_FLAG, chipClock } from "./decide/chips.js";
import { openMomentPopup, acknowledgeMoment, momentAcknowledged, pendingRow } from "./ui.js";
import { SURFACES } from "./surfaces.js";
import { targetsOf } from "./decide/card.js";
import { listen } from "./dispatch.js";

// "Directed Attack" targets the ALLY and spends the die; the GM writes a chip carrying it on the
// ally, whose owner attacks from their own sheet; the die rides that damage and spends their Reaction.

listen("dnd5e.preUseActivity", "command", (activity, usageConfig) => {
  try {
    if ( (activity?.type !== "damage") || !activity.actor ) return;
    if ( !foldEntryFor(activity.actor, "command", maneuverFoldEntries()) ) return;
    const found = foldEntryFor(activity.actor, "command", maneuverFoldEntries());
    if ( found.item.id !== activity.item?.id ) return;
    usageConfig.subsequentActions = false;   // the die is the ally's hit's, not the Bonus Action's
  } catch(err) { log.warn(`Could not claim Commander's Strike's use.`, err); }
});

listen("dnd5e.postUseActivity", "command", (activity, _usageConfig, results) => {
  try {
    if ( (activity?.type !== "damage") || !activity.actor?.isOwner ) return;
    const found = foldEntryFor(activity.actor, "command", maneuverFoldEntries());
    if ( !found || (found.item.id !== activity.item?.id) ) return;
    const message = (results?.message instanceof ChatMessage) ? results.message : null;
    if ( !message || readFlag(message, "command") ) return;
    void stampCommand(activity, activity.actor, message, found);
  } catch(err) {
    log.error(`Commander's Strike failed at the use — direct the strike by hand.`, err);
  }
});

/** The fighter's client, at the use: the ally, the die (the FIGHTER's scale value), the notice's clock. */
async function stampCommand(activity, fighter, message, found) {
  const targets = targetsOf(message).filter(t => t.uuid !== fighter.uuid);
  const ally = targets[0] ?? null;
  // ⚠ Resolved on the FIGHTER: the raw `@scale…` formula reads 0 on the ally's roll.
  const dieFormula = resolveDie(fighter, maneuverDieFormula(activity));
  const window = decisionWindow();
  await message.setFlag(MODULE_ID, "command", {
    status: ally ? "directed" : "no ally", ...statContext(fighter.uuid),
    attackerUuid: fighter.uuid, attackerName: fighter.name, itemName: found.item.name, itemImg: found.item.img ?? null,
    itemUuid: found.item.uuid, ally: ally ? { uuid: ally.uuid, name: ally.name } : null, dieFormula, chipId: null,
    ...((window && ally) ? { window, deadline: Date.now() + (window * 1000) } : {})
  });
}

/** THE CHIP, by the GM (the fighter may not own the ally): until the fighter's turn ends, spent by the ally's next damage. */
async function ensureCommandChip(message) {
  const flag = readFlag(message, "command");
  if ( !flag || (flag.status !== "directed") || flag.chipId || !flag.ally?.uuid ) return;
  const ally = await resolveUuidAsync(flag.ally.uuid);
  if ( !(ally instanceof Actor) ) return;
  const standing = ally.effects.find(e => (readFlag(e, CHIP_FLAG) === "use") && (readFlag(e, "useKey") === "command") && (readFlag(e, "cardId") === message.id));
  let chip = standing ?? null;
  if ( !chip ) {
    const stale = ally.effects.filter(e => (readFlag(e, CHIP_FLAG) === "use") && (readFlag(e, "useKey") === "command"));
    if ( stale.length ) await ally.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id)).catch(() => {});
    const fighter = flag.attackerUuid ? await resolveUuidAsync(flag.attackerUuid) : null;
    const clock = chipClock("steadyAim", placeOf(fighter ?? ally));
    chip = await ActiveEffect.implementation.create({
      name: flag.itemName, img: flag.itemImg ?? "icons/svg/aura.svg",
      description: `${await ruleHTML(RULE_TEXT.command)}<p>Written by By the Books when ${esc(flag.attackerName)} used ${esc(flag.itemName)}: ${esc(ally.name)} may use a Reaction to make one attack with a weapon or an Unarmed Strike; ${flag.dieFormula ?? "the Superiority Die"} rides the damage of the next hit.</p>`,
      origin: flag.itemUuid ?? null, disabled: false, transfer: false,
      ...(clock ? chipData(clock) : {}),
      flags: { [MODULE_ID]: { [CHIP_FLAG]: "use", useKey: "command", die: flag.dieFormula ?? null, sourceUuid: flag.attackerUuid, sourceName: flag.attackerName, cardId: message.id } }
    }, { parent: ally }).catch(err => { log.error(`Commander's Strike could not mark the ally — add the die by hand.`, err); return null; });
  }
  if ( chip ) await queueFlagWrite(message, "command", current => { if ( current.chipId ) return false; current.chipId = chip.id; });
}

listen("createChatMessage", "command", message => { if ( isActiveGM() && readFlag(message, "command") ) void ensureCommandChip(message); });

/** THE NOTICE: the ally's owner is told, OK-only, auto-closed at the deadline (the Hew notice's shape). */
async function showCommandNotice(message) {
  const flag = readFlag(message, "command");
  if ( !flag || (flag.status !== "directed") ) return;
  const ally = flag.ally?.uuid ? resolveUuid(flag.ally.uuid) : null;
  await openMomentPopup(message, "command", ally, {
    title: `${flag.itemName} — ${flag.ally?.name ?? ""}`, icon: "fa-solid fa-bullhorn", width: 440,
    content: bfCard({ img: flag.itemImg, eyebrow: `Maneuver — ${flag.itemName}`, tone: "pending",
      title: `${flag.attackerName} directs you to strike`,
      subtitle: `Use your Reaction to make one attack with a weapon or an Unarmed Strike from your sheet — ${flag.attackerName}'s ${flag.dieFormula ?? "Superiority Die"} rides the damage if it hits`,
      lines: [ruleLine(RULE_TEXT.command)] }) + (flag.deadline ? momentBarHTML(flag, "reminder") : ""),
    buttons: [{ action: "ok", label: "OK", default: true, callback: () => acknowledgeMoment(message, "command") }],
    autoCloseAt: flag.deadline || null
  });
}

/** THE RIDE: the die folds INTO the base roll (crit-doubled with it); chip and Reaction spent. */
listen("dnd5e.preRollDamage", "command", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "attack" ) return;
    const actor = activity.item?.actor;
    if ( !actor ) return;
    const chip = actor.effects.find(e => (readFlag(e, CHIP_FLAG) === "use") && (readFlag(e, "useKey") === "command"));
    if ( !chip ) return;
    const formula = readFlag(chip, "die");
    const type = [...(activity.item?.system?.damage?.base?.types ?? [])][0] ?? "";
    if ( formula ) {
      const base = (config.rolls ?? []).find(r => r.base === true);
      if ( base ) base.parts = [...(base.parts ?? []), namedPart(formula, "Commander's Strike")];
      // ⚠ Clone the data: damage rules WRITE into a roll's data, and a shared object carries the last rider's type onto roll 0.
      else config.rolls.push({ data: foundry.utils.deepClone(config.rolls[0]?.data ?? {}), parts: [namedPart(formula, "Commander's Strike")], options: { type, types: type ? [type] : [] } });
    }
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.commandRide`, {
      ...statContext(actor.uuid), cardId: readFlag(chip, "cardId") ?? null, formula: formula ?? null, type,
      by: actor.name, directedBy: readFlag(chip, "sourceName") ?? null, weapon: activity.item?.name ?? null
    });
    void chip.delete().catch(() => {});
    void spendReaction(actor, { origin: chip.origin ?? null, what: "Commander's Strike" });
  } catch(err) {
    log.error(`Commander's Strike's die failed to ride — add it by hand.`, err);
  }
});

// The fighter's card records the strike — the elect folds it from the ally's damage message.
listen("createChatMessage", "command", message => {
  const ride = readFlag(message, "commandRide");
  if ( !ride?.cardId || !isActiveGM() ) return;
  const card = game.messages.get(ride.cardId);
  if ( !card ) return;
  void queueFlagWrite(card, "command", current => {
    if ( current.status !== "directed" ) return false;
    current.status = "struck"; current.struck = { by: ride.by, weapon: ride.weapon ?? null, at: Date.now() };
  }).catch(err => log.warn(`Could not record the directed strike on the card.`, err));
});

listen("dnd5e.renderChatMessage", "command", (message, html) => {
  const ride = readFlag(message, "commandRide");
  if ( ride ) {
    const line = document.createElement("div");
    line.innerHTML = bfCard({ eyebrow: "Maneuver — Commander's Strike", tone: "good",
      title: `Commander's Strike — ${ride.formula ?? "the die"}${ride.type ? ` ${ride.type}` : ""} rode this roll`,
      subtitle: `${ride.by}'s Reaction${ride.directedBy ? `, directed by ${ride.directedBy}` : ""}`,
      lines: [ruleLine(RULE_TEXT.command)] });
    html.querySelector(SURFACES.messageContent)?.appendChild(line);
  }
  const flag = readFlag(message, "command");
  if ( !flag ) return;
  const directed = flag.status === "directed";
  const live = directed && (!flag.deadline || (flag.deadline > Date.now())) && !momentAcknowledged(message, "command");
  const line = document.createElement("div");
  line.innerHTML = bfCard({
    img: flag.itemImg, eyebrow: `Maneuver — ${flag.itemName}`, tone: (flag.status === "struck") ? "good" : directed ? "pending" : "neutral",
    title: (flag.status === "no ally") ? `${flag.itemName} — no ally targeted; direct the strike by hand`
      : (flag.status === "struck") ? `${flag.itemName} — ${flag.struck?.by ?? flag.ally?.name} struck${flag.struck?.weapon ? ` with ${flag.struck.weapon}` : ""}; ${flag.dieFormula ?? "the die"} rode the hit`
      : `${flag.itemName} — ${flag.ally?.name} may use a Reaction to make one attack; ${flag.dieFormula ?? "the die"} rides the hit`,
    subtitle: spendPhrase(poolSpendsOn(message)),
    lines: [ruleLine(RULE_TEXT.command)]
  });
  html.querySelector(SURFACES.messageContent)?.appendChild(line);
  if ( isActiveGM() ) void ensureCommandChip(message);   // the resume floor
  const ally = flag.ally?.uuid ? resolveUuid(flag.ally.uuid) : null;
  const may = live && canAnswerFor(ally);
  pendingRow(message, line, {
    bar: live && momentBarHTML(flag, "reminder"),
    latch: may && { sub: "command", show: () => showCommandNotice(message) },
    answer: may && `Show — ${flag.itemName}`
  });
});
