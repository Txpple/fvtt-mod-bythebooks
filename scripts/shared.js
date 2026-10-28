/**
 * By the Books — Shared EDGE helpers: the hit test, the attack-chain lookup, status forcing, turn
 * chits, the Reaction chip and pool spends (ARCHITECTURE.md §7).
 */
import { MODULE_ID, readFlag, TITLE, activeCombatFor, canApplyTo, combatStamp, stampedSourceOf, resolveUuid, log } from "./core.js";
import { CHIP_FLAG, chipClock, chitStamp, reactionStands, reactionStandsEveryTurn } from "./decide/chips.js";
import { REACTION_RESETS, identifierOf } from "./decide/registry.js";
import { foldsFrom, hitsAmong } from "./decide/verdict.js";
import { storedChipName, withoutFace } from "./decide/stored-dice.js";
import { CARD, describeTarget, isCard, targetsOf } from "./decide/card.js";
import { METAMAGIC_FLAG } from "./decide/metamagic.js";
import { tokenDocOf } from "./geometry.js";


/** The attack's snapshot targets the roll hit; a null AC (total cover) MISSES, as dnd5e 6 judges it. */
export function hitTargets(attackMessage) {
  const roll = attackMessage.rolls[0];
  if ( !(roll instanceof dnd5e.dice.D20Roll) ) return [];
  return hitsAmong({
    targets: targetsOf(attackMessage),
    folds: foldsFrom(key => readFlag(attackMessage, key)),
    roll: { isCritical: roll.isCritical, isFumble: roll.isFumble, total: roll.total }
  });
}

/** EDGE: the system's own label for a weapon mastery key. */
export const masteryLabel = key => CONFIG.DND5E.weaponMasteries[key]?.label ?? key;

/** The attack roll a damage message descends from; null outside an attack chain.
 * ⚠ The `attackFor` stamp leads: a volley's rays share one usage card, so walking back is the fallback. */
export function resolveAttackMessage(damageMessage) {
  const forId = attackIdOf(damageMessage);
  if ( forId ) {
    const stamped = game.messages.get(forId);
    if ( stamped ) return stamped;
  }
  const origin = damageMessage.getOriginatingMessage(); // falls back to the message itself
  if ( origin === damageMessage ) return null;
  if ( isCard(origin, CARD.attack) ) return origin;
  return origin.getAssociatedRolls("attack")
    .filter(m => m.timestamp <= damageMessage.timestamp)
    .pop() ?? null;
}

/** The acting actor's uuid; the message's own speaker leads (a reaction's hop names the attacker). */
export function statSourceOf(message) {
  const actor = message?.getAssociatedActor?.();
  if ( actor ) return actor.uuid;
  const origin = message?.getOriginatingMessage?.();
  if ( origin && (origin !== message) ) return origin.getAssociatedActor?.()?.uuid ?? null;
  return null;
}

/** The actor behind an effect's `origin` item (the bard behind an Inspired die), or null. */
export function grantingActor(effect) {
  try {
    const origin = effect?.origin ? resolveUuid(effect.origin) : null;
    return (origin?.actor instanceof Actor) ? origin.actor : null;
  } catch { return null; }
}

/** An effect's SOURCE: the module's own stamp, else the actor behind its origin item, or null. */
export function effectSourceUuid(effect) {
  return stampedSourceOf(effect) ?? grantingActor(effect)?.uuid ?? null;
}

/* --- THE RECORDS ANOTHER UNIT READS (ARCHITECTURE §4 *Who reads a record*) ------------------- */
// Each key's readers, here where the services, the spine and every machine can import them: the writer
// sits above one of its readers, or beside it. `npm run flagedges` holds every other read to them.

/** The attack's hold record (hold/), or null. */
export function holdOf(attackMessage) {
  return readFlag(attackMessage, "hold") ?? null;
}

/** The hold's per-target entries; [] when the attack carries none. */
export function holdTargets(attackMessage) {
  return holdOf(attackMessage)?.targets ?? [];
}

/** Does a hold claim this damage roll (`attackHoldPending`, stamped at the roll while a reaction is pending)? */
export function attackHoldClaims(damageMessage) {
  return readFlag(damageMessage, "attackHoldPending") === true;
}

/** Has the hold that claimed this damage roll let it go? */
export function attackHoldReleased(damageMessage) {
  return readFlag(damageMessage, "attackHoldPending") === false;
}

/** The id of the attack a damage roll was rolled for (`attackFor`, auto-damage.js), or null. */
export function attackIdOf(damageMessage) {
  return readFlag(damageMessage, "attackFor") ?? null;
}

