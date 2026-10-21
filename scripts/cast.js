/**
 * By the Books — the cast path: the caster's flow elect lands a stamped cast's utility effects and
 * healing, with receipts, and asks the caster's EFFECT_CHOICES pick.
 */
import { MODULE_ID, readFlag, TITLE, canAnswerFor, canApplyTo, drivesMomentFor, queueFlagWrite, whisperNoGM, resolveUuid, writableTargets, log } from "./core.js";
import { activityNamed, cardActivity, cardItem, featureNamed, lower, namesAnswering } from "./lookup.js";
import { chipData, damagePartsOf, statSourceOf } from "./shared.js";
import { bfCard, esc, ruleLine } from "./decide/present.js";
import { effectsAfterChoice, effectsAfterPick, slotHours } from "./decide/choices.js";
import { EFFECT_CHOICES, HEAL_REROLLS, MARK_USES, SLOT_DURATIONS, TOKEN_LIGHTS, healRerollEntries, listedNames, tokenLightEntries } from "./decide/registry.js";
import { lightAdopts, lightItemNames } from "./decide/token-lights.js";
import { rollMaximum } from "./decide/damage-dice.js";
import { registerResumable, pendingRow, closePopup } from "./ui.js";
import { openPicker } from "./gallery.js";
import { applyDamagesWithReceipt, hasReceipt } from "./auto-apply.js";
import { applyEffectsWithReceipt, effectReceiptOf } from "./effect-riders.js";
import { SURFACES } from "./surfaces.js";
import { activityUuidOf, targetsOf } from "./decide/card.js";
import { listen } from "./dispatch.js";

// Auto-apply on cast (ARCHITECTURE.md §6). The STAMP is the trigger, never the setting: `castApply` and
// `healPending` are stamped at preCreate, so an old log re-rendered is inert. Left out on purpose: save
// activities (their cards are load-bearing), bare damage (Magic Missile is the negate hold's seam), and
// enchant/summon/forward.

async function executeCastApply(message) {
  try {
    const payload = readFlag(message, "castApply");
    if ( !payload?.targets?.length ) return;
    if ( effectReceiptOf(message)?.castDone ) return;
    // Through the CARD: a consumed item (a potion) lives on only in the card's snapshot.
    const activity = cardActivity(message, payload.activityUuid);
    // dnd5e 6: the list holds PROFILES; the effects resolve asynchronously.
    const applicable = (await activity?.getApplicableEffects?.()) ?? [];
    const row = payload.choice?.key ? EFFECT_CHOICES[payload.choice.key] : null;
    const names = row?.picks ? effectsAfterPick(applicable.map(e => e.name), row, payload.choice)
      : effectsAfterChoice(applicable.map(e => e.name), payload.choice ?? null);
    if ( names === null ) return;   // pending — the caster's popup is open on their client
    const wanted = new Set(names.map(n => String(n).toLowerCase()));
    const effects = lookedAs(row, applicable.filter(e => wanted.has(String(e.name).toLowerCase()) && !lightAdopted(activity, e)));
    if ( !effects.length ) return;
    // Apply what this client MAY; the driver is told the rest (core.js "THE FLOW ELECT"). The marker
    // still writes, so a rejoining GM re-pays nothing.
    const writable = writableTargets(payload.targets);
    const blocked = payload.targets.filter(t => !writable.includes(t));
    if ( blocked.length ) {
      await whisperNoGM(`${effects.map(e => e.name).join(", ")} on ${blocked.map(t => t.name).join(", ")}`,
        "The card stands — put the effect on by hand.");
    }
    // The caster's concentration effect, for origin linkage; a mark's move begins none and joins the standing one.
    const move = isMarkMove(activity);
    const concentration = payload.concentration
      ? (activity?.actor?.effects.get(payload.concentration) ?? null)
      : (move ? standingConcentration(activity) : null);
    if ( move && concentration ) await liftEarlierMarks(concentration, activity.item, writable);
    const clock = await slotClock(activity, concentration, payload.spellLevel, move);
    await applyEffectsWithReceipt(message, effects, writable, {
      clock,
      concentration, scaling: payload.scaling ?? 0,
      spellLevel: payload.spellLevel ?? undefined,
      marker: "castDone",
      source: statSourceOf(message), // the data-plane stamp — the caster's own usage card
      activity // the one resolved above — live, or the card's snapshot of a used-up item
    });
  } catch(err) {
    log.error(`Cast auto-apply failed.`, err);
  }
}

