/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): the REBUKE — a Reaction to taking damage, at the
 * damager (registry.js REBUKES, decide/rebukes.js). Riposte's shape; Use drives the REAL use on the
 * answering client. The trigger is `dnd5e.applyDamage`, the one seam that knows the ORIGINATING
 * card (a raw HP edit offers nothing). "That you can see" is the table's.
 */
import { MODULE_ID, readFlag, keepsMessage, queueFlagWrite, canAnswerFor, statContext, decisionWindow, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { lower, itemNamed, activityNamed, cardActivity, meleeOptions, preferredMeleeOption, wearsEffectNamed } from "./lookup.js";
import { rebukeEntries, listedNames } from "./decide/registry.js";
import { REBUKES, EMANATIONS, tableIndex } from "./decide/registry.js";
import { rebukeReach, rebukeBlocked, rebukeCost, rebukeLine, rebukeTypesAdmit, zoneKeysOf, placedAreaDamage, rebukeAimsAtDealer } from "./decide/rebukes.js";
import { castWayCost, WAYS_HEAD } from "./decide/cast-ways.js";
import { castWayOf, castBy, payPillsFor } from "./cast-ways.js";
import { poolOf, reactionSpent, resolveAttackMessage, spendReaction, withTargets, hitTargets, grantingActor } from "./shared.js";
import { CARD, isCard, targetsOf, originIdOf } from "./decide/card.js";
import { isActiveGM } from "./core.js";
import { feetOf, nearestFeet, tokenOf } from "./geometry.js";
import { bfCard, esc, holdBarHTML, ruleLine } from "./decide/present.js";
import { openMomentPopup, momentButton, armAskTimer, disarmAskTimer, keeperOwns, registerRelay, pendingRow, closePopup, postCard, postAnswer, picked } from "./ui.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";

const REBUKE_FLAG = "rebuke";
const timers = new Map();
const driving = new Set();

/* --- the offer's facts, off the bearer's sheet ------------------------------------------------ */

/** The item's first REACTION activity, or the row's named one. */
function reactionActivity(item, row) {
  if ( row.activity ) return activityNamed(item, row.activity);
  return [...(item?.system?.activities ?? [])].find(a => a.activation?.type === "reaction") ?? null;
}

/** The rebukes this bearer may take at this damager now. `ward`: the WARD rows only (Sentinel, a
 * bystander to the hit); `attackHit`: the damage came from an attack. */
function offersFor(actor, source, { ward = false, attackHit = false, hitMelee = false, miss = false, missMelee = true, onAttack = false, damageTypes = [], becameBloodied = false, watch = false, zone = false } = {}) {
  const listed = listedNames(rebukeEntries());
  const bearer = tokenOf(actor.uuid);
  const damager = tokenOf(source.uuid);
  const distance = (bearer && damager) ? nearestFeet(bearer, damager) : null;
  const out = [];
  for ( const [name, row] of Object.entries(REBUKES) ) {
    if ( !listed.has(lower(name)) ) continue;
    // RAVENLOFT — `wardAlso` (Prowling Retribution): a ward row asked on the bearer's own damage too.
    if ( (!!row.ward !== ward) && !(row.wardAlso && !ward) ) continue;
    // THE BLOODIED MOMENT, watched (Bloodthirst): a `judge: "enemyBloodied"` row is asked of a bystander when an ENEMY of
    // its became Bloodied — `source` is that enemy; nothing else asks these rows, and they ask on nothing else.
    if ( (row.judge === "enemyBloodied") !== watch ) continue;
    if ( row.hitMelee && !hitMelee ) continue;               // a melee hit alone (Zhentarim Tactics' Retaliate)
    if ( (row.on === "miss") !== miss ) continue;           // a miss row only on a miss, never on damage
    // A miss row answers a melee weapon attack's miss (Sticky Shield); `missOf: "any"` (Masterful Shots) any attack roll's.
    if ( miss && (row.missOf !== "any") && !missMelee ) continue;
    if ( (row.on === "attack") !== onAttack ) continue;     // C1 — an attack row only on the marked creature's attack card
    // A placed area's damage (Cloud of Daggers, Moonbeam, Spike Growth) is not the dealer's blow: nothing answers
    // its caster (RULINGS, the rebukes against a standing area); a self answer (Misty Escape) still stands.
    if ( zone && rebukeAimsAtDealer(row) ) continue;
    // THE BLOODIED MOMENT (Harvest Undead): the damage took the bearer from above half its Hit Points to half or fewer.
    if ( (row.judge === "becameBloodied") && !becameBloodied ) continue;
    // C1 — `mark` (Soul of Vengeance): the attacker must wear the bearer's effect of that name.
    if ( row.mark && !source.effects?.some?.(e => e.active && (lower(e.name) === lower(row.mark)) && (grantingActor(e)?.uuid === actor.uuid)) ) continue;
    if ( row.hit && !attackHit ) continue;
    if ( !rebukeTypesAdmit(row.types, damageTypes) ) continue;
    const item = itemNamed(actor, name);
    if ( !item ) continue;
    const activity = reactionActivity(item, row);
    if ( !activity && !row.attack ) continue;
    // A levelled spell is paid the shared way (cast-ways.js): a free cast left on any copy (Fiendish Legacy), else the
    // lowest slot that can cast it, a Pact slot too, through the copy that owns that slot.
    const route = activity ? castWayOf(actor, item, activity) : null;
    const pool = (activity && !route) ? poolOf(actor, activity) : null;
    const usesMax = Number(pool?.system?.uses?.max ?? 0);
    const usesLeft = (usesMax > 0) ? Number(pool.system.uses.value ?? 0) : null;
    const reach = rebukeReach(row, activity ? feetOf(activity.range?.value, activity.range?.units) : null);
    const blocked = rebukeBlocked({
      self: actor.uuid === source.uuid, hp: Number(actor.system?.attributes?.hp?.value ?? 0),
      reactionSpent: reactionSpent(actor), distance, reach,
      usesLeft,
      slot: route ? (route.way.kind !== "none") : null,
      whileStands: row.while ? wearsEffectNamed(actor, row.while) : null,
      equipped: row.equipped ? !!item.system?.equipped : null,
      // a ward's: the one who hit stands on another side of the map (the tokens' dispositions)
      side: (row.ward && ward) ? (!!bearer && !!damager && (bearer.document.disposition !== damager.document.disposition)) : null
    });
    if ( blocked ) continue;
    out.push({ name, itemId: route?.copy?.id ?? item.id, activityId: route?.activity?.id ?? activity?.id ?? null, img: item.img, reach,
      attack: row.attack ?? null, advantage: !!row.advantage, ...(route ? { spell: true } : {}),
      ...(row.opportunity ? { opportunity: true } : {}), ...((row.ward && ward) ? { ward: true } : {}),
      cost: route ? castWayCost(route.way) : rebukeCost({ usesLeft, usesMax }),
      ...(row.follow?.length ? { follow: [...row.follow] } : {}) });
  }
  return { distance, options: out };
}

/* --- the stamp: the damage landed ------------------------------------------------------------- */

listen("dnd5e.applyDamage", "rebukes", (actor, amount, options) => {
  try {
    if ( !(Number(amount) > 0) || !(actor instanceof Actor) ) return;
    const origin = options?.originatingMessage;
    if ( !(origin instanceof ChatMessage) ) return;
    if ( !listedNames(rebukeEntries()).size ) return;
    const source = origin.getAssociatedActor?.();
    if ( !(source instanceof Actor) || (source.uuid === actor.uuid) ) return;
    const attackHit = isAttackDamage(origin);
    const hitMelee = attackHit && (attackActivityOf(origin)?.attack?.type?.value === "melee");
    // The damage's types, off the card's rolls (a `types` row); a card with none is unreadable and counts.
    const damageTypes = [...new Set((origin.rolls ?? []).map(r => r?.options?.type).filter(Boolean))];
    const becameBloodied = becameBloodiedBy(actor, Number(amount));
    const zone = isZoneDamage(origin);
    void stampRebuke(actor, source, Number(amount), origin, { attackHit, hitMelee, damageTypes, becameBloodied, zone });
    if ( attackHit ) void stampWards(actor, source, Number(amount), origin);
    if ( becameBloodied ) void stampWatchers(actor, source, Number(amount), origin);
  } catch(err) {
    log.error(`The rebuke offer failed — use the reaction from the sheet.`, err);
  }
});

/** Did this damage take the creature from above half its Hit Points to half or fewer, and not to 0 — the Bloodied moment
 * (`judge: "becameBloodied"`)? Read after the damage landed: the Hit Points before are the ones now plus what landed
 * (Temporary Hit Points absorbed are not counted back — a creature they spared never crossed the line). */
function becameBloodiedBy(actor, amount) {
  const hp = actor.system?.attributes?.hp ?? {};
  const now = Number(hp.value) || 0;
  const max = Number(hp.effectiveMax ?? hp.max) || 0;
  if ( !(max > 0) || !(now > 0) || !(now * 2 <= max) ) return false;
  return (now + amount) * 2 > max;
}

/** The Emanations table by row key (a zone card's `key`) and by the item it is cast from (a cast card's item). */
const { rowNamed: emanationRowNamed } = tableIndex(EMANATIONS);
const { rowFor: emanationRowFor } = tableIndex(EMANATIONS, (row, key) => row.item ?? key);

/** Did this damage come from a placed area (decide/rebukes.js `placedAreaDamage`)? The rows its card names, the cards it
 * chains to (a save trigger's damage roll → its demand; three hops at most), and its own item's. */
function isZoneDamage(origin) {
  try {
    const keys = [...zoneKeysOf(origin.flags?.[MODULE_ID])];
    let at = origin;
    for ( let hop = 0; hop < 3; hop++ ) {
      const id = originIdOf(at);
      at = id ? game.messages?.get?.(id) : null;
      if ( !at ) break;
      keys.push(...zoneKeysOf(at.flags?.[MODULE_ID]));
    }
    const item = cardActivity(origin)?.item ?? origin.getAssociatedItem?.() ?? null;
    return placedAreaDamage([...keys.map(k => emanationRowNamed(k)), item ? emanationRowFor(item) : null]);
  } catch(err) {
    log.warn(`Could not tell whether the damage was an area's — offered as a blow.`, err);
    return false;
  }
}

/** Did this damage come from an attack's hit — its card's activity an attack, or chained to one? */
function isAttackDamage(origin) {
  if ( cardActivity(origin)?.type === "attack" ) return true;
  try { return !!resolveAttackMessage(origin); } catch { return false; }
}

/** The attack activity the damage came from: the card's own, or the attack card's it chains to. */
function attackActivityOf(origin) {
  const own = cardActivity(origin);
  if ( own?.type === "attack" ) return own;
  try { return cardActivity(resolveAttackMessage(origin)) ?? null; } catch { return null; }
}

/** THE BLOODIED MOMENT, watched (Bloodthirst): every holder of a `judge: "enemyBloodied"` row on another side than the
 * creature that just became Bloodied, within its reach, is asked — the Bloodied enemy as the reaction's target. */
async function stampWatchers(hurt, dealer, amount, origin) {
  const listed = listedNames(rebukeEntries());
  if ( !Object.entries(REBUKES).some(([name, row]) => (row.judge === "enemyBloodied") && listed.has(lower(name))) ) return;
  const hurtToken = tokenOf(hurt.uuid);
  if ( !hurtToken ) return;
  const seen = new Set();
  for ( const t of canvas.tokens?.placeables ?? [] ) {
    const bearer = t.actor;
    if ( !bearer || seen.has(bearer.uuid) || (bearer.uuid === hurt.uuid) ) continue;
    seen.add(bearer.uuid);
    if ( t.document.disposition === hurtToken.document.disposition ) continue;
    const key = `${origin.id}|${bearer.uuid}|watch`;
    if ( wardsAsked.has(key) ) continue;
    if ( !offersFor(bearer, hurt, { watch: true }).options.length ) continue;
    wardsAsked.add(key);
    await stampRebuke(bearer, hurt, amount, origin, { watch: true, dealerName: dealer?.name ?? null });
  }
}

async function stampRebuke(actor, source, amount, origin, { attackHit = false, hitMelee = false, ward = null, miss = false, missMelee = true, onAttack = false, damageTypes = [], becameBloodied = false, watch = false, dealerName = null, zone = false } = {}) {
  const { distance, options } = offersFor(actor, source, { ward: !!ward, attackHit, hitMelee, miss, missMelee, onAttack, damageTypes, becameBloodied, watch, zone });
  if ( !options.length ) return;
  const window = decisionWindow();
  const flag = {
    status: "pending", actorUuid: actor.uuid, actorName: actor.name,
    sourceUuid: source.uuid, sourceName: source.name, distance, amount, originId: origin.id,
    options, answer: null, choice: null,
    ...(ward ? { ward: true, targetUuid: ward.uuid, targetName: ward.name } : {}),
    ...(miss ? { miss: true } : {}),
    ...(onAttack ? { onAttack: true } : {}),
    ...(watch ? { watch: true, ...(dealerName ? { dealerName } : {}) } : {}),
    ...statContext(source.uuid),
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
  };
  const first = options[0];
  const message = await postCard({
    actor,
    card: bfCard({ img: first.img, eyebrow: `Reaction — ${options.map(o => o.name).join(" / ")}`, tone: "pending",
      title: watch ? `${source.name} is Bloodied` : ward ? `${source.name} hit ${ward.name}` : miss ? `${source.name} missed ${actor.name}` : onAttack ? `${source.name} attacked` : `${source.name} damaged ${actor.name}`,
      subtitle: watch ? `${actor.name}${(distance !== null) ? ` · ${distance} ft away` : ""}${dealerName ? ` · hurt by ${dealerName}` : ""}`
        : ward ? `${actor.name}${(distance !== null) ? ` · ${distance} ft from ${source.name}` : ""}`
        : miss ? `an attack${(distance !== null) ? ` · ${distance} ft away` : ""}`
        : onAttack ? `under ${actor.name}'s ${options[0].name === "Soul of Vengeance" ? "Vow of Enmity" : "mark"}${(distance !== null) ? ` · ${distance} ft away` : ""}`
        : `${amount} damage${(distance !== null) ? ` · ${distance} ft away` : ""}` }),
    flags: { [MODULE_ID]: { [REBUKE_FLAG]: flag } }
  });
  if ( message ) armTimer(message);
}

/* --- C1 — the attack (Soul of Vengeance): the creature under the bearer's mark makes an attack roll, hit or miss --------- */

listen("createChatMessage", "rebukes", async message => {
  try {
    if ( !isActiveGM() || !isCard(message, CARD.attack) ) return;
    if ( readFlag(message, "rebukeFor") ) return;            // a driven attack never chains re-offers
    const listed = listedNames(rebukeEntries());
    const rows = Object.entries(REBUKES).filter(([name, row]) => (row.on === "attack") && listed.has(lower(name)));
    if ( !rows.length ) return;
    const attacker = message.getAssociatedActor?.();
    if ( !(attacker instanceof Actor) ) return;
    // The bearers: whoever placed a listed row's mark on this attacker.
    const bearers = new Map();
    for ( const [, row] of rows ) {
      for ( const e of attacker.effects.filter(e => e.active && (lower(e.name) === lower(row.mark))) ) {
        const bearer = grantingActor(e);
        if ( (bearer instanceof Actor) && (bearer.uuid !== attacker.uuid) ) bearers.set(bearer.uuid, bearer);
      }
    }
    for ( const bearer of bearers.values() ) void stampRebuke(bearer, attacker, 0, message, { onAttack: true });
  } catch(err) {
    log.error(`The attack rebuke offer failed — use the reaction from the sheet.`, err);
  }
});

/* --- the miss (Sticky Shield): a melee weapon attack that MISSED the bearer, stamped by the elect ---- */

listen("createChatMessage", "rebukes", async message => {
  try {
    if ( !isActiveGM() || !isCard(message, CARD.attack) ) return;
    if ( readFlag(message, "rebukeFor") ) return;            // a driven attack never chains re-offers
    const listed = listedNames(rebukeEntries());
    const missRows = Object.entries(REBUKES).filter(([name, row]) => (row.on === "miss") && listed.has(lower(name)));
    if ( !missRows.length ) return;
    const activity = cardActivity(message);
    if ( activity?.type !== "attack" ) return;
    // Sticky Shield's rows want a melee weapon attack; a `missOf: "any"` row (Masterful Shots) any attack roll.
    const missMelee = (activity.attack?.type?.value === "melee") && (activity.item?.type === "weapon");
    if ( !missMelee && !missRows.some(([, row]) => row.missOf === "any") ) return;
    const attacker = message.getAssociatedActor?.();
    if ( !(attacker instanceof Actor) ) return;
    const hitSet = new Set(hitTargets(message).map(t => t.uuid));
    for ( const t of targetsOf(message) ) {
      if ( hitSet.has(t.uuid) ) continue;
      const actor = await resolveUuidAsync(t.uuid);
      if ( !(actor instanceof Actor) || (actor.uuid === attacker.uuid) ) continue;
      void stampRebuke(actor, attacker, 0, message, { miss: true, missMelee });
    }
  } catch(err) {
    log.error(`The miss rebuke offer failed — use the reaction from the sheet.`, err);
  }
});

/** THE WARDS (Sentinel's Guardian): asked of every OTHER holder in reach of the hitter, on another
 * side; one ask per bearer per dealing card. */
const wardsAsked = new Set();
async function stampWards(hurt, source, amount, origin) {
  const listed = listedNames(rebukeEntries());
  if ( !Object.entries(REBUKES).some(([name, row]) => row.ward && listed.has(lower(name))) ) return;
  const seen = new Set();
  for ( const t of canvas.tokens?.placeables ?? [] ) {
    const bearer = t.actor;
    if ( !bearer || seen.has(bearer.uuid) ) continue;
    seen.add(bearer.uuid);
    if ( (bearer.uuid === hurt.uuid) || (bearer.uuid === source.uuid) ) continue;
    const key = `${origin.id}|${bearer.uuid}`;
    if ( wardsAsked.has(key) ) continue;
    if ( !offersFor(bearer, source, { ward: true, attackHit: true }).options.length ) continue;
    wardsAsked.add(key);
    await stampRebuke(bearer, source, amount, origin, { attackHit: true, ward: { uuid: hurt.uuid, name: hurt.name } });
  }
}

/* --- who folds and who keeps the clock: the author, or the GM when the author has gone --------- */


function armTimer(message) {
  armAskTimer(timers, message, REBUKE_FLAG, live => queueFlagWrite(live, REBUKE_FLAG, current => {
    if ( current.status !== "pending" ) return false;
    current.status = "resolved"; current.answer = "pass"; current.timedOut = true; current.answeredAt = Date.now();
  }), { owns: keeperOwns });
}

/* --- the answer ------------------------------------------------------------------------------- */

/** One answer: folded where this client may write, relayed otherwise; a Use drives the use HERE. `pay` the way the
 * player picked to pay a spell (a pill's key, cast-ways.js), the module's own pick when none. */
async function answerRebuke(message, answer, index = null, pay = null) {
  const flag = readFlag(message, REBUKE_FLAG);
  if ( flag?.status !== "pending" ) return;
  const option = (answer === "use") ? flag.options?.[index] : null;
  if ( (answer === "use") && !option ) return;
  if ( keepsMessage(message) ) {
    let claimed = false;
    await queueFlagWrite(message, REBUKE_FLAG, current => {
      if ( current.status !== "pending" ) return false;
      current.status = "resolved"; current.answer = answer; current.choice = option?.name ?? null; current.answeredAt = Date.now();
      claimed = true;
    });
    if ( claimed && option ) await driveRebuke(message, option, pay);
    return;
  }
  // The relay carries the answer to the keeper; the drive runs here at once.
  const actor = resolveUuid(flag.actorUuid);
  await postAnswer("rebukeAnswer", {
    actor,
    card: bfCard({ img: option?.img ?? null, eyebrow: `Reaction — ${option?.name ?? "Rebuke"}`,
      tone: option ? "good" : "neutral", title: rebukeLine({ ...flag, answer, choice: option?.name ?? null }) }),
    flags: { [MODULE_ID]: { rebukeAnswer: { messageId: message.id, answer, choice: option?.name ?? null } } }
  });
  if ( option ) await driveRebuke(message, option, pay);
}

registerRelay("rebukeAnswer", {
  flagKey: REBUKE_FLAG,
  targetOf: a => a.messageId,
  owns: (_flag, target) => keepsMessage(target),
  fold: (current, a) => {
    if ( current.status !== "pending" ) return false;
    current.status = "resolved"; current.answer = a.answer; current.choice = a.choice ?? null; current.answeredAt = Date.now();
  }
});

/** THE DRIVE: the real use at the damager, aimed first so every card names it; the Reaction spent
 * after. An attack row rolls the attack; anything else is the ordinary pipeline's. */
async function driveRebuke(message, option, pay = null) {
  const key = `${message.id}|${option.name}`;
  if ( driving.has(key) ) return;
  driving.add(key);
  try {
    const flag = readFlag(message, REBUKE_FLAG);
    const actor = resolveUuid(flag?.actorUuid);
    const damager = tokenOf(flag?.sourceUuid);
    if ( !(actor instanceof Actor) || !damager ) return;
    const item = actor.items.get(option.itemId);
    await withTargets([damager], async () => {
      let attack = null;
      if ( option.attack === "melee" ) {
        // Retaliation: one melee attack with the weapon last swung (Riposte's pick, lookup.js).
        const choice = preferredMeleeOption(actor, meleeOptions(actor));
        const weapon = choice ? actor.items.get(choice.itemId) : null;
        attack = weapon?.system?.activities?.get(choice.activityId) ?? null;
      } else {
        const activity = item?.system?.activities?.get(option.activityId) ?? null;
        if ( activity?.type !== "attack" ) {
          if ( !activity ) return;
          const data = { data: { flags: { [MODULE_ID]: { rebukeFor: message.id } } } };
          // A spell: paid the way picked while it is left, else the way read NOW (a free cast spent since the offer
          // falls to a slot), cast-ways.js.
          const route = option.spell ? castWayOf(actor, item, activity, { pick: pay }) : null;
          if ( route ) {
            if ( route.way.kind === "none" ) { ui.notifications?.warn(`${actor.name} has no way left to cast ${option.name} (${route.way.why}).`); return; }
            await castBy(route, { message: data });
          } else await activity.use({}, { configure: false }, data);
          return;
        }
        attack = activity;
      }
      if ( !attack ) return;
      // An Opportunity Attack says so on its cards (Sentinel's Guardian): the Halt rider reads it.
      const oa = !!option.opportunity;
      const use = await attack.use({ subsequentActions: false }, { configure: false },
        { data: { flags: { [MODULE_ID]: { rebukeFor: message.id, ...(oa ? { opportunity: true } : {}) } } } });
      const usageId = use?.message?.id ?? null;
      await attack.rollAttack(option.advantage ? { advantage: true } : {}, { configure: false },
        { data: { ...(usageId ? { "system.origin": usageId } : {}), flags: { [MODULE_ID]: { rebukeFor: message.id, ...(oa ? { opportunity: true } : {}) } } } });
    });
    await spendReaction(actor, { origin: item?.uuid ?? null, what: option.name });
  } catch(err) {
    log.error(`${option.name} could not be driven — use it from the sheet.`, err);
  } finally {
    driving.delete(key);
  }
}

/* --- the popup and the card ------------------------------------------------------------------- */

async function showPopup(message) {
  const flag = readFlag(message, REBUKE_FLAG);
  if ( flag?.status !== "pending" ) return;
  const actor = resolveUuid(flag.actorUuid);
  // A spell's ways to pay as pills under its line (cast-ways.js), read off the sheet NOW, the module's pick ticked.
  const pills = flag.options.map((o, i) => {
    if ( !o.spell ) return null;
    const item = actor?.items?.get(o.itemId) ?? null;
    return payPillsFor(actor, item, item?.system?.activities?.get(o.activityId) ?? null, `bf-pay-${i}`, { head: WAYS_HEAD });
  });
  const lines = flag.options.flatMap((o, i) => [
    `<strong>${esc(o.name)}</strong> · ${esc(pills[i] ? "a Reaction" : o.cost)} · reach ${o.reach} ft`,
    ...(pills[i] ? [pills[i].html] : []),
    ruleLine(REBUKES[o.name]?.rule ?? ""), ...(REBUKES[o.name]?.caveat ? [`<em>${esc(REBUKES[o.name].caveat)} — the table's call</em>`] : [])]);
  await openMomentPopup(message, REBUKE_FLAG, actor, {
    title: `Reaction — ${flag.actorName}`, icon: "fa-solid fa-bolt",
    content: bfCard({ img: flag.options[0]?.img ?? null, eyebrow: `Reaction — ${flag.options.map(o => o.name).join(" / ")}`, tone: "pending",
      title: flag.watch ? `${flag.sourceName} is Bloodied — strike?` : flag.ward ? `${flag.sourceName} hit ${flag.targetName} — strike?` : flag.onAttack ? `${flag.sourceName} attacked — strike?` : flag.miss ? `${flag.sourceName} missed you — answer?` : `${flag.sourceName} damaged you — answer?`,
      subtitle: flag.watch ? `${flag.sourceName} is ${flag.distance} ft from you`
        : flag.ward ? `${flag.sourceName} is ${flag.distance} ft from you — an Opportunity Attack`
        : `${flag.amount} damage${(flag.distance !== null) ? ` · ${flag.distance} ft away` : ""}`, lines })
      + holdBarHTML(flag, "to answer"),
    buttons: [
      ...flag.options.map((o, i) => ({ action: `use-${i}`, label: o.name, default: i === 0,
        callback: (_event, button) => { void answerRebuke(message, "use", i, pills[i] ? picked(button?.form, `bf-pay-${i}`) : null); } })),
      { action: "pass", label: "Pass", callback: () => { void answerRebuke(message, "pass"); } }
    ]
  });
}

listen("dnd5e.renderChatMessage", "rebukes", (message, html) => {
  try {
    const flag = readFlag(message, REBUKE_FLAG);
    if ( !flag ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-rebuke-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-rebuke-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-bolt" data-tooltip="Reaction"></i> ${esc(rebukeLine(flag))}`;
    // B4 — `follow` (Misty Escape's Steps): once the answer is driven, the feature's follow-up activities as buttons, the pick the owner's.
    const used = (flag.status === "resolved") && (flag.answer === "use") ? (flag.options ?? []).find(o => o.name === flag.choice) : null;
    if ( used?.follow?.length && !flag.followed ) {
      const actor = resolveUuid(flag.actorUuid);
      const item = actor?.items?.get(used.itemId) ?? null;
      if ( item && canAnswerFor(actor) ) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:0.35rem;align-items:center;margin-top:0.3rem;flex-wrap:wrap;";
        const label = document.createElement("span");
        label.style.opacity = "0.8";
        label.textContent = `${used.name} — then:`;
        row.appendChild(label);
        for ( const name of used.follow ) {
          const act = activityNamed(item, name);
          if ( !act ) continue;
          row.appendChild(momentButton(name, () => void (async () => {
            await act.use({}, { configure: false }, {});
            if ( message.canUserModify?.(game.user, "update") ) await queueFlagWrite(message, REBUKE_FLAG, current => { current.followed = name; });
          })().catch(err => log.error(`${name} could not be used — use it from the sheet.`, err))));
        }
        div.appendChild(row);
      }
    } else if ( flag.followed ) {
      div.insertAdjacentHTML("beforeend", ` · ${esc(flag.followed)}`);
    }
    if ( flag.status === "pending" ) {
      const may = canAnswerFor(resolveUuid(flag.actorUuid));
      pendingRow(message, div, {
        bar: holdBarHTML(flag, "to answer"),
        latch: may && { sub: REBUKE_FLAG, show: () => showPopup(message) },
        answer: may && "Answer",
        arm: armTimer
      });
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The rebuke line could not render.`, err); }
});

// An answer anywhere closes the popup everywhere (law 4); the clock stands down with it.
listen("updateChatMessage", "rebukes", message => {
  const flag = readFlag(message, REBUKE_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armTimer(message); return; }
  disarmAskTimer(timers, message.id);
  void closePopup(message, REBUKE_FLAG);
});

listen("deleteChatMessage", "rebukes", message => { disarmAskTimer(timers, message.id); });