/** A save demand card's record (saves/), or null. */
export function savesOf(card) {
  return readFlag(card, "saves") ?? null;
}

/** Who forced the save: the demand's caster, or null. */
export function saveSourceOf(card) {
  return savesOf(card)?.sourceUuid ?? null;
}

/** What the save is against (`{ spell, statuses, … }`, read at the stamp), or null. */
export function saveDemandOf(card) {
  return savesOf(card)?.demand ?? null;
}

/** One saver's entry on a demand card, or null. */
export function saveEntryFor(card, uuid) {
  return savesOf(card)?.targets?.find(t => t.uuid === uuid) ?? null;
}

/** The kind a chip's fingerprint names (a mastery mark, a turn chit, `use`), or null for an effect that is no chip. */
export function chipKindOf(effect) {
  return readFlag(effect, CHIP_FLAG) ?? null;
}

/** The weapon mastery's moment on an attack card (mastery.js), or null. */
export function masteryMomentOf(attackMessage) {
  return readFlag(attackMessage, "mastery") ?? null;
}

/** A cast's Metamagic record (metamagic.js: the option, the caster, the spell), or null. */
export function metamagicOf(card) {
  return readFlag(card, METAMAGIC_FLAG) ?? null;
}

/** The folds a roll's d20 took (d20-folds.js), each `{ kind, label, … }`; [] when none. */
export function d20FoldSpends(rollMessage) {
  return readFlag(rollMessage, "d20fold")?.spends ?? [];
}

/** A Death Saving Throw's fold (d20-folds.js) as death-saves.js reads it: its target, the composed total and the spends;
 * null when no fold was offered on the roll. */
export function deathSaveFoldOf(rollMessage) {
  const flag = readFlag(rollMessage, "d20fold");
  if ( !flag?.death ) return null;
  return { dc: Number.isFinite(Number(flag.dc)) ? Number(flag.dc) : null, foldedTotal: flag.foldedTotal ?? null, spends: flag.spends ?? [] };
}

/** A Fighting Style face's fingerprint on its effect (damage-rules.js), or null. */
export function styleFaceOf(effect) {
  return readFlag(effect, "fightingStyle") ?? null;
}

/** Is this the pack's own effect a Fighting Style face switched off (damage-rules.js)? */
export function styleTookOver(effect) {
  return readFlag(effect, "fightingStyleTakenOver") === true;
}

/** The chips an attack roll used up (chip-spend.js's `chipSpend` record), each `{ id, name, key, uuid, … }`; [] when none. */
export function chipSpendsOn(attackMessage) {
  return readFlag(attackMessage, "chipSpend")?.spent ?? [];
}

/** Is this chip SPENT on record? With no GM its delete cannot happen, so a later `chipSpend` receipt counts. */
export function chipSpentOnRecord(effect, { limit = 100 } = {}) {
  const bearerUuid = effect?.parent?.uuid;
  if ( !effect?.id || !bearerUuid ) return false;
  const since = effect._stats?.modifiedTime ?? 0;
  const messages = game.messages.contents;
  for ( let i = messages.length - 1, n = 0; (i >= 0) && (n < limit); i--, n++ ) {
    const m = messages[i];
    if ( m.timestamp < since ) continue;
    if ( chipSpendsOn(m).some(s => (s.id === effect.id) && (s.uuid === bearerUuid)) ) return true;
  }
  return false;
}

/** A clock from a platform pseudo-expiry (`sourceEnd` …); dnd5e judges the edge live, value null. */
const clockOfExpiry = expiry => ({ "duration.expiry": expiry, "duration.value": null, "duration.units": "rounds" });

/**
 * Put a status on an actor and make sure it LANDED. ⚠ `toggleStatusEffect(id, { active: true })`
 * no-ops when any carrier exists (disabled too): re-enable a canonical carrier, else build it, else toggle.
 */
