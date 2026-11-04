/**
 * By the Books — Table polish: the no-target gate, the drinker default, the cast birth stamps, hidden
 * card buttons, the dialog target block and centering. EDGE layer (ARCHITECTURE.md §7, §8).
 */
import { MODULE_ID, log } from "./core.js";
import { labelReductionParts, poolHealDefault } from "./decide/present.js";
import { blockEntries, effectChoiceEntries, interruptEntries } from "./decide/registry.js";
import { EFFECT_CHOICES, answers, tableIndex } from "./decide/registry.js";
import { effectChoiceFor } from "./decide/choices.js";
import { CARD, TARGETS_KEY, activityTypeOf, activityUuidOf, castLevelOn, isCard, itemNameOf, itemUuidOf, targetsOf } from "./decide/card.js";
import { targetDescriptorOf, dispositionStyle, holdOf } from "./shared.js";
import { cardActivity, cardItem, featureNamed, lower, profileEffectSync } from "./lookup.js";
import { listen } from "./dispatch.js";
import { SURFACES } from "./surfaces.js";
import { tokenOf } from "./geometry.js";

/** A reaction's or a spell's row means a spell or a monster's feature, never armor of the same name. */
const SPELL_ROW_TYPES = ["spell", "feat"];


// Require a target to attack: veto the use on the initiating client before anything rolls or consumes.
listen("dnd5e.preUseActivity", "polish", activity => {
  if ( activity?.type !== "attack" ) return;
  if ( game.user.targets.size ) return;
  ui.notifications.warn(`No target selected — ${activity.item?.name ?? "the attack"} stays sheathed. Target something, then attack.`);
  return false;
});

/* A DRUNK POTION with no target aims at the drinker; a real target always wins.
 * ⚠ `messageFlags` snapshots targets BEFORE this hook: the snapshot is written directly, and the
 * live target set only so the dialog shows it. */

/** A heal consumable aimed at one creature, no template — a potion you drink. */
function potionDefaultsToDrinker(activity) {
  if ( activity?.item?.type !== "consumable" ) return false;
  if ( activity.type !== "heal" ) return false;
  if ( activity.target?.affects?.type !== "creature" ) return false;
  if ( activity.target?.template?.type ) return false;
  return true;
}

listen("dnd5e.preUseActivity", "polish", (activity, _usageConfig, _dialogConfig, messageConfig) => {
  if ( !potionDefaultsToDrinker(activity) ) return;

  const path = `data.${TARGETS_KEY}`;
  const snapshot = foundry.utils.getProperty(messageConfig ?? {}, path);
  if ( game.user.targets.size || (Array.isArray(snapshot) && snapshot.length) ) return;

  const actor = activity.actor;
  if ( !actor ) return;
  // No token needed to aim: an off-scene drinker still gets the snapshot.
  const token = tokenOf(actor);
  const descriptor = targetDescriptorOf(token, actor);
  if ( !descriptor ) return;

  foundry.utils.setProperty(messageConfig, path, [descriptor]);
  token?.setTarget(true, { releaseOthers: false });
});

/* THE POOL HEAL'S AMOUNT (Session 03 of Echoes of Halruaa: Kartor healed 1 before he found the slider). Lay on Hands'
 * heal opens dnd5e's amount slider at 1; it opens here at what its one target is missing (the paladin's own Hit Points
 * with nothing targeted), at most the pool left. A caller's own amount stands. */
const isLayOnHands = item => (item?.system?.identifier === "lay-on-hands") || (lower(item?.name) === "lay on hands");

listen("dnd5e.preUseActivity", "polish", (activity, usageConfig) => {
  try {
    if ( (activity?.type !== "heal") || !isLayOnHands(activity.item) ) return;
    const scale = activity.consumption?.scaling;
    if ( !scale?.allowed || !scale.max || !usageConfig || (usageConfig.scaling === false) ) return;
    if ( Number(usageConfig.scaling) > 0 ) return;
    const pool = dnd5e.utils.simplifyBonus(scale.max, activity.getRollData());
    const targets = [...game.user.targets].filter(t => t.actor);
    const aimed = (targets.length === 1) ? targets[0].actor : (targets.length ? null : activity.actor);
    const hp = aimed?.system?.attributes?.hp ?? null;
    const top = Number(hp?.effectiveMax ?? hp?.max);
    const missing = (hp && Number.isFinite(top) && Number.isFinite(Number(hp.value))) ? top - Number(hp.value) : null;
    const amount = poolHealDefault({ pool, missing });
    if ( amount ) usageConfig.scaling = amount - 1;
  } catch(err) {
    log.warn(`Lay on Hands' amount could not be preset — the slider opens at 1.`, err);
  }
});

