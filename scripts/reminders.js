/**
 * By the Books — The gate machine: what bends this attack, save or check, and what it nets to,
 * BEFORE the dice; plus the attack's cover (measured, or ignored by a feat). EDGE layer
 * (ARCHITECTURE.md §7). RULINGS *The gate before the roll*.
 */
import { MODULE_ID, readFlag, activeCombatFor, statContext, sheetModeEffects, rollLabelFor, canApplyTo, whisperNoGM, resolveUuid, log } from "./core.js";
import { featureNamed, isWorn, lower, namesAnswering } from "./lookup.js";
import { damagedSince } from "./decide/turn-grants.js";
import { conditionEntries, effectEntries, reminderEntries } from "./decide/registry.js";
import { chipSpentOnRecord, grantingActor, turnChitStands, chipKindOf, effectSourceUuid, metamagicOf, savesOf } from "./shared.js";
import { DialogCarried, cardRow, markDefaultButton, pendingDemandsFor, postCard, pickInputs } from "./ui.js";
import { bfCard, reminderFieldsetHTML, ruleLine, sneakBoxHTML, TONE, esc } from "./decide/present.js";
import { chipIsDead, chipOwnedBy, rollModeOf } from "./decide/chips.js";
import { CHECK_BENDS, CONDITION_BENDS, CROSSBOWS, EFFECT_BENDS, EMANATIONS, MASTERY_RULES, RANGE_FEATS, RANGE_RULES, SAVE_BENDS, SNEAK_ATTACK, tableIndex } from "./decide/registry.js";
import { askDefaults, circleBend, creatureTypeOf } from "./decide/emanations.js";
import { tokensInRegions, tokenOf } from "./geometry.js";
import { parseDice, sneakConditionsHold, sneakWeaponQualifies } from "./decide/sneak.js";
import { CARD, itemNameOf, originIdInData, rollKindInData } from "./decide/card.js";
import { carriedCover, feetOf, measuredCoverBetween, nearestFeet, tokensOverlap } from "./geometry.js";
import { CARRIED_CAUSE, COVER_DEGREES, coverAtTheAttack, coverStanding, degreeOfBonus } from "./decide/cover.js";
import { SURFACES } from "./surfaces.js";
import { REMINDER_FLAG, checkGate, checkSources, conditionSources, sightOf, demandBendSources, effectCheckSources, effectSaveSources, effectSources, modeSources, modeTitle, netMode, proneSources, rangeSources,
  reminderRecord, reminderSource, reminderView, rolledWith, saveGate, saveSources, rangeFeatsFor, reachedRange, acWithoutCover, forgoneSources } from "./decide/reminders.js";
import { listen } from "./dispatch.js";
import { receiptEntries } from "./auto-apply.js";

/** The names a sheet's feats are read in: the feature rows of the effect table, and the range feats. */
const EFFECT_FEATURE_KEYS = Object.entries(EFFECT_BENDS).filter(([, r]) => r.match === "feature")
  .flatMap(([k, r]) => (r.named ? [k, r.named] : [k]));
const RANGE_FEAT_KEYS = Object.keys(RANGE_FEATS);
/** The items the effect table's `item` discriminator names. */
const EFFECT_ITEM_KEYS = [...new Set(Object.values(EFFECT_BENDS).map(r => r.item).filter(Boolean))];

/** The DMG — the effect table's `worn` rows: a magic item equipped (and attuned) carries them as a feature would. */
const EFFECT_WORN_KEYS = Object.entries(EFFECT_BENDS).filter(([, r]) => r.match === "worn").map(([k]) => k);
/** The actor's feats in the effect table's words, and its worn items answering a `worn` row. */
const featuresOf = actor => [...namesAnswering(actor.items.filter(i => i.type === "feat"), EFFECT_FEATURE_KEYS),
  ...(EFFECT_WORN_KEYS.length ? namesAnswering(actor.items.filter(i => (i.type !== "feat") && (i.type !== "spell") && isWorn(i)), EFFECT_WORN_KEYS)
    .filter(n => EFFECT_WORN_KEYS.includes(n)) : [])];

/** The DMG — Cloak of Displacement's facts: damage taken since the bearer's OWN last turn start (the receipts), its Speed 0. */
function displacedFacts(actor) {
  const combat = actor ? (game.combats?.find?.(c => c.started && c.combatants.some(x => x.actor?.uuid === actor.uuid)) ?? null) : null;
  let damaged = false;
  if ( combat ) {
    const idx = combat.turns.findIndex(c => c.actor?.uuid === actor.uuid);
    if ( idx >= 0 ) {
      // Its most recent turn start: this round's if its turn has come, else the last round's.
      const startRound = (combat.turn >= idx) ? combat.round : (combat.round - 1);
      const entries = game.messages.contents.flatMap(m => receiptEntries(m));
      const types = Object.keys(CONFIG.DND5E?.damageTypes ?? {});
      damaged = damagedSince({ entries, uuid: actor.uuid, combatId: combat.id, round: startRound + 1, turn: idx, types }).blocked;
    }
  }
  const walk = Number(actor?.system?.attributes?.movement?.walk ?? 1);
  const held = ["grappled", "restrained", "paralyzed", "petrified", "stunned", "unconscious"].some(s => actor?.statuses?.has?.(s));
  const suppressed = (actor?.appliedEffects ?? []).some(e => !e.disabled && (lower(e.name) === "displacement suppressed"));
  return { undamaged: !damaged, speedZero: (walk === 0) || held, displacementOff: suppressed };
}

/** D1 — the `allies` feature rows (Improved Duplicity) another creature of the attacker's side holds on its scene: read as the
 * attacker's own, so the gate lists them for every ally's attack. */
const ALLY_FEATURE_KEYS = Object.entries(EFFECT_BENDS).filter(([, r]) => (r.match === "feature") && r.allies).map(([k]) => k);
function alliedFeaturesOf(attacker, attackerToken) {
  const scene = attackerToken?.document?.parent ?? attackerToken?.scene ?? canvas?.scene ?? null;
  if ( !ALLY_FEATURE_KEYS.length || !scene || !attackerToken ) return [];
  const side = attackerToken.document?.disposition ?? attackerToken.disposition;
  const out = new Set();
  for ( const t of scene.tokens ) {
    const actor = t.actor;
    if ( !actor || (actor.uuid === attacker.uuid) || (t.disposition !== side) ) continue;
    for ( const key of namesAnswering(actor.items.filter(i => i.type === "feat"), ALLY_FEATURE_KEYS) ) if ( ALLY_FEATURE_KEYS.includes(key) ) out.add(key);
  }
  return [...out];
}
/** The features a save row reads off an effect's SOURCE (`saves.sourceFeature` — Eldritch Hex), and the effects that ask. */
const SOURCE_FEATURE_KEYS = [...new Set(Object.values(EFFECT_BENDS).map(r => r.saves?.sourceFeature).filter(Boolean))];
const SOURCE_FEATURE_ROWS = new Set(Object.entries(EFFECT_BENDS).filter(([, r]) => r.saves?.sourceFeature).map(([k, r]) => String(r.named ?? k).toLowerCase()));
const sourceFeaturesOf = e => {
  if ( !SOURCE_FEATURE_ROWS.has(String(e.name ?? "").toLowerCase()) ) return [];
  const source = resolveUuid(effectSourceUuid(e) ?? "");
  return (source instanceof Actor) ? namesAnswering(source.items.filter(i => i.type === "feat"), SOURCE_FEATURE_KEYS) : [];
};
/** The roller's effects as the save gate reads them (B2: statuses, the source, the source's features). */
const saveEffectFacts = actor => actor.effects.filter(e => !e.disabled).map(e => ({ id: e.id, name: e.name,
  statuses: [...(e.statuses ?? [])], sourceUuid: effectSourceUuid(e), sourceHas: sourceFeaturesOf(e),
  member: !!readFlag(e, "emanation") }));