export async function forceStatus(actor, statusId, { origin = null, expiry = null, duration = null } = {}) {
  if ( !(actor instanceof Actor) ) return false;
  // ⚠ Only the CANONICAL condition (by localized name) is re-enabled; a pack effect would revive its own changes.
  // ⚠ `CONFIG.statusEffects` is an OBJECT keyed by id in dnd5e 6.
  const canonicalName = game.i18n.localize(CONFIG.statusEffects[statusId]?.name ?? "");
  const active = actor.effects.find(e => e.statuses.has(statusId) && !e.disabled);
  const dormant = actor.effects.find(e => e.statuses.has(statusId) && e.disabled && (e.name === canonicalName));
  if ( active ) {
    // An already-active effect keeps its own origin.
  } else if ( dormant ) {
    await dormant.update({ disabled: false, ...(origin ? { origin } : {}), ...(expiry ? clockOfExpiry(expiry) : {}), ...(duration ? { duration } : {}) });
  } else {
    try {
      const effect = await ActiveEffect.implementation.fromStatusEffect(statusId);
      if ( origin ) effect.updateSource({ origin });
      if ( expiry ) effect.updateSource(clockOfExpiry(expiry));
      if ( duration ) effect.updateSource({ duration });   // a press that lasts (SAVE_PRESSES `lasts`, B2)
      await ActiveEffect.implementation.create(effect, { parent: actor, keepId: true });
    } catch(err) {
      log.error(`Could not build status "${statusId}" directly.`, err);
    }
    if ( !actor.statuses.has(statusId) ) await actor.toggleStatusEffect(statusId, { active: true });
  }
  const landed = actor.statuses.has(statusId);
  if ( !landed ) log.error(`Status "${statusId}" refused to land on ${actor.name} — check for a module vetoing effect creation.`);
  return landed;
}


/** Take a status OFF and make sure it is gone; never throws. ⚠ `toggleStatusEffect(id, { active: false })`
 * throws when a concurrent remover wins and deletes only the canonical carrier. NOTES.md §1. */
export async function clearStatus(actor, statusId) {
  if ( !(actor instanceof Actor) ) return false;
  for ( const effect of actor.effects.filter(e => e.statuses?.has?.(statusId)) ) {
    // ⚠ Re-read before deleting: the list is a snapshot and this loop awaits.
    if ( !actor.effects.get(effect.id) ) continue;
    try {
      await effect.delete();
    } catch(err) {
      // A concurrent delete is the expected loss here; anything else is worth a line.
      if ( !actor.effects.get(effect.id) ) continue;
      log.warn(`Could not clear status "${statusId}" from ${actor.name}.`, err);
    }
  }
  return !actor.statuses.has(statusId);
}



/** A damage message's rolls as the appliers' descriptors, properties respected so bypasses survive. */
export function damagePartsOf(rolls) {
  return dnd5e.dice.aggregateDamageRolls(rolls, { respectProperties: true })
    .map(roll => ({
      value: Math.max(0, roll.total),
      type: roll.options.type,
      properties: new Set(roll.options.properties ?? [])
    }));
}

/**
 * Rolls rebuilt from PATCHED data, totals re-evaluated. ⚠ `_evaluateTotal` is PRIVATE Foundry API; one home.
 * @param {object[]} rollsData  `Roll#toJSON` shapes
 * @returns {Roll[]}
 */
export function rebuildRolls(rollsData) {
  return (rollsData ?? []).map(rd => { const r = Roll.fromData(rd); r._total = r._evaluateTotal(); return r; });
}

/** A human's answer as a `rollSavingThrow`/`rollConcentration` config; an unrollable bonus warns, never throws. */
export function rollConfigFor(mode, bonus) {
  const override = {};
  if ( mode === "advantage" ) override.options = { advantage: true, disadvantage: false };
  else if ( mode === "disadvantage" ) override.options = { advantage: false, disadvantage: true };
  else if ( mode === "normal" ) override.options = { advantage: false, disadvantage: false };
  const part = (bonus ?? "").trim().replace(/^\+\s*/, "");
  if ( part ) {
    if ( Roll.validate(part) ) override.parts = [part];
    else ui.notifications.warn(`${TITLE}: "${part}" is not a rollable bonus — rolling without it.`);
  }
  return Object.keys(override).length ? { rolls: [override] } : {};
}

/* --- Turn chits: once-per-turn marks, dead with the turn they were written in -------------- */

/** The attacker's place in the RUNNING combat, for decide/chips.js — or null out of combat. */
export function placeOf(attacker) {
  const combat = activeCombatFor(attacker);
  if ( !combat ) return null;
  const combatant = combat.getCombatantsByActor(attacker)[0] ?? null;
  return { combat: combat.id, combatant: combatant?.id ?? null, initiative: combatant?.initiative ?? null,
    round: combat.round, turn: combat.turn, time: game.time.worldTime };
}

/** The turn IN PROGRESS, for the once-per-turn chit (an opportunity attack's dies with the victim's turn). */
export function turnPlace() {
  const combat = game.combat;
  if ( !combat?.started ) return null;
  const combatant = combat.combatant ?? null;
  return { combat: combat.id, combatant: combatant?.id ?? null, initiative: combatant?.initiative ?? null,
    round: combat.round, turn: combat.turn, time: game.time.worldTime };
}