/* THE CONDITION'S NAME ON THE FORMULA (Session 03 of Echoes of Halruaa: Kartor's initiative read "1d20 + 1 - 2" and he
 * asked why). dnd5e adds a condition's roll reduction as a bare number; it is named here, "- 2[Exhaustion]", on
 * initiative (rolled from the tracker or the sheet) and on every d20 test it builds. */
const conditionLabel = status => {
  const name = CONFIG.DND5E?.conditionTypes?.[status]?.name ?? CONFIG.statusEffects?.find?.(s => s.id === status)?.name ?? null;
  return name ? game.i18n.localize(name) : null;
};
const nameReductions = rollConfig => {
  if ( Array.isArray(rollConfig?.parts) ) rollConfig.parts = labelReductionParts(rollConfig.parts, conditionLabel);
};
listen("dnd5e.preConfigureInitiative", "polish", (_actor, rollConfig) => {
  try { nameReductions(rollConfig); }
  catch(err) { log.warn(`The initiative formula could not name its conditions.`, err); }
});
listen("dnd5e.preRollD20TestV2", "polish", config => {
  try { for ( const roll of (config?.rolls ?? []) ) nameReductions(roll); }
  catch(err) { log.warn(`The roll formula could not name its conditions.`, err); }
});

const activityOf = doc => cardActivity(doc);

/**
 * The cast gate (DESIGN.md R4): a `utility` activity carrying effects, or a `heal`. Bare `damage`
 * is OUT: an auto-apply here would beat a pending negate hold's verdict.
 */
function castApplyQualifies(doc) {
  const activityType = activityTypeOf(doc);
  if ( (activityType !== "utility") && (activityType !== "heal") ) return false;
  const activity = activityOf(doc);
  const affects = activity?.target?.affects?.type ?? null;
  if ( !affects ) return false;   // no aim data: never guess
  const payloadWorthy = (activityType === "heal") || !!doc.system?.effects?.length;
  if ( affects !== "self" ) {
    return payloadWorthy && !!targetsOf(doc).length;
  }
  // A SELF-tagged activity self-aims. ⚠ Except a LISTED reaction answering a PENDING hold: the hold
  // applies its effect (RULINGS *A listed reaction cast freestanding*); the two paths never both land.
  if ( interruptEntries().some(e => answers(e.name, activity?.item, SPELL_ROW_TYPES))
    && holdPendingFor(activity?.actor?.uuid) ) return false;
  return payloadWorthy;
}

/** Is a hold WAITING on this actor's reaction? The WHOLE log is scanned, never a tail window. */
function holdPendingFor(actorUuid) {
  if ( !actorUuid ) return false;
  return game.messages.contents.some(message => {
    const hold = holdOf(message);
    return !!hold && (hold.status === "pending")
      && (hold.targets ?? []).some(t => (t.uuid === actorUuid) && !t.answer);
  });
}

/* A listed cast's CHOICE between alternative effects (EFFECT_CHOICES), stamped pending on the card;
 * null when unlisted or fewer than two match. */
const EFFECT_CHOICE_INDEX = tableIndex(EFFECT_CHOICES);
function castChoice(activity) {
  // The item's own row, else a row asked at this item's use by a feature its bearer holds (`on`).
  const key = EFFECT_CHOICE_INDEX.keyFor(activity?.item)
    ?? Object.keys(EFFECT_CHOICES).find(k => EFFECT_CHOICES[k].on && answers(EFFECT_CHOICES[k].on, activity?.item)
      && !!featureNamed(activity?.actor, k)) ?? null;
  if ( !key || !effectChoiceEntries().some(e => String(e.kind).toLowerCase() === key.toLowerCase()) ) return null;
  const row = EFFECT_CHOICES[key];
  if ( !row ) return null;
  // An `on` row asks at the `on` item's use only: the pick's own activity (the Wolf) never asks again.
  if ( row.on && !answers(row.on, activity?.item) ) return null;
  if ( row.activity && (lower(activity?.name) !== lower(row.activity)) ) return null;
  // ⚠ SYNC at preCreate: profiles resolve effects async, so names come off the item's effects by id.
  const options = row.picks ? [...row.picks]
    : effectChoiceFor(row, (activity?.applicableEffects ?? []).map(p => profileEffectSync(p, activity?.item)?.name));
  return options ? { key, options, ask: row.ask, rule: row.rule, chosen: null, ...(row.on ? { free: true } : {}) } : null;
}

