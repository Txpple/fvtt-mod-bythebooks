/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): THE FIGHTING STYLES — feats turning on what the owner
 * holds or wears, or how it attacks (RULINGS *The fighting styles*). THE FACE: one ActiveEffect per
 * listed style, live or disabled off the EQUIPPED boxes; an ungated pack effect is off while the face
 * carries the rule. THE ROLL: bonuses join the parts; a die floor is a `minN` on the built rolls.
 */
import { MODULE_ID, readFlag, TITLE, publish, drivesMomentFor, canApplyTo, canAnswerFor, keepsMessage, statContext, queueFlagWrite, decisionWindow, ownersAndGmIds, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { lower, featureNamed, wieldsAs } from "./lookup.js";
import { answers, damageRuleEntries, identifierOf, listedNames } from "./decide/registry.js";
import { DAMAGE_RULES } from "./decide/registry.js";
import { heldOf, faceState, rollFits, raisedOf, styleLine, diceOf, chipsOf, blockDamages,
  typesInNames, typedFace, ignoredResistances, typeChoicesLeft, spellRuleFits } from "./decide/damage-rules.js";
import { isCard, CARD, originIdInData } from "./decide/card.js";
import { changeCopy, changesSignature } from "./decide/changes.js";
import { bfCard, esc, holdBarHTML, ruleLine, pickInputHTML } from "./decide/present.js";
import { SURFACES } from "./surfaces.js";
import { riseDice, driftChip } from "./dice-rise.js";
import { withTargets, resolveAttackMessage, turnChitStands, writeTurnChit } from "./shared.js";
import { attackMessageForDamage } from "./auto-damage.js";
import { grappledBy, tokenOf, tokensOf } from "./geometry.js";
import { openMomentPopup, momentButton, armAskTimer, disarmAskTimer, keeperOwns, registerRelay, pendingRow, closePopup, postCard, postAnswer, picked } from "./ui.js";
import { listen, listenOnce } from "./dispatch.js";

const STYLE_FLAG = "fightingStyle";            // a damage message's record — and a face's own key
const TAKEN_FLAG = "fightingStyleTakenOver";   // the pack's own effect, switched off for the face
const FLOOR = "bfFightingStyleFloor";   // string keys: a config may be cloned between the hooks
const DONE = "bfFightingStyleDone";

/* --- reading the sheet ------------------------------------------------------------------------ */

/** Every item as the decision layer wants it. */
const itemFacts = actor => [...(actor?.items ?? [])].map(i => ({
  name: i.name, type: i.type, kind: i.system?.type?.value ?? null, base: i.system?.type?.baseItem ?? null,
  equipped: i.system?.equipped === true, properties: [...(i.system?.properties ?? [])]
}));

/** The damage types dnd5e knows — what a `typed` row may read off a feat's name. */
const damageTypeKeys = () => Object.keys(CONFIG.DND5E?.damageTypes ?? {});

/**
 * The feat copies a `typed` row reads: every feat carrying the row's identifier or a name that starts
 * with the row's ("Elemental Adept (Fire)").
 */
const typedCopies = (actor, name) => [...(actor?.items ?? [])].filter(i => (i.type === "feat")
  && ((i.system?.identifier === identifierOf(name)) || lower(i.name).startsWith(lower(name))));

/**
 * The listed rows this actor holds — `[{ name, row, feature, types }]`. `types` is the row's own, or
 * for a `typed` row what the copies' names say.
 */
function heldRows(actor) {
  const listed = listedNames(damageRuleEntries());
  const out = [];
  for ( const [name, row] of Object.entries(DAMAGE_RULES) ) {
    if ( !listed.has(lower(name)) ) continue;
    if ( row.typed ) {
      const copies = typedCopies(actor, name);
      if ( copies.length ) out.push({ name, row, feature: copies[0], types: typesInNames(copies.map(c => c.name), name, damageTypeKeys()) });
      continue;
    }
    const feature = featureNamed(actor, name);
    if ( feature ) out.push({ name, row, feature, types: [...(row.types ?? [])] });
  }
  return out;
}

/** The pack's own effects on the feat that carry a change — the ones a `takesOver` row switches off. */
const packEffectsOf = feature => [...(feature?.effects ?? [])].filter(e => (e.changes ?? e.system?.changes ?? []).length);

/** A change the pack's own effect carries, by a key test — the number is the content's (N1). */
function packChange(feature, test) {
  for ( const effect of packEffectsOf(feature) ) {
    const change = (effect.changes ?? effect.system?.changes ?? []).find(c => test(String(c.key ?? "")));
    if ( change ) return change;
  }
  return null;
}
const damageBonusOf = feature => packChange(feature, k => /damage/i.test(k))?.value ?? null;
const acChangeOf = feature => packChange(feature, k => /attributes\.ac\./i.test(k));

/** Unarmed Fighting's two dice, as the feat's own attacks ship them — for the face's line. */
function unarmedDiceOf(feature) {
  const dice = [...(feature?.system?.activities ?? [])]
    .filter(a => (a.type === "attack") && (a.attack?.type?.classification === "unarmed"))
    .map(a => a.damage?.parts?.[0]?.denomination).filter(Boolean).map(Number).sort((a, b) => a - b);
  return dice.length ? { small: `d${dice[0]}`, large: `d${dice.at(-1)}` } : {};
}

/* --- THE FACE ----------------------------------------------------------------------------------- */

/** The face this row should wear on this actor — the effect's data, bar the ids. */
function desiredFace({ name, row, feature, types }, held) {
  const state = row.typed ? typedFace(name, types) : faceState(row.gate, held, row.gate === "unarmed" ? unarmedDiceOf(feature) : {});
  const change = row.ac === "effect" ? acChangeOf(feature) : null;
  return {
    name, img: feature.img, origin: feature.uuid, transfer: false, disabled: !state.live,
    changes: change ? [{ ...changeCopy(change), value: String(change.value) }] : [],
    flags: { [MODULE_ID]: { [STYLE_FLAG]: { key: row.key, live: state.live, word: state.word, detail: state.detail,
      ...(row.feat ? { feat: true } : {}) } } }
  };
}

const faceOf = effect => readFlag(effect, STYLE_FLAG) ?? null;
const sameChanges = (a, b) => changesSignature(a) === changesSignature(b);

const syncing = new Map();

/** Silences core's own "+/-" float on face writes (the face floats its own words).
 * ⚠ A FRESH object per write: Foundry writes into the operation, and a shared frozen one throws. */
const quiet = () => ({ animate: false });

/** Keep this actor's faces — and the pack effects they take over — in step with its sheet. */
function scheduleSync(actor) {
  if ( !actor?.uuid || !drivesMomentFor(actor.uuid) || !canApplyTo(actor) ) return;
  clearTimeout(syncing.get(actor.uuid));
  syncing.set(actor.uuid, setTimeout(() => { syncing.delete(actor.uuid); void syncFaces(actor); }, 150));
}

async function syncFaces(actor) {
  try {
    const rows = heldRows(actor);
    const held = heldOf(itemFacts(actor));
    const faces = [...(actor.effects ?? [])].filter(e => faceOf(e));
    const creates = [], updates = [], deletes = [];
    for ( const found of rows ) {
      const want = desiredFace(found, held);
      const have = faces.find(e => faceOf(e).key === found.row.key);
      if ( !have ) { creates.push(want); continue; }
      const f = faceOf(have);
      if ( (have.disabled !== want.disabled) || (f.detail !== want.flags[MODULE_ID][STYLE_FLAG].detail) || (f.word !== want.flags[MODULE_ID][STYLE_FLAG].word)
        || (have.name !== want.name) || !sameChanges(have.changes, want.changes) ) {
        updates.push({ _id: have.id, name: want.name, disabled: want.disabled, changes: want.changes,
          [`flags.${MODULE_ID}.${STYLE_FLAG}`]: want.flags[MODULE_ID][STYLE_FLAG] });
      }
    }
    const keys = new Set(rows.map(r => r.row.key));
    for ( const e of faces ) if ( !keys.has(faceOf(e).key) ) deletes.push(e.id);
    if ( deletes.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", deletes, quiet());
    if ( updates.length ) await actor.updateEmbeddedDocuments("ActiveEffect", updates, quiet());
    if ( creates.length ) await actor.createEmbeddedDocuments("ActiveEffect", creates, quiet());
    await syncTakeovers(actor, rows);
  } catch(err) {
    log.error(`The fighting styles on ${actor?.name} could not be kept in step — toggle their effects by hand.`, err);
  }
}

/** The pack's ungated effects: off while the face carries the rule, back on when it stops. */
async function syncTakeovers(actor, rows) {
  // Every copy that answers the row: a second copy of the feat would otherwise keep its pack effect running.
  const running = rows.filter(r => r.row.takesOver).map(r => r.name);
  for ( const feature of (actor.items ?? []) ) {
    if ( feature.type !== "feat" ) continue;
    const ours = running.some(name => answers(name, feature, ["feat"]));
    const writes = [];
    for ( const effect of packEffectsOf(feature) ) {
      const taken = readFlag(effect, TAKEN_FLAG) === true;
      if ( ours && (!taken || !effect.disabled) ) {
        writes.push({ _id: effect.id, disabled: true, [`flags.${MODULE_ID}.${TAKEN_FLAG}`]: true });
      } else if ( !ours && taken ) {
        writes.push({ _id: effect.id, disabled: false, [`flags.${MODULE_ID}.-=${TAKEN_FLAG}`]: null });
      }
    }
    if ( writes.length ) await feature.updateEmbeddedDocuments("ActiveEffect", writes, quiet());
  }
}

/** Every actor this client keeps: the world's, and the scene's unlinked tokens'. */
function syncAll() {
  for ( const actor of game.actors ?? [] ) scheduleSync(actor);
  for ( const token of canvas?.tokens?.placeables ?? [] ) if ( token.actor && !token.document.actorLink ) scheduleSync(token.actor);
}

listenOnce("ready", "damage-rules", () => { try { syncAll(); } catch(err) { log.warn(`fighting styles: the first pass failed.`, err); } });
listen("canvasReady", "damage-rules", () => {
  for ( const token of canvas?.tokens?.placeables ?? [] ) if ( token.actor && !token.document.actorLink ) scheduleSync(token.actor);
});
listen("createActor", "damage-rules", actor => scheduleSync(actor));
for ( const hook of ["createItem", "updateItem", "deleteItem"] ) {
  listen(hook, "damage-rules", item => { if ( item?.parent instanceof Actor ) scheduleSync(item.parent); });
}
// The list is the switch: a change re-reads every actor (an unlisted style's face goes, its pack effect comes back).

/* --- THE ROLL ----------------------------------------------------------------------------------- */

/** Is it this attacker's own turn? True unless a running combat holds it and the turn is another's. */
function ownTurnOf(actor) {
  const same = other => !!other && !!actor && ((other === actor) || (other.uuid === actor.uuid));
  const running = [...(game.combats ?? [])].filter(c => c.started && c.combatants.some(cb => same(cb.actor)));
  return !running.length || running.some(c => same(c.combatant?.actor));
}

listen("dnd5e.preRollDamage", "damage-rules", (config, _dialog, message) => {
  try {
    if ( !config || config[DONE] ) return;
    const activity = config.subject;
    if ( activity?.item?.type === "spell" ) { spellRules(config, activity, message); return; }
    const weapon = activity?.item;
    if ( (activity?.type !== "attack") || (weapon?.type !== "weapon") ) return;
    const attacker = activity.actor;
    const rows = heldRows(attacker);
    if ( !rows.length ) return;
    config[DONE] = true;
    const roll = config.rolls?.[0];
    const parts = Array.isArray(roll?.parts) ? roll.parts : null;
    const held = heldOf(itemFacts(attacker));
    const facts = {
      kind: weapon.system?.type?.value ?? null, base: weapon.system?.type?.baseItem ?? null, properties: [...(weapon.system?.properties ?? [])],
      mode: config.attackMode ?? null, mod: Number(roll?.data?.mod ?? 0),
      // Pole Strike's swing is a BONUS ACTION, never "part of the Attack action" (Heavy Weapon Mastery)
      ownTurn: ownTurnOf(attacker) && !readFlag(attackMessageForDamage(config, message), "poleStrike")
    };
    const resolve = f => { try { return Roll.replaceFormulaData(String(f), roll?.data ?? {}); } catch { return String(f); } };
    const styles = [];
    let offhandAdded = false;   // Two-Weapon Fighting and Crossbow Expert give back ONE modifier between them
    for ( const { name, row, feature } of rows ) {
      const face = faceState(row.gate, held);
      const fits = rollFits(row.gate, { ...facts, faceLive: face.live });
      if ( row.minimum && fits ) {
        config[FLOOR] = row.minimum;
        styles.push({ key: row.key, feature: name, gain: 0, pending: true });
        continue;
      }
      if ( !row.bonus ) continue;
      if ( !fits ) {
        // Dueling's quiet line, only when the face is live but THIS swing took the Versatile weapon in two.
        if ( (row.gate === "oneHanded") && face.live && ["simpleM", "martialM"].includes(facts.kind) ) {
          styles.push({ key: row.key, feature: name, gain: 0, off: "two hands" });
        }
        // Great Weapon Master's quiet line: a Heavy weapon swung off the owner's turn.
        if ( (row.gate === "heavy") && facts.properties.includes("hvy") && !facts.ownTurn ) {
          styles.push({ key: row.key, feature: name, gain: 0, off: "not your turn" });
        }
        continue;
      }
      const offhand = (row.gate === "offhand") || (row.gate === "offhandCrossbow");
      if ( offhand && offhandAdded ) continue;
      const amount = row.bonus === "effect" ? damageBonusOf(feature) : row.bonus;
      const gain = Number(resolve(amount));
      if ( !parts || !amount || !Number.isFinite(gain) || (gain <= 0) ) continue;
      parts.push(String(amount));
      if ( offhand ) offhandAdded = true;
      styles.push({ key: row.key, feature: name, gain, note: offhand ? "on the off-hand" : null });
    }
    if ( !styles.length ) return;
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.${STYLE_FLAG}`,
      { styles, gain: styles.reduce((s, e) => s + e.gain, 0), ...statContext(attacker.uuid) });
  } catch(err) {
    log.error(`A fighting style could not be applied to this damage roll — add it by hand.`, err);
  }
});

/** The damage types one built roll carries. */
const rollTypesOf = r => r?.options?.types ?? (r?.options?.type ? [r.options.type] : []);

/** The once-per-cast marks (`once: "spell"`), client-local: the cast card's id → the row keys that rode it. The rolling
 * client rolls every roll of the cast (Scorching Ray's rays), so no world write is needed. */
const spellOnce = new Map();
const SPELL_ONCE_CAP = 200;
function markSpellOnce(castId, key) {
  if ( !castId ) return;
  if ( spellOnce.size >= SPELL_ONCE_CAP ) spellOnce.delete(spellOnce.keys().next().value);
  spellOnce.set(castId, new Set([...(spellOnce.get(castId) ?? []), key]));
}

/** Whose spell (a `classes` row): metamagic.js's reading of dnd5e 6's `sourceItem`. */
function sourceClassOf(activity) {
  const sys = activity?.item?.system ?? {};
  return sys.classIdentifier || (String(sys.sourceItem ?? "").startsWith("class:") ? String(sys.sourceItem).slice(6) : "")
    || ((Object.keys(activity?.actor?.classes ?? {}).length === 1) ? Object.keys(activity.actor.classes)[0] : null);
}

/**
 * A SPELL's rows: the floor (Elemental Adept — a `spells` row with a `minimum`, when the spell deals one of the row's
 * types; only that type's dice are floored) and B4's BONUSES (a `spells` row with a `bonus`, pushed onto the FIRST
 * roll whose type the row names — one roll per cast for `once: "spell"`, one per turn for `once: "turn"`).
 */
function spellRules(config, activity, message) {
  const caster = activity.actor;
  const held = heldRows(caster).filter(r => r.row.spells);
  if ( !held.length ) return;
  const rolls = config.rolls ?? [];
  const dealt = new Set(rolls.flatMap(rollTypesOf));
  const styles = [];
  for ( const { name, row, types } of held ) {
    if ( !row.minimum || !types.length ) continue;
    const hit = types.filter(t => dealt.has(t));
    if ( !hit.length || config[FLOOR] ) continue;
    config[FLOOR] = { minimum: row.minimum, types: hit };
    styles.push({ key: row.key, feature: name, gain: 0, pending: true });
  }
  const castId = originIdInData(message?.data ?? {}) ?? null;
  const spell = { level: activity.item.system?.level ?? null, school: activity.item.system?.school ?? null,
    sourceClass: sourceClassOf(activity), dealt: [...dealt] };
  for ( const { name, row, types } of held ) {
    const fits = spellRuleFits(row, spell, types);
    if ( !fits ) continue;
    if ( (row.once === "spell") && castId && spellOnce.get(castId)?.has(row.key) ) continue;
    if ( (row.once === "turn") && turnChitStands(caster, "rider", `damage-rule:${row.key}`) ) continue;
    const roll = rolls.find(r => rollTypesOf(r).some(t => fits.includes(String(t).toLowerCase())));
    const parts = Array.isArray(roll?.parts) ? roll.parts : null;
    if ( !parts ) continue;
    let gain = NaN;
    try { gain = Number(Roll.replaceFormulaData(String(row.bonus), roll.data ?? caster.getRollData?.() ?? {}, { missing: "0" })); } catch { gain = NaN; }
    if ( !Number.isFinite(gain) || (gain <= 0) ) continue;
    parts.push(String(row.bonus));
    if ( row.once === "spell" ) markSpellOnce(castId, row.key);
    styles.push({ key: row.key, feature: name, gain, ...(row.once === "turn" ? { turnChit: true } : {}) });
  }
  if ( !styles.length ) return;
  config[DONE] = true;
  foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.${STYLE_FLAG}`,
    { styles, gain: styles.reduce((s, e) => s + e.gain, 0), ...statContext(caster.uuid) });
}

// The floor goes on the built rolls, so a crit's doubled dice are included.
listen("dnd5e.postDamageRollConfiguration", "damage-rules", (rolls, config) => {
  try {
    const set = config?.[FLOOR];
    if ( !set ) return;
    const floor = (typeof set === "object") ? set.minimum : set;
    const only = (typeof set === "object") ? new Set(set.types ?? []) : null;
    const Die = foundry.dice.terms.Die;
    for ( const roll of (rolls ?? []) ) {
      if ( only && !(roll.options?.types ?? [roll.options?.type]).some(t => only.has(t)) ) continue;
      let touched = false;
      for ( const term of (roll.terms ?? []) ) {
        if ( !(term instanceof Die) || term.modifiers.some(m => /^min\d+$/i.test(m)) ) continue;
        term.modifiers.push(`min${floor}`);
        touched = true;
      }
      if ( touched ) roll.resetFormula?.();
    }
  } catch(err) {
    log.error(`A damage floor (Great Weapon Fighting, Elemental Adept) could not be set — count the low dice by hand.`, err);
  }
});

// Count what the floor raised off the evaluated dice; a floor that raised nothing leaves no trace.
listen("preCreateChatMessage", "damage-rules", doc => {
  try {
    const flag = readFlag(doc, STYLE_FLAG);
    if ( !flag?.styles?.length ) return;
    const rolls = (doc.rolls ?? []).map(r => (typeof r?.toJSON === "function") ? r.toJSON() : r);
    const styles = [];
    let floor = null;
    for ( const entry of flag.styles ) {
      if ( !entry.pending ) { styles.push(entry); continue; }
      floor = Object.values(DAMAGE_RULES).find(r => r.key === entry.key)?.minimum ?? 3;
      const { raised, gain } = raisedOf(rolls, floor);
      if ( gain > 0 ) styles.push({ key: entry.key, feature: entry.feature, gain, raised });
    }
    const changed = styles.some(e => e.gain > 0);
    const next = styles.length
      ? { ...flag, styles, gain: styles.reduce((sum, e) => sum + e.gain, 0), ...(changed ? { dice: diceOf(rolls, floor) } : {}) }
      : null;
    doc.updateSource({ [`flags.${MODULE_ID}.${next ? STYLE_FLAG : `-=${STYLE_FLAG}`}`]: next });
  } catch(err) {
    log.error(`Great Weapon Fighting's count failed — the dice stand as rolled.`, err);
  }
});

/**
 * The face's float, core's "+(…)" / "−(…)" with the panel's title: core floats only an effect with
 * changes, so the face draws its own (core's is quieted). Every client, on a toggle; a create floats nothing.
 */
listen("updateActiveEffect", "damage-rules", (effect, changes) => {
  try {
    const actor = effect.parent;
    if ( !faceOf(effect) || !(actor instanceof Actor) || !("disabled" in changes) || !canvas?.interface?.createScrollingText ) return;
    const enabled = !effect.disabled;
    for ( const token of tokensOf(actor) ) {
      if ( !token.visible || token.document.isSecret ) continue;
      const title = faceOf(effect).feat ? effect.name : `Fighting Style: ${effect.name}`;
      canvas.interface.createScrollingText(token.center, `${enabled ? "+" : "−"}(${title})`, {
        anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
        direction: enabled ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
        distance: 2 * token.h, fontSize: 28, stroke: 0x000000, strokeThickness: 4, jitter: 0.25
      });
    }
  } catch(err) { log.warn(`The fighting style's face float could not draw.`, err); }
});

/* --- THE BLOCK (Heavy Armor Master) ------------------------------------------------------------ *
 * `dnd5e.preCalculateDamage` runs before resistances (the rule's order); only an ATTACK's damage is
 * cut. The cut rides the options and the actor's update so every client pops it.
 * ------------------------------------------------------------------------------------------- */

const BLOCK = "bfArmorBlock";          // on the damage options and the calculation, client-local
const BLOCK_FLAG = "armorBlock";       // on the actor's own damage update — the pop, every client

/** An attack's damage card: a damage roll whose activity is an attack, or that answers one. */
function isAttackDamage(message) {
  if ( !message || !isCard(message, CARD.damage) ) return false;
  if ( message.getAssociatedActivity?.()?.type === "attack" ) return true;
  try { return !!resolveAttackMessage(message); } catch { return false; }
}

listen("dnd5e.preCalculateDamage", "damage-rules", (actor, damages, options) => {
  try {
    if ( !(actor instanceof Actor) || !Array.isArray(damages) || (options?.ignore === true) ) return;
    const rows = heldRows(actor).filter(r => r.row.block);
    if ( !rows.length || !isAttackDamage(options?.originatingMessage) ) return;
    const held = heldOf(itemFacts(actor));
    for ( const { name, row } of rows ) {
      if ( !faceState(row.gate, held).live ) continue;
      const amount = Number(Roll.replaceFormulaData(String(row.block), actor.getRollData(), { missing: "0" }));
      const { values, cut } = blockDamages(damages, row.types, amount);
      if ( !cut ) continue;
      values.forEach((v, i) => { damages[i].value = v; });
      const block = { feature: name, amount: cut };
      damages[BLOCK] = block;
      if ( options ) options[BLOCK] = block;
      return;
    }
  } catch(err) {
    log.error(`Heavy Armor Master's reduction could not be taken — reduce by hand.`, err);
  }
});

/* --- THE IGNORED RESISTANCE (Elemental Adept, Poisoner) ----------------------------------------- *
 * RULINGS *The PHB feats — groups 1–3*. The ATTACKER's rows fill dnd5e's `options.ignore.resistance`.
 * ⚠ A copy, never the caller's Set: the damage tray keeps its options between renders.
 * ------------------------------------------------------------------------------------------- */

const IGNORED = "bfIgnored";

listen("dnd5e.preCalculateDamage", "damage-rules", (actor, damages, options) => {
  try {
    if ( !(actor instanceof Actor) || !Array.isArray(damages) || !options || (options.ignore === true) ) return;
    const message = options.originatingMessage;
    if ( !message || !isCard(message, CARD.damage) ) return;
    const source = message.getAssociatedActor?.();
    if ( !(source instanceof Actor) || (source.uuid === actor.uuid) ) return;
    const rows = heldRows(source).filter(r => (r.row.ignores === "resistance") && r.types.length);
    // THE DMG — a `wields` row is carried by the damage's own WEAPON (Vorpal Sword), never a feat on the sheet.
    const weapon = message.getAssociatedItem?.() ?? null;
    const listed = listedNames(damageRuleEntries());
    for ( const [name, row] of Object.entries(DAMAGE_RULES) ) {
      if ( row.wields && (row.ignores === "resistance") && listed.has(lower(name)) && wieldsAs(weapon, name) ) {
        rows.push({ name, row, feature: weapon, types: [...(row.types ?? [])] });
      }
    }
    if ( !rows.length ) return;
    const spellItem = message.getAssociatedItem?.() ?? null;
    const spell = spellItem?.type === "spell";
    const dealt = new Set(damages.map(d => d?.type).filter(Boolean));
    const said = [];
    for ( const { name, row, types } of rows ) {
      if ( row.spells && !spell ) continue;
      // RAVENLOFT — `spell`: one spell by name (Death Touch's Chill Touch).
      if ( row.spell && (lower(spellItem?.name ?? "") !== lower(row.spell)) ) continue;
      const hit = types.filter(t => dealt.has(t));
      if ( !hit.length ) continue;
      const ignore = (options.ignore && (typeof options.ignore === "object")) ? { ...options.ignore } : {};
      ignore.resistance = new Set([...(ignore.resistance ?? []), ...hit]);
      options.ignore = ignore;
      const resisted = ignoredResistances(damages, hit, actor.system?.traits?.dr?.value ?? []);
      if ( resisted.length ) said.push({ feature: name, types: resisted });
    }
    if ( said.length ) damages[IGNORED] = said;
  } catch(err) {
    log.error(`A feat's ignored Resistance (Elemental Adept, Poisoner) could not be set — apply it by hand.`, err);
  }
});

// The block rides the damage's own update: one write, and every client pops it.
listen("dnd5e.preApplyDamage", "damage-rules", (_actor, _amount, updates, options) => {
  const block = options?.[BLOCK];
  if ( !block?.amount || !updates ) return;
  updates[`flags.${MODULE_ID}.${BLOCK_FLAG}`] = { ...block, at: Date.now() };
});

const popped = new Set();
listen("updateActor", "damage-rules", (actor, changes) => {
  try {
    // ⚠ The update carries only what CHANGED (a same-amount block sends `at` alone): read the actor's flag.
    if ( !changes?.flags?.[MODULE_ID]?.[BLOCK_FLAG] ) return;
    const block = readFlag(actor, BLOCK_FLAG);
    if ( !block?.amount || !block.at || ((Date.now() - block.at) > 10_000) ) return;
    const key = `${actor.uuid}|${block.at}`;
    if ( popped.has(key) ) return;
    popped.add(key);
    publish("armorBlock", { actorUuid: actor.uuid, ...block });
    for ( const token of tokensOf(actor) ) driftChip(token, token, `−${block.amount}`);
  } catch(err) { log.warn(`Heavy Armor Master's block could not draw.`, err); }
});

/* --- THE NOTICE: the card's chips and the canvas dice, no clicks (decide/damage-rules.js chipsOf) --- */

const CHIP_CSS_ID = "bf-style-chips-css";
/** The chips' look, once per client (light-dark() follows Foundry's per-theme color-scheme). */
function ensureChipCss() {
  if ( document.getElementById(CHIP_CSS_ID) ) return;
  const style = document.createElement("style");
  style.id = CHIP_CSS_ID;
  style.textContent = `
    .bf-fighting-style-line{display:flex;flex-wrap:wrap;align-items:center;gap:0.35rem;margin:0.3rem 0;font-size:var(--font-size-11,11px);opacity:0.9}
    .bf-fighting-style-line .bf-chips{display:inline-flex;flex-wrap:wrap;gap:0.25rem;align-items:center}
    .bf-fighting-style-line .bf-chip{position:relative;display:inline-grid;place-items:center;min-width:1.55rem;height:1.55rem;padding:0 0.2rem;border-radius:4px;border:1px solid currentColor;font-weight:bold;font-size:var(--font-size-12,12px)}
    .bf-fighting-style-line .bf-chip.up{border:2px solid light-dark(#9f7a1e,#e3ce9e);box-shadow:0 0 5px light-dark(rgba(159,122,30,.35),rgba(227,206,158,.45))}
    .bf-fighting-style-line .bf-chip b{grid-area:1/1}
    .bf-fighting-style-line .bf-chip em{position:absolute;top:-0.45rem;right:-0.35rem;font-size:9px;font-style:normal;opacity:0.55;text-decoration:line-through}
    .bf-fighting-style-line .bf-gain{font-weight:bold;opacity:0.85}
    .bf-fighting-style-line .bf-chip .was{opacity:0}
    @media (prefers-reduced-motion:no-preference){
      .bf-fighting-style-line.fresh .bf-chip .was{animation:bf-was 0.9s ease-in forwards}
      .bf-fighting-style-line.fresh .bf-chip .now{animation:bf-now 0.9s ease-out forwards}
      .bf-fighting-style-line.fresh .bf-chip.flat{animation:bf-pop 0.9s ease-out}
    }
    @keyframes bf-was{0%,35%{opacity:1;transform:rotateX(0)}55%,100%{opacity:0;transform:rotateX(90deg)}}
    @keyframes bf-now{0%,50%{opacity:0;transform:rotateX(-90deg)}75%,100%{opacity:1;transform:rotateX(0)}}
    @keyframes bf-pop{0%,40%{transform:scale(0.6);opacity:0}70%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}`;
  document.head.appendChild(style);
}

/** A chip, as the card draws it: a turned die carries the face it showed, ghosted in its corner. */
function chipHTML(c) {
  const cls = `bf-chip${c.up ? " up" : ""}${c.flat ? " flat" : ""}`;
  const tip = c.faces ? ` data-tooltip="d${c.faces}${c.was ? ` — rolled ${esc(c.was)}, counts ${esc(c.label)}` : ""}"` : "";
  return c.was
    ? `<span class="${cls}"${tip}><em>${esc(c.was)}</em><b class="was">${esc(c.was)}</b><b class="now">${esc(c.label)}</b></span>`
    : `<span class="${cls}"${tip}><b>${esc(c.label)}</b></span>`;
}

listen("dnd5e.renderChatMessage", "damage-rules", (message, html) => {
  try {
    const flag = readFlag(message, STYLE_FLAG);
    if ( !flag?.styles?.length ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-fighting-style-line") ) return;
    ensureChipCss();
    // The turn-over plays only on a card just born.
    const fresh = (Date.now() - (message.timestamp ?? 0)) < 5000;
    for ( const entry of flag.styles ) {
      const div = document.createElement("div");
      div.className = `bf-fighting-style-line${fresh ? " fresh" : ""}`;
      if ( !entry.gain ) {
        div.dataset.bfStyleLine = `${entry.feature} off — ${entry.off ?? ""}`;
        div.style.opacity = "0.6";
        div.innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${esc(entry.feature)} off — ${esc(entry.off ?? "")}`;
      } else {
        const { chips, after } = chipsOf(entry, flag.dice ?? []);
        div.dataset.bfStyleLine = styleLine(entry);
        div.setAttribute("aria-label", styleLine(entry));
        div.innerHTML = `<i class="fa-solid fa-shield-halved"></i> <span>${esc(entry.feature)}</span>`
          + `<span class="bf-chips">${chips.map(chipHTML).join("")}</span>`
          + (after ? `<span class="bf-gain">${esc(after)}</span>` : "");
      }
      content.appendChild(div);
    }
  } catch(err) {
    log.error(`The fighting style's line failed to draw.`, err);
  }
});

// The dice rise off the ATTACKER's token on every client, once, for every style that changed the
// roll (dice-rise.js draws them). Live cards only: a reload replays nothing.
const floated = new Set();
/** The type popup's words: the row's own (`pickLine`), else Elemental Adept's. */
const pickWordsOf = row => row?.pickLine ?? "your spells ignore Resistance to it, and its 1s count as 2";
listen("createChatMessage", "damage-rules", message => {
  try {
    const flag = readFlag(message, STYLE_FLAG);
    const changed = (flag?.styles ?? []).filter(e => e.gain > 0);
    if ( !changed.length || floated.has(message.id) ) return;
    floated.add(message.id);
    const token = tokenOf(message.speaker?.token) ?? tokenOf(flag.sourceUuid);
    changed.forEach((entry, i) => {
      const { chips } = chipsOf(entry, flag.dice ?? []);
      publish("styleDice", { messageId: message.id, key: entry.key, chips });
      setTimeout(() => riseDice(token, chips), i * 700);
    });
    // B4 — a `once: "turn"` row (Radiant Soul) marks the turn on the caster's own client: the rider chit.
    const caster = resolveUuid(flag.sourceUuid);
    if ( (caster instanceof Actor) && drivesMomentFor(caster.uuid) ) {
      for ( const entry of changed.filter(e => e.turnChit) ) {
        const feature = featureNamed(caster, entry.feature);
        void writeTurnChit(caster, "rider", { name: `${entry.feature} — used this turn`, img: feature?.img ?? null,
          description: `${entry.feature} rode a damage roll this turn. Once per turn; this chit ends with the turn.`,
          origin: feature?.uuid ?? null, riderKey: `damage-rule:${entry.key}` });
      }
    }
  } catch(err) { log.warn(`The fighting style's dice could not draw.`, err); }
});

/* --- THE GRAPPLE'S TURN-START DAMAGE (Unarmed Fighting) ----------------------------------------- *
 * Asked of the owner (Deal it / Skip); the clock deals it only to the one creature KNOWN to be held
 * by this one. The damage is the feat's own damage activity, used at the pick (damage-casts.js).
 * ------------------------------------------------------------------------------------------- */

const GRAPPLE_FLAG = "grappleDamage";
const grappleTimers = new Map();
const grappleAsked = new Set();

// The grapple finder (grapplerOf, grappledBy) is geometry.js's: Barbed Hide's turn start reads it too.

/** The feat's own grapple-damage activity: its bare damage activity. */
const grappleActivityOf = feature => [...(feature?.system?.activities ?? [])].find(a => a.type === "damage") ?? null;

listen("updateCombat", "damage-rules", (combat, changed) => {
  try {
    if ( !combat?.started || (!("turn" in changed) && !("round" in changed)) ) return;
    const combatant = combat.combatant;
    const actor = combatant?.actor;
    if ( !actor || !drivesMomentFor(actor.uuid) ) return;
    if ( !listedNames(damageRuleEntries()).has("unarmed fighting") ) return;
    const feature = featureNamed(actor, "Unarmed Fighting");
    const activity = grappleActivityOf(feature);
    if ( !activity ) return;
    const turnKey = `${combat.id}:${combat.round}:${combat.turn}`;
    if ( grappleAsked.has(turnKey) ) return;
    grappleAsked.add(turnKey);
    const token = combatant.token?.object ?? tokenOf(actor.uuid);
    const candidates = grappledBy(actor, token);
    if ( !candidates.length ) return;
    void stampGrapple(actor, feature, activity, candidates);
  } catch(err) {
    log.error(`Unarmed Fighting's grapple damage could not be offered — use "Grappled Damage" from the sheet.`, err);
  }
});

async function stampGrapple(actor, feature, activity, candidates) {
  const window = decisionWindow();
  const certain = candidates.filter(c => c.certain);
  const flag = {
    status: "pending", row: "Unarmed Fighting", actorUuid: actor.uuid, actorName: actor.name,
    itemId: feature.id, activityId: activity.id, candidates,
    pick: (certain.length === 1) ? certain[0].uuid : (candidates.length === 1 ? candidates[0].uuid : null),
    clockDeals: certain.length === 1, answer: null, ...statContext(actor.uuid),
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
  };
  const message = await postCard({
    actor,
    card: bfCard({ img: feature.img, eyebrow: "Your turn — Unarmed Fighting", tone: "pending",
      title: `${actor.name} may deal 1d4 to ${candidates.map(c => c.name).join(" or ")}`,
      subtitle: "a creature you are grappling" }),
    flags: { [MODULE_ID]: { [GRAPPLE_FLAG]: flag } }
  });
  if ( message ) armGrappleTimer(message);
}


function armGrappleTimer(message) {
  armAskTimer(grappleTimers, message, GRAPPLE_FLAG, async live => {
    const now = readFlag(live, GRAPPLE_FLAG);
    if ( now.clockDeals && now.pick ) await dealGrapple(live, now.pick, { timedOut: true });
    else await recordGrapple(live, { answer: "skip", pick: null, timedOut: true });
  }, { owns: keeperOwns });
}

/** Deal it: the feat's own damage activity used at the pick, on this client; then the answer recorded. */
async function dealGrapple(message, pickUuid, { timedOut = false } = {}) {
  const flag = readFlag(message, GRAPPLE_FLAG);
  const actor = resolveUuid(flag?.actorUuid);
  const activity = actor?.items?.get(flag.itemId)?.system?.activities?.get(flag.activityId) ?? null;
  const pick = (flag?.candidates ?? []).find(c => c.uuid === pickUuid);
  const token = pick ? resolveUuid(pick.tokenUuid)?.object : null;
  if ( !activity || !token ) {
    ui.notifications.warn(`${TITLE}: could not find the grappled creature or "Grappled Damage" — use it from the sheet.`);
    return;
  }
  await withTargets([token], () => activity.use({ subsequentActions: false }, { configure: false }, {}));
  await recordGrapple(message, { answer: "deal", pick: pickUuid, timedOut });
}

/** Record an answer: the keeper writes it, anyone else sends it (the relay folds it). */
async function recordGrapple(message, { answer, pick, timedOut = false }) {
  if ( keepsMessage(message) || message.isOwner ) {
    await queueFlagWrite(message, GRAPPLE_FLAG, current => foldGrapple(current, { answer, pick, timedOut }));
    return;
  }
  await postAnswer("grappleDamageAnswer", {
    actor: resolveUuid(readFlag(message, GRAPPLE_FLAG)?.actorUuid),
    card: `<p>Unarmed Fighting — ${answer === "deal" ? "dealt" : "skipped"}</p>`, toElect: true,
    flags: { [MODULE_ID]: { grappleDamageAnswer: { messageId: message.id, answer, pick } } }
  });
}

function foldGrapple(current, { answer, pick, timedOut = false }) {
  if ( current.status !== "pending" ) return false;
  Object.assign(current, { status: "resolved", answer, pick: pick ?? null, timedOut: !!timedOut, answeredAt: Date.now() });
}

registerRelay("grappleDamageAnswer", {
  flagKey: GRAPPLE_FLAG,
  targetOf: a => a.messageId,
  owns: (_flag, target) => keepsMessage(target),
  fold: (current, a) => foldGrapple(current, { answer: a.answer, pick: a.pick ?? null }),
  cleanup: true
});

async function showGrapplePopup(message) {
  const flag = readFlag(message, GRAPPLE_FLAG);
  if ( flag?.status !== "pending" ) return;
  const actor = resolveUuid(flag.actorUuid);
  const feature = actor?.items?.get(flag.itemId);
  const radios = (flag.candidates.length > 1)
    ? flag.candidates.map(c => `<label style="display:block;margin:0.2rem 0;">${pickInputHTML({ kind: "radio", name: "bf-grapple", value: c.uuid, checked: c.uuid === flag.pick })} ${esc(c.name)}</label>`).join("")
    : "";
  await openMomentPopup(message, GRAPPLE_FLAG, actor, {
    title: `Unarmed Fighting — ${actor?.name ?? ""}`, icon: "fa-solid fa-hand-fist",
    content: bfCard({ img: feature?.img ?? null, eyebrow: "Your turn — Unarmed Fighting", tone: "pending",
      title: `Deal 1d4 to ${flag.candidates.length === 1 ? `the ${flag.candidates[0].name}` : "a creature"} you're grappling?`,
      subtitle: "1d4 bludgeoning · the start of your turn",
      lines: [ruleLine(DAMAGE_RULES["Unarmed Fighting"].rule)] }) + radios + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "deal", label: "Deal it", default: true, callback: (_event, button) => {
        const pick = picked(button?.form, "bf-grapple") ?? flag.pick ?? flag.candidates[0]?.uuid;
        void dealGrapple(message, pick);
      } },
      { action: "skip", label: "Skip", callback: () => { void recordGrapple(message, { answer: "skip", pick: null }); } }
    ]
  });
}

listen("dnd5e.renderChatMessage", "damage-rules", (message, html) => {
  try {
    const flag = readFlag(message, GRAPPLE_FLAG);
    if ( !flag ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-grapple-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-grapple-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    const pickName = (flag.candidates ?? []).find(c => c.uuid === flag.pick)?.name ?? "";
    div.innerHTML = `<i class="fa-solid fa-hand-fist"></i> ` + esc((flag.status !== "pending")
      ? ((flag.answer === "deal") ? `Unarmed Fighting — 1d4 to ${pickName}${flag.timedOut ? " (timer)" : ""}` : `Unarmed Fighting — skipped${flag.timedOut ? " (timer)" : ""}`)
      : "Unarmed Fighting — waiting for the answer");
    if ( flag.status === "pending" ) {
      const may = canAnswerFor(resolveUuid(flag.actorUuid));
      pendingRow(message, div, {
        bar: holdBarHTML(flag, "to answer"),
        latch: may && { sub: GRAPPLE_FLAG, show: () => showGrapplePopup(message) },
        answer: may && "Answer",
        arm: armGrappleTimer
      });
    }
    content.appendChild(div);
  } catch(err) { log.warn(`Unarmed Fighting's line could not render.`, err); }
});

// An answer anywhere closes the popup everywhere (law 4); the clock stands down with it.
listen("updateChatMessage", "damage-rules", message => {
  const flag = readFlag(message, GRAPPLE_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armGrappleTimer(message); return; }
  disarmAskTimer(grappleTimers, message.id);
  void closePopup(message, GRAPPLE_FLAG);
});

listen("deleteChatMessage", "damage-rules", message => { disarmAskTimer(grappleTimers, message.id); });

/* --- THE TYPE PICK (Elemental Adept) ------------------------------------------------------------ *
 * The pack's feat carries no type and the row reads it off the NAME: a typeless copy landing on a
 * character asks for one, and the answer renames the copy "Elemental Adept (Fire)".
 * ------------------------------------------------------------------------------------------- */

const PICK_FLAG = "typePick";
const titleCase = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);

/** The listed typed row a copy answers, when its name carries no type — `{ name, row }` or null. */
function typelessRowOf(item) {
  if ( item?.type !== "feat" ) return null;
  const listed = listedNames(damageRuleEntries());
  for ( const [name, row] of Object.entries(DAMAGE_RULES) ) {
    if ( !row.typed || !row.choices?.length || !listed.has(lower(name)) ) continue;
    const answered = answers(name, item, ["feat"]) || (lower(item.name).trim() === lower(name));
    if ( answered && !typesInNames([item.name], name, damageTypeKeys()).length ) return { name, row };
  }
  return null;
}

listen("createItem", "damage-rules", (item, _options, userId) => {
  try {
    if ( userId !== game.user.id ) return;
    const actor = item.parent;
    const found = (actor instanceof Actor) ? typelessRowOf(item) : null;
    if ( !found ) return;
    void postTypePick(actor, item, found.name, found.row)
      .catch(err => log.error(`${found.name}'s type could not be asked — rename it "${found.name} (Fire)".`, err));
  } catch(err) { log.error(`A typed feat's pick failed.`, err); }
});

/** The types this copy may still take — or null (and a warning) when the other copies hold them all. */
function typesLeftFor(actor, item, name, row) {
  const others = typedCopies(actor, name).filter(i => i.id !== item.id).map(i => i.name);
  const left = typeChoicesLeft(row.choices, typesInNames(others, name, damageTypeKeys()));
  if ( left.length ) return left;
  ui.notifications.warn(`${actor.name} already has every ${name} type — this copy has none left to choose.`);
  return null;
}

async function postTypePick(actor, item, name, row) {
  const left = typesLeftFor(actor, item, name, row);
  if ( !left ) return;
  const message = await postCard({
    actor, card: "", to: ownersAndGmIds(actor),
    flags: { [MODULE_ID]: { [PICK_FLAG]: { ...statContext(actor.uuid), row: name, itemUuid: item.uuid, left, chosen: null } } }
  });
  if ( message ) await askTypePick(message);
}

// The feat's own card asks too: a typeless copy's card (posted from the sheet) carries the pick.
listen("dnd5e.displayCard", "damage-rules", (item, card) => {
  try {
    if ( !(card instanceof ChatMessage) || !card.isAuthor ) return;
    const actor = item?.actor;
    const found = (actor instanceof Actor) && actor.isOwner ? typelessRowOf(item) : null;
    if ( !found ) return;
    const left = typesLeftFor(actor, item, found.name, found.row);
    if ( !left ) return;
    void card.setFlag(MODULE_ID, PICK_FLAG, { ...statContext(actor.uuid), row: found.name, itemUuid: item.uuid, left, chosen: null })
      .then(() => askTypePick(card))
      .catch(err => log.error(`${found.name}'s type could not be asked — rename it "${found.name} (Fire)".`, err));
  } catch(err) { log.error(`A typed feat's card pick failed.`, err); }
});

/** The popup: a button per type still open, and Later. */
async function askTypePick(message) {
  const flag = readFlag(message, PICK_FLAG);
  const row = DAMAGE_RULES[flag?.row];
  if ( !row || flag.chosen ) return;
  // live only: the owner whose sheet the feat is on answers
  const actor = resolveUuid(flag.sourceUuid ?? "");
  if ( !(actor instanceof Actor) || !actor.isOwner ) return;
  await openMomentPopup(message, PICK_FLAG, actor, {
    title: `${flag.row} — ${actor.name}`, icon: "fa-solid fa-fire", width: 460, gate: false,
    content: bfCard({
      // live only: the new feat on the sheet — its own icon, and the copy the answer renames
      img: resolveUuid(flag.itemUuid ?? "")?.img ?? null,
      eyebrow: `${flag.row} — a new feat`, tone: "pending",
      title: "Choose your damage type",
      subtitle: pickWordsOf(row),
      lines: [ruleLine(row.rule)]
    }),
    buttons: [
      ...flag.left.map(t => ({ action: t, label: titleCase(t), callback: () => { void chooseType(message, t); } })),
      { action: "later", label: "Later" }
    ]
  });
}

async function chooseType(message, type) {
  try {
    const flag = readFlag(message, PICK_FLAG);
    if ( !flag || flag.chosen || !flag.left.includes(type) ) return;
    // live only: the copy on the sheet is what the answer renames — a gone copy has nothing to name
    const item = await resolveUuidAsync(flag.itemUuid ?? "");
    if ( !(item instanceof Item) ) { ui.notifications.warn(`${flag.row} is no longer on the sheet.`); return; }
    await item.update({ name: `${flag.row} (${titleCase(type)})` });
    if ( message.canUserModify?.(game.user, "update") ) await message.setFlag(MODULE_ID, PICK_FLAG, { ...flag, chosen: type });
  } catch(err) {
    log.error(`${type} could not be chosen — rename the feat by hand.`, err);
  }
}

// The card says it (R5): the choice while it waits — its button recalls the popup — and what was chosen.
listen("dnd5e.renderChatMessage", "damage-rules", (message, html) => {
  const f = readFlag(message, PICK_FLAG);
  const row = f ? DAMAGE_RULES[f.row] : null;
  if ( !row ) return;
  const line = document.createElement("div");
  line.innerHTML = bfCard({
    eyebrow: `${f.row} — a new feat`, tone: f.chosen ? "good" : "pending",
    title: f.chosen ? `${titleCase(f.chosen)} chosen — “${f.row} (${titleCase(f.chosen)})”` : "Choose your damage type",
    subtitle: f.chosen ? pickWordsOf(row) : f.left.map(titleCase).join(" · ")
  });
  const content = html.querySelector(SURFACES.messageContent);
  content?.appendChild(line);
  if ( !f.chosen ) {
    // live only: the choice is the feat's owner's — another client sees the line, not the button
    const actor = resolveUuid(f.sourceUuid ?? "");
    if ( actor?.isOwner ) content?.appendChild(momentButton("Choose type…", () => void askTypePick(message)));
  }
});

// A copy renamed by hand with its type settles the card too.
listen("updateItem", "damage-rules", (item, changes) => {
  try {
    if ( !("name" in changes) || !(item.parent instanceof Actor) ) return;
    for ( const message of game.messages.contents.slice(-50) ) {
      const f = readFlag(message, PICK_FLAG);
      if ( !f || f.chosen || (f.itemUuid !== item.uuid) ) continue;
      const [type] = typesInNames([item.name], f.row, damageTypeKeys());
      if ( !type ) continue;
      // The card's keeper settles it, once: every client sees the rename.
      if ( keepsMessage(message) ) void message.setFlag(MODULE_ID, PICK_FLAG, { ...f, chosen: type }).catch(() => {});
      void closePopup(message, PICK_FLAG);
    }
  } catch(err) { log.warn(`The type pick could not follow the rename.`, err); }
});

// A made choice closes the popup everywhere (law 4).
listen("updateChatMessage", "damage-rules", message => {
  if ( !readFlag(message, PICK_FLAG)?.chosen ) return;
  void closePopup(message, PICK_FLAG);
});