/** A clock as document data; out of combat `_preCreate` fills the start.
 * ⚠ `combat: null` would not help a summon outside the tracker: Foundry falls back to the bearer's combatant. */
export function chipData(clock) {
  return { duration: { ...clock.duration, expired: false },
    start: clock.start ?? { time: game.time.worldTime } };
}

/** The turn a chit was written in, as the house stamp. `start.combat` is a Combat or null. */
export function chitStampOf(effect) {
  const combat = effect.start?.combat;
  return chitStamp({ combat: (typeof combat === "string") ? combat : (combat?.id ?? null),
    round: effect.start?.round, turn: effect.start?.turn });
}

/**
 * Does a once-per-turn chit stand for the RUNNING turn? By stamp, never the GM-written expired mark.
 * @param {Actor} actor
 * @param {string} key   a CHIP_WINDOWS turn-chit key ("cleave" | "sneak" | "rider")
 * @param {string|null} [riderKey]   for "rider" chits, WHICH rider (the flag's `riderKey`)
 */
export function turnChitStands(actor, key, riderKey = null) {
  const stamp = activeCombatFor(actor) ? combatStamp() : null;
  if ( !stamp || !actor ) return false;
  return actor.effects.some(e => (readFlag(e, CHIP_FLAG) === key)
    && (!riderKey || (readFlag(e, "riderKey") === riderKey)) && (chitStampOf(e) === stamp));
}

/**
 * Write a once-per-turn chit, replacing stale ones; none out of combat or without an owner (the cheaper failure).
 * @param {Actor} actor
 * @param {string} key
 * @param {{name: string, img?: string|null, description?: string, origin?: string|null, riderKey?: string|null}} chit
 */
export async function writeTurnChit(actor, key, { name, img = null, description = "", origin = null, riderKey = null }) {
  if ( !actor || !canApplyTo(actor) ) return null;
  if ( !activeCombatFor(actor) ) return null;   // the attacker's own combat, or no turn to be once-per
  const stale = actor.effects.filter(e => (readFlag(e, CHIP_FLAG) === key)
    && (!riderKey || (readFlag(e, "riderKey") === riderKey)));
  // Best-effort: the platform may already have deleted an expired chit.
  if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id).filter(id => actor.effects.get(id))).catch(() => {});
  const clock = chipClock(key, turnPlace());
  if ( !clock ) return null;
  return ActiveEffect.implementation.create({
    name, img: img ?? "icons/svg/clockwork.svg", description, origin, disabled: false, transfer: false,
    ...chipData(clock),
    flags: { [MODULE_ID]: { [CHIP_FLAG]: key, ...(riderKey ? { riderKey } : {}) } }
  }, { parent: actor });
}

/* --- The Reaction chip: spent Reaction, back at the start of the creature's own turn ---------- */

/** Is this creature's Reaction spent? Stamp arithmetic too, so it dies without a GM's mark. */
export function reactionSpent(actor) {
  if ( !actor ) return false;
  const chips = actor.effects?.filter(e => readFlag(e, CHIP_FLAG) === "reaction") ?? [];
  if ( !chips.length ) return false;
  const combat = activeCombatFor(actor);
  const now = combat ? { round: combat.round, turn: combat.turn } : null;
  const actorTurn = combat ? (combat.turns ?? []).findIndex(t => combat.getCombatantsByActor(actor).includes(t)) : null;
  // Reactive (REACTION_RESETS): the Reaction comes back on every turn, not only the bearer's own.
  const everyTurn = Object.keys(REACTION_RESETS).some(key => (actor.items ?? []).some(i => (i.type === "feat")
    && ((i.system?.identifier === identifierOf(key)) || (String(i.name ?? "").toLowerCase() === key.toLowerCase()))));
  return chips.some(e => !e.duration?.expired && (everyTurn
    ? reactionStandsEveryTurn({ start: e.start?.combat ? { round: e.start.round, turn: e.start.turn } : null, now })
    : reactionStands({ start: e.start?.combat ? { round: e.start.round, turn: e.start.turn } : null, now, actorTurn })));
}

/**
 * Spend the Reaction: a chip clocked to the reactor's next turn; only in their running combat.
 * @param {Actor} actor
 * @param {{origin?: string|null, what?: string}} [by]   what spent it, for the chip's description
 */
