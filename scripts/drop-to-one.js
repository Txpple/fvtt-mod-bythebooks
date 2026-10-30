/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): DROP TO 1 HP (DROP_TO_ONE; RULINGS *Where the table
 * bends the rule*). A row that ASKS (Relentless Endurance) holds the HP at 1 while its popup asks
 * — not offered when the damage kills outright; an automatic row (Death Ward) stops at 1 and ends
 * its effect; a `save` row (Undead Fortitude, the GM's side) holds at 1 while the bearer's save rolls on the
 * keeper — the dice decide (R1), a failure lands the 0. A `died` row (Death Throes) is THE DEATH'S SIDE:
 * when the damage leaves the bearer at 0 and nothing held it, its save is used at the corpse against
 * every creature in its Emanation — one demand card, the saves machine from there.
 * THE SEAM is `dnd5e.preApplyDamage` — synchronous, with the update in hand, on every application
 * path — so the 1 is written in the same update and the creature never touches 0; the landed 0 is
 * seen at `dnd5e.applyDamage`, after the write.
 * THE KEEPER of an ask is the client that applied the damage, or the GM once it has gone; any
 * other answer is relayed to it.
 */
import { MODULE_ID, readFlag, keepsMessage, queueFlagWrite, canAnswerFor, statContext, decisionWindow, isActiveGM, resolveUuid, log, claimLanding, claimHolds } from "./core.js";
import { featureNamed, lower, activityNamed, activityOfType, applicableProfiles, wearsEffectNamed } from "./lookup.js";
import { poolOf } from "./shared.js";
import { nearestFeet, tokenOf } from "./geometry.js";
import { riderPartFormula } from "./decide/clock.js";
import { applyDamagesWithReceipt } from "./auto-apply.js";
import { closeLedger, effectsNamed, hitPointsOf, landingSteps } from "./ledger.js";
import { applyActivityEffectsOnHit } from "./effect-riders.js";
import { dropToOneEntries, listedNames } from "./decide/registry.js";
import { DROP_TO_ONE } from "./decide/registry.js";
import { dropSaveDc, dropSaveExempt, dropSaveTitle, diedTitle, downedOutcome } from "./decide/drop-to-one.js";
import { saveDemandData, saveTargetEntry } from "./decide/demand.js";
import { bfCard, esc, holdBarHTML, ruleLine } from "./decide/present.js";
import { openMomentPopup, armAskTimer, disarmAskTimer, keeperOwns, registerRelay, registerResumable, pendingRow, closePopup, postCard, postAnswer } from "./ui.js";
import { resolveAttackMessage } from "./shared.js";
import { creaturesWithin, feetOf } from "./geometry.js";
import { rollDamageForSave } from "./auto-damage.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";

const DROP_FLAG = "dropToOne";
const HP = "system.attributes.hp.value";
const timers = new Map();
const answering = new Set();
/** Actors with an ask standing — a second drop while it stands lands as it would. Client-local. */
const asking = new Set();
/** Actors whose 0 is about to land with a `died` row on the sheet: stamped before the write, read after it. */
const dying = new Map();

/** The first listed row this actor holds that can act now — `{ name, row, item?, effect? }` or null.
 * A `died` row never holds: it is the death's side (`diedRowsFor`). */
function rowFor(actor, { outright }) {
  const on = listedNames(dropToOneEntries());
  for ( const [name, row] of Object.entries(DROP_TO_ONE) ) {
    if ( !on.has(lower(name)) || (row.on === "died") || (row.on === "deathSave") ) continue;
    if ( outright && !row.outright ) continue;
    if ( row.effect ) {
      const effect = actor.effects.find(e => !e.disabled && !e.isSuppressed && (lower(e.name) === lower(row.effect)));
      if ( effect ) return { name, row, effect };
      continue;
    }
    // B4 — a `named` row (Gift of the Protectors): ANOTHER character's feature whose description names this creature.
    if ( row.named ) {
      const keeper = namedKeeperOf(actor, name, row);
      if ( keeper ) return { name, row, ...keeper };
      continue;
    }
    // C1 — an `ally` row (Rage of the Gods): ANOTHER creature's feature within reach, its `while` effect standing on the keeper,
    // its activity's consumption (a Rage use) able to pay.
    if ( row.ally ) {
      const keeper = allyKeeperOf(actor, name, row);
      if ( keeper ) return { name, row, ...keeper };
      continue;
    }
    const item = featureNamed(actor, name);
    if ( !item ) continue;
    // C1 — `while` on the bearer (Relentless Rage: raging).
    if ( row.while && !wearsWhile(actor, row.while) ) continue;
    if ( row.uses && !(Number(item.system?.uses?.value ?? 0) > 0) ) continue;
    return { name, row, item };
  }
  return null;
}

/** C1 — does the actor wear the row's `while`? "raging" is the Rage effect or status; else an effect by name. */
function wearsWhile(actor, name) {
  if ( lower(name) === "raging" ) return actor.effects.some(e => e.active && ((lower(e.name) === "rage") || e.statuses?.has?.("raging")));
  return wearsEffectNamed(actor, name);   // an item's transferred effect too (Ghastly Form)
}

/** C1 — the keeper of an `ally` row: a creature within `ally` feet holding the feature, wearing its `while`, its activity's pool
 * with a use left: `{ item, keeper, activity, pool }` or null. */
function allyKeeperOf(actor, name, row) {
  const own = tokenOf(actor);
  if ( !own ) return null;
  for ( const token of (canvas.tokens?.placeables ?? []) ) {
    const keeper = token.actor;
    if ( !keeper || (keeper.uuid === actor.uuid) ) continue;
    const item = featureNamed(keeper, name);
    if ( !item ) continue;
    if ( row.while && !wearsWhile(keeper, row.while) ) continue;
    const feet = nearestFeet(own, token);
    if ( (feet === null) || (feet > row.ally) ) continue;
    const activity = row.activity ? activityNamed(item, row.activity) : null;
    if ( row.activity && !activity ) continue;
    const pool = activity ? poolOf(keeper, activity) : null;
    if ( pool && !(Number(pool.system?.uses?.value ?? 0) > 0) ) continue;
    return { item, keeper, activity, pool };
  }
  return null;
}

/** The character whose copy of the feature names this creature, its activity's uses standing: `{ item, keeper, activity }`. */
function namedKeeperOf(actor, name, row) {
  const wanted = lower(actor?.name ?? "").trim();
  if ( !wanted ) return null;
  for ( const keeper of game.actors.filter(a => a.type === "character") ) {
    const item = featureNamed(keeper, name);
    if ( !item ) continue;
    const activity = row.activity ? activityNamed(item, row.activity) : null;
    if ( row.activity && !activity ) continue;
    if ( activity && !(Number(activity.uses?.value ?? 0) > 0) ) continue;
    const page = lower(String(item.system?.description?.value ?? "").replace(/<[^>]*>/g, " "));
    if ( !page.includes(wanted) ) continue;
    return { item, keeper, activity };
  }
  return null;
}

/** The listed `died` rows this actor holds — `{ name, row, item }[]`. */
function diedRowsFor(actor) {
  const on = listedNames(dropToOneEntries());
  const out = [];
  for ( const [name, row] of Object.entries(DROP_TO_ONE) ) {
    if ( (row.on !== "died") || !on.has(lower(name)) ) continue;
    const item = featureNamed(actor, name);
    if ( item ) out.push({ name, row, item });
  }
  return out;
}

/** What the damage card says about the damage: its types, and whether it came off a Critical Hit. A card the
 * module cannot read is `readable: false` — the row counts (the gate never guesses an exemption). */
function damageFacts(message) {
  try {
    if ( !(message instanceof ChatMessage) ) return { readable: false, types: [], crit: false };
    const rolls = message.rolls ?? [];
    const types = [...new Set(rolls.map(r => r?.options?.type).filter(Boolean))];
    let crit = rolls.some(r => r?.isCritical === true);
    if ( !crit ) {
      let attack = null;
      try { attack = resolveAttackMessage(message); } catch { attack = null; }
      crit = !!attack?.rolls?.[0]?.isCritical;
    }
    return { readable: types.length > 0, types, crit };
  } catch {
    return { readable: false, types: [], crit: false };
  }
}

listen("dnd5e.preApplyDamage", "drop-to-one", (actor, amount, updates, options) => {
  try {
    if ( !(actor instanceof Actor) || !(Number(amount) > 0) || !(HP in (updates ?? {})) ) return;
    const hp = actor.system?.attributes?.hp;
    const before = Number(hp?.value ?? 0);
    if ( !(before > 0) || (Number(updates[HP]) > 0) ) return;
    if ( asking.has(actor.uuid) ) return;
    // Killed outright: the damage left after 0 meets the Hit Point maximum (the rule's own test).
    const tempTaken = Math.max(0, Number(hp.temp ?? 0) - Number(updates["system.attributes.hp.temp"] ?? hp.temp ?? 0));
    const remainder = Number(amount) - tempTaken - before;
    const outright = remainder >= Number(hp.max ?? Infinity);
    const found = rowFor(actor, { outright });
    const source = options?.originatingMessage?.getAssociatedActor?.() ?? null;
    if ( !found ) { markDying(actor, { amount, source }); return; }
    if ( found.row.save ) {
      const facts = damageFacts(options?.originatingMessage ?? null);
      const { exempt, why } = dropSaveExempt(found.row.save.unless, facts);
      if ( exempt ) {
        void exemptCard(actor, found, why, { amount, source });
        markDying(actor, { amount, source });
        return;
      }
      updates[HP] = 1;                                                 // held at 1 while the dice roll
      asking.add(actor.uuid);
      // C1 — `dc: "activity"` (Relentless Rage): the pack's own save activity computes it (10, +5 per use spent).
      const saveAct = found.row.save.activity ? activityNamed(found.item, found.row.save.activity) : null;
      const dc = (found.row.save.dc === "activity") ? (Number(saveAct?.save?.dc?.value) || dropSaveDc(null, amount)) : dropSaveDc(found.row.save.dc, amount);
      void rollDropSave(actor, found, { amount, source, dc, saveAct })
        .catch(err => { asking.delete(actor.uuid); log.error(`${found.name}'s save failed — the creature stays at 1 HP; set it by hand.`, err); });
      return;
    }
    updates[HP] = 1;                                                   // held at 1, in this very update
    if ( !found.row.ask ) { void settle(actor, found, { amount, source }); return; }
    asking.add(actor.uuid);
    void stampAsk(actor, found, { amount, source })
      .catch(err => { asking.delete(actor.uuid); log.error(`${found.name}'s ask failed — the creature stays at 1 HP; set it by hand.`, err); });
  } catch(err) {
    log.error(`Drop to 1 HP failed — the damage lands as the system has it.`, err);
  }
});

// THE DOWNED CONDITIONS OUT OF COMBAT (RULINGS *Session zero's combat*, call 2): dnd5e's Apply Downed Conditions puts
// Unconscious or Dead on a creature at 0 Hit Points only while it is in the active combat (`Actor5e#updateDowned`, "do not
// auto-apply statuses outside of combat"), and takes its own back when the Hit Points return, in or out of combat. The
// module applies the same mapping (`downedOutcome`) to a creature NOT in combat, on the updating client as the system
// does, with the system's own `autoDowned` flag, so the system's removal on the heal is the one that ends it and the
// Prone rider stays, as written. dnd5e's setting governs: at "none" nothing is applied.
// One application per drop: the hook can fire again for the same creature before the first status lands (a synthetic
// actor's update reaches it twice), and the status ids are fixed, so a second create would be refused as a duplicate.
const downing = new Set();
listen("updateActor", "drop-to-one", (actor, changes, _options, userId) => {
  try {
    if ( (userId !== game.user.id) || !(actor instanceof Actor) || !foundry.utils.hasProperty(changes, HP) ) return;
    if ( (Number(actor.system?.attributes?.hp?.value ?? 1) > 0) || actor.inCombat || downing.has(actor.uuid) ) return;
    const conditions = actor.effects.filter(e => e.type === "condition" || e.statuses?.size);
    const toApply = downedOutcome({ setting: game.settings.get("dnd5e", "autoApplyDowned"), type: actor.type,
      important: !!actor.system?.traits?.important, failedDeathSaves: Number(actor.system?.attributes?.death?.failure ?? 0) >= 3,
      isDead: conditions.some(e => e.statuses?.has?.("dead")), isUnconscious: conditions.some(e => e.statuses?.has?.("unconscious")) });
    if ( !toApply ) return;
    downing.add(actor.uuid);
    void (async () => {
      const effect = await ActiveEffect.implementation.fromStatusEffect(toApply);
      // Landed meanwhile (the system's own, or another client's): nothing to add.
      if ( actor.statuses?.has?.(toApply) || actor.effects.has(effect.id) ) return;
      const flags = { dnd5e: { autoDowned: true } };
      if ( toApply === "dead" ) flags.core = { overlay: true };
      effect.updateSource({ flags });
      await ActiveEffect.implementation.create(effect, { parent: actor, keepId: true });
    })().catch(err => log.warn(`The downed condition could not be applied out of combat — set it by hand.`, err))
      .finally(() => downing.delete(actor.uuid));
  } catch(err) {
    log.error(`The downed condition failed out of combat.`, err);
  }
});

/** An automatic row (Death Ward): the effect ends, the card says so. */
async function settle(actor, found, { amount, source }) {
  try { if ( found.effect && actor.effects.get(found.effect.id) ) await found.effect.delete(); }
  catch(err) { log.warn(`${found.name}'s effect could not be removed — end it by hand.`, err); }
  // B4 — a named row's activity pays (Protect's once per Long Rest), on the keeper's item.
  if ( found.activity && found.item ) {
    await found.item.update({ [`system.activities.${found.activity.id}.uses.spent`]: Number(found.activity.uses?.spent ?? 0) + 1 })
      .catch(err => log.warn(`${found.name}'s use could not be spent — mark it by hand.`, err));
  }
  await postCard({
    actor,
    card: bfCard({ img: found.effect?.img ?? found.item?.img ?? null, eyebrow: found.name, tone: "good",
      title: `${actor.name} drops to 1 Hit Point instead`, subtitle: found.row.ends ? "the spell ends" : found.keeper ? `${found.keeper.name}'s ${found.name} — its name is on the page` : "",
      lines: [ruleLine(found.row.rule), found.row.caveat ? `<span style="opacity:0.8;">${found.row.caveat}</span>` : null] }),
    flags: { [MODULE_ID]: { [DROP_FLAG]: { status: "resolved", answer: "auto", row: found.name, actorUuid: actor.uuid,
      actorName: actor.name, amount, applied: true, ...statContext(source?.uuid ?? null) } } }
  });
}

/* --- the `save` row: the dice decide (Undead Fortitude) ------------------------------------------- */

/** The damage set the row aside (Radiant, a Critical Hit): the 0 lands, the card says why. */
async function exemptCard(actor, found, why, { amount, source }) {
  try {
    await postCard({
      actor,
      card: bfCard({ img: found.item?.img ?? null, eyebrow: found.name, tone: "neutral",
        title: `${actor.name} drops to 0 — ${found.name} does not apply`, subtitle: `${why}: no save`,
        lines: [ruleLine(found.row.rule)] }),
      flags: { [MODULE_ID]: { [DROP_FLAG]: { status: "resolved", answer: "exempt", why, row: found.name, actorUuid: actor.uuid,
        actorName: actor.name, amount, applied: true, ...statContext(source?.uuid ?? null) } } }
    });
  } catch(err) { log.warn(`${found.name}'s card could not post.`, err); }
}

/** The bearer's save, rolled here on the keeper with the computed DC; the verdict lands the 1 or the 0. */
async function rollDropSave(actor, found, { amount, source, dc, saveAct = null }) {
  const ability = found.row.save.ability ?? [...(saveAct?.save?.ability ?? [])][0] ?? "con";
  let total = null;
  try {
    const rolls = await actor.rollSavingThrow({ ability, target: dc }, { configure: false },
      { data: { flags: { [MODULE_ID]: { dropToOneSave: { row: found.name, actorUuid: actor.uuid, dc } } } } });
    const t = Number(rolls?.[0]?.total);
    total = Number.isFinite(t) ? t : null;
  } catch(err) {
    log.error(`${found.name}'s save did not roll — the creature stays at 1 HP; roll it by hand.`, err);
  }
  const saved = (total !== null) && (total >= dc);
  // C1 — `uses` on a save row (Relentless Rage): the roll itself spends the use, saved or not (the DC climbs with it).
  // RAVENLOFT — `spendOn: "success"` (Strength of the Grave): the success alone spends it.
  if ( found.row.uses && found.item && (total !== null) && ((found.row.spendOn !== "success") || saved) ) {
    await found.item.update({ "system.uses.spent": Number(found.item.system.uses?.spent ?? 0) + 1 })
      .catch(err => log.warn(`${found.name}'s use could not be spent — mark it by hand.`, err));
  }
  try {
    if ( !saved && (total !== null) && (Number(actor.system.attributes.hp.value) === 1) ) {
      // Only the 1 the roll held: a heal in between is left alone.
      await actor.update({ [HP]: 0 });
    }
  } finally {
    asking.delete(actor.uuid);
  }
  const card = await postCard({
    actor,
    card: bfCard({ img: found.item?.img ?? null, eyebrow: found.name, tone: saved ? "good" : "bad",
      title: dropSaveTitle({ name: actor.name, saved, total, dc }),
      subtitle: (found.row.save.dc === "activity") ? `${CONFIG.DND5E.abilities[ability]?.label ?? ability} save, DC ${dc} (rising 5 per use)` : `Constitution save, DC 5 + ${Number(amount)} damage`,
      lines: [ruleLine(found.row.rule)] }),
    flags: { [MODULE_ID]: { [DROP_FLAG]: { status: "resolved", answer: (total === null) ? "unrolled" : saved ? "saved" : "failed",
      row: found.name, actorUuid: actor.uuid, actorName: actor.name, amount, applied: true,
      save: { ability, dc, total }, ...statContext(source?.uuid ?? null) } } }
  });
  // C1 — `heal` on a success (Relentless Rage: 2 × level on top of the 1), receipted on the card.
  if ( saved && found.row.heal && card ) await healOnHold(card, actor, found);
  if ( !saved && (total !== null) ) await landedZero(actor, { amount, source });
}

/**
 * C1 — a row's `heal` (the feature's heal activity, rolled on its bearer): landed on the held creature with a receipt.
 * In a ledgered landing (`steps`) the roll and the heal are steps: a re-drive heals once, by the first drive's roll.
 */
async function healOnHold(card, actor, found, steps = null) {
  const once = (name, spec) => (steps ? steps.step(name, spec) : unledgered(spec));
  try {
    const item = found.item;
    const activity = item ? activityNamed(item, found.row.heal) : null;
    const h = activity?.healing;
    const raw = h ? riderPartFormula({ number: h.number, denomination: h.denomination, custom: h.custom, bonus: h.bonus }) : null;
    if ( !raw ) { log.warn(`${found.name}: no healing part on "${found.row.heal}" — heal by hand.`); return; }
    const owner = found.keeper ?? actor;
    // the roll writes nothing: its witness never moves, so a roll the dead claimant never recorded is rolled again
    const rolled = await once("heal-roll", {
      witness: () => null,
      run: async () => ({ total: Number((await new Roll(raw, activity.getRollData?.() ?? owner.getRollData()).evaluate()).total) })
    });
    const total = Number(rolled.result?.total);
    if ( !(total > 0) ) return;
    await once("heal", {
      // RAVENLOFT — `sets` ("your Hit Points instead change to"): the held 1 counts toward the roll.
      plan: () => ({ value: found.row.sets ? Math.max(0, total - Math.max(0, Number(actor.system?.attributes?.hp?.value ?? 0))) : total }),
      witness: () => hitPointsOf(actor),
      run: async p => {
        if ( !(p.value > 0) ) return;
        await applyDamagesWithReceipt(card, [{ uuid: actor.uuid, name: actor.name }], [{ value: p.value, type: "healing", properties: new Set() }], { note: found.name });
      }
    });
  } catch(err) { log.error(`${found.name}'s heal failed — heal by hand.`, err); }
}

/** A step's spec run as it stands, outside a ledgered landing: the shape `steps.step` resolves. @param {any} spec */
async function unledgered({ plan = () => null, run }) {
  const p = plan() ?? null;
  return { plan: p, result: (await run(p)) ?? null, how: "ran", now: null };
}

/* --- the `died` row: the death's side (Death Throes) --------------------------------------------- */

/** Stamped before the write when a `died` row stands; `dnd5e.applyDamage` reads it after. */
function markDying(actor, ctx) {
  if ( diedRowsFor(actor).length ) dying.set(actor.uuid, ctx);
}

listen("dnd5e.applyDamage", "drop-to-one", (actor, _amount, _options) => {
  try {
    const ctx = dying.get(actor?.uuid);
    if ( !ctx ) return;
    dying.delete(actor.uuid);
    if ( Number(actor.system?.attributes?.hp?.value ?? 1) > 0 ) return;   // something else held it
    void landedZero(actor, ctx);
  } catch(err) {
    log.error(`The death's side failed — use the trait by hand.`, err);
  }
});

/** The 0 landed and nothing held it: every listed `died` row fires at the corpse. */
async function landedZero(actor, { source }) {
  for ( const found of diedRowsFor(actor) ) {
    try {
      const item = found.item;
      // A `notice` row: the death's side is the GM's move (the vampire's mist) — the card says what, nothing is used.
      if ( found.row.notice ) {
        await postCard({
          actor,
          card: bfCard({ img: item.img ?? null, eyebrow: found.name, tone: "neutral",
            title: `${actor.name} drops to 0 — ${found.name}`, subtitle: found.row.notice,
            lines: [ruleLine(found.row.rule), found.row.caveat ? `<span style="opacity:0.8;">${found.row.caveat}</span>` : null] }),
          flags: { [MODULE_ID]: { deathThroes: { ...statContext(actor.uuid), key: found.name, actorUuid: actor.uuid, sourceUuid: source?.uuid ?? null, count: 0, feet: 0, notice: true } } }
        });
        continue;
      }
      const activity = found.row.activity ? activityNamed(item, found.row.activity) : activityOfType(item, "save");
      const dc = activity?.save?.dc?.value;
      const abilities = [...(activity?.save?.ability ?? [])];
      if ( !activity || !(dc > 0) || !abilities.length ) { log.warn(`${found.name}: no save activity on ${actor.name}'s sheet — use it by hand.`); continue; }
      const corpse = tokenOf(actor);
      const feet = feetOf(Number(activity.target?.template?.size), activity.target?.template?.units || "ft");
      if ( !corpse || !(feet > 0) ) { log.warn(`${found.name}: ${actor.name} has no token in view, or its activity no Emanation — use it by hand.`); continue; }
      const victims = creaturesWithin(corpse, feet);
      const entries = (await applicableProfiles(activity)).map(({ profile, effect }) => ({ onSave: profile.onSave, effect }));
      const effectNames = { fail: entries.filter(e => !e.onSave).map(e => e.effect.name), always: entries.filter(e => e.onSave).map(e => e.effect.name) };
      const onSave = activity.damage?.onSave ?? "half";
      const hasDamage = !!activity.damage?.parts?.length && (onSave !== "full");
      const window = decisionWindow();
      const abilityLabel = CONFIG.DND5E.abilities[abilities[0]]?.label ?? abilities[0];
      const content = bfCard({ img: item.img ?? null, eyebrow: found.name, tone: "bad",
        title: diedTitle({ row: found.name, name: actor.name, count: victims.length }),
        subtitle: `${abilityLabel} save DC ${dc} · ${feet}-foot Emanation${hasDamage ? ` · ${onSave === "half" ? "half on a success" : "none on a success"}` : ""}`,
        lines: [ruleLine(found.row.rule)] });
      const throes = { ...statContext(actor.uuid), key: found.name, actorUuid: actor.uuid, sourceUuid: source?.uuid ?? null, count: victims.length, feet };
      if ( !victims.length ) {
        await postCard({ actor, token: corpse.document, card: content, flags: { [MODULE_ID]: { deathThroes: throes } } });
        continue;
      }
      const card = await postCard({
        actor, token: corpse.document,
        card: content,
        flags: { [MODULE_ID]: {
          saves: saveDemandData({
            stat: statContext(actor.uuid),
            abilities, dc, damageOnSave: onSave, hasDamage, effectNames,
            demand: { spell: !!activity.item?.system?.properties?.has?.("mgc"), cast: activity.item?.type === "spell", abilities,
              statuses: [...new Set(entries.filter(e => !e.onSave).flatMap(e => [...(e.effect?.statuses ?? [])]))], sleep: false },
            // ⚠ Pinned: the area adoption keys on the activity and would rewrite the targets.
            pinnedTargets: true,
            activityUuid: activity.uuid, templateType: null, templated: false,
            durationUnits: activity.duration?.units ?? null,
            item: { name: item.name, img: item.img ?? null }, casterName: actor.name,
            window, deadline: window ? Date.now() + (window * 1000) : null,
            targets: victims.map(t => saveTargetEntry(t.actor.uuid, t.name))
          }),
          deathThroes: throes
        } }
      });
      if ( hasDamage && card ) await rollDamageForSave(activity, card);
    } catch(err) {
      log.error(`${found.name} failed — use the trait by hand.`, err);
    }
  }
}

/* --- the ask (Relentless Endurance) --------------------------------------------------------------- */

async function stampAsk(actor, found, { amount, source }) {
  const window = decisionWindow();
  const flag = {
    status: "pending", row: found.name, actorUuid: actor.uuid, actorName: actor.name, itemId: found.item.id,
    amount, sourceName: source?.name ?? null, answer: null, applied: false,
    // C1 — an `ally` row's KEEPER (Rage of the Gods): the ask is theirs, their pool pays.
    ...(found.keeper ? { keeperUuid: found.keeper.uuid, keeperName: found.keeper.name } : {}),
    ...statContext(source?.uuid ?? null),
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
  };
  const message = await postCard({
    actor,
    card: bfCard({ img: found.item.img, eyebrow: found.name, tone: "pending",
      title: `${actor.name} drops to 0 Hit Points`, subtitle: found.keeper ? `held at 1 until ${found.keeper.name} answers` : "held at 1 until the answer" }),
    flags: { [MODULE_ID]: { [DROP_FLAG]: flag } }
  });
  if ( message ) armTimer(message);
}

// The keeper.


function armTimer(message) {
  armAskTimer(timers, message, DROP_FLAG, live => queueFlagWrite(live, DROP_FLAG, current => {
    if ( current.status !== "pending" ) return false;
    Object.assign(current, { status: "resolved", answer: "pass", timedOut: true, answeredAt: Date.now() });
  }), { owns: keeperOwns });
}

// The answer: folded by the keeper, relayed by anyone else.

async function answer(message, choice) {
  if ( answering.has(message.id) ) return;
  answering.add(message.id);
  try {
    const flag = readFlag(message, DROP_FLAG);
    if ( flag?.status !== "pending" ) return;
    if ( keepsMessage(message) ) {
      await queueFlagWrite(message, DROP_FLAG, current => {
        if ( current.status !== "pending" ) return false;
        Object.assign(current, { status: "resolved", answer: choice, answeredAt: Date.now() });
      });
      return;
    }
    await postAnswer("dropToOneAnswer", {
      actor: resolveUuid(flag.actorUuid),
      card: bfCard({ eyebrow: flag.row, tone: (choice === "use") ? "good" : "neutral",
        title: (choice === "use") ? `${flag.actorName} drops to 1 Hit Point instead` : `${flag.actorName} drops to 0` }),
      flags: { [MODULE_ID]: { dropToOneAnswer: { messageId: message.id, answer: choice } } }
    });
  } finally {
    answering.delete(message.id);
  }
}

registerRelay("dropToOneAnswer", {
  flagKey: DROP_FLAG,
  targetOf: a => a.messageId,
  owns: (_flag, target) => keepsMessage(target),
  fold: (current, a) => {
    if ( current.status !== "pending" ) return false;
    Object.assign(current, { status: "resolved", answer: a.answer, answeredAt: Date.now() });
  }
});

/** The keeper lands the answer: the use spent, or the 0 the damage would have left. */
async function land(message) {
  if ( !(await claimLanding(message, DROP_FLAG, current => current.status === "resolved")) ) return;
  const flag = readFlag(message, DROP_FLAG);
  const actor = resolveUuid(flag.actorUuid);
  // THE LEDGER (ledger.js): a re-drive over a dead claim spends the use once, sets the Hit Points once, heals once.
  const steps = landingSteps(message, DROP_FLAG, "land");
  let fell = false;
  try {
    if ( actor instanceof Actor ) {
      if ( flag.answer === "use" ) {
        // C1 — an `ally` row (Rage of the Gods): the KEEPER's activity pays (its pool — a Rage use); the creature drops to the
        // activity's roll (`to: "roll"`, the barbarian's level) instead of 1. A `heal` row (Undying Sentinel) heals on top of the 1.
        const keeper = flag.keeperUuid ? resolveUuid(flag.keeperUuid) : null;
        const owner = (keeper instanceof Actor) ? keeper : actor;
        const item = owner.items.get(flag.itemId);
        const row = DROP_TO_ONE[flag.row];
        const activity = (item && row?.activity) ? activityNamed(item, row.activity) : null;
        const pool = activity ? poolOf(owner, activity) : null;
        const pays = pool ?? ((item && row?.uses) ? item : null);
        if ( pays ) await steps.step("spend", {
          plan: () => ({ spent: Number(pays.system.uses?.spent ?? 0) + 1 }),
          witness: () => pays.system.uses?.spent ?? null,
          run: async p => { await pays.update({ "system.uses.spent": p.spent }); }
        });
        if ( (row?.to === "roll") && activity?.roll?.formula ) {
          // the held 1 read before the write, once: a re-drive keeps the first drive's verdict
          const raised = await steps.step("to", {
            plan: () => {
              if ( Number(actor.system.attributes.hp.value) !== 1 ) return { to: null };
              const to = Math.max(1, Math.floor(Number(Roll.safeEval(Roll.replaceFormulaData(String(activity.roll.formula), owner.getRollData()))) || 1));
              return { to, hp: Math.min(to, Number(actor.system.attributes.hp.max) || to) };
            },
            witness: () => hitPointsOf(actor),
            run: async p => { if ( p.to !== null ) await actor.update({ [HP]: p.hp }); }
          });
          const to = raised.plan?.to ?? null;
          // a value written, never added to: safe to repeat
          if ( to !== null ) await queueFlagWrite(message, DROP_FLAG, current => { current.to = to; });
        }
        if ( row?.heal ) await healOnHold(message, actor, { name: flag.row, row, item, keeper: (keeper instanceof Actor) ? keeper : null }, steps);
      } else {
        // Only the 1 the ask held: a heal in between is left alone. Read before the write, once.
        const dropped = await steps.step("fall", {
          plan: () => ({ fall: Number(actor.system.attributes.hp.value) === 1 }),
          witness: () => hitPointsOf(actor),
          run: async p => { if ( p.fall ) await actor.update({ [HP]: 0 }); }
        });
        fell = !!dropped.plan?.fall;
      }
    }
  } finally {
    asking.delete(flag.actorUuid);
    await queueFlagWrite(message, DROP_FLAG, current => { current.applied = true; current.applying = false; closeLedger(current, "land"); });
  }
  if ( fell ) await landedZero(actor, { source: flag.sourceUuid ? resolveUuid(flag.sourceUuid) : null });
}

registerResumable(DROP_FLAG, {
  pending: flag => (flag?.status === "resolved") && !flag.applied && !claimHolds(flag.applying),
  drives: (_flag, message) => keepsMessage(message),
  drive: land
});

// The popup and the card.

/** The ask's answerer: an `ally` row's keeper (Rage of the Gods), else the dropped creature. */
const askerOf = flag => (flag?.keeperUuid ? resolveUuid(flag.keeperUuid) : null) ?? resolveUuid(flag?.actorUuid);

async function showPopup(message) {
  const flag = readFlag(message, DROP_FLAG);
  if ( flag?.status !== "pending" ) return;
  const actor = askerOf(flag);
  const row = DROP_TO_ONE[flag.row];
  const item = actor?.items.get(flag.itemId);
  const activity = (item && row?.activity) ? activityNamed(item, row.activity) : null;
  const pool = activity ? poolOf(actor, activity) : item;
  const left = Number(pool?.system?.uses?.value ?? 0), max = Number(pool?.system?.uses?.max ?? 0);
  const to = (row?.to === "roll" && activity?.roll?.formula) ? `${activity.roll.formula} Hit Points` : "1 Hit Point";
  await openMomentPopup(message, DROP_FLAG, actor, {
    title: `${flag.row} — ${flag.actorName}`, icon: "fa-solid fa-heart-pulse",
    content: bfCard({ img: item?.img ?? null, eyebrow: flag.row, tone: "pending",
      title: `${flag.actorName} drops to 0 Hit Points — drop to ${to} instead?`,
      subtitle: `${flag.sourceName ? `from ${flag.sourceName} · ` : ""}${max > 0 ? `${left} of ${max} ${pool && (pool.id !== item?.id) ? `${pool.name} ` : ""}${(max === 1) ? "use" : "uses"} left` : ""}${row?.heal ? " · and the heal" : ""}`,
      lines: [ruleLine(row?.rule ?? "")] })
      + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "use", label: `Drop to ${to}`, default: true, callback: () => { void answer(message, "use"); } },
      { action: "pass", label: "Drop to 0", callback: () => { void answer(message, "pass"); } }
    ]
  });
}

