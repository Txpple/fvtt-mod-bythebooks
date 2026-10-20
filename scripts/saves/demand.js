/**
 * By the Books — MACHINE, part of scripts/saves/ (ARCHITECTURE.md §7): the DEMAND. The casting
 * client stamps the `saves` flag on the usage card, with the dead-target gate, metamagic, a chosen
 * area and an emanation's reach applied at the cast.
 */
import { MODULE_ID, readFlag, clearFlag, S, setting, statContext, decisionWindow, resolveUuid, log } from "../core.js";
import { applicableProfiles, itemNamed, namesAnswering } from "../lookup.js";
import { CARD, activityUuidOf, isCard, targetsOf } from "../decide/card.js";
import { saveDemandData, saveTargetEntry, putsToSleep } from "../decide/demand.js";
import { METAMAGIC_FLAG, metamagicRuleText, carefulKind } from "../decide/metamagic.js";
import { AREA_CHOICE_FLAG, carefulProtects, heightenedMark, choiceCapFrom, choiceRuleFrom, chosenByDefault, choiceNeedsAsk } from "../decide/area-ask.js";
import { askCandidates, newAsk, raiseAsk, areaAskOf } from "../area-ask.js";
import { tokensInRegions, tokenDocOf } from "../geometry.js";
import { isDeadForSaves } from "../decide/eligible.js";
import { EFFECT_BENDS, EMANATIONS, SAVE_PRESSES, tableIndex } from "../decide/registry.js";
import { reachAdmits, affectsAdmits, selfEmanation } from "../decide/emanations.js";
import { emanationEntries, spentAreaListed, chosenAreaListed } from "../decide/registry.js";
import { raiseHold, releaseHold, isHeld } from "../holds.js";
import { offerSaveDamageRoll, rollDamageForSave } from "../auto-damage.js";
import { listen } from "../dispatch.js";

const SAVE_PRESS_ROWS = tableIndex(SAVE_PRESSES);

/* THE CASTER'S SNAPSHOT (B2): the `side: "caster"` save rows are read off the DEMAND, not the roller's sheet —
 * the caster's effects and features in the table's words, and its statuses as it cast (Magical Ambush's Invisible). */
const CASTER_SIDE = Object.entries(EFFECT_BENDS).filter(([, r]) => (r.side === "caster") && r.saves);
const CASTER_EFFECT_NAMES = new Set(CASTER_SIDE.filter(([, r]) => r.match !== "feature").map(([k, r]) => String(r.named ?? k).toLowerCase()));
const CASTER_FEATURE_KEYS = [...new Set(CASTER_SIDE.filter(([, r]) => r.match === "feature").map(([k, r]) => String(r.named ?? k)))];
function casterSnapshot(actor) {
  if ( !(actor instanceof Actor) ) return null;
  // D1 — `type`: the caster's creature type (Holy Ward's Fiend or Undead).
  return { uuid: actor.uuid, name: actor.name, type: actor.system?.details?.type?.value ?? null,
    effects: actor.effects.filter(e => !e.disabled && CASTER_EFFECT_NAMES.has(String(e.name ?? "").toLowerCase())).map(e => ({ id: e.id, name: e.name })),
    features: CASTER_FEATURE_KEYS.length ? namesAnswering(actor.items.filter(i => i.type === "feat"), CASTER_FEATURE_KEYS) : [],
    statuses: [...(actor.statuses ?? [])] };
}

/** D1 — is this use a Channel Divinity's: the item itself, or the Channel Divinity uses its activity consumes. */
function channelDivinityUse(activity) {
  const actor = activity?.actor;
  const item = activity?.item;
  if ( !actor || !item ) return false;
  const isChannel = i => !!i && ((i.system?.identifier === "channel-divinity") || (String(i.name ?? "").toLowerCase() === "channel divinity"));
  if ( isChannel(item) ) return true;
  return (activity.consumption?.targets ?? []).some(c => (c.type === "itemUses") && !!c.target
    && (isChannel(actor.items.get(c.target)) || /ChannelDiv$/.test(String(c.target))));
}