export async function spendReaction(actor, { origin = null, what = "a Reaction" } = {}) {
  if ( !(actor instanceof Actor) || !canApplyTo(actor) ) return null;
  const clock = chipClock("reaction", placeOf(actor));
  if ( !clock?.start ) return null;                       // not in the running combat — no turn to bring it back
  if ( reactionSpent(actor) ) return null;
  const stale = actor.effects.filter(e => readFlag(e, CHIP_FLAG) === "reaction");
  if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id));
  return ActiveEffect.implementation.create({
    name: "Reaction — used", img: "icons/svg/clockwork.svg",
    description: `${actor.name} took ${what}. The Reaction comes back at the start of ${actor.name}'s next turn; until then no hold is offered.`,
    origin, disabled: false, transfer: false,
    ...chipData(clock),
    flags: { [MODULE_ID]: { [CHIP_FLAG]: "reaction" } }
  }, { parent: actor });
}

/* --- THE STORED DICE (STORED_DICE — Portent): the chip on the bearer that keeps the faces ------------- */

/** The chip's flag key: `{ key, faces, turn }`. */
export const STORED_FLAG = "storedDice";

/** The BEARER's combat turn (`combat:round:turn`), or null when it is in no started combat — never another scene's combat. */
const storedTurnNow = actor => { const c = activeCombatFor(actor); return c ? `${c.id}:${c.round}:${c.turn}` : null; };

/** The bearer's chip for a STORED_DICE row, or null. */
export const storedChipOf = (actor, key) => actor?.effects?.find?.(e => readFlag(e, STORED_FLAG)?.key === key) ?? null;

/** The faces a stored-dice chip still keeps; [] when none (or no chip). */
export function storedFacesOf(chip) {
  return readFlag(chip, STORED_FLAG)?.faces ?? [];
}

/** May a face be spent now? One left, and (`oncePerTurn`) none spent this combat turn. */
export function storedFacesUsable(chip, row) {
  const f = readFlag(chip, STORED_FLAG);
  if ( !f?.faces?.length ) return false;
  const now = storedTurnNow(chip?.parent);
  return !(row?.oncePerTurn && now && (f.turn === now));
}

/** Spend one face: struck off the chip (renamed to what is left, deleted when empty), the turn stamped. */
export async function spendStoredFace(actor, key, face) {
  const chip = storedChipOf(actor, key);
  const f = readFlag(chip, STORED_FLAG);
  if ( !chip || !f ) return false;
  const faces = withoutFace(f.faces, face);
  if ( faces.length === f.faces.length ) return false;
  if ( !faces.length ) { await chip.delete(); return true; }
  await chip.update({ name: storedChipName(key, faces), [`flags.${MODULE_ID}.${STORED_FLAG}`]: { key, faces, turn: storedTurnNow(actor) } });
  return true;
}

/* --- THE MUTES: a bystander's feature muted until the bearer's next turn, or the combat's end (RULINGS *The asks widened*) --- */

/**
 * THE MUTE'S SCOPES: in a combat, "turn" (until the bearer's next turn begins) and "combat" (until it ends); out of one,
 * "combat" alone (until a combat starts). Each is a popup button and a card button; the chip is `bystanderMute`
 * `{ key, combat, until }` — `combat` null for a mute written out of combat, inert once one starts.
 * @returns {{until: "turn"|"combat", label: string, hint: string}[]}
 */
export function muteScopesFor(actor) {
  if ( activeCombatFor(actor) ) return [
    { until: "turn", label: "Don't ask again till next turn", hint: "Don't ask me about this again until my next turn." },
    { until: "combat", label: "Don't ask again this combat", hint: "Don't ask me about this again until this combat ends." }
  ];
  return [{ until: "combat", label: "Don't ask again till the next combat", hint: "Don't ask me about this again until a combat starts." }];
}

/** A mute chip's record (`{ key, combat, until }`), or null for an effect that is no mute. */
export function bystanderMuteOf(effect) {
  return readFlag(effect, "bystanderMute") ?? null;
}

/** Is the bearer's mute on this feature live now — a combat's chip in that combat, an out-of-combat chip out of one? */
export function bystanderMuted(actor, key) {
  if ( !actor ) return false;
  const combat = activeCombatFor(actor);
  const want = String(key ?? "").toLowerCase();
  return actor.effects?.some(e => { const m = readFlag(e, "bystanderMute");
    return m && (String(m.key ?? "").toLowerCase() === want) && (combat ? (m.combat === combat.id) : (m.combat == null)); }) ?? false;
}

/**
 * Write the mute: an effect on the bearer (the effect view lists it; the turn's start or the combat's end sweeps it,
 * chip-spend.js; deleting it unmutes). One chip per feature — an older one of any scope is replaced.
 * @param {Actor} actor
 * @param {string} key   the INTERRUPT_ROLLS row
 * @param {{img?: string|null, until?: "turn"|"combat"}} [opts]
 */