/** A token light adopts this use's own effect of the spell's name (token-lights.js lands it, carrying the light), so the cast leaves it. */
function lightAdopted(activity, effect) {
  const itemName = activity?.item ? namesAnswering([activity.item], lightItemNames(TOKEN_LIGHTS))[0] : null;
  return !!lightAdopts(TOKEN_LIGHTS, { itemName, activityName: activity?.name, activityType: activity?.type,
    effectName: effect?.name, effectType: effect?.type }, listedNames(tokenLightEntries()));
}

/** A row's look (EFFECT_CHOICES `img`, `says` — Hex): each effect drawn and told as the row says, under its own id, so
 * the copy is still the pack effect's (a refresh finds it, the rider reads its item). */
function lookedAs(row, effects) {
  if ( !row?.img && !row?.says ) return effects;
  return effects.map(e => new ActiveEffect.implementation({ ...e.toObject(),
    ...(row.img ? { img: row.img } : {}), ...(row.says ? { description: `<p>${esc(row.says)}</p>` } : {}) }, { parent: e.parent }));
}

/**
 * A longer Concentration at a higher slot (SLOT_DURATIONS — Hex at level 3: 8 hours): the cast's effects take the step's
 * hours, and so does the caster's Concentration; a move's effects take the standing Concentration's own clock. Null:
 * the pack's duration stands.
 */
async function slotClock(activity, concentration, spellLevel, move) {
  const steps = SLOT_DURATIONS[Object.keys(SLOT_DURATIONS).find(k => lower(k) === lower(activity?.item?.name)) ?? ""] ?? null;
  if ( !steps ) return null;
  if ( move ) {
    const src = concentration?._source;
    return src ? { duration: { ...(src.duration ?? {}), expired: false }, start: foundry.utils.deepClone(src.start ?? {}) } : null;
  }
  const hours = slotHours(steps, spellLevel);
  if ( !hours ) return null;
  const duration = { value: hours * 3600, units: "seconds" };
  if ( concentration?.isOwner ) await concentration.update({ duration }).catch(err => log.warn(`${activity.item.name}'s Concentration kept its base clock — set it by hand.`, err));
  return chipData({ duration });
}

/** The mark spell's move (MARK_USES `move`: Move Hex, Move Mark): it begins no Concentration of its own. */
function isMarkMove(activity) {
  const uses = MARK_USES[activity?.item?.system?.identifier ?? ""];
  return !!uses && (lower(activity?.name) === lower(uses.move));
}

/** The caster's standing Concentration on this activity's item, or null. */
const standingConcentration = activity => activity?.actor?.effects?.find(e => e.statuses?.has?.("concentrating")
  && (e.getFlag?.("dnd5e", "item")?.id === activity.item?.id)) ?? null;

/** A moved mark leaves where it was: the item's effects that hang on the Concentration, on any creature not newly marked. */
async function liftEarlierMarks(concentration, item, targets) {
  const keep = new Set(targets.map(t => t.uuid));
  for ( const dependent of concentration.getDependents?.() ?? [] ) {
    const bearer = dependent?.parent;
    if ( !(dependent instanceof ActiveEffect) || !(bearer instanceof Actor) || keep.has(bearer.uuid) ) continue;
    if ( (dependent.system?.origin?.item ?? null) !== item?.uuid ) continue;
    if ( !canApplyTo(bearer) ) continue;
    await dependent.delete().catch(err => log.warn(`The earlier ${item.name} on ${bearer.name} could not be lifted — remove it by hand.`, err));
  }
}