/** The caster's identity and side, as Careful's and Heightened's defaults read them. */
function casterFactsOf(activity) {
  const caster = activity?.actor ?? null;
  const tok = tokenDocOf(caster);
  return { casterUuid: caster?.uuid ?? null, casterDisposition: tok?.disposition ?? (caster ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : null) };
}

/**
 * The cast's metamagic on THIS demand: Careful's protected leave, Heightened's mark rides along.
 * A player's own pick (`chosen: true`) is honoured, never recomputed.
 * @returns {Promise<{protectedUuids: Set<string>, heightened: {uuid: string, name: string, caster: string|null, rule: object|string|null}|null}>}
 */
export async function metamagicForDemand(card, activity, contained) {
  const mm = readFlag(card, METAMAGIC_FLAG);
  const pendingAsk = !!mm && (carefulKind(mm.key) || (mm.key === "heightened")) && !mm.chosen;
  const none = { protectedUuids: new Set(), heightened: null, hold: false, pendingAsk };
  if ( !mm || !Array.isArray(contained) ) return none;
  const facts = casterFactsOf(activity);
  // THE ASK AT THE AREA: a pick not yet made is asked of the area's creatures; the demand WAITS.
  if ( (carefulKind(mm.key) || (mm.key === "heightened")) && !mm.chosen && contained.length ) {
    const ask = areaAskOf(card);
    if ( ask?.status !== "pending" && card.canUserModify?.(game.user, "update") ) {
      await raiseAsk(card, newAsk({ kind: mm.key, feature: mm.feature, cap: mm.cap ?? 1, rule: mm.rule ?? null,
        candidates: askCandidates(contained), caster: { uuid: facts.casterUuid, disposition: facts.casterDisposition, name: activity?.actor?.name ?? null } }));
    }
    return { ...none, hold: true };
  }
  if ( carefulKind(mm.key) ) {
    const list = carefulProtects({ contained, ...facts, cap: mm.cap ?? 1, chosen: mm.chosen ? (mm.protected ?? []).map(p => p.uuid) : null });
    // ⚠ Only a DEFAULT list is written back: a bare cast's empty reach would erase a player's ticks.
    const same = JSON.stringify(list) === JSON.stringify(mm.protected ?? null);
    if ( !mm.chosen && !same && card.canUserModify?.(game.user, "update") ) await card.setFlag(MODULE_ID, METAMAGIC_FLAG, { ...mm, protected: list });
    return { protectedUuids: new Set(list.map(p => p.uuid)), heightened: null, hold: false, pendingAsk };
  }
  if ( mm.key === "heightened" ) {
    const mark = heightenedMark({ contained, ...facts, chosen: mm.chosen ? (mm.target?.uuid ?? null) : null });
    if ( !mark ) return none;
    const rule = mm.rule ?? metamagicRuleText(itemNamed(activity?.actor, mm.feature)?.system?.description?.value ?? "");
    const same = (mm.target?.uuid === mark.uuid) && (mm.rule === rule);
    if ( !mm.chosen && !same && card.canUserModify?.(game.user, "update") ) await card.setFlag(MODULE_ID, METAMAGIC_FLAG, { ...mm, target: mark, rule });
    return { protectedUuids: new Set(), heightened: { ...mark, caster: activity?.actor?.name ?? null, rule }, hold: false, pendingAsk };
  }
  return none;
}

/**
 * WHO A CHOSEN AREA AFFECTS (RULINGS *Spells that choose their targets*): a recorded choice
 * filters; an open or needed ask holds the demand; otherwise the default is written as the choice.
 * @returns {Promise<{contained: object[]|null, hold: boolean}>}
 */