/* THE ATTACK GATE: one fieldset in dnd5e's Attack Roll dialog, default button on the net; re-judged
 * on every re-render and re-target. ⚠ FORCED open: dnd5e applies fast-forward keys AFTER the pre-roll
 * hooks (`dialog.configure ??=`). A caller's `configure: false` is never touched. */

/** Does the attack mode make the roll ranged — a weapon thrown, or the `ranged` mode? */
const modeIsRanged = attackMode => (attackMode === "ranged") || String(attackMode ?? "").startsWith("thrown");

/** The Distant Spell range a roll's originating card carries, in feet, or null. */
function distantRangeOn(message) {
  try {
    const data = message?.data ?? {};
    const id = originIdInData(data);
    const feet = id ? metamagicOf(game.messages.get(id))?.rangeFeet : null;
    return Number.isFinite(Number(feet)) && (Number(feet) > 0) ? Number(feet) : null;
  } catch { return null; }
}

/** The dialogs standing with a gate in them, re-judged on a re-target. */
const openGates = new Set();

listen("dnd5e.preRollAttack", "reminders", (config, dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "attack" ) return;
    if ( dialog?.configure === false ) return;       // no dialog, no gate
    const attacker = activity.item?.actor;
    if ( !(attacker instanceof Actor) ) return;
    if ( !reminderEntries().length ) return;
    const rangeFeet = distantRangeOn(message);
    const judge = attackMode => ({ ...judgeRoll(attacker, { activity, attackMode, rangeFeet }), attackMode: attackMode ?? null });
    const first = judge(config.attackMode);
    // Carried even when empty, so a dropdown change can grow a box. ⚠ A DialogCarried: dnd5e
    // deep-clones dialog options, so a plain object would arrive as a COPY.
    const gate = new DialogCarried({ ...first, attackerUuid: attacker.uuid, judge });
    dialog.options ??= {};
    dialog.options.bfReminder = gate;
    config.bfReminder = gate;
    // A Sneak Attack to offer forces the dialog open too: the tick is a choice the roller must see.
    if ( !first.sources.length && !first.sneak ) return;
    dialog.configure = true;
    dialog.options.defaultButton = first.net;
  } catch(err) {
    log.error(`Reminder gate failed — rolling natively.`, err);
  }
});

/* THE PLUS (B3, Sundered): a flat bonus to the roll AT a target carrying a `plus` row — pushed onto the roll's parts here,
 * dialog or none, for the targets the attack has NOW (a re-target inside the dialog does not re-push: RULINGS *Where the
 * table bends the rule*); the chip is spent by the roll (chip-spend.js). */
listen("dnd5e.preRollAttack", "reminders", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "attack" ) return;
    const attacker = activity.item?.actor;
    if ( !(attacker instanceof Actor) || !reminderEntries().length ) return;
    const judged = judgeRoll(attacker, { activity, attackMode: config.attackMode, rangeFeet: distantRangeOn(message) });
    const plus = (judged?.sources ?? []).filter(s => Number.isFinite(Number(s.plus)) && (Number(s.plus) !== 0));
    if ( !plus.length ) return;
    const roll = config.rolls?.[0];
    if ( !Array.isArray(roll?.parts) ) return;
    for ( const s of plus ) roll.parts.push(String(s.plus));
  } catch(err) {
    log.error(`The attack's plus could not be added — add it by hand.`, err);
  }
});

/** The range feats (RANGE_FEATS) this attack meets: the attacker's feats against the attack's kind. */
function rangeFeatsOf(attacker, activity) {
  const item = activity?.item;
  const weapon = item?.type === "weapon";
  const kind = item?.system?.type?.value ?? "";
  return rangeFeatsFor(namesAnswering(attacker?.items?.filter(i => i.type === "feat") ?? [], RANGE_FEAT_KEYS), {
    // a Ranged weapon by its KIND (simpleR, martialR): a dart thrown is one, a dagger thrown is not
    rangedWeapon: weapon && /R$/.test(kind),
    spell: activity?.attack?.type?.classification === "spell",
    crossbow: weapon && CROSSBOWS.includes(item?.system?.type?.baseItem)
  }, RANGE_FEATS);
}

/* Cover at the attack, per recorded target: MEASURED cover raises the recorded AC over the carried
 * cover (RULINGS *Measured cover*), then a BYPASS feat records the AC without it. */
listen("dnd5e.preRollAttack", "reminders", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "attack" ) return;
    const attacker = activity.item?.actor;
    const targets = message?.data?.system?.targets;
    if ( !(attacker instanceof Actor) || !Array.isArray(targets) || !targets.length ) return;
    const from = tokenOf(attacker);
    const feat = reminderEntries().some(e => e.kind === "range") ? rangeFeatsOf(attacker, activity).cover : null;
    if ( !from && !feat ) return;
    const measured = [], ignored = [];
    for ( const t of targets ) {
      const actor = t?.actor ? resolveUuid(t.actor) : null;
      const name = t?.name ?? actor?.name ?? "";
      // The card names the cover on every attack; a hand-set status that wins is the one named.
      if ( (t?.ac === null) || (t?.ac === undefined) ) {
        if ( from && actor?.statuses?.has?.("coverTotal") ) measured.push({ name, key: "total", label: degreeOfBonus(null).label, bonus: null, cause: CARRIED_CAUSE });
        continue;
      }
      let carried = carriedCover(actor);
      const token = from ? (resolveUuid(t.token)?.object ?? tokenOf(actor?.uuid)) : null;
      const m = token ? measuredCoverBetween(from, token) : null;
      if ( m ) {
        // the row says what stands and why, as the hover card does (decide/cover.js `coverStanding`)
        const { degree: stands, cause } = coverStanding(carried, m);
        const { raise, total } = coverAtTheAttack(carried, m.degree);
        if ( total ) { t.ac = null; measured.push({ name, key: stands.key, label: stands.label, bonus: null, cause }); continue; }
        if ( raise ) { t.ac = Number(t.ac) + raise; carried += raise; }
        // No Cover draws no row
        if ( stands.key !== "none" ) measured.push({ name, key: stands.key, label: stands.label, bonus: stands.bonus, cause });
      }
      if ( !feat || !carried ) continue;
      t.ac = acWithoutCover(t.ac, carried);
      ignored.push({ name: t.name ?? actor?.name ?? "", cover: carried });
    }
    if ( !measured.length && !ignored.length ) return;
    if ( targets.length === 1 ) config.target = targets[0].ac ?? undefined;
    if ( measured.length ) foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.coverMeasured`, { targets: measured });
    if ( ignored.length ) foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.coverIgnored`, { feature: feat.feature, targets: ignored });
  } catch(err) {
    log.error(`The attack's cover could not be put on (or taken off) the AC — judge the hit by hand.`, err);
  }
});