// ⚠ A CLAIM ON THE HEALING: it waits on the Healer's rerolls (heal-rerolls.js) so it lands ONCE, as
// auto-apply.js EITHER_WAITS does for damage.
const HEAL_REROLL_WAITS = new Set(["due", "pending", "answering"]);
const healRerollWaits = message => HEAL_REROLL_WAITS.has(readFlag(message, "healReroll")?.status);

async function applyCastHealing(message) {
  try {
    if ( hasReceipt(message) ) return; // applied (or reverted) already
    if ( healRerollWaits(message) ) return;               // the Healer's answer first (the claim above)
    // A SELF-aimed heal carries its target on the stamp; the dnd5e snapshot is incidental there.
    const stamp = readFlag(message, "healPending");
    const targets = stamp?.selfAim
      ? [{ uuid: stamp.uuid, name: stamp.name }]
      : targetsOf(message).map(t => ({ uuid: t.uuid, name: t.name }));
    if ( !targets.length ) return;
    const damages = damagePartsOf(message.rolls);
    if ( !damages.length ) return;
    // A target wearing a `max` row's effect (Beacon of Hope's Hopeful) is healed the roll's maximum; a CASTER's `max` row
    // (Supreme Healing, D1) raises every target of its spell or Channel Divinity.
    const casterMax = casterMaxRow(message);
    // RAVENLOFT — an `atZero` caster row (Return to Life) raises the dice only for a creature at 0 Hit Points.
    const atZero = casterMax ? !!HEAL_REROLLS[casterMax]?.atZero : false;
    const zeroHp = uuid => { const s = resolveUuid(uuid); const a = (s instanceof Actor) ? s : (s?.actor ?? null); return !(Number(a?.system?.attributes?.hp?.value ?? 1) > 0); };
    const raised = targets.filter(t => (casterMax && (!atZero || zeroHp(t.uuid))) || maxRowOn(t.uuid));
    const plain = targets.filter(t => !raised.includes(t));
    if ( plain.length ) await applyDamagesWithReceipt(message, plain, damages, { note: "Healing" });
    if ( raised.length ) {
      const maxed = (message.rolls ?? []).map(r => {
        const json = r.toJSON();
        return { value: rollMaximum(json), type: r.options?.type ?? "healing", properties: new Set(r.options?.properties ?? []) };
      }).filter(p => p.value > 0);
      for ( const t of raised ) {
        await applyDamagesWithReceipt(message, [t], maxed, { note: `Healing — ${casterMax ?? maxRowOn(t.uuid)} — the maximum` });
      }
    }
  } catch(err) {
    log.error(`Healing auto-apply failed.`, err);
  }
}

/** D1 — the listed `caster` `max` row the HEALER holds (Supreme Healing), by key, when the healing is a spell's or a Channel
 * Divinity's (the item, or the Channel Divinity uses its activity consumes), else null. */
function casterMaxRow(message) {
  const actor = message?.getAssociatedActor?.() ?? null;
  if ( !(actor instanceof Actor) ) return null;
  const activity = cardActivity(message, activityUuidOf(message));
  const item = activity?.item ?? null;
  if ( !item ) return null;
  const channel = actor.items.find(i => (i.type === "feat") && ((i.system?.identifier === "channel-divinity") || (lower(i.name) === "channel divinity")));
  const viaChannel = !!channel && ((item.id === channel.id)
    || (activity.consumption?.targets ?? []).some(c => (c.type === "itemUses") && c.target && ((c.target === channel.id) || String(c.target).endsWith(".phbclcChannelDiv"))));
  if ( (item.type !== "spell") && !viaChannel ) return null;
  const listed = listedNames(healRerollEntries());
  for ( const [key, row] of Object.entries(HEAL_REROLLS) ) {
    if ( !row.max || !row.caster || !listed.has(lower(key)) ) continue;
    if ( featureNamed(actor, key) ) return key;
  }
  return null;
}