export async function areaChoiceForDemand(card, activity, contained) {
  if ( !Array.isArray(contained) || !chosenAreaListed(activity?.item) ) return { contained, hold: false };
  const facts = casterFactsOf(activity);
  const casterTok = tokenDocOf(activity?.actor);
  const pool = contained.filter(c => (c.uuid !== facts.casterUuid) && !(casterTok && (c.tokenId === casterTok.id))).filter(saveDemandable);
  const record = readFlag(card, AREA_CHOICE_FLAG);
  if ( Array.isArray(record?.chosen) ) {
    const chosen = new Set(record.chosen.map(c => c.uuid));
    return { contained: pool.filter(c => chosen.has(c.uuid)), hold: false };
  }
  const ask = areaAskOf(card);
  if ( (ask?.status === "pending") && (ask.kind === "choose") ) return { contained: [], hold: true };
  if ( !pool.length ) return { contained: pool, hold: false };
  const spell = activity.item.name;
  const description = activity.item.system?.description?.value ?? "";
  const cap = choiceCapFrom(description);
  const candidates = askCandidates(pool);
  const writable = !!card?.canUserModify?.(game.user, "update");
  if ( !choiceNeedsAsk({ candidates, ...facts, cap }) ) {
    const chosen = chosenByDefault({ candidates, ...facts, cap });
    const ids = new Set(chosen.map(c => c.uuid));
    if ( writable ) await card.setFlag(MODULE_ID, AREA_CHOICE_FLAG, { spell, chosen, cap, asked: false,
      left: candidates.filter(c => !ids.has(c.uuid)).map(c => ({ uuid: c.uuid, name: c.name })), ...statContext(facts.casterUuid) });
    return { contained: pool.filter(c => ids.has(c.uuid)), hold: false };
  }
  if ( writable ) {
    const mm = readFlag(card, METAMAGIC_FLAG);
    const heightened = ((mm?.key === "heightened") && !mm.chosen)
      ? { feature: mm.feature, rule: mm.rule ?? metamagicRuleText(itemNamed(activity.actor, mm.feature)?.system?.description?.value ?? "") } : null;
    await raiseAsk(card, newAsk({ kind: "choose", feature: spell, spell, cap, rule: choiceRuleFrom(description), itemImg: activity.item.img ?? null, heightened,
      candidates, caster: { uuid: facts.casterUuid, disposition: facts.casterDisposition, name: activity.actor?.name ?? null } }));
  }
  return { contained: [], hold: true };
}

/* THE PICTURE WAITS FOR THE CHOICE: a hold raised as the card is born keeps FX Studio's visuals
 * back until the stamp (nothing asked) or the answer releases it; bounded by the clock plus slack. */
const CHOICE_HOLD_SLACK_MS = 30_000;
listen("preCreateChatMessage", "saves/demand", doc => {
  try {
    if ( !isCard(doc, CARD.usage) ) return;
    // A held card re-posted with its answer: the question was already asked.
    if ( readFlag(doc, AREA_CHOICE_FLAG) || readFlag(doc, METAMAGIC_FLAG)?.chosen ) return;
    const uuid = activityUuidOf(doc);
    const activity = uuid ? resolveUuid(uuid) : null;
    if ( (activity?.type !== "save") || !activity.target?.template?.type || !chosenAreaListed(activity.item) ) return;
    const window = decisionWindow();
    raiseHold(uuid, { reason: "area-choice", bound: window ? (window * 1000) + CHOICE_HOLD_SLACK_MS : null });
  } catch(err) { log.warn(`The chosen area's hold could not be raised — the picture plays at once.`, err); }
});

/** After the stamp: lift the chosen area's hold unless its ask now stands (the answer lifts it then). */
function settleChoiceHold(activity, message) {
  const uuid = activity?.uuid ?? "";
  if ( !uuid || !isHeld(uuid) ) return;
  const ask = areaAskOf(message);
  if ( (ask?.status === "pending") && (ask.kind === "choose") ) return;
  if ( !chosenAreaListed(activity.item) ) return;   // somebody else's hold
  releaseHold(uuid, message ?? null);
}