/** Everything the elect needs to apply a cast, captured off the card at preCreate. */
function castPayload(doc) {
  const activity = activityOf(doc);
  const self = (activity?.target?.affects?.type === "self") ? activity?.actor : null;
  const choice = castChoice(activity);
  return {
    activityUuid: activityUuidOf(doc),
    concentration: doc.system?.concentration ?? null,
    scaling: doc.system?.scaling ?? 0,
    spellLevel: castLevelOn(doc),
    targets: self ? [{ uuid: self.uuid, name: self.name }]
      : targetsOf(doc).map(t => ({ uuid: t.uuid, name: t.name })),
    ...(choice ? { choice } : {})
  };
}

listen("preCreateChatMessage", "polish", doc => {
  // A healing roll aimed at targets is claimed at birth. The elect keys on the STAMP, never the
  // setting, so an old log is inert and a mid-session kill still resolves.
  if ( isCard(doc, CARD.healing) ) {
    const activity = activityOf(doc);
    if ( (activity?.target?.affects?.type === "self") && activity?.actor ) {
      doc.updateSource({ flags: { [MODULE_ID]: { healPending: {
        selfAim: true, uuid: activity.actor.uuid, name: activity.actor.name } } } });
    } else if ( targetsOf(doc).length ) {
      doc.updateSource({ flags: { [MODULE_ID]: { healPending: true } } });
    }
  }

  // The no-attack damage applier's birth stamp (not gated on autoApply: the veto's fallback reads
  // it). A BLOCKLISTED spell also carries the hold's claim from birth, so the applier can never win the race.
  if ( isCard(doc, CARD.damage) && (activityTypeOf(doc) === "damage") && targetsOf(doc).length ) {
    const claim = { spellDamage: true };
    // The card's live item, else the name its snapshot carries (a statblock's cached spell resolves no uuid).
    const item = cardItem(doc, itemUuidOf(doc));
    const name = itemNameOf(doc);
    if ( blockEntries().some(e => item ? answers(e.spell, item, SPELL_ROW_TYPES) : (!!name && (e.spell.toLowerCase() === name.toLowerCase()))) )
      claim.spellHoldPending = true;
    doc.updateSource({ flags: { [MODULE_ID]: claim } });
  }

  if ( !isCard(doc, CARD.usage) ) return;

  // A no-gate cast: the usage card carries the elect's payload (a bare heal's roll carries healPending).
  if ( castApplyQualifies(doc) && doc.system?.effects?.length ) {
    doc.updateSource({ flags: { [MODULE_ID]: { castApply: castPayload(doc) } } });
  }
});

// A card says what happened, not the whole spell (DESIGN *Cards*): the item's description is folded under the
// header's chevron on every card, whatever the client's own Collapse Item Cards setting; the chevron opens it.
listen("dnd5e.renderChatMessage", "polish", (_message, html) => {
  const description = html?.querySelector?.(SURFACES.cardDescription);
  if ( !description || description.classList.contains("collapsed") ) return;
  description.classList.add("collapsed");
  html.querySelector(SURFACES.cardHeader)?.classList.add("collapsed");
});

// Hide the cards' action buttons: a second, manual path that forks the machine; Refund Resource stays.
// They are DATA (`system.buttons[]`), filtered at birth so no re-render draws one back (NOTES §2).
const KEPT_CARD_BUTTONS = new Set(["refundResource"]);

listen("dnd5e.preCreateUsageMessage", "polish", (_activity, messageConfig) => {
  const buttons = messageConfig?.data?.system?.buttons;
  if ( !Array.isArray(buttons) ) return;
  messageConfig.data.system.buttons = buttons.filter(b => KEPT_CARD_BUTTONS.has(b?.action));
});