export async function muteBystander(actor, key, { img = null, until = "combat" } = {}) {
  if ( !(actor instanceof Actor) || !canApplyTo(actor) ) return null;
  const combat = activeCombatFor(actor);
  const scope = (combat && (until === "turn")) ? "turn" : "combat";
  const want = String(key ?? "").toLowerCase();
  const stale = actor.effects.filter(e => String(readFlag(e, "bystanderMute")?.key ?? "").toLowerCase() === want).map(e => e.id);
  if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  const word = combat ? ((scope === "turn") ? "until your next turn" : "this combat") : "until the next combat";
  const span = combat ? ((scope === "turn") ? "until its next turn begins" : "until this combat ends") : "until a combat starts";
  return ActiveEffect.implementation.create({
    name: `${key} — muted ${word}`, img: img ?? "icons/svg/sound-off.svg",
    description: `${actor.name} is not asked about ${key} again ${span}. Delete this effect to be asked again.`,
    disabled: false, transfer: false,
    flags: { [MODULE_ID]: { bystanderMute: { key, combat: combat?.id ?? null, until: scope } } }
  }, { parent: actor });
}

/**
 * Who put an effect on and from what Item. ⚠ An applied copy carries its template's stale compendium
 * `item` beside a fresh `activity`: candidates are tried, `activity` first, until one reaches a world Actor.
 */
export function effectSourceOf(marker) {
  const so = marker.system?.origin ?? {};
  const candidates = [so.activity, so.item, so.actor, marker.origin,
    marker.getFlag("dnd5e", "dependentOn"), so.effect];
  for ( const uuid of new Set(candidates.filter(u => (typeof u === "string") && u)) ) {
    const found = sourceFromUuid(uuid);
    if ( found ) return found;
  }
  return null;
}

function sourceFromUuid(uuid) {
  let doc = resolveUuid(uuid);
  const root = doc;
  let item = null;
  while ( doc && !(doc instanceof Actor) ) {
    if ( doc instanceof Item ) item = doc;
    doc = doc.parent;
  }
  // A pack's actor is nobody at the table — a compendium uuid is lineage, never a source.
  if ( !(doc instanceof Actor) || doc.pack ) return null;

  // An effect ON the caster names its item in a flag. ⚠ Uuid resolution, not a concentration test.
  if ( !item ) {
    const carried = root?.getFlag?.("dnd5e", "item");
    item = resolveUuid(carried?.uuid);
    // ⚠ `.data` exists only when the item is not on the actor (statblock casting).
    if ( !item && carried?.data ) item = new Item.implementation(carried.data, { parent: doc });
  }
  return item ? { actor: doc, item } : null;
}

/**
 * A pool named by a COMPENDIUM uuid on a sheet whose copy carries no source (an imported or hand-built
 * Bardic Inspiration): the pack index's NAME for that uuid, matched to the sheet's one feature of that name
 * with uses. Null when the index cannot say or two features share the name.
 */
function poolByPackName(actor, target) {
  if ( !target.startsWith("Compendium.") ) return null;
  const entry = resolveUuid(target);
  const name = String(entry?.name ?? "").toLowerCase();
  if ( !name ) return null;
  const hits = actor.items.filter(i => (i.type === "feat") && (String(i.name ?? "").toLowerCase() === name)
    && (Number(i.system?.uses?.max) > 0));
  return (hits.length === 1) ? hits[0] : null;
}

/** The pool an activity consumes; packs name it by item id, bare identifier or compendium UUID. */
export function poolOf(actor, activity) {
  for ( const c of (activity?.consumption?.targets ?? []) ) {
    // RAVENLOFT — an activity that consumes ITS OWN uses (Steel Yourself's once per Long Rest): the activity is the pool;
    // `poolUsesOf` and `spendPoolUses` read and write it where an item's `system.uses` would be.
    if ( (c.type === "activityUses") && activity.uses && (activity.uses.max !== "") && (activity.uses.max !== null) && (activity.uses.max !== undefined) ) return activity;
    if ( c.type !== "itemUses" ) continue;
    const target = String(c.target ?? "");
    if ( !target ) return activity.item ?? null;
    const item = actor.items.get(target)
      ?? actor.items.find(i => (i.system?.identifier === target) || (i.identifier === target))
      ?? actor.items.find(i => (i._stats?.compendiumSource === target) || (i.flags?.core?.sourceId === target))
      ?? actor.items.find(i => target.endsWith(`.${i._stats?.compendiumSource?.split(".").pop() ?? "\u0000"}`))
      ?? poolByPackName(actor, target);
    if ( item ) return item;
  }
  return null;
}

