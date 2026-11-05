/**
 * By the Books — hit riders: a mark on the target (Hunter's Mark, Hex) pays its die into the attack's own
 * damage roll, on the attacker's client, instead of a separate damage press after every hit.
 */
import { TITLE, selfAndGmIds, resolveUuid, log } from "./core.js";
import { lower } from "./lookup.js";
import { MARK_USES, riderEntries, riderUpgradeEntries } from "./decide/registry.js";
import { riderKey } from "./decide/eligible.js";
import { effectSourceOf, hitTargets, namedPart } from "./shared.js";
import { bfCard } from "./decide/present.js";
import { CARD, isCard, originIdInData } from "./decide/card.js";
import { listen } from "./dispatch.js";
import { SURFACES } from "./surfaces.js";
import { postCard } from "./ui.js";

// The mark's owner is found by origin alone: mark → its source ITEM → that item's ACTOR (two rangers can
// mark one creature). ⚠ Crit doubling is free: `preRollDamage` fires before `options.isCritical` is
// stamped on every roll; never read the source activity's `damage.critical.allow`. Delete this the day
// Conditional ActiveEffects ships (DESIGN.md §3).

/** The attacker's own item that REPLACES a mark's damage (Foe Slayer's d10), or null. */
function riderUpgrade(identifier, attacker) {
  for ( const { feature, rider } of riderUpgradeEntries() ) {
    if ( rider !== identifier ) continue;
    const owned = attacker.items.find(i => i.system?.identifier === feature);
    if ( owned ) return owned;
  }
  return null;
}

/** A mark's own damage activity: a damage with no activation (it rides the hit, it is never used). */
const isRiderDamage = a => (a?.type === "damage") && !!a.activation?.override && !a.activation?.type;

/** A mark source's damage parts, read off its no-activation damage activity — never transcribed. */
function riderParts(item) {
  const activities = item.system?.activities ?? [];
  const bonus = [...activities].find(isRiderDamage);
  return (bonus?.damage?.parts ?? []).map(p => ({
    formula: p.custom?.enabled ? p.custom.formula : `${p.number ?? 1}d${p.denomination}`,
    type: Array.from(p.types ?? [])[0] ?? null
  })).filter(p => /\d/.test(p.formula));
}

/** The riders this attacker earned against one target, keyed for intersection across targets.
 * ⚠ The owner test is by UUID: an unlinked token's synthetic actor keeps the base actor's `id`. */
function ridersAgainst(attacker, targetActor) {
  const listed = riderEntries();
  const found = new Map();
  for ( const marker of targetActor.effects ) {
    const src = effectSourceOf(marker);
    if ( src?.actor?.uuid !== attacker.uuid ) continue;
    const identifier = src.item.system?.identifier;
    if ( !identifier || !listed.some(e => e.name === identifier) ) continue;
    const source = riderUpgrade(identifier, attacker) ?? src.item;
    for ( const part of riderParts(source) ) found.set(riderKey(identifier, part), { ...part, name: source.name });
  }
  return found;
}

/**
 * Who this damage roll lands on: the origin attack's hit snapshot, else the roller's live targets
 * (⚠ a native Damage click is read at buildPost, AFTER this hook, so there is no chain to walk).
 */
function riderTargets(message) {
  const originId = originIdInData(message?.data);
  const origin = originId ? game.messages.get(originId) : null;
  const attack = isCard(origin, CARD.attack)
    ? origin
    : (origin?.getAssociatedRolls("attack").pop() ?? null);
  if ( attack ) {
    const hits = hitTargets(attack)
      .map(t => resolveUuid(t.uuid))
      .filter(Boolean);
    if ( hits.length ) return hits;
  }
  return Array.from(game.user.targets).map(t => t.actor).filter(Boolean);
}

listen("dnd5e.preRollDamage", "hit-riders", (config, _dialog, message) => {
  const activity = config.subject;
  const attacker = activity?.actor;
  if ( !attacker ) return;
  // Attacks only — this also stops the rider's own standalone damage press adding a die to itself.
  if ( activity.type !== "attack" ) return;

  const targets = riderTargets(message);
  if ( !targets.length ) return;

  // One roll serves every target it hit, so a rider folds in only when true of ALL of them; a dropped
  // rider is announced to the roller and the GM.
  const per = targets.map(t => ridersAgainst(attacker, t));
  const common = [...per[0]].filter(([key]) => per.every(m => m.has(key)));
  const dropped = new Set(per.flatMap(m => [...m.keys()]).filter(k => !per.every(m => m.has(k))));
  if ( dropped.size ) {
    const names = [...new Set([...dropped].map(k => k.split(":")[0]))].join(", ");
    void postCard({
      card: bfCard({
        eyebrow: "Rider — not folded in", title: "One roll, mixed targets", tone: "neutral",
        lines: [`This damage roll serves targets that are not all marked, so `
          + `<strong>${names}</strong> was left out rather than over-applied. `
          + `Roll the bonus damage by hand for the marked target.`]
      }),
      to: selfAndGmIds(),
      alias: TITLE
    });
    log.warn(`Rider(s) ${[...dropped].join(", ")} not folded in: one damage roll `
      + "covers targets that are not all marked. Roll the bonus damage by hand for the marked one.");
  }

  for ( const [, part] of common ) {
    config.rolls.push({
      // No `properties`: the rider must not inherit the weapon's magical/silvered bypass. ⚠ The data is
      // CLONED: dnd5e writes `damageType` into each roll's data, and a shared object leaks it onto roll 0.
      data: foundry.utils.deepClone(config.rolls[0]?.data ?? {}),
      parts: [namedPart(part.formula, part.name)],
      options: { type: part.type, types: part.type ? [part.type] : [] }
    });
  }
});


/* --- a mark spell's uses (MARK_USES): the picker offers the cast and the move, the move asks nothing ------ */

/** The MARK_USES row of an item, by identifier, or null. */
const markUsesOf = item => MARK_USES[item?.system?.identifier ?? ""] ?? null;

// The system's picker lists the rider's damage activity beside the cast and the move: it rides the hit, so it
// is not offered; the two that are read "Cast Hex" and "Move Hex".
listen("renderActivityChoiceDialog", "hit-riders", (app, element) => {
  try {
    const item = app?.item;
    const uses = markUsesOf(item);
    if ( !uses || !element?.querySelectorAll ) return;
    for ( const button of element.querySelectorAll(SURFACES.activityChoice) ) {
      const activity = item.system.activities.get(button.dataset.activityId);
      if ( !activity ) continue;
      if ( isRiderDamage(activity) ) { (button.closest("li") ?? button).remove(); continue; }
      const label = (lower(activity.name) === lower(uses.cast)) ? uses.castLabel : (lower(activity.name) === lower(uses.move)) ? uses.moveLabel : null;
      const name = label ? button.querySelector(SURFACES.activityChoiceName) : null;
      if ( name ) name.textContent = label;
    }
  } catch(err) { log.warn(`Could not label the mark's uses — pick from the system's list.`, err); }
});

// The move spends no slot and begins no Concentration: the system's dialog (a slot select, nothing to answer) is skipped.
listen("dnd5e.preUseActivity", "hit-riders", (activity, usageConfig, dialogConfig) => {
  const uses = markUsesOf(activity?.item);
  if ( !uses || (lower(activity.name) !== lower(uses.move)) ) return;
  usageConfig.consume ??= {};
  usageConfig.consume.spellSlot = false;
  if ( dialogConfig ) dialogConfig.configure = false;
});