/** The card's line — source, then result (law 6). */
function askLine(flag) {
  const by = flag.keeperName ? ` (${flag.keeperName}'s)` : "";
  if ( flag.answer === "use" ) return `${flag.row}${by} — ${flag.actorName} drops to ${flag.to ? `${flag.to} Hit Points` : "1 Hit Point"} instead`;
  if ( flag.answer === "pass" ) return `${flag.actorName} drops to 0${flag.timedOut ? " (timer)" : ""}`;
  if ( flag.answer === "auto" ) return "";
  return `${flag.row}${by} — ${flag.actorName} is held at 1 Hit Point; it waits for the answer`;
}

/** The card IS the record for a row the dice or the damage settled: no line under it. */
const CARD_SAYS_IT = new Set(["auto", "saved", "failed", "unrolled", "exempt"]);

listen("dnd5e.renderChatMessage", "drop-to-one", (message, html) => {
  try {
    const flag = readFlag(message, DROP_FLAG);
    if ( !flag || CARD_SAYS_IT.has(flag.answer) ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-drop-to-one-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-drop-to-one-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-heart-pulse" data-tooltip="${esc(flag.row)}"></i> ${esc(askLine(flag))}`;
    if ( flag.status === "pending" ) {
      const may = canAnswerFor(askerOf(flag));
      pendingRow(message, div, {
        bar: holdBarHTML(flag, "to answer"),
        latch: may && { sub: DROP_FLAG, show: () => showPopup(message) },
        answer: may && "Answer",
        arm: armTimer
      });
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The drop-to-1 line could not render.`, err); }
});

// An answer anywhere closes the popup everywhere (law 4); the clock stands down with it.
listen("updateChatMessage", "drop-to-one", message => {
  const flag = readFlag(message, DROP_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armTimer(message); return; }
  disarmAskTimer(timers, message.id);
  void closePopup(message, DROP_FLAG);
});

listen("deleteChatMessage", "drop-to-one", message => { disarmAskTimer(timers, message.id); });

/* --- C1 — THE DEATH SAVE'S SIDE (`on: "deathSave"`, Searing Vengeance) ------------------------------------------------
 * When a creature rolls a Death Saving Throw, every keeper within the row's `ally` reach (the creature itself too) holding the
 * feature with a use left is OFFERED it: Yes regains half the creature's Hit Point maximum, rolls the pack's damage once and
 * lands it on every enemy within its Emanation of the creature, the activity's effect with it for the turn. The offer rides
 * the roll, never before it (RULINGS *Where the table bends the rule*). */

const DEATH_OFFER_FLAG = "deathSaveOffer";
const offeredFor = new Set();

/** The `deathSave` rows' keepers for this creature: `{ name, row, keeper, item, activity }[]`. */
function deathSaveKeepersOf(actor) {
  const on = listedNames(dropToOneEntries());
  const own = tokenOf(actor);
  const out = [];
  for ( const [name, row] of Object.entries(DROP_TO_ONE) ) {
    if ( (row.on !== "deathSave") || !on.has(lower(name)) ) continue;
    const seen = new Set();
    for ( const token of (own ? (canvas.tokens?.placeables ?? []) : []) ) {
      const keeper = token.actor;
      if ( !keeper || seen.has(keeper.uuid) ) continue;
      seen.add(keeper.uuid);
      if ( (keeper.uuid !== actor.uuid) && (token.document.disposition !== own.document.disposition) ) continue;
      const item = featureNamed(keeper, name);
      if ( !item ) continue;
      if ( row.uses && !(Number(item.system?.uses?.value ?? 0) > 0) ) continue;
      const feet = (keeper.uuid === actor.uuid) ? 0 : nearestFeet(own, token);
      if ( (feet === null) || (Number.isFinite(row.ally) && (feet > row.ally)) ) continue;
      const activity = row.activity ? activityNamed(item, row.activity) : activityOfType(item, "damage");
      if ( !activity ) continue;
      out.push({ name, row, keeper, item, activity, feet });
    }
  }
  return out;
}

listen("dnd5e.rollDeathSave", "drop-to-one", (rolls, ctx) => {
  try {
    if ( !isActiveGM() ) return;
    const subject = ctx?.subject;
    const actor = (subject instanceof Actor) ? subject : (subject?.actor ?? null);
    const message = rolls?.[0]?.parent ?? null;
    if ( !(actor instanceof Actor) || !message?.id || offeredFor.has(message.id) ) return;
    offeredFor.add(message.id);
    for ( const found of deathSaveKeepersOf(actor) ) void stampDeathOffer(actor, found, message);
  } catch(err) {
    log.error(`The death save's offer failed — use the feature by hand.`, err);
  }
});

async function stampDeathOffer(actor, found, rollMessage) {
  const window = decisionWindow();
  const flag = { status: "pending", row: found.name, actorUuid: actor.uuid, actorName: actor.name,
    keeperUuid: found.keeper.uuid, keeperName: found.keeper.name, itemId: found.item.id, activityId: found.activity.id,
    rollMessageId: rollMessage.id, feet: found.feet, answer: null, applied: false,
    ...statContext(found.keeper.uuid),
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {}) };
  const message = await postCard({
    actor: found.keeper,
    card: bfCard({ img: found.item.img, eyebrow: found.name, tone: "pending",
      title: `${actor.name} rolls a Death Saving Throw`, subtitle: `${found.keeper.name} may answer${found.feet ? ` · ${found.feet} ft away` : ""}` }),
    flags: { [MODULE_ID]: { [DEATH_OFFER_FLAG]: flag } }
  });
  if ( message ) armOfferTimer(message);
}

function armOfferTimer(message) {
  armAskTimer(timers, message, DEATH_OFFER_FLAG, live => queueFlagWrite(live, DEATH_OFFER_FLAG, current => {
    if ( current.status !== "pending" ) return false;
    Object.assign(current, { status: "resolved", answer: "pass", timedOut: true, answeredAt: Date.now() });
  }), { owns: keeperOwns });
}

async function answerOffer(message, choice) {
  if ( answering.has(message.id) ) return;
  answering.add(message.id);
  try {
    const flag = readFlag(message, DEATH_OFFER_FLAG);
    if ( flag?.status !== "pending" ) return;
    if ( keepsMessage(message) ) {
      await queueFlagWrite(message, DEATH_OFFER_FLAG, current => {
        if ( current.status !== "pending" ) return false;
        Object.assign(current, { status: "resolved", answer: choice, answeredAt: Date.now() });
      });
      return;
    }
    await postAnswer("deathSaveOfferAnswer", {
      actor: resolveUuid(flag.keeperUuid),
      card: bfCard({ eyebrow: flag.row, tone: (choice === "use") ? "good" : "neutral",
        title: (choice === "use") ? `${flag.keeperName} answers with ${flag.row}` : `${flag.keeperName} lets the save roll` }),
      flags: { [MODULE_ID]: { deathSaveOfferAnswer: { messageId: message.id, answer: choice } } }
    });
  } finally {
    answering.delete(message.id);
  }
}

registerRelay("deathSaveOfferAnswer", {
  flagKey: DEATH_OFFER_FLAG,
  targetOf: a => a.messageId,
  owns: (_flag, target) => keepsMessage(target),
  fold: (current, a) => {
    if ( current.status !== "pending" ) return false;
    Object.assign(current, { status: "resolved", answer: a.answer, answeredAt: Date.now() });
  }
});

/** The keeper lands a Yes: half the maximum back, the use spent, the burst rolled once and landed on the enemies around. */
async function landOffer(message) {
  if ( !(await claimLanding(message, DEATH_OFFER_FLAG, current => (current.status === "resolved") && (current.answer === "use"))) ) return;
  const flag = readFlag(message, DEATH_OFFER_FLAG);
  const record = {};
  // THE LEDGER (ledger.js): a re-drive over a dead claim spends the use once, heals once, rolls the burst once and lands
  // it, and its effect, once on each enemy.
  const steps = landingSteps(message, DEATH_OFFER_FLAG, "land");
  try {
    const actor = resolveUuid(flag.actorUuid);
    const keeper = resolveUuid(flag.keeperUuid);
    const item = keeper?.items?.get(flag.itemId);
    const activity = item?.system?.activities?.get(flag.activityId) ?? null;
    const row = DROP_TO_ONE[flag.row];
    if ( !(actor instanceof Actor) || !(keeper instanceof Actor) || !item || !activity || !row ) throw new Error("the feature left the sheet");
    if ( row.uses ) await steps.step("spend", {
      plan: () => ({ spent: Number(item.system.uses?.spent ?? 0) + 1 }),
      witness: () => item.system.uses?.spent ?? null,
      run: async p => { await item.update({ "system.uses.spent": p.spent }); }
    });
    // Half the maximum, as healing (a receipt on the card), read before the heal lands.
    if ( row.heal === "halfMax" ) {
      const healed = await steps.step("heal", {
        plan: () => {
          const max = Number(actor.system.attributes.hp.effectiveMax ?? actor.system.attributes.hp.max) || 0;
          return { heal: Math.max(1, Math.floor(max / 2) - Number(actor.system.attributes.hp.value || 0)) };
        },
        witness: () => hitPointsOf(actor),
        run: async p => { await applyDamagesWithReceipt(message, [{ uuid: actor.uuid, name: actor.name }], [{ value: p.heal, type: "healing", properties: new Set() }], { note: flag.row }); }
      });
      record.healed = healed.plan.heal;
    }
    // The burst: the activity's damage rolled once on the keeper, landed on every enemy of the creature within its Emanation.
    // The roll writes nothing (its witness never moves, so an unrecorded roll is rolled again); the enemies are its plan.
    const burst = await steps.step("burst-roll", {
      plan: () => {
        const corpse = tokenOf(actor);
        const feet = feetOf(Number(activity.target?.template?.size), activity.target?.template?.units || "ft");
        const victims = (corpse && (feet > 0)) ? creaturesWithin(corpse, feet).filter(t => t.actor && (t.actor.uuid !== actor.uuid)
          && (t.document.disposition !== corpse.document.disposition)) : [];
        return { targets: victims.map(t => ({ uuid: t.actor.uuid, name: t.document?.name ?? t.actor.name })) };
      },
      witness: () => null,
      run: async () => {
        const rolls = await activity.rollDamage({}, { configure: false }, { create: false });
        return { damages: (rolls ?? []).map(r => ({ value: Number(r.total) || 0, type: r.options?.type ?? [...(r.options?.types ?? [])][0] ?? "radiant" })) };
      }
    });
    /** @type {{ uuid: string, name: string }[]} */
    const targets = burst.plan.targets;
    const damages = (burst.result?.damages ?? []).map(d => ({ ...d, properties: new Set(["mgc"]) }));
    record.burst = damages.reduce((n, d) => n + d.value, 0);
    record.victims = targets.map(t => t.name);
    if ( targets.length && damages.length ) {
      // a step per enemy: the applier writes each in turn, so a claimant can go between two of them
      for ( const [i, target] of targets.entries() ) {
        const hit = resolveUuid(target.uuid);
        await steps.step(`burst-${i}`, {
          witness: () => hitPointsOf(hit),
          run: async () => { await applyDamagesWithReceipt(message, [target], damages, { note: flag.row }); }
        });
      }
      try {
        const names = [...(activity.effects ?? [])].map(e => e?.effect?.name).filter(Boolean);
        for ( const [i, target] of targets.entries() ) {
          const hit = resolveUuid(target.uuid);
          await steps.step(`effect-${i}`, {
            witness: () => names.flatMap(name => effectsNamed(hit, name)),
            run: async () => { await applyActivityEffectsOnHit(message, activity, [target], { clock: row.clock ?? null, attacker: keeper }); }
          });
        }
      } catch(err) { log.warn(`${flag.row}'s effect could not land — apply it by hand.`, err); }
    }
  } catch(err) {
    log.error(`${flag.row} failed part-way — check the sheets.`, err);
  } finally {
    await queueFlagWrite(message, DEATH_OFFER_FLAG, current => { Object.assign(current, record, { applied: true, applying: false }); closeLedger(current, "land"); });
  }
}

registerResumable(DEATH_OFFER_FLAG, {
  pending: flag => (flag?.status === "resolved") && (flag.answer === "use") && !flag.applied && !claimHolds(flag.applying),
  drives: (_flag, message) => keepsMessage(message),
  drive: landOffer
});

async function showOfferPopup(message) {
  const flag = readFlag(message, DEATH_OFFER_FLAG);
  if ( flag?.status !== "pending" ) return;
  const keeper = resolveUuid(flag.keeperUuid);
  const row = DROP_TO_ONE[flag.row];
  const item = keeper?.items.get(flag.itemId);
  const left = Number(item?.system?.uses?.value ?? 0), max = Number(item?.system?.uses?.max ?? 0);
  await openMomentPopup(message, DEATH_OFFER_FLAG, keeper, {
    title: `${flag.row} — ${flag.actorName}`, icon: "fa-solid fa-sun",
    content: bfCard({ img: item?.img ?? null, eyebrow: flag.row, tone: "pending",
      title: `${flag.actorName} rolls a Death Saving Throw — ${flag.row}?`,
      subtitle: `half its Hit Point maximum back, the burst on the enemies around it${max > 0 ? ` · ${left} of ${max} ${(max === 1) ? "use" : "uses"} left` : ""}`,
      lines: [ruleLine(row?.rule ?? ""), row?.caveat ? `<span style="opacity:0.8;">${esc(row.caveat)}</span>` : null] })
      + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "use", label: flag.row, default: true, callback: () => { void answerOffer(message, "use"); } },
      { action: "pass", label: "Pass", callback: () => { void answerOffer(message, "pass"); } }
    ]
  });
}