/** The cover row's colour, read for the ATTACKER: none green, Half/Three-Quarters orange, Total red. */
const COVER_TONE = { none: TONE.good, half: TONE.pending, threeQuarters: TONE.pending, total: TONE.bad };

// The cover row under the card's header: per target, the degree and the feat that ignored it.
listen("dnd5e.renderChatMessage", "reminders", (message, html) => {
  try {
    const flag = readFlag(message, "coverMeasured");
    if ( !flag?.targets?.length ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-cover-measured") ) return;
    const ignored = readFlag(message, "coverIgnored");
    const box = document.createElement("div");
    box.className = "bf-cover-measured";
    box.style.cssText = "display:flex;flex-direction:column;gap:3px;margin:0.35rem 0;";
    for ( const t of flag.targets ) {
      const d = COVER_DEGREES.find(x => x.key === t.key) ?? COVER_DEGREES.find(x => x.label === t.label) ?? COVER_DEGREES[0];
      const amount = t.bonus ? `${d.label} (+${t.bonus} AC)` : d.label;
      const cause = t.cause ? ` · ${t.cause}` : "";
      const off = ignored?.targets?.some(i => i.name === t.name) ? ` · ${ignored.feature} ignores it` : "";
      const tone = COVER_TONE[d.key] ?? TONE.neutral;
      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:center;gap:8px;padding:4px 8px 4px 5px;border-radius:4px;border:1px solid ${tone};`
        + `border-left-width:4px;background:color-mix(in srgb, ${tone} 16%, transparent);`;
      row.innerHTML = `<img src="${esc(d.img)}" alt="" style="width:28px;height:28px;flex:none;border:0;border-radius:3px;">`
        + `<div style="display:flex;flex-direction:column;line-height:1.2;min-width:0;">`
        + `<strong style="font-size:var(--font-size-14,14px);">${foundry.utils.escapeHTML(amount)}</strong>`
        + `<span style="font-size:var(--font-size-11,11px);opacity:0.85;">${foundry.utils.escapeHTML(`vs ${t.name}${cause}${off}`)}</span></div>`;
      box.appendChild(row);
    }
    const words = flag.targets.map(t => `the ${t.name}: ${t.label}${t.bonus ? ` (+${t.bonus} AC)` : ""}${t.cause ? ` · ${t.cause}` : ""}`).join(", ");
    box.dataset.bfCoverMeasured = `Cover — ${words}`;
    const header = content.querySelector(SURFACES.cardHeader);
    if ( header ) header.after(box); else content.prepend(box);
  } catch(err) { log.warn(`The measured cover's line could not draw.`, err); }
});

// the line: "Sharpshooter — ignores the Goblin's cover (+2 AC)"
listen("dnd5e.renderChatMessage", "reminders", (message, html) => {
  try {
    const flag = readFlag(message, "coverIgnored");
    if ( !flag?.targets?.length || readFlag(message, "coverMeasured") ) return;   // the cover row says it
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-cover-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-cover-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    const words = flag.targets.map(t => `the ${t.name}'s cover (+${t.cover} AC)`).join(", ");
    div.textContent = `${flag.feature} — ignores ${words}`;
    div.dataset.bfCoverLine = div.textContent;
    content.appendChild(div);
  } catch(err) { log.warn(`The ignored cover's line could not draw.`, err); }
});

/** Draw or redraw the section from the form as it stands, default button on the net. Idempotent. */
function drawGate(app, { force = false } = {}) {
  const gate = app.options?.bfReminder;
  const element = app.element;
  if ( !gate?.judge || !element ) return;
  let attackMode = gate.attackMode;
  try {
    const form = app.form ?? element.querySelector("form");
    const data = form ? new foundry.applications.ux.FormDataExtended(form) : null;
    if ( data?.has("attackMode") ) attackMode = data.get("attackMode");
  } catch { /* the form is the dialog's; a missing read keeps the last judgement */ }
  const existing = element.querySelector("[data-bf-reminder]");
  const wants = g => (g.sources?.length > 0) || !!g.sneak;
  const unchanged = (attackMode === gate.attackMode) && (!!existing === wants(gate));
  if ( unchanged && !force ) return;
  const next = gate.judge(attackMode);
  Object.assign(gate, next);
  const open = !!existing?.querySelector("details[data-bf-reminder-details]")?.open;
  existing?.remove();
  if ( wants(next) ) {
    const host = document.createElement("div");
    host.innerHTML = reminderFieldsetHTML(next.view, { open });
    const fieldset = host.firstElementChild;
    if ( next.sneak ) {
      // The Sneak Attack box sits OUTSIDE the fold; the human's tick survives re-renders.
      if ( typeof gate.sneakArmed !== "boolean" ) gate.sneakArmed = next.sneak.armed;
      if ( next.sneak.used ) gate.sneakArmed = false;
      const box = document.createElement("div");
      box.innerHTML = sneakBoxHTML({ dice: next.sneak.dice, rule: next.sneak.rule,
        checked: gate.sneakArmed, used: next.sneak.used });
      fieldset.appendChild(box.firstElementChild);
      pickInputs(fieldset, "bf-sneak")[0]?.addEventListener("change", ev => { gate.sneakArmed = !!ev.target.checked; });
    }
    const configuration = element.querySelector(SURFACES.dialogConfiguration);
    const buttons = element.querySelector(SURFACES.dialogButtons);
    if ( configuration ) configuration.insertAdjacentElement("afterend", fieldset);
    else if ( buttons ) buttons.insertAdjacentElement("beforebegin", fieldset);
    else element.querySelector("form")?.appendChild(fieldset);
  }
  markDefaultButton(element, next.net);
}

// Re-renders replace only the formula part; the section is a sibling after CONFIGURATION.
listen("renderRollConfigurationDialog", "reminders", (app, element) => {
  try {
    const check = app.options?.bfCheckGate;
    if ( check ) drawCheckGate(element, check);
    // The save gate sits beside saves/ask.js's demand fieldset; the demand rides in for Fails.
    const save = app.options?.bfSaveGate;
    if ( save ) drawSaveGate(app, element, save, app.options?.bfSaveDemand ?? null);
    if ( !app.options?.bfReminder ) return;
    openGates.add(app);
    drawGate(app);
  } catch(err) {
    log.error(`Reminder section failed to draw.`, err);
  }
});

// A re-target fires no dialog render; the judgement follows the canvas.
listen("targetToken", "reminders", () => {
  for ( const app of openGates ) {
    if ( app.rendered && app.element ) { try { drawGate(app, { force: true }); } catch(err) { log.error(`Reminder section failed to redraw.`, err); } }
    else openGates.delete(app);
  }
});

/* THE CHECK GATE: checks, skills and tools meet the same machine (CHECK_BENDS); nothing applied.
 * ⚠ Initiative is OUT by design (its hookNames carry `initiativeDialog`, the skip). */
listen("dnd5e.preRollAbilityCheck", "reminders", (config, dialog, _message) => {
  try {
    if ( dialog?.configure === false ) return;       // no dialog, no gate
    if ( config?.hookNames?.includes?.("initiativeDialog") ) return;
    const actor = config?.subject;
    if ( !(actor instanceof Actor) ) return;
    const on = new Set(reminderEntries().map(e => e.kind));
    if ( !on.has("condition") && !on.has("effect") ) return;
    const sources = [];
    if ( on.has("condition") ) {
      sources.push(...checkSources({ statuses: actor.statuses ?? [], enabled: conditionEntries().map(e => e.kind),
        table: CHECK_BENDS, name: actor.name }));
    }
    if ( on.has("effect") ) {
      // The sheet's mode effects (heavy armour's Stealth Disadvantage is not one, so stays unexplained).
      const roll = { kind: "check", ability: config.ability ?? null, skill: config.skill ?? null, tool: config.tool ?? null };
      sources.push(...modeSources({ effects: sheetModeEffects(actor), roll, rollLabel: rollLabelFor(roll), name: actor.name }));
      // …and the effect table's rows that bend checks by their text (Heated Metal).
      // …and the effect table's rows that bend checks by their text (Heated Metal), or by what the effect lends (Assisted).
      sources.push(...effectCheckSources({
        effects: actor.effects.filter(e => !e.disabled && !e.isSuppressed).map(e => ({ id: e.id, name: e.name, lends: readFlag(e, "lends") ?? null })),
        features: featuresOf(actor),
        enabled: effectEntries().map(e => e.kind), table: EFFECT_BENDS, name: actor.name,
        statuses: actor.statuses ?? [], skill: config.skill ?? null, tool: config.tool ?? null }));
    }
    if ( !sources.length ) return;
    const gate = new DialogCarried({ ...checkGate(sources), actorUuid: actor.uuid,
      ability: config.ability ?? null, skill: config.skill ?? null, tool: config.tool ?? null });
    dialog.options ??= {};
    dialog.options.bfCheckGate = gate;
    config.bfCheckGate = gate;
    dialog.configure = true;
    dialog.options.defaultButton = gate.net;
  } catch(err) {
    log.error(`Check gate failed — rolling natively.`, err);
  }
});

/** The check gate's section, folded, after the configuration part; the default moved to the net. */
function drawCheckGate(element, gate) {
  if ( !gate?.sources?.length || !element ) return;
  if ( !element.querySelector("[data-bf-reminder]") ) {
    const host = document.createElement("div");
    host.innerHTML = reminderFieldsetHTML(gate.view, { open: false });
    const fieldset = host.firstElementChild;
    const configuration = element.querySelector(SURFACES.dialogConfiguration);
    const buttons = element.querySelector(SURFACES.dialogButtons);
    if ( configuration ) configuration.insertAdjacentElement("afterend", fieldset);
    else if ( buttons ) buttons.insertAdjacentElement("beforebegin", fieldset);
    else element.querySelector("form")?.appendChild(fieldset);
  }
  markDefaultButton(element, gate.net);
}

// The check's record: the attack's flag, on the check's message.
listen("dnd5e.postRollConfiguration", "reminders", (rolls, config, _dialog, message) => {
  try {
    const gate = config?.bfCheckGate;
    if ( !gate?.sources?.length || !rolls?.length ) return;
    const mode = rollModeOf(rolls[0]?.options?.advantageMode);
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.${REMINDER_FLAG}`, {
      ...reminderRecord({ sources: gate.sources, net: gate.net, mode, answeredAt: Date.now() }),
      ...statContext(gate.actorUuid)
    });
    void spendCheckEffects(gate);
  } catch(err) {
    log.error(`Check gate record failed.`, err);
  }
});

/** A `spend: "check"` row's effect (Assisted) is used up by the check it bent — the record above is the receipt. */
async function spendCheckEffects(gate) {
  try {
    const ids = [...new Set((gate?.sources ?? []).filter(s => (s.spend === "check") && s.effectId).map(s => s.effectId))];
    if ( !ids.length ) return;
    const actor = resolveUuid(gate.actorUuid);
    if ( !(actor instanceof Actor) ) return;
    const live = ids.filter(id => actor.effects.get(id));
    if ( !live.length ) return;
    if ( !canApplyTo(actor) ) {
      await whisperNoGM(`the spent ${actor.effects.get(live[0])?.name ?? "effect"} on ${actor.name}`,
        "The check's record says it was spent; the effect stays until a GM is connected or its window closes.");
      return;
    }
    await actor.deleteEmbeddedDocuments("ActiveEffect", live);
  } catch(err) {
    log.error(`The check's spent effect could not be removed — remove it by hand.`, err);
  }
}

// The attack's record: what was shown, the net, what was pressed — only with rolls in hand.
listen("dnd5e.postRollConfiguration", "reminders", (rolls, config, _dialog, message) => {
  try {
    const gate = config?.bfReminder;
    if ( !gate || !rolls?.length || (config.subject?.type !== "attack") ) return;
    const mode = rollModeOf(rolls[0]?.options?.advantageMode);
    if ( gate.sources?.length ) {
      foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.${REMINDER_FLAG}`, {
        ...reminderRecord({ sources: gate.sources, net: gate.net, mode, answeredAt: Date.now() }),
        ...statContext(gate.attackerUuid)
      });
    }
    // The Sneak Attack choice rides the attack message, armed or not, for the damage offer to read.
    if ( gate.sneak ) {
      const { dice, number, faces, type, weaponName } = gate.sneak;
      foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.sneak`, {
        armed: !!gate.sneakArmed, dice, number, faces, type, weaponName, feature: SNEAK_ATTACK.feature,
        mode, ...statContext(gate.attackerUuid)
      });
    }
  } catch(err) {
    log.error(`Reminder record failed.`, err);
  }
});

/** The range facts of THIS attack as the dialog stands: ranged or not, normal and long feet. */
function rangeFactsFor(activity, attackMode, rangeFeet = null) {
  const item = activity?.item;
  const thrown = String(attackMode ?? "").startsWith("thrown");
  const ranged = thrown || modeIsRanged(attackMode) || (activity?.attack?.type?.value === "ranged");
  if ( !ranged ) return { ranged: false };
  let value = null, long = null, units = null;
  if ( activity.range?.override || (item?.type !== "weapon") ) {
    value = activity.range?.value; units = activity.range?.units;
  } else {
    value = item.system.range?.value; long = item.system.range?.long; units = item.system.range?.units;
  }
  // A Distant Spell's doubled range stands in for this cast alone (a spell has no long band).
  if ( rangeFeet !== null ) return { ranged: true, normalFeet: Number(rangeFeet), longFeet: null };
  return { ranged: true, normalFeet: feetOf(value, units), longFeet: feetOf(long, units) };
}

/** Live, capable enemies within 5 feet; a neutral or secret attacker has none the module can name. */
function closeEnemiesOf(attackerToken) {
  if ( !attackerToken ) return [];
  const mine = attackerToken.document?.disposition;
  const enemy = (mine === 1) ? -1 : (mine === -1) ? 1 : null;
  if ( enemy === null ) return [];
  const out = [];
  for ( const other of (canvas.tokens?.placeables ?? []) ) {
    if ( (other === attackerToken) || (other.document?.disposition !== enemy) ) continue;
    const actor = other.actor;
    if ( !actor || ((actor.system?.attributes?.hp?.value ?? 0) <= 0) || actor.statuses?.has?.("incapacitated") ) continue;
    const d = nearestFeet(attackerToken, other);
    if ( (d !== null) && (d <= 5) ) out.push(other.document?.name ?? actor.name);
  }
  return [...new Set(out)];
}

/** Is an ALLY of the attacker within 5 feet of this target? Null when the attacker's side is unnamed. */
function allyNearTarget(attackerToken, targetToken) {
  const mine = attackerToken?.document?.disposition;
  if ( !targetToken || ((mine !== 1) && (mine !== -1)) ) return null;
  const selves = new Set([attackerToken.actor?.uuid, targetToken.actor?.uuid].filter(Boolean));
  for ( const other of (canvas.tokens?.placeables ?? []) ) {
    if ( (other === attackerToken) || (other === targetToken) || (other.document?.disposition !== mine) ) continue;
    const actor = other.actor;
    if ( !actor || selves.has(actor.uuid) || ((actor.system?.attributes?.hp?.value ?? 0) <= 0) || actor.statuses?.has?.("incapacitated") ) continue;
    const d = nearestFeet(other, targetToken);
    if ( (d !== null) && (d <= 5) ) return true;
  }
  return false;
}

/** The feet between a bearer's token and its effect's source's token, or null. */
function sourceFeetOf(bearer, sourceUuid) {
  if ( !sourceUuid || (sourceUuid === bearer?.uuid) ) return null;
  const from = tokenOf(bearer), to = tokenOf(sourceUuid);
  return (from && to) ? nearestFeet(from, to) : null;
}

/** A creature's special senses, in feet (dnd5e 6 `senses.ranges`, flat keys as a fallback). */
function sensesOf(actor) {
  const senses = actor?.system?.attributes?.senses ?? {};
  const ranges = senses.ranges ?? senses;
  return { blindsight: Number(ranges.blindsight) || 0, truesight: Number(ranges.truesight) || 0 };
}

/** Every source for this roll, attacker then targets; a chip is live unless dead, spent on record or by an earlier ray. */
function sourcesFor(attacker, enabled, { activity = null, attackMode = null, targets = null, spent = null, spendNote = "", rangeFeet = null } = {}) {
  const out = [];
  const attackerName = attacker.name;
  const live = e => !chipIsDead(e.duration ?? {}) && !chipSpentOnRecord(e) && !spent?.has(e.id);
  const conditions = enabled.has("condition") ? conditionEntries().map(e => e.kind) : [];
  const conditionFacts = { enabled: conditions, table: CONDITION_BENDS };
  const attackerToken = tokenOf(attacker);
  const feats = enabled.has("range") ? rangeFeatsOf(attacker, activity) : { cancels: [], cover: null, reach: null };
  const range = enabled.has("range") ? reachedRange(rangeFactsFor(activity, attackMode, rangeFeet), feats.reach) : { ranged: false };
  const effectsOn = enabled.has("effect") ? effectEntries().map(e => e.kind) : [];
  const scope = { classification: activity?.attack?.type?.classification ?? null,
    type: modeIsRanged(attackMode) ? "ranged" : (activity?.attack?.type?.value ?? null),
    item: activity?.item?.name ?? null };
  // The ITEM an effect comes from, in the table's words, for a row's `item` discriminator.
  const itemOf = e => {
    const key = readFlag(e, "emanation")?.key;
    if ( key ) return key;
    const origin = e.origin ? resolveUuid(e.origin) : null;
    // ⚠ dnd5e 6 stamps an applied effect's origin with the ACTIVITY; read through to its item.
    const item = (origin instanceof Item) ? origin : ((origin?.item instanceof Item) ? origin.item : null);
    return item ? namesAnswering([item], EFFECT_ITEM_KEYS)[0] : null;
  };
  const sheetOf = actor => ({
    uuid: actor.uuid,
    effects: actor.effects.filter(live).map(e => ({ id: e.id, name: e.name, sourceUuid: effectSourceUuid(e), item: itemOf(e),
      sourceFeet: sourceFeetOf(actor, effectSourceUuid(e)), member: !!readFlag(e, "emanation"),
      against: readFlag(e, "against") ?? null })),
    features: featuresOf(actor),
    bloodied: hpFraction(actor) <= 0.5, damaged: hpFraction(actor) < 1,
    grappled: !!actor.statuses?.has?.("grappled"),
    incapacitated: !!actor.statuses?.has?.("incapacitated"),
    statuses: [...(actor.statuses ?? [])],
    notActed: targetNotActed(attacker, actor),
    ...(EFFECT_WORN_KEYS.length ? displacedFacts(actor) : {})
  });
  const attackerSheet = effectsOn.length ? sheetOf(attacker) : null;
  if ( attackerSheet ) attackerSheet.features = [...new Set([...attackerSheet.features, ...alliedFeaturesOf(attacker, attackerToken)])];
  // B4 — an Opportunity Attack as the gate can read it (Halt's fact): a melee attack off the attacker's turn in a running combat.
  if ( attackerSheet ) {
    const combat = game.combat;
    attackerSheet.offTurnMelee = !!(combat?.started && combat.combatant && (combat.combatant.actor?.uuid !== attacker.uuid)
      && (scope.type === "melee") && combat.combatants.some(c => c.actor?.uuid === attacker.uuid));
  }

  if ( enabled.has("sap") ) {
    for ( const e of attacker.effects ) {
      if ( (chipKindOf(e) !== "sap") || !live(e) ) continue;
      const by = grantingActor(e)?.name ?? null;
      out.push(Object.assign(reminderSource("sap", "disadvantage",
        `${attackerName} — ${e.name}${by ? ` by ${by}` : ""}${spendNote}`, MASTERY_RULES.sap), { effectId: e.id }));
    }
  }
  if ( enabled.has("prone") ) {
    out.push(...proneSources({ attackerProne: attacker.statuses?.has?.("prone"), attackerName }));
  }
  if ( conditions.length ) {
    // The attacker's own Invisible is listed, not counted, when every target sees it (sightOf).
    const aimed = [...(targets ?? game.user.targets)].filter(t => t.actor && (t.actor.uuid !== attacker.uuid));
    const seers = aimed.map(t => ({ t, seen: sightOf(sensesOf(t.actor), attackerToken ? nearestFeet(attackerToken, t) : null) }));
    const attackerSeenBy = (seers.length && seers.every(x => x.seen)) ? seers[0].seen : null;
    const seerName = seers[0] ? (seers[0].t.document?.name ?? seers[0].t.actor.name) : undefined;
    out.push(...conditionSources({ ...conditionFacts, attackerStatuses: attacker.statuses ?? [], attackerName,
      attackerSeenBy, targetName: seerName }));
  }
  if ( range.ranged ) {
    out.push(...rangeSources({ ranged: true, closeEnemies: closeEnemiesOf(attackerToken), attackerName, cancels: feats.cancels, rules: RANGE_RULES }));
  }
  if ( attackerSheet ) {
    out.push(...effectSources({ attacker: attackerSheet, enabled: effectsOn, table: EFFECT_BENDS, scope, attackerName, pass: "attacker" }));
  }

  for ( const token of (targets ?? game.user.targets) ) {
    const target = token.actor;
    if ( !target || (target.uuid === attacker.uuid) ) continue;
    const targetName = token.document?.name ?? target.name;
    const distanceFeet = attackerToken ? nearestFeet(attackerToken, token) : null;
    if ( enabled.has("vex") ) {
      for ( const e of target.effects ) {
        if ( (chipKindOf(e) !== "vex") || !chipOwnedBy(e.origin, attacker.uuid) || !live(e) ) continue;
        out.push(Object.assign(reminderSource("vex", "advantage", `${attackerName} Vexed ${targetName}${spendNote}`,
          MASTERY_RULES.vex), { effectId: e.id }));
      }
    }
    if ( enabled.has("prone") && target.statuses?.has?.("prone") ) {
      const proneBy = target.effects.find(e => !e.disabled && e.statuses?.has?.("prone"))?.name ?? null;
      out.push(...proneSources({ targetProne: true, distanceFeet, targetName, targetProneBy: proneBy }));
    }
    if ( conditions.length ) {
      out.push(...conditionSources({ ...conditionFacts, targetStatuses: target.statuses ?? [], targetName, attackerName,
        targetSeenBy: sightOf(sensesOf(attacker), distanceFeet) }));
    }
    if ( range.ranged ) {
      out.push(...rangeSources({ ranged: true, distanceFeet, normalFeet: range.normalFeet, longFeet: range.longFeet,
        targetName, cancels: feats.cancels, coverBonus: feats.cover ? carriedCover(target) : 0, coverFeat: feats.cover, rules: RANGE_RULES }));
    }
    if ( attackerSheet ) {
      // Target-side rows, and attacker-side rows that hinge on THIS target (Bloodied, an ally beside it).
      out.push(...effectSources({ attacker: attackerSheet, target: { ...sheetOf(target), allyNear: allyNearTarget(attackerToken, token), inSpace: tokensOverlap(attackerToken, token) },
        enabled: effectsOn, table: EFFECT_BENDS, scope, attackerName, targetName, pass: "target" }));
      out.push(...circleSourcesFor(attacker, token, attackerName));
    }
  }
  return out;
}

/** THE CIRCLE'S GATE (Magic Circle): a gated area the target stands in, read off the region and its picks. */
const EMANATION_INDEX = tableIndex(EMANATIONS);
function circleSourcesFor(attacker, targetToken, attackerName) {
  const out = [];
  try {
    const scene = targetToken?.document?.parent ?? null;
    if ( !scene ) return out;
    const attackerType = creatureTypeOf(attacker?.system?.details?.type ?? null);
    for ( const region of scene.regions ) {
      const f = readFlag(region, "emanation");
      if ( f?.kind !== "area" ) continue;
      const row = EMANATION_INDEX.rowNamed(f.key);
      if ( !row?.gate ) continue;
      const inside = (tokensInRegions([region]) ?? []).some(e => e.tokenId === targetToken.document.id);
      const bend = circleBend(row, { attackerType, picked: f.picked ?? askDefaults(row.ask), targetInside: inside });
      if ( bend ) out.push(reminderSource("effect", bend.bend, `${attackerName} — ${bend.label}`, row.rule));
    }
  } catch(err) { log.warn(`The circle's gate could not be read.`, err); }
  return out;
}

/** Has this target not yet acted in round one of the attacker's combat (Assassinate)? */
function targetNotActed(attacker, target) {
  const combat = activeCombatFor(attacker);
  if ( !combat || (combat.round !== 1) ) return false;
  const turns = combat.turns ?? [];
  const at = turns.findIndex(c => combat.getCombatantsByActor(target).includes(c));
  return (at >= 0) && (at > (combat.turn ?? 0));
}

/** HP as a fraction of max — 1 when unreadable, so nothing judged on it fires by accident. */
function hpFraction(actor) {
  const hp = actor?.system?.attributes?.hp;
  const max = Number(hp?.max) || 0;
  if ( !(max > 0) ) return 1;
  return Math.max(0, Number(hp?.value) || 0) / max;
}

/** C1 — a `cancel: "advantage"` row (Trance of Order) on an aimed target: every Advantage source is struck (Brutal Strike's
 * forgo shape — listed, no vote) and a listed source says why; Disadvantage stands. Pure over the sources once the target is read. */
function cancelAdvantage(attacker, sources, targets) {
  const rows = Object.entries(EFFECT_BENDS).filter(([, r]) => r.cancel === "advantage");
  if ( !rows.length || !reminderEntries().some(e => e.kind === "effect") ) return sources;
  const on = new Set(effectEntries().map(e => e.kind));
  for ( const token of (targets ?? []) ) {
    const target = token?.actor;
    if ( !target || (target.uuid === attacker.uuid) ) continue;
    for ( const [key, row] of rows ) {
      if ( !on.has(lower(key)) ) continue;
      // D1 — a FEATURE carrier (Elusive), off while it is Incapacitated (`judge: "notIncapacitated"`); else the effect by name.
      const feature = row.match === "feature";
      if ( feature ? !featureNamed(target, key) : !target.effects.some(e => !e.disabled && !e.isSuppressed && (lower(e.name) === lower(key))) ) continue;
      if ( (row.judge === "notIncapacitated") && target.statuses?.has?.("incapacitated") ) continue;
      const name = token.document?.name ?? target.name;
      const struck = forgoneSources(sources, key).map(s => s.forgone ? { ...s, label: s.label.replace(/ — forgone \(.*\)$/, ` — cancelled (${key})`) } : s);
      return [...struck, reminderSource("effect", null, `${name} ${feature ? `has ${key}` : `is in a ${key}`} — attack rolls against it cannot have Advantage`, row.rule)];
    }
  }
  return sources;
}

/**
 * THE JUDGE before the dice: sources, net, view; a volley calls it per ray with the chips spent so far.
 * @param {Actor} attacker
 * @param {{activity?: object|null, attackMode?: string|null, targets?: Token[]|null,
 *          spent?: Set<string>|null, spendNote?: string}} [facts]
 * @returns {{sources: object[], net: "advantage"|"disadvantage"|"normal", view: object, spends: string[]}|null}
 */
export function judgeRoll(attacker, { activity = null, attackMode = null, targets = null, spent = null, spendNote = "", rangeFeet = null } = {}) {
  const enabled = new Set(reminderEntries().map(e => e.kind));
  if ( !enabled.size ) return null;
  const sources = cancelAdvantage(attacker, sourcesFor(attacker, enabled, { activity, attackMode, targets, spent, spendNote, rangeFeet }), targets ?? game.user.targets);
  const net = netMode(sources);
  const sneak = enabled.has("sneak") ? sneakFactsFor(attacker, activity, attackMode, net, targets ?? game.user.targets) : null;
  // ⚠ Only what the rules SPEND carries forward through a volley; a standing effect stands for every ray.
  const spendable = s => s.effectId && (s.spend || (s.kind === "vex") || (s.kind === "sap"));
  return { sources, net, view: reminderView(sources, net), spends: sources.filter(spendable).map(s => s.effectId), sneak };
}

/** The Sneak Attack facts, or null; dice that do not resolve to plain dice are never armed (they roll zero silently). */
function sneakFactsFor(attacker, activity, attackMode, net, targets = []) {
  const item = activity?.item;
  if ( !item || (item.type !== "weapon") || (activity?.type !== "attack") ) return null;
  const feature = featureNamed(attacker, SNEAK_ATTACK.feature);
  if ( !feature ) return null;
  const damage = [...(feature.system?.activities ?? [])].find(a => (a.type === "damage") && a.damage?.parts?.length);
  const part = damage?.damage?.parts?.[0];
  if ( !part ) return null;
  const raw = part.custom?.enabled ? part.custom.formula : `${part.number ?? 1}d${part.denomination}`;
  let resolved = null;
  try { resolved = Roll.replaceFormulaData(String(raw), attacker.getRollData()); } catch { resolved = null; }
  const dice = parseDice(resolved);
  if ( !dice ) return null;
  const finesse = !!item.system?.properties?.has?.("fin");
  const ranged = modeIsRanged(attackMode) || (activity?.attack?.type?.value === "ranged");
  if ( !sneakWeaponQualifies({ finesse, ranged }) ) return null;
  const type = [...(item.system?.damage?.base?.types ?? [])][0] ?? null;   // "the same as the weapon's type"
  const used = turnChitStands(attacker, "sneak");
  // The ally clause holds only when measured true at every target.
  const aimed = [...(targets ?? [])].filter(t => t.actor && (t.actor.uuid !== attacker.uuid));
  const attackerToken = tokenOf(attacker);
  const allyNear = aimed.length ? aimed.every(t => allyNearTarget(attackerToken, t) === true) : null;
  return {
    dice: `${dice.number}d${dice.faces}`, number: dice.number, faces: dice.faces, type, weaponName: item.name,
    finesse, ranged, rule: SNEAK_ATTACK.rule,
    used: used ? "used this turn — the chit on you clears at the end of the turn" : null,
    armed: !used && sneakConditionsHold({ net, allyNear })
  };
}

/* --- the card line -------------------------------------------------------------------------- */

// The attack card says a Sneak Attack was ARMED; the damage card says what rode.
listen("dnd5e.renderChatMessage", "reminders", (message, html) => {
  const s = readFlag(message, "sneak");
  if ( !s?.armed ) return;
  const line = document.createElement("div");
  line.innerHTML = bfCard({
    eyebrow: "Sneak Attack", tone: s.rolled ? "good" : "pending",
    title: s.rolled ? `Sneak Attack — ${s.dice} rode the damage` : `Sneak Attack armed — ${s.dice} on the hit, once per turn`,
    subtitle: `${s.weaponName ?? "the weapon"}${s.type ? `, ${s.type}` : ""}`
  });
  html.querySelector(SURFACES.messageContent)?.appendChild(line);
});

// The reminder row rides cardRow: dnd5e 6 draws a save's roll inside the usage card.
listen("dnd5e.renderChatMessage", "reminders", cardRow((message, host) => {
  const r = readFlag(message, REMINDER_FLAG);
  if ( !r?.sources?.length ) return;
  const line = document.createElement("div");
  const what = r.sources.map(s => s.label + (s.bend ? ` (${modeTitle(s.bend)})` : "")).join(" · ");
  line.innerHTML = bfCard({
    eyebrow: "Before the roll", tone: r.honoured ? "good" : "neutral",
    title: `Reminded — net ${modeTitle(r.net)}, rolled ${rolledWith(r.mode)}${r.honoured ? "" : " (against the net)"}`,
    subtitle: what
  });
  host.appendChild(line);
}));

/* THE SAVE GATE (RULINGS *The gate before the roll*). The demand's fieldset on the same dialog is
 * saves/ask.js's; the two meet only through the dialog's options — no import either way. */

/**
 * The save gate's judge; null unless `condition` or `effect` is a Reminder Source.
 * @param {Actor} actor
 * @param {string} ability
 */
function judgeSave(actor, ability, { concentration = false, askId = null } = {}) {
  const on = new Set(reminderEntries().map(e => e.kind));
  if ( !on.has("condition") && !on.has("effect") ) return null;
  const sources = [];
  if ( on.has("condition") ) {
    sources.push(...saveSources({ statuses: actor.statuses ?? [], ability,
      enabled: conditionEntries().map(e => e.kind), table: SAVE_BENDS, name: actor.name }));
  }
  if ( on.has("effect") ) {
    // A Concentration save reads its own mode field too (War Caster).
    const roll = { kind: "save", ability, ...(concentration ? { concentration: true } : {}) };
    sources.push(...modeSources({ effects: sheetModeEffects(actor), roll, rollLabel: rollLabelFor(roll), name: actor.name }));
    // The effect table's `saves` facet (Aura of Purity), read against the demand being answered.
    const demand = pendingDemandFor(actor)?.demand ?? null;
    sources.push(...effectSaveSources({ effects: saveEffectFacts(actor),
      features: featuresOf(actor),
      enabled: effectEntries().map(e => e.kind), table: EFFECT_BENDS, demand, name: actor.name }));
    // The demand's own bend (a repeated save raised by damage — Tasha's Hideous Laughter).
    sources.push(...demandBendSources(demand, actor.name));
    // Heightened Spell's mark on the demand: THIS roller's saves against the spell at Disadvantage.
    const mark = demand?.heightened ?? null;
    if ( mark && (mark.uuid === actor.uuid) ) {
      sources.push(reminderSource("effect", "disadvantage", `${actor.name} — Heightened Spell${mark.caster ? ` (${mark.caster}'s)` : ""}`, mark.rule ?? ""));
    }
    // Extended Spell: a concentration save for a spell cast Extended is at Advantage.
    if ( concentration ) {
      for ( const card of extendedCastsHeldBy(actor) ) {
        const rec = metamagicOf(card);
        sources.push(reminderSource("effect", "advantage", `${actor.name} — Extended Spell (${itemNameOf(card) ?? rec.spellName ?? "the spell"})`, rec.rule ?? ""));
      }
      // Mage Slayer: the damage that forced this check came from the feat's holder (concentration.js `breakerFor`).
      const breaker = concentrationAskFor(actor, askId)?.breaker ?? null;
      if ( breaker ) {
        sources.push(reminderSource("effect", "disadvantage", `${breaker.by} — ${breaker.feat}`, breaker.rule ?? ""));
      }
    }
  }
  // A save that cannot fail is a DEMAND's (Trance); a concentration check answers no demand.
  const own = concentration ? sources.map(s => (s.autoSucceed ? { ...s, autoSucceed: false } : s)) : sources;
  return new DialogCarried({ ...saveGate(own), actorUuid: actor.uuid, ability, failed: false });
}

/** The concentration ask this save answers: the dialog's, else the oldest pending one. */
function concentrationAskFor(actor, askId = null) {
  const carried = askId ? readFlag(game.messages.get(askId), "concentration") : null;
  if ( carried ) return carried;
  return readFlag(pendingDemandsFor(actor.uuid, { flagKey: "concentration" })[0]?.card, "concentration") ?? null;
}

/** The newest Extended usage card per spell this actor still concentrates on (by origin or item id). */
function extendedCastsHeldBy(actor) {
  const held = (actor?.effects ?? []).filter(e => !e.disabled && e.statuses?.has?.("concentrating"));
  if ( !held.length ) return [];
  const out = [];
  for ( const m of game.messages.contents.slice(-200).reverse() ) {
    const rec = metamagicOf(m);
    if ( (rec?.key !== "extended") || (rec.actorUuid !== actor.uuid) ) continue;
    const itemId = rec.spellUuid?.split(".").pop() ?? null;
    if ( !held.some(e => (e.origin === rec.spellUuid) || (e.origin && itemId && e.origin.endsWith(`.${itemId}`)) || (e.getFlag?.("dnd5e", "item")?.id === itemId)) ) continue;
    if ( out.some(c => metamagicOf(c)?.spellUuid === rec.spellUuid) ) continue;
    out.push(m);
  }
  return out;
}

/** The demand this actor is mid-answer on, if any. */
function pendingDemandFor(actor) {
  return savesOf(pendingDemandsFor(actor.uuid, { flagKey: "saves" }).at(-1)?.card);
}

// The save gate, on every saving throw that opens a dialog (a demand's or a sheet roll's).
listen("dnd5e.preRollSavingThrow", "reminders", (config, dialog, _message) => {
  try {
    if ( dialog?.configure === false ) return;       // no dialog, no gate
    const actor = config?.subject;
    if ( !(actor instanceof Actor) ) return;
    const gate = judgeSave(actor, config.ability, { concentration: !!config.isConcentration,
      askId: config.isConcentration ? (dialog?.options?.bfSaveDemand?.cardId ?? null) : null });
    if ( !gate ) return;
    dialog.options ??= {};
    dialog.options.bfSaveGate = gate;
    config.bfSaveGate = gate;
    if ( !gate.sources.length ) return;
    dialog.configure = true;
    // Fails/Succeeds take focus themselves; the dialog's own default stays Normal behind them.
    dialog.options.defaultButton = (gate.autoFail || gate.autoSucceed) ? "normal" : gate.net;
  } catch(err) {
    log.error(`Save gate failed — rolling natively.`, err);
  }
});

/** The save gate's section, plus Fails / Succeeds when the outcome is fixed. Idempotent. */
function drawSaveGate(app, element, gate, demand) {
  if ( !gate?.sources?.length ) return;
  if ( !element.querySelector("[data-bf-reminder]") ) {
    const host = document.createElement("div");
    host.innerHTML = reminderFieldsetHTML(gate.view, { open: false });
    const fieldset = host.firstElementChild;
    const configuration = element.querySelector(SURFACES.dialogConfiguration);
    const buttons = element.querySelector(SURFACES.dialogButtons);
    if ( configuration ) configuration.insertAdjacentElement("afterend", fieldset);
    else if ( buttons ) buttons.insertAdjacentElement("beforebegin", fieldset);
    else element.querySelector("form")?.appendChild(fieldset);
  }
  const modeButtonsEl = [...element.querySelectorAll(`${SURFACES.dialogButtons} button[data-action]`)];
  if ( gate.autoFail && !element.querySelector("[data-bf-fails]") ) {
    const sibling = modeButtonsEl.find(b => b.dataset.action !== "bf-fails");
    if ( sibling ) {
      const fails = document.createElement("button");
      fails.type = "button";
      fails.className = sibling.className;
      fails.dataset.action = "bf-fails";
      fails.setAttribute("data-bf-fails", "");
      fails.innerHTML = `<i class="fa-solid fa-xmark" inert></i> Fails`;
      fails.style.cssText = `border-color:${TONE.bad};`;
      fails.addEventListener("click", () => {
        try {
          gate.failed = true;
          if ( demand ) demand.failed = gate.sources;
          else postSheetAutoFail(gate);
        } finally {
          void app.close();
        }
      });
      sibling.insertAdjacentElement("beforebegin", fails);
    }
  }
  // Succeeds: only with a demand to record it on — the facet never passes a bare sheet roll.
  if ( gate.autoSucceed && demand && !element.querySelector("[data-bf-succeeds]") ) {
    const sibling = modeButtonsEl.find(b => b.dataset.action !== "bf-succeeds");
    if ( sibling ) {
      const succeeds = document.createElement("button");
      succeeds.type = "button";
      succeeds.className = sibling.className;
      succeeds.dataset.action = "bf-succeeds";
      succeeds.setAttribute("data-bf-succeeds", "");
      succeeds.innerHTML = `<i class="fa-solid fa-check" inert></i> Succeeds`;
      succeeds.style.cssText = `border-color:${TONE.good};`;
      succeeds.addEventListener("click", () => {
        try { demand.succeeded = gate.sources.filter(s => s.autoSucceed); }
        finally { void app.close(); }
      });
      sibling.insertAdjacentElement("beforebegin", succeeds);
    }
  }
  markDefaultButton(element, gate.autoFail ? "bf-fails" : (gate.autoSucceed && demand) ? "bf-succeeds" : gate.net);
}

/** A sheet save pressed Fails with no demand to record it: the card is the record (R5). */
function postSheetAutoFail(gate) {
  const actor = resolveUuid(gate.actorUuid);
  if ( !(actor instanceof Actor) ) return;
  const abilityLabel = CONFIG.DND5E.abilities[gate.ability]?.label ?? gate.ability;
  const failing = gate.sources.filter(s => s.autoFail);
  void postCard({
    actor,
    card: bfCard({
      img: actor.img ?? null, eyebrow: "Saving throw — automatic failure", tone: "bad",
      title: `${actor.name}: ${abilityLabel} save fails`,
      subtitle: failing.map(s => s.statusName).join(", "),
      lines: [...new Set(failing.map(s => s.detail))].map(ruleLine)
    }),
    flags: { [MODULE_ID]: { saveAutoFail: { ...statContext(actor.uuid), ability: gate.ability,
      sources: failing.map(s => ({ status: s.status, label: s.label })) } } }
  }).catch(err => log.error(`Automatic-failure card failed.`, err));
}

// The save's record: the attack gate's flag, on the save message.
listen("dnd5e.postRollConfiguration", "reminders", (rolls, config, _dialog, message) => {
  try {
    const gate = config?.bfSaveGate;
    if ( !gate?.sources?.length || !rolls?.length ) return;
    if ( rollKindInData(message?.data) !== CARD.save ) return;
    const mode = rollModeOf(rolls[0]?.options?.advantageMode);
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.${REMINDER_FLAG}`, {
      ...reminderRecord({ sources: gate.sources, net: gate.net, mode, answeredAt: Date.now() }),
      ...statContext(gate.actorUuid)
    });
    void spendSaveEffects(gate);
  } catch(err) {
    log.error(`Save gate record failed.`, err);
  }
});

/** A `spend: "save"` row's effect (Struck) is used up by the save it bent — the record above is the receipt. */
async function spendSaveEffects(gate) {
  try {
    const ids = [...new Set((gate?.sources ?? []).filter(s => (s.spend === "save") && s.effectId).map(s => s.effectId))];
    if ( !ids.length ) return;
    const actor = resolveUuid(gate.actorUuid);
    if ( !(actor instanceof Actor) ) return;
    const live = ids.filter(id => actor.effects.get(id));
    if ( !live.length ) return;
    if ( !canApplyTo(actor) ) {
      await whisperNoGM(`the spent ${actor.effects.get(live[0])?.name ?? "effect"} on ${actor.name}`,
        "The save's record says it was spent; the effect stays until a GM is connected or its window closes.");
      return;
    }
    await actor.deleteEmbeddedDocuments("ActiveEffect", live);
  } catch(err) {
    log.error(`The save's spend failed.`, err);
  }
}