/** Stamp-time filter: a dead target stays out; an unresolvable uuid stays IN (never eat a demand on a lookup miss). */
export function saveDemandable(t) {
  const actor = resolveUuid(t.uuid);
  if ( !(actor instanceof Actor) ) return true;
  return !isDeadForSaves(actor);
}

listen("dnd5e.postUseActivity", "saves/demand", (activity, _usageConfig, results) => {
  if ( activity?.type !== "save" ) return;
  const message = (results?.message instanceof ChatMessage) ? results.message : null;
  if ( !message ) return; // create: false — no card, no bus
  void stampSaveDemand(activity, message, results).finally(() => settleChoiceHold(activity, message));
});

// A usage card held back by the metamagic ask, born with the pick made: stamp as at the use.
listen("bythebooks.deferredUsageCard", "saves/demand", ({ activity, message, templates }) => {
  if ( (activity?.type !== "save") || !(message instanceof ChatMessage) ) return;
  void stampSaveDemand(activity, message, { templates: [templates ?? []] }).finally(() => settleChoiceHold(activity, message));
});

async function stampSaveDemand(activity, message, results) {
  try {
    if ( readFlag(message, "saves") ) return; // never re-stamp
    // An area whose save is for something other than standing in it (Magic Circle's teleport-in save) demands nothing at the cast.
    if ( emanationRowFor(activity)?.noCastSave ) return;
    // ⚠ A template spell's targets are what the AREA contains, not what was clicked. postUseActivity
    // fires after placement, so `results.templates` is the real RegionDocument[] (maybe nested).
    const placed = emanationReach(activity, tokensInRegions((results?.templates ?? []).flat().filter(t => t?.parent)));
    const choice = await areaChoiceForDemand(message, activity, placed);
    const contained = choice.contained;
    // No area to read: the card's targets — an Emanation's origin still never among them.
    const raw = contained ?? withoutOrigin(activity, targetsOf(message));
    // THE DEAD-TARGET GATE on the RESOLVED set, before the setFlag: an all-dead cast starves
    // everything downstream; raw emptiness still means a WAITING demand.
    const metamagic = choice.hold ? { protectedUuids: new Set(), heightened: null, hold: true, pendingAsk: false }
      : await metamagicForDemand(message, activity, contained ?? raw);
    // An open ask holds the demand EMPTY, clockless; the answer fills it.
    const targets = metamagic.hold ? [] : raw.filter(saveDemandable).filter(t => !metamagic.protectedUuids.has(t.uuid));
    if ( raw.length && !targets.length && !metamagic.protectedUuids.size && !metamagic.hold ) return; // every target dead
    // A TEMPLATE-SHAPED targetless cast stamps a WAITING demand (no deadline); adoption fills it.
    const templateShaped = !!activity.target?.template?.type;
    if ( !targets.length && !templateShaped ) return;
    // A self-aimed save's targets are incidental. A BLANK affects is allowed: statblocks often carry none.
    // RAVENLOFT — a MISHAP's save (mishaps.js) is self-aimed by the pack and IS the demand: the bearer saves against its gift.
    if ( !contained && ((activity.target?.affects?.type ?? null) === "self") && !readFlag(message, "mishap") ) return;
    const dc = activity.save?.dc?.value;
    if ( !(dc > 0) ) return;
    const abilities = [...(activity.save?.ability ?? [])];
    if ( !abilities.length ) return;

    // The effect names by outcome, resolved NOW while the item surely exists.
    const entries = (await applicableProfiles(activity)).map(({ profile, effect }) => ({ onSave: profile.onSave, effect }));
    // An EMANATION's effect is the region's STANDING effect: the verdict never applies it.
    const emanation = !!emanationRowFor(activity);
    // A SAVE_PRESSES `success` row moves the named effects to the success (Stunning Strike's Slowed).
    const success = new Set((SAVE_PRESS_ROWS.rowFor(activity.item)?.success ?? []).map(n => n.toLowerCase()));
    const onSuccess = e => success.has(String(e.effect?.name ?? "").toLowerCase());
    const effectNames = emanation ? { fail: [], always: [] } : {
      fail: entries.filter(e => !e.onSave && !onSuccess(e)).map(e => e.effect.name),
      always: entries.filter(e => e.onSave && !onSuccess(e)).map(e => e.effect.name),
      ...(success.size ? { success: entries.filter(onSuccess).map(e => e.effect.name) } : {})
    };

    // ⚠ `onSave: "full"` marks rider damage the save does NOT modulate (Web's burn): no auto-roll,
    // no per-verdict application; the card's enricher stays GM-judged.
    const onSave = activity.damage?.onSave ?? "half";
    // THE DMG — a weapon rider's save (clock-riders.js `save`) is the save alone: the hit carried the damage.
    const riderSave = !!readFlag(message, "riderSave");
    const saveModulated = !riderSave && !!activity.damage?.parts?.length && (onSave !== "full");

    const window = decisionWindow();
    const awaiting = !targets.length;
    // ⚠ THE EMPTY INSTANT: an instantaneous area placed with nobody inside stamps DONE.
    // ⚠ The ITEM's duration for a spell (its activity's is not the spell's), the ACTIVITY's for a
    // feature (a `feat` has none; null would read as a duration area that never ends).
    const durationUnits = activity.item?.system?.duration?.units ?? activity.duration?.units ?? null;
    const instantArea = (durationUnits === "inst") || spentAreaListed(activity.item);
    // …and an EMANATION placed with nobody inside owes nothing at the cast: its region's triggers own every later save.
    const emptyInstant = awaiting && !!contained && (instantArea || emanation) && !metamagic.hold;
    await message.setFlag(MODULE_ID, "saves", saveDemandData({
      status: emptyInstant ? "done" : "pending",
      stat: statContext(activity.actor?.uuid ?? null),
      abilities, dc,
      damageOnSave: onSave,
      hasDamage: saveModulated,
      effectNames,
      // WHAT THE SAVE IS AGAINST, read by save-side auras when the roller's dialog opens.
      demand: { spell: (activity.item?.type === "spell") || (activity.item?.system?.properties?.has?.("mgc") ?? false),
        // A spell CAST alone (`spells: "cast"` rows — the Mantle, the Ring): the item is a spell.
        cast: activity.item?.type === "spell",
        abilities,
        item: activity.item?.name ?? null,
        // D1 — the damage types it deals and whether it is a Channel Divinity use (Corona of Light, Diminish Defiance).
        types: [...new Set((activity.damage?.parts ?? []).flatMap(p => [...(p.types ?? [])]))],
        // The DMG — the spell's school (Scarab of Protection's Necromancy).
        school: activity.item?.system?.school ?? null,
        channel: channelDivinityUse(activity),
        source: casterSnapshot(activity.actor),
        statuses: [...new Set(entries.filter(e => !e.onSave && !onSuccess(e)).flatMap(e => [...(e.effect?.statuses ?? [])]))],
        sleep: putsToSleep({ itemName: activity.item?.name ?? null, effectNames: entries.filter(e => !e.onSave).map(e => e.effect?.name) }),
        ...(metamagic.heightened ? { heightened: metamagic.heightened } : {}) },
      effectsHandled: emanation ? "emanation" : null,
      // A rider the CAST carried (a hit reaction's `failDamage`, B2): the failure's damage on the saver.
      failDamage: readFlag(message, "failDamage") ?? null,
      activityUuid: activity.uuid,
      // Adoption's shape gate for a toolbar-drawn area, which has no origin flag.
      templateType: activity.target?.template?.type ?? null,
      templated: !!contained,
      awaitingTemplate: awaiting && !emptyInstant,
      durationUnits,
      item: { name: activity.item?.name ?? "the effect", img: activity.item?.img ?? null },
      casterName: activity.actor?.name ?? null,
      // A waiting demand has NO deadline: the clock starts at adoption.
      window: (window && !emptyInstant) ? window : 0,
      deadline: (window && !emptyInstant && !awaiting) ? Date.now() + (window * 1000) : null,
      // ⚠ An ARRAY, never a uuid-keyed map (dotted-key expansion).
      targets: targets.map(t => saveTargetEntry(t.uuid, t.name))
    }));

    // The machine rolls the save-modulated damage as the demand stamps, chained to the card so
    // upcasting rides the native plumbing; this is the casting client, so its own-dice popup can show.
    if ( saveModulated && !emptyInstant ) {
    // ⚠ Deferred while an area ask stands or is still to come: the dice wait for the answer.
      if ( metamagic.hold || (metamagic.pendingAsk && awaiting) ) await message.setFlag(MODULE_ID, "savesDeferredRoll", { damageOnSave: onSave });
      else await rollSaveDamageNow(activity, message, { damageOnSave: onSave, targets, awaiting });
    }
  } catch(err) {
    log.error(`Could not stamp the save demand.`, err);
  }
}