function offerLine(flag) {
  if ( flag.answer === "use" ) {
    if ( !flag.applied ) return `${flag.row} — ${flag.keeperName} answers; landing…`;
    const burst = flag.victims?.length ? `; ${flag.burst} radiant on ${flag.victims.join(", ")}, Blinded until the end of the turn` : "; nobody within its burst";
    return `${flag.row} — ${flag.actorName} regains ${flag.healed ?? "half its maximum"} Hit Points${burst}`;
  }
  if ( flag.answer === "pass" ) return `${flag.row} — ${flag.keeperName} lets the save stand${flag.timedOut ? " (timer)" : ""}`;
  return `${flag.row} — ${flag.keeperName} may answer ${flag.actorName}'s Death Saving Throw`;
}

listen("dnd5e.renderChatMessage", "drop-to-one", (message, html) => {
  try {
    const flag = readFlag(message, DEATH_OFFER_FLAG);
    if ( !flag ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-death-offer-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-death-offer-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-sun" data-tooltip="${esc(flag.row)}"></i> ${esc(offerLine(flag))}`;
    if ( flag.status === "pending" ) {
      const may = canAnswerFor(resolveUuid(flag.keeperUuid));
      pendingRow(message, div, {
        bar: holdBarHTML(flag, "to answer"),
        latch: may && { sub: DEATH_OFFER_FLAG, show: () => showOfferPopup(message) },
        answer: may && "Answer",
        arm: armOfferTimer
      });
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The death save offer's line could not render.`, err); }
});

listen("updateChatMessage", "drop-to-one", message => {
  const flag = readFlag(message, DEATH_OFFER_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armOfferTimer(message); return; }
  disarmAskTimer(timers, message.id);
  void closePopup(message, DEATH_OFFER_FLAG);
});