/** The listed `max` row whose effect stands on this creature (HEAL_REROLLS — Beacon of Hope), by key, or null. */
function maxRowOn(uuid) {
  const subject = resolveUuid(uuid);
  const actor = (subject instanceof Actor) ? subject : (subject?.actor ?? null);
  if ( !(actor instanceof Actor) ) return null;
  const listed = listedNames(healRerollEntries());
  for ( const [key, row] of Object.entries(HEAL_REROLLS) ) {
    if ( !row.max || !row.effect || !listed.has(lower(key)) ) continue;
    if ( actor.effects.some(e => !e.disabled && (lower(e.name) === lower(row.effect))) ) return key;
  }
  return null;
}

// The CASTER's flow elect drives these (ARCHITECTURE §3, the driver table); the answered choice is the
// one update that resumes a cast.
const castSubject = message => message?.getAssociatedActor?.()?.uuid ?? null;
registerResumable("castApply", {
  pending: (flag, _message, cause) => (cause !== "update") || !!flag.choice?.chosen,
  drives: (_flag, message) => drivesMomentFor(castSubject(message)),
  drive: executeCastApply
});
registerResumable("healPending", {
  // An update resumes it only as the Healer's claim settles (heal-rerolls.js writes its status here).
  pending: (_flag, message, cause) => (cause !== "update")
    || (!!readFlag(message, "healReroll") && !healRerollWaits(message) && !hasReceipt(message)),
  drives: (_flag, message) => drivesMomentFor(castSubject(message)),
  drive: applyCastHealing
});

// THE CHOICE (EFFECT_CHOICES): the popup opens on the caster's client and the answer folds onto the
// caster's own card; no clock — the card's button reopens it.

async function chooseEffect(card, name) {
  const payload = readFlag(card, "castApply");
  const choice = payload?.choice;
  if ( !choice || choice.chosen || !choice.options?.includes(name) ) return;
  let won = false;
  await queueFlagWrite(card, "castApply", current => {
    if ( !current.choice || current.choice.chosen ) return false;
    current.choice.chosen = name;
    current.choice.answeredAt = Date.now();
    won = true;
  });
  if ( won ) await afterPick(card, payload, name);
}

/** What a `picks` row does beyond the cast's own effects, on the caster's client: the form chip kept, or the
 * feature's activity of that name used (its card lands its own effect). */
async function afterPick(card, payload, name) {
  const key = payload.choice.key;
  const row = EFFECT_CHOICES[key];
  const actor = resolveUuid(payload.targets?.[0]?.uuid ?? null) ?? card.getAssociatedActor?.() ?? null;
  if ( !row || !(actor instanceof Actor) || !actor.isOwner ) return;
  try {
    if ( row.chip ) await writeChoiceChip(actor, cardItem(card), key, name);
    if ( row.use ) {
      const activity = activityNamed(featureNamed(actor, key), name);
      if ( activity ) await activity.use({ subsequentActions: false }, { configure: false });
      else ui.notifications?.warn(`${TITLE}: ${key} — no "${name}" on ${actor.name}'s sheet; use it by hand.`);
    }
  } catch(err) {
    log.error(`${key} — the ${name} pick could not land; use it from the sheet.`, err);
  }
}

/** The pick kept as a form chip (clock-riders.js's `formChip`, keyed by the row), for the item's own clock. */
async function writeChoiceChip(actor, item, key, name) {
  const stale = actor.effects.filter(e => readFlag(e, "formChip")?.choice === key);
  if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id)).catch(() => {});
  const base = item?.effects?.find(e => lower(e.name) === lower(key)) ?? null;
  await ActiveEffect.implementation.create({
    name: `${key}: ${name}`, img: item?.img ?? "icons/svg/aura.svg",
    description: `<p>Written by By the Books when ${esc(name)} was chosen: the form stands while this does. It ends with ${esc(key)}.</p>`,
    origin: item?.uuid ?? null, disabled: false, transfer: false,
    duration: base ? { ...(base._source?.duration ?? {}) } : {},
    flags: { [MODULE_ID]: { formChip: { choice: key, form: lower(name) } } }
  }, { parent: actor });
}