/** The caster's dice — their own popup, or the automation's roll — for a demand just stamped. */
async function rollSaveDamageNow(activity, message, { damageOnSave, targets, awaiting }) {
  if ( setting(S.playerRollDamage) ) {
    void offerSaveDamageRoll(activity, message, { damageOnSave, targets, awaiting });
  }
  else await rollDamageForSave(activity, message);
}

// The deferred dice, on the answering client once the area ask is answered; the flag clears first.
listen("bythebooks.areaAskAnswered", "saves/demand", async message => {
  try {
    const deferred = readFlag(message, "savesDeferredRoll");
    if ( !deferred ) return;
    const activity = resolveUuid(activityUuidOf(message) ?? "");
    if ( !activity ) return;
    await clearFlag(message, "savesDeferredRoll");   // an old card may hold it under the legacy scope
    const flag = readFlag(message, "saves");
    if ( !flag || (flag.status === "done") ) return;   // everyone spared — no dice owed
    await rollSaveDamageNow(activity, message, { damageOnSave: deferred.damageOnSave ?? "half", targets: flag.targets ?? [], awaiting: false });
  } catch(err) {
    log.error(`The deferred save damage could not roll — press the card's damage.`, err);
  }
});

/* AN EMANATION'S REACH AT THE CAST: a listed row filters by its reach (DESIGN §5 *Emanations*), an
 * activity naming who it affects filters by that, and the caster never saves against its own spell. */