/**
 * Spend a die by hand, in the record shape `poolSpendsOn` reads beside dnd5e's own deltas.
 * @returns {Promise<{pool: string, spent: number, left: number, max: number, ability: string, actorUuid: string|null, at: number}|null>}
 */
export async function spendSuperiorityDie(actor, pool, ability) {
  return spendPoolUses(actor, pool, ability, 1);
}

/** B3 — the stand-in's once per turn (Relentless): the rider chit, keyed `stand-in:<feature>`; none out of combat. */
export async function noteSuperiorityStandIn(actor, standIn) {
  return writeTurnChit(actor, "rider", { name: `${standIn.feature} — used this turn`, img: standIn.item?.img ?? null,
    description: `${standIn.feature}'s ${standIn.die} stood in for a Superiority Die this turn. Once per turn; this chit ends with the turn.`,
    origin: standIn.item?.uuid ?? null, riderKey: `stand-in:${standIn.feature}` });
}

/** A pool's uses — an item's `system.uses`, or an activity's own `uses` (RAVENLOFT, activityUses pools). */
export const poolUsesOf = pool => pool?.system?.uses ?? ((pool && !pool.system && pool.uses) ? pool.uses : {});

/**
 * Spend N uses of a pool, recorded under `poolName` (default the item's).
 * @param {number} n
 * @param {string|null} poolName
 */
export async function spendPoolUses(actor, pool, ability, n = 1, poolName = null) {
  if ( !pool ) return null;
  const count = Math.max(1, Number(n) || 1);
  const activityPool = !pool.system && !!pool.uses;
  if ( activityPool ) await pool.update({ "uses.spent": Number(pool.uses?.spent ?? 0) + count });
  else await pool.update({ "system.uses.spent": Number(pool.system?.uses?.spent ?? 0) + count });
  const uses = poolUsesOf(pool);
  return { pool: poolName ?? pool.name, spent: count, left: Math.max(0, Number(uses.value ?? 0)), max: Number(uses.max ?? 0),
    ability: String(ability ?? pool.name), actorUuid: actor?.uuid ?? null, at: Date.now() };
}

/**
 * Every pool spend a message records (card deltas, hand, hold and hit-menu picks), player-owned only.
 * @returns {{pool: string, spent: number, left: number, max: number, ability?: string, at?: number}[]}
 */
export function poolSpendsOn(message) {
  const rows = [];
  const isUsage = isCard(message, CARD.usage);
  const actor = message?.getAssociatedActor?.() ?? null;
  if ( isUsage && message.system?.deltas && actor?.hasPlayerOwner ) {
    for ( const [itemId, changes] of Object.entries(message.system.deltas.item ?? {}) ) {
      const item = actor.items.get(itemId);
      if ( !item ) continue;
      for ( const { keyPath, delta } of (changes ?? []) ) {
        if ( !(delta > 0) ) continue;
        if ( keyPath === "system.uses.spent" ) {
          const uses = item.system.uses;
          if ( !(uses?.max > 0) || !(uses.recovery?.length) ) continue;
          rows.push({ pool: item.name, spent: delta, left: uses.value ?? 0, max: uses.max });
        } else {
          const m = /^system\.activities\.([a-zA-Z0-9]+)\.uses\.spent$/.exec(keyPath);
          if ( !m ) continue;
          const act = item.system.activities?.get?.(m[1]);
          const uses = act?.uses;
          if ( !(uses?.max > 0) || !(uses.recovery?.length) ) continue;
          rows.push({ pool: act.name || item.name, spent: delta, left: uses.value ?? 0, max: uses.max });
        }
      }
    }
  }
  const own = actor?.hasPlayerOwner ?? true;
  const hand = [];
  const flagged = readFlag(message, "poolSpend");
  if ( flagged ) hand.push(...(Array.isArray(flagged) ? flagged : [flagged]));
  for ( const t of holdTargets(message) ) if ( t.poolSpend ) hand.push(t.poolSpend);
  const hm = readFlag(message, "hitManeuver");
  for ( const pick of (Array.isArray(hm?.picks) ? hm.picks : (hm ? [hm] : [])) ) if ( pick?.poolSpend ) hand.push(pick.poolSpend);
  for ( const r of hand ) {
    const spender = resolveUuid(r.actorUuid);
    if ( (spender ? spender.hasPlayerOwner : own) && (r.max > 0) ) rows.push(r);
  }
  return rows;
}

/**
 * The platform's target descriptor for one creature, read off the token when there is one.
 * @param {Token|TokenDocument|null} token
 * @param {Actor|null} actor
 */