async function showChoicePopup(card) {
  const payload = readFlag(card, "castApply");
  const choice = payload?.choice;
  if ( !choice || choice.chosen ) return;
  const actor = chooserOf(card, payload);
  const short = sharedPrefix(choice.options);
  const n = choice.options.length;
  // the picker every popup of the module draws (gallery.js): the options as one even grid of radios, the rule under its
  // tick, Apply and Not now
  await openPicker(card, "effectChoice", actor, {
    title: `${choice.key} — ${actor?.name ?? ""}`, icon: "fa-solid fa-code-branch", width: 420,
    card: { eyebrow: `Cast — ${choice.key}`, title: choice.ask ?? "Which effect?" },
    sections: [{ field: "bf-effect-pick", columns: (n > 4) ? 3 : n,
      pills: choice.options.map(name => ({ value: name, label: name.slice(short) })) }, { rule: choice.rule }],
    needs: [{ field: "bf-effect-pick", why: "pick one first" }],
    buttons: [
      { action: "apply", label: "Apply", default: true, checks: true, submit: picks => void chooseEffect(card, picks.one("bf-effect-pick")) },
      { action: "cancel", label: "Not now" }
    ]
  });
}

/** Who picks: the caster (its card's actor), else the first target (a self cast's). A curse on a foe is the caster's pick. */
const chooserOf = (card, payload) => card.getAssociatedActor?.()
  ?? (payload.targets?.[0]?.uuid ? resolveUuid(payload.targets[0].uuid) : null);

/** The length of a word prefix every option shares ("Hexed "), so a button reads "Strength"; 0 when none. */
function sharedPrefix(options) {
  if ( (options?.length ?? 0) < 2 ) return 0;
  const words = options.map(o => String(o).split(" "));
  let n = 0;
  while ( words.every(w => (w.length > n + 1) && (w[n] === words[0][n])) ) n++;
  return n ? (words[0].slice(0, n).join(" ").length + 1) : 0;
}

// The pick, made on any client, withdraws the effect choice's popup on this one (§5 law 4): every GM screen may hold one for an unowned subject, and the latch is per client.
listen("updateChatMessage", "cast", message => {
  if ( readFlag(message, "castApply")?.choice?.chosen ) void closePopup(message, "effectChoice");
});

listen("dnd5e.renderChatMessage", "cast", (message, html) => {
  const payload = readFlag(message, "castApply");
  const choice = payload?.choice;
  if ( !choice ) return;
  // the system's tray would land every alternative by hand: the pick is the one path (an `on` row's trigger keeps it)
  if ( !choice.free ) html.querySelector(SURFACES.effectTray)?.remove();
  const short = sharedPrefix(choice.options);
  const line = document.createElement("div");
  line.innerHTML = bfCard({ eyebrow: `Cast — ${choice.key}`, tone: choice.chosen ? "good" : "pending",
    title: choice.chosen ? `${choice.chosen}` : (choice.ask ?? "Which effect?"),
    subtitle: choice.chosen ? "the caster's choice" : choice.free ? `pick one — ${choice.options.map(o => o.slice(short)).join(", ")}`
      : "the cast waits for the pick",
    lines: [ruleLine(choice.rule)] });
  html.querySelector(SURFACES.messageContent)?.appendChild(line);
  if ( choice.chosen ) return;
  if ( !canAnswerFor(chooserOf(message, payload)) ) return;
  pendingRow(message, line, { latch: { sub: "effectChoice", show: () => showChoicePopup(message) }, answer: `Choose — ${choice.key}` });
});

