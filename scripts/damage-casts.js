/**
 * By the Books — Damage casts: a bare damage activity rolls its dice at the use, and a listed row
 * demands the save its text names after the damage lands (RULINGS *Damage casts*). EDGE layer
 * (ARCHITECTURE.md §7).
 */
import { MODULE_ID, readFlag, S, setting, statContext, log } from "./core.js";
import { lower, activityNamed, namesAnswering } from "./lookup.js";
import { damageSaveEntries, emanationEntries, listedNames } from "./decide/registry.js";
import { withTargets } from "./shared.js";
import { bfCard, ruleLine } from "./decide/present.js";
import { DAMAGE_SAVES, EMANATIONS, MANEUVER_FEATURE_NAMES, answers, tableIndex } from "./decide/registry.js";
import { pulseFormKey } from "./decide/emanations.js";
import { volleyEntryFor } from "./volley-registry.js";
import { offerSaveDamageRoll, rollDamageForSave } from "./auto-damage.js";
import { SURFACES } from "./surfaces.js";
import { targetsInData, targetsOf } from "./decide/card.js";
import { listen } from "./dispatch.js";
import { tokenOf } from "./geometry.js";

/* THE DICE: a bare damage activity aimed at targets is rolled at the use on the casting client,
 * chained to the usage card, where the `spellDamage` applier lands it (no roll dialog click).
 * THE SAVE: a DAMAGE_SAVES row's save activity is USED at the same targets right after the dice. */

const listed = () => listedNames(damageSaveEntries());

/** An item as the Emanations table's `item ?? key` names it, for `pulseFormKey`. */
const pulseItemName = item => namesAnswering([item], Object.entries(EMANATIONS).map(([k, r]) => r.item ?? k))[0];

/** Is this a bare damage activity the module will drive — aimed, on a side the mode admits, not a volley's? */
function drives(activity, targetCount) {
  if ( activity?.type !== "damage" ) return false;
  const actor = activity.actor;
  if ( !actor?.isOwner ) return false;
  if ( volleyEntryFor(activity.item) ) return false;                  // the volley machine rolls its darts
  const item = activity.item;
  if ( item && [...MANEUVER_FEATURE_NAMES].some(n => answers(n, item)) ) return false;   // a maneuver's damage activity is its DIE — other machines'
  // A transformation whose damage is a turn-end PULSE: the use is the transform alone.
  if ( pulseFormKey(EMANATIONS, { itemName: item ? pulseItemName(item) : null, activityName: activity.name }, listedNames(emanationEntries())) ) return false;
  if ( !activity.damage?.parts?.length ) return false;
  return targetCount > 0;
}

// ⚠ ONE ROLL, NEVER TWO: the native follow-up roll (`_triggerSubsequentActions`) is switched off at the use.
listen("dnd5e.preUseActivity", "damage-casts", (activity, usageConfig, _dialogConfig, messageConfig) => {
  try {
    const snapshot = targetsInData(messageConfig?.data);   // null: not written yet — the client's targets
    const n = snapshot ? snapshot.length : game.user.targets.size;
    if ( !drives(activity, n) ) return;
    usageConfig.subsequentActions = false;
  } catch(err) {
    log.warn(`Could not claim the damage cast's roll.`, err);
  }
});
const { rowFor } = tableIndex(DAMAGE_SAVES);

listen("dnd5e.postUseActivity", "damage-casts", (activity, _usageConfig, results) => {
  try {
    const message = (results?.message instanceof ChatMessage) ? results.message : null;
    if ( !message ) return;                                          // used with create: false — no card, no bus
    if ( readFlag(message, "smiteFor") ) return;                     // a smite's dice rode the hit's roll (hit-menu.js)
    const targets = targetsOf(message).map(t => ({ uuid: t.uuid, name: t.name, img: t.img ?? null }));
    if ( !drives(activity, targets.length) ) return;                 // nothing aimed — the humans have it
    if ( readFlag(message, "damageCast") ) return;          // never re-drive
    // The consumed-flag write the suppressed follow-up skips — the volley machine's two lines.
    try {
      const consumed = activity.createConsumedFlag?.(activity.actor, message.system?.deltas);
      if ( consumed ) activity.item.updateSource({ "flags.dnd5e.consumed": consumed });
    } catch { /* refund keeps working through the deltas either way */ }
    void driveDamageCast(activity, message, targets);
  } catch(err) {
    log.error(`Damage cast failed — roll the dice from the card.`, err);
  }
});

async function driveDamageCast(activity, message, targets) {
  const actor = activity.actor;
  const row = rowFor(activity.item);
  const follows = !!row && listed().has(lower(row.key)) && (row.damage ?? []).some(n => lower(n) === lower(activity.name));
  await message.setFlag(MODULE_ID, "damageCast", { ...statContext(actor.uuid), activity: activity.name,
    scaling: Number(message.system?.scaling ?? 0), ...(follows ? { save: row.save, key: row.key } : {}) });
  // Not awaited past the offer: the demand below must not wait on it.
  if ( setting(S.playerRollDamage) ) void offerSaveDamageRoll(activity, message, { damageOnSave: null, targets });
  else await rollDamageForSave(activity, message);
  if ( !follows ) return;
  // The save, used at the same targets; the saves machine takes it from here. No slot: already cast.
  const save = activityNamed(activity.item, row.save);
  if ( !save ) { log.warn(`${row.key}: no activity named "${row.save}" on the sheet — ask for the save by hand.`); return; }
  const tokens = targets.map(t => tokenOf(t.uuid)).filter(Boolean);
  if ( !tokens.length ) return;
  try {
    await withTargets(tokens, () => save.use({ consume: { spellSlot: false, resources: false, action: false }, subsequentActions: false }, { configure: false },
      { data: { flags: { [MODULE_ID]: { damageSaveCard: { ...statContext(actor.uuid), key: row.key, damageCardId: message.id, line: row.line ?? null, rule: row.rule } } } } }));
  } catch(err) {
    log.error(`${row.key}: the save could not be put to the targets — ask for it by hand.`, err);
  }
}

/* --- the cards say it (R5) -------------------------------------------------------------------- */

listen("dnd5e.renderChatMessage", "damage-casts", (message, html) => {
  const dc = readFlag(message, "damageSaveCard");
  if ( !dc ) return;
  const line = document.createElement("div");
  line.innerHTML = bfCard({
    eyebrow: `${dc.key} — the save after the damage`, tone: "neutral",
    title: "Drop it, or keep it and take the Disadvantage",
    lines: [dc.line, ruleLine(dc.rule)]
  });
  html.querySelector(SURFACES.messageContent)?.appendChild(line);
});