const EMANATION_INDEX = tableIndex(EMANATIONS);
function emanationRowFor(activity) {
  if ( !activity?.item ) return null;
  const key = EMANATION_INDEX.keyFor(activity.item);
  const row = key ? EMANATIONS[key] : null;
  if ( !row?.reach || !emanationEntries().some(e => e.kind === key.toLowerCase()) ) return null;
  return row;
}
/** Targets with a self Emanation's own caster left out (any other area keeps them all). */
function withoutOrigin(activity, targets) {
  if ( !selfEmanation(activity) ) return targets;
  const own = new Set([activity.actor?.uuid, tokenDocOf(activity.actor)?.actor?.uuid].filter(Boolean));
  return targets.filter(t => !own.has(t.uuid));
}
export function emanationReach(activity, contained) {
  if ( !Array.isArray(contained) ) return contained;
  const row = emanationRowFor(activity);
  const affects = activity?.target?.affects?.type ?? null;
  if ( !row && (affects !== "enemy") && (affects !== "ally") && !selfEmanation(activity) ) return contained;
  const caster = activity.actor ?? null;
  const casterTok = tokenDocOf(caster);
  const casterDisposition = casterTok?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  return contained.filter(c => (c.tokenId !== casterTok?.id) && (c.uuid !== caster?.uuid)
    && (!row || reachAdmits(row.reach, casterDisposition, c.disposition ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL))
    && affectsAdmits(affects, casterDisposition, c.disposition ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL));
}