export function targetDescriptorOf(token, actor) {
  const doc = tokenDocOf(token);
  const subject = doc?.actor ?? actor;
  if ( !subject?.uuid ) return null;
  return describeTarget({ actorUuid: subject.uuid, tokenUuid: doc?.uuid ?? null,
    name: doc?.name ?? subject.name, img: doc?.texture?.src ?? subject.img ?? null,
    ac: subject.system?.attributes?.ac?.value ?? null, totalCover: !!subject.statuses?.has?.("coverTotal") });
}

/** Aim this client's targets at these tokens for the duration of `fn`, then put them back. */
export async function withTargets(tokens, fn) {
  const before = [...game.user.targets];
  try {
    game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: false }); });
    tokens.forEach((t, i) => { t.setTarget(true, { releaseOthers: i === 0 }); });
    return await fn();
  } finally {
    game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: false }); });
    before.forEach((t, i) => { t.setTarget(true, { releaseOthers: i === 0 }); });
  }
}

/** A party member: in the primary party group, or a player-owned character. */
export function isPartyMember(uuid) {
  try {
    const actor = resolveUuid(uuid);
    if ( !(actor instanceof Actor) ) return false;
    const base = actor.isToken ? (game.actors.get(actor.id) ?? actor) : actor;
    const party = game.actors?.party?.system?.members?.map?.(m => m.actor?.id ?? m.actor) ?? [];
    if ( party.includes(base.id) ) return true;
    return (base.type === "character") && !!base.hasPlayerOwner;
  } catch { return false; }
}

/** A Foundry disposition colour as CSS, so the row can never disagree with the token border. */
export function dispositionHex(value, fallback) {
  return (typeof value === "number") ? `#${value.toString(16).padStart(6, "0")}` : fallback;
}

/** Glyph, colour and word for a token's ABSOLUTE disposition, as the border draws it; never colour alone. */
export function dispositionStyle(token) {
  const D = CONST.TOKEN_DISPOSITIONS;
  const colors = CONFIG.Canvas?.dispositionColors ?? {};
  switch ( token?.document?.disposition ) {
    case D.FRIENDLY:
      return { icon: "fa-solid fa-shield-halved", label: "ally",
        color: dispositionHex(colors.FRIENDLY, "#43dfdf") };
    case D.NEUTRAL:
      return { icon: "fa-solid fa-circle-half-stroke", label: "neutral",
        color: dispositionHex(colors.NEUTRAL, "#f1d836") };
    case D.HOSTILE:
      return { icon: "fa-solid fa-skull", label: "enemy",
        color: dispositionHex(colors.HOSTILE, "#e72124") };
    case D.SECRET:
      return { icon: "fa-solid fa-eye-slash", label: "secret",
        color: dispositionHex(colors.SECRET, "#a612d4") };
    default:
      return { icon: "fa-solid fa-circle-question", label: "unknown", color: "inherit" };
  }
}

/* --- a cast that ends Concentration asks first (RULINGS *Summons*) ---------------------------------- */

/** The mark a use carries once its caster has answered the Concentration question (`usageConfig[MODULE_ID]`). */
export const CONCENTRATION_ASKED = "concentrationAsked";

/**
 * The Concentration a use would end: the caster at its limit, and the effect dnd5e itself would end
 * (this activity's own, else the first). Null when the use ends none.
 * @returns {{ id: string, name: string, same: boolean }|null}
 */
export function concentrationEnding(activity) {
  const actor = activity?.actor;
  if ( !activity?.requiresConcentration || !actor ) return null;
  if ( game.settings.get("dnd5e", "disableConcentration") ) return null;
  const effects = actor.concentration?.effects;
  const limit = Number(actor.system?.attributes?.concentration?.limit ?? 0);
  if ( !limit || !effects?.size || (effects.size < limit) ) return null;
  // the same spell's own concentration: dnd5e stamps the effect with the ITEM (`flags.dnd5e.item.id` / `.uuid`, and
  // `origin`), its `data` only for an item off the sheet; matching the activity's id there never matched (3.4.1)
  const item = activity.item;
  const same = effects.find(e => { const f = e.flags?.dnd5e?.item ?? {};
    return (!!item?.id && (f.id === item.id)) || (!!item?.uuid && ((f.uuid === item.uuid) || (e.origin === item.uuid))) || (!!item?.id && (f.data?._id === item.id)); }) ?? null;
  const effect = same ?? effects.first?.() ?? [...effects][0] ?? null;
  if ( !effect ) return null;
  const name = resolveUuid(effect.origin)?.name ?? effect.name;
  return { id: effect.id, name, same: !!same };
}