/* The target block: roll and usage dialogs name who they aim at. DISPLAY-ONLY — downstream reads
 * the message SNAPSHOT, so an untarget control would change the canvas, not the roll. */

const TARGET_BLOCK_CLASS = "bythebooks-target-block";

const openTargetBlocks = new Set();

function buildTargetBlock() {
  const block = document.createElement("div");
  block.className = TARGET_BLOCK_CLASS;
  Object.assign(block.style, {
    margin: "0.5rem 0 0", padding: "0.35rem 0.5rem",
    border: "1px solid var(--color-border-light-2, #999a)", borderRadius: "4px",
    fontSize: "var(--font-size-12, 12px)", lineHeight: "1.5"
  });

  const targets = Array.from(game.user.targets);

  // The ZERO case matters: requireTarget guards only attacks.
  const heading = document.createElement("div");
  heading.textContent = targets.length ? `Targeted — ${targets.length}` : "No targets";
  Object.assign(heading.style, {
    fontWeight: "bold",
    ...(targets.length ? { opacity: "0.85" } : { color: "var(--dnd5e-color-maroon, #740b0b)" })
  });
  block.append(heading);

  for ( const token of targets ) {
    const { icon, label, color } = dispositionStyle(token);
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex", alignItems: "center", gap: "0.5rem", margin: "2px 0"
    });

    const art = token.document?.texture?.src || token.actor?.img || null;
    let portrait;
    if ( art ) {
      portrait = document.createElement("img");
      portrait.src = art;
      portrait.alt = label;
      portrait.className = "gold-icon"; // the receipts' native framing
      Object.assign(portrait.style, {
        flex: "0 0 auto", width: "32px", height: "32px", objectFit: "cover", borderRadius: "4px",
        border: `2px solid ${color}`
      });
    } else {
      portrait = document.createElement("i");
      portrait.className = icon;
      Object.assign(portrait.style, { flex: "0 0 auto", width: "32px", textAlign: "center", color });
    }
    portrait.title = label;

    const name = document.createElement("span");
    name.textContent = token.document?.name ?? token.name ?? "Unknown";
    Object.assign(name.style, {
      flex: "1", minWidth: "0", fontWeight: "bold",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
    });

    // ⚠ The WORD stays: colour is never the only carrier.
    const word = document.createElement("span");
    word.textContent = label;
    Object.assign(word.style, { flex: "0 0 auto", opacity: "0.7", fontSize: "0.9em", color });

    row.append(portrait, name, word);
    block.append(row);
  }
  return block;
}

/** Idempotent repaint. ⚠ Never gate on `element.isConnected`: the render hook fires while DETACHED. */
function paintTargetBlock(element) {
  if ( !element ) return;
  // Both names: a card posted before 3.0.0 (formerly Battle Flow) may carry the old class in its stored HTML.
  for ( const stale of element.querySelectorAll(`.${TARGET_BLOCK_CLASS}, .battleflow-target-block`) ) stale.remove();
  element.append(buildTargetBlock());
}

// ⚠ Repaints on EVERY render. Registered BEFORE the centering hook: hooks run in registration
// order, so the block exists when centering measures offsetHeight.
listen("renderRollConfigurationDialog", "polish", (app, element) => {
  paintTargetBlock(element);
  openTargetBlocks.add(app);
});

// ActivityUsageDialog's subclasses fire the base's render hook.
listen("renderActivityUsageDialog", "polish", (app, element) => {
  paintTargetBlock(element);
  openTargetBlocks.add(app);
});

// A re-target fires no dialog re-render. ⚠ Hold the APP: the element is replaced on re-render.
listen("targetToken", "polish", () => {
  for ( const app of openTargetBlocks ) {
    if ( app.rendered && app.element ) paintTargetBlock(app.element);
    else openTargetBlocks.delete(app); // closed dialogs drop out on the next re-target
  }
});

// Center roll dialogs, first render only, so it never fights a player dragging the window.
listen("renderRollConfigurationDialog", "polish", (app, element) => {
  if ( app._bfCentered ) return;
  app._bfCentered = true;
  app.setPosition({
    left: Math.max(0, (window.innerWidth - element.offsetWidth) / 2),
    top: Math.max(0, (window.innerHeight - element.offsetHeight) / 2)
  });
});

