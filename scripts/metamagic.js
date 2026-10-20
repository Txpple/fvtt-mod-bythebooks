/**
 * By the Books — Metamagic: the options as a group in the casting window (RULINGS.md *Metamagic*).
 * The pick waits on the casting client until the card's `preCreateChatMessage` stamps it as a birth
 * flag; `postUseActivity` spends the points (`poolSpend`). Empowered is a dice-changers row, Seeking a
 * d20 fold kind, the ask at the area is area-ask.js.
 */
import { MODULE_ID, readFlag, publish, statContext, decisionWindow, ownersAndGmIds, resolveUuid, log } from "./core.js";
import { cardActivity, featureNamed, lower, namesAnswering } from "./lookup.js";
import { metamagicEntries, listedNames, chosenAreaListed } from "./decide/registry.js";
import { poolOf, spendPoolUses, isPartyMember } from "./shared.js";
import { feetOf, tokensInRegions, tokenOf } from "./geometry.js";
import { bfCard, foldedRuleHTML, esc, pickInputHTML } from "./decide/present.js";
import { METAMAGIC, TRANSMUTED_TYPES, TWINNED_EXCEPTIONS, tableIndex } from "./decide/registry.js";
import { METAMAGIC_FLAG, metamagicMenu, metamagicPick, metamagicRuleText, metamagicCardLine, distantRange, scalesTargetsFrom, carefulKind } from "./decide/metamagic.js";
import { AREA_ASK_FLAG, AREA_CHOICE_FLAG, askWords, heightenedMark, choiceCapFrom, choiceRuleFrom, choiceNeedsAsk } from "./decide/area-ask.js";
import { newAsk, registerAskAnswerPart } from "./area-ask.js";
import { raiseHold, releaseHold, isHeld } from "./holds.js";
import { SURFACES } from "./surfaces.js";
import { CARD, activityUuidOf, isCard, originIdInData } from "./decide/card.js";
import { listen } from "./dispatch.js";
import { selfEmanation } from "./decide/emanations.js";
import { postCard, pickInputs } from "./ui.js";

const INDEX = tableIndex(METAMAGIC);
/** The name the record shows for Font of Magic's uses — what the table calls them. */
export const SORCERY_POINTS = "Sorcery Points";
const POOL_NAME = SORCERY_POINTS;

/* --- The sheet: the options the caster knows, and the pool they draw on ----------------------- */

/** The metamagic feats on the sheet that the table knows and the list admits, by feat name — and the
 * `free` rows' class features (Psychic Spells), which are no Metamagic feat. */
function knownOptions(actor) {
  const listed = listedNames(metamagicEntries());
  const out = new Map();
  for ( const item of (actor?.items ?? []) ) {
    if ( item.type !== "feat" ) continue;
    const feature = INDEX.keyFor(item);
    if ( !feature || !listed.has(lower(feature)) ) continue;
    if ( !METAMAGIC[feature]?.free && (lower(item.system?.type?.subtype) !== "metamagic") ) continue;
    out.set(feature, item);
  }
  return out;
}

/** The Sorcery Points pool the PAID options draw on (a free row names none). */
function firstPool(actor, known) {
  return [...known].filter(([feature]) => !METAMAGIC[feature]?.free).map(([, i]) => poolFor(actor, i)).find(Boolean) ?? null;
}

/** The option's own cost: its activity's `itemUses` consumption value, read live (N1). */
function costOf(item) {
  const activity = item?.system?.activities?.contents?.[0] ?? null;
  const target = activity?.consumption?.targets?.find(t => t.type === "itemUses") ?? null;
  const n = Number(target?.value);
  return Number.isFinite(n) && (n > 0) ? n : null;
}

/** The pool the option consumes — Font of Magic on a 2024 sheet — resolved through the option's own target. */
function poolFor(actor, item) {
  const activity = item?.system?.activities?.contents?.[0] ?? null;
  return activity ? poolOf(actor, activity) : null;
}

/** Who an option can name IN THE WINDOW: only the targeted; a cast targeting nobody is asked at the area. */
function candidatesFor(actor) {
  const casterTok = tokenOf(actor) ?? null;
  const casterDisposition = casterTok?.document?.disposition ?? actor.prototypeToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  const selected = [...(game.user?.targets ?? [])]
    .map(t => ({ uuid: t.actor?.uuid ?? null, name: t.document?.name ?? t.name, disposition: t.document?.disposition ?? null }))
    .filter(t => t.uuid);
  return { casterDisposition, casterUuid: actor.uuid, targets: selected };
}

/** Twinned's named exceptions, as one list: a spell reads as the exception it answers. */
const TWINNED_NAMES = [...TWINNED_EXCEPTIONS.except, ...TWINNED_EXCEPTIONS.also];

/** The facts of the spell being cast, as decide/metamagic.js reads them. */
function spellFactsOf(activity) {
  const item = activity?.item;
  const sys = item?.system ?? {};
  const range = activity?.range?.override ? activity.range : sys.range;
  const units = String(range?.units ?? "");
  const rangeFeet = (units === "touch" || units === "self" || !units) ? null : feetOf(range?.value, units);
  const duration = activity?.duration?.override ? activity.duration : sys.duration;
  const MIN = { round: 0.1, minute: 1, hour: 60, day: 1440, month: 43200, year: 525600, perm: Infinity };
  const minutes = (Number(duration?.value) || 0) * (MIN[String(duration?.units ?? "")] ?? 0);
  const activation = activity?.activation?.override ? activity.activation : sys.activation;
  const parts = activity?.damage?.parts ?? [];
  const damageTypes = [...new Set(parts.flatMap(p => [...(p.types ?? [])].map(lower)))];
  return {
    save: (activity?.type === "save") || !!activity?.save?.ability?.size,
    rangeFeet, touch: units === "touch", minutes,
    action: String(activation?.type ?? "") === "action",
    damageTypes, damageRoll: parts.length > 0,
    spellAttack: activity?.type === "attack",
    // ⚠ The SOURCE count: only it keeps the `@item.level - 1` formula; the prepared value is a number.
    scalesTargets: !activity?.target?.template?.type && scalesTargetsFrom(item?.system?._source?.target?.affects?.count ?? null, { name: item ? namesAnswering([item], TWINNED_NAMES)[0] : null, exceptions: TWINNED_EXCEPTIONS }),
    // A Chosen Areas spell: Careful greys on it.
    choosesTargets: !!activity?.target?.template?.type && chosenAreaListed(item),
    // Whose spell it is (a `classes` row): the item's own class (dnd5e 6 `sourceItem`, resolved when the class is
    // on the sheet, else read off its "class:" key), else the caster's one class.
    sourceClass: sys.classIdentifier || (String(sys.sourceItem ?? "").startsWith("class:") ? String(sys.sourceItem).slice(6) : "")
      || ((Object.keys(activity?.actor?.classes ?? {}).length === 1) ? Object.keys(activity.actor.classes)[0] : null),
    school: lower(sys.school ?? "")
  };
}

/* --- The casting window: one fieldset, the pick held until the cast lands --------------------- */

/** activity uuid → the pick made in the dialog (`{ key, feature, cost, poolId, rangeFeet }`). */
const pending = new Map();
/** activity uuid → the `free` rows ticked beside it (`[{ key, feature, type }]`), stamped as `metamagicFree`. */
const freePending = new Map();
const FREE_FLAG = "metamagicFree";

/** The window's rows for a spell's use - the same read the window makes - or null when the caster has none that fit. */
function windowMenuFor(activity) {
  const actor = activity?.actor;
  if ( !activity || (activity.item?.type !== "spell") || !actor?.isOwner ) return null;
  const known = knownOptions(actor);
  if ( !known.size ) return null;
  const first = firstPool(actor, known);
  const points = Math.max(0, Number(first?.system?.uses?.value ?? 0));
  const costs = Object.fromEntries([...known].map(([feature, item]) => [feature, costOf(item)]));
  const menu = metamagicMenu({ table: METAMAGIC, listed: known.keys(), known: known.keys(), facts: spellFactsOf(activity), points, costs, transmutedTypes: TRANSMUTED_TYPES });
  return menu.length ? menu : null;
}

// ⚠ dnd5e skips the usage dialog when nothing is configurable (a cantrip): `scaling: 0` forces it
// without drawing a scaling section. `configure: false` is respected.
listen("dnd5e.preUseActivity", "metamagic", (activity, usageConfig, dialogConfig) => {
  try {
    if ( dialogConfig?.configure === false ) return;
    if ( usageConfig?.scaling !== false ) return;                 // something else opens it already
    const menu = windowMenuFor(activity);
    if ( !menu?.some(r => r.eligible && r.affordable) ) return;
    usageConfig.scaling = 0;
  } catch(err) { log.warn(`Could not open the casting window for the metamagic group.`, err); }
});

listen("renderActivityUsageDialog", "metamagic", (app, element) => {
  try {
    const activity = app?.activity ?? app?.options?.activity ?? null;
    const actor = activity?.actor;
    if ( !activity || (activity.item?.type !== "spell") || !actor?.isOwner ) return;
    if ( element.querySelector("[data-bf-metamagic-field]") ) return;
    const known = knownOptions(actor);
    if ( !known.size ) return;
    const first = firstPool(actor, known);
    const points = Math.max(0, Number(first?.system?.uses?.value ?? 0));
    const max = Number(first?.system?.uses?.max ?? 0);
    const costs = Object.fromEntries([...known].map(([feature, item]) => [feature, costOf(item)]));
    const facts = spellFactsOf(activity);
    const menu = metamagicMenu({ table: METAMAGIC, listed: known.keys(), known: known.keys(), facts, points, costs, transmutedTypes: TRANSMUTED_TYPES });
    if ( !menu.length ) return;
    const current = pending.get(activity.uuid)?.key ?? null;
    const currentType = pending.get(activity.uuid)?.type ?? null;
    // Careful names nobody here (the spared are asked on the card); only the cap travels.
    const cap = Math.max(1, Number(actor.system?.abilities?.cha?.mod) || 1);
    const selected = candidatesFor(actor);
    // A template spell names nobody for Heightened either: the targets are not who the area will hold.
    if ( activity?.target?.template?.type ) selected.targets = [];
    const mark = { ...selected, chosen: pending.get(activity.uuid)?.target?.uuid ?? null };
    // A free row alone (Psychic Spells on a Warlock) is no Metamagic: the legend names it, no pool line.
    const paid = menu.some(r => !r.free);
    const currentFree = new Set((freePending.get(activity.uuid) ?? []).map(r => r.key));
    const fs = document.createElement("fieldset");
    fs.dataset.bfMetamagicField = "";
    fs.innerHTML = `<legend>By the Books — ${paid ? "Metamagic" : esc(menu.map(r => r.feature).join(", "))}</legend>
      ${paid ? `<div data-bf-metamagic-pool style="display:flex;justify-content:space-between;font-size:var(--font-size-12,12px);opacity:0.85;margin:0 0 0.25rem;">
        <span>${esc(actor.name)}</span><span><strong>${POOL_NAME}: ${points} of ${max}</strong>${first ? "" : " — no pool found"}</span></div>` : ""}
      ${menu.map(row => rowHTML(row, known.get(row.feature), row.free ? (currentFree.has(row.key) ? row.key : null) : current, { facts, currentType, mark })).join("")}
      ${(paid && (points === 0)) ? `<p class="hint" style="margin:0.25rem 0 0;">No ${POOL_NAME} — the rows stay so the sheet is not the only place that says so.</p>` : ""}`;
    const boxes = pickInputs(fs, "bf-metamagic");
    // The free rows' ticks stand apart from the one-per-cast pick.
    const freeBoxes = pickInputs(fs, "bf-metamagic-free");
    const syncFree = () => {
      const ticked = [...freeBoxes].filter(b => b.checked && !b.disabled)
        .map(b => menu.find(r => r.key === b.value)).filter(r => r?.eligible)
        .map(r => ({ key: r.key, feature: r.feature, type: r.fixed ?? null, at: Date.now() }));
      if ( ticked.length ) freePending.set(activity.uuid, ticked); else freePending.delete(activity.uuid);
      // B4 — a free row that ASKS at the area (Sculpt Spells): the one-per-cast record carries it (no cost, no pool),
      // unless a paid pick stands; its cap is set at the card's birth, off the slot cast.
      const asker = ticked.map(r => METAMAGIC[menu.find(m => m.key === r.key)?.feature ?? ""] ? r : null).find(r => r && METAMAGIC[r.feature]?.asks);
      const held = pending.get(activity.uuid);
      if ( asker && (!held || held.free) ) {
        pending.set(activity.uuid, { key: asker.key, feature: asker.feature, cost: 0, free: true, itemUuid: known.get(asker.feature)?.uuid ?? null,
          actorUuid: actor.uuid, at: Date.now(), spellUuid: activity.item?.uuid ?? null, activityUuid: activity.uuid, spellName: activity.item?.name ?? null, poolId: null });
      } else if ( !asker && held?.free ) pending.delete(activity.uuid);
    };
    for ( const b of freeBoxes ) b.addEventListener("change", syncFree);
    syncFree();
    const sync = () => {
      const picked = [...boxes].find(b => b.checked)?.value ?? null;
      for ( const b of boxes ) {
        const row = b.closest("[data-bf-metamagic-row]");
        const own = b.value === picked;
        if ( !picked || own ) b.disabled = row?.dataset.bfOff === "1";
        else b.disabled = true;   // one option per cast: a tick greys the rest
        if ( row ) row.style.opacity = (b.disabled && !own) ? "0.55" : "1";
      }
      // Heightened's and Transmuted's radios are inert until their option is ticked.
      for ( const [key, sub, name] of [["heightened", "mark", "bf-metamagic-mark"], ["transmuted", "type", "bf-metamagic-type"]] ) {
        const on = picked === key;
        for ( const r of pickInputs(fs.querySelector(`[data-bf-metamagic-row="${key}"]`), name) ) r.disabled = !on;
        const box = fs.querySelector(`[data-bf-metamagic-row="${key}"] [data-bf-metamagic-sub="${sub}"]`);
        if ( box ) box.style.opacity = on ? "1" : "0.45";
      }
      const pick = metamagicPick({ menu, chosen: picked });
      if ( pick ) {
        const item = known.get(pick.feature);
        const typeBox = pickInputs(fs.querySelector('[data-bf-metamagic-row="transmuted"]'), "bf-metamagic-type").find(i => i.checked) ?? null;
        const markBox = pickInputs(fs.querySelector('[data-bf-metamagic-row="heightened"]'), "bf-metamagic-mark").find(i => i.checked) ?? null;
        pending.set(activity.uuid, { key: pick.key, feature: pick.feature, cost: pick.cost, itemUuid: item?.uuid ?? null, actorUuid: actor.uuid, at: Date.now(),
          spellUuid: activity.item?.uuid ?? null, activityUuid: activity.uuid, spellName: activity.item?.name ?? null,
          // The rule rides the record for the concentration gate to quote.
          ...(pick.key === 'extended' ? { rule: metamagicRuleText(item?.system?.description?.value ?? '') } : {}),
          poolId: poolFor(actor, item)?.id ?? null,
          ...(pick.key === "transmuted" ? { from: facts.damageTypes.filter(t => TRANSMUTED_TYPES.includes(t)), type: typeBox?.value ?? TRANSMUTED_TYPES.find(t => !facts.damageTypes.includes(t)) ?? null } : {}),
          ...(pick.key === "distant" ? { rangeFeet: distantRange(facts) } : {}),
          ...(pick.key === "careful" ? { cap } : {}),
          // Heightened's rule rides the demand for the save gate (law 8); a marked target rides as CHOSEN.
          ...(pick.key === "heightened" ? { rule: metamagicRuleText(item?.system?.description?.value ?? ""),
            ...(markBox ? { chosen: true, target: { uuid: markBox.value, name: markBox.dataset.name ?? markBox.value } } : {}) } : {}) });
      } else pending.delete(activity.uuid);
    };
    for ( const b of boxes ) b.addEventListener("change", sync);
    for ( const r of [...pickInputs(fs, "bf-metamagic-type"), ...pickInputs(fs, "bf-metamagic-mark")] ) r.addEventListener("change", sync);
    sync();
    const footer = element.querySelector(SURFACES.dialogFooter);
    if ( footer ) footer.before(fs); else (element.querySelector("form") ?? element).appendChild(fs);
  } catch(err) { log.warn(`Could not add the metamagic fieldset.`, err); }
});

// ⚠ An unclaimed pick (window cancelled, template never placed) must not land on the NEXT cast:
// the close hook sweeps it and the stamp refuses a stale one.
const PICK_TTL_MS = 5 * 60 * 1000;
listen("closeActivityUsageDialog", "metamagic", app => {
  try {
    const uuid = (app?.activity ?? app?.options?.activity)?.uuid ?? null;
    if ( !uuid || !pending.has(uuid) ) return;
    setTimeout(() => { const p = pending.get(uuid); if ( p && !p.born ) pending.delete(uuid); }, 3000);
    setTimeout(() => { freePending.delete(uuid); }, 3000);
  } catch { /* the sweep is a courtesy */ }
});

/** One row: tick, name, tag, the rule folded under — nothing above the fold (the offer-row law). */
function rowHTML(row, item, current, { facts = null, currentType = null, mark = null } = {}) {
  const off = !row.eligible || !row.affordable;
  const rule = metamagicRuleText(item?.system?.description?.value ?? "");
  // Transmuted's new type: a radio per listed type the spell does not already deal.
  let sub = "";
  if ( (row.key === "transmuted") && !off ) {
    const has = new Set(facts?.damageTypes ?? []);
    const options = TRANSMUTED_TYPES.filter(t => !has.has(t));
    const picked = currentType ?? options[0] ?? null;
    const cap = s => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
    sub = `<div data-bf-metamagic-sub="type" style="grid-column:2 / -1;display:flex;flex-wrap:wrap;gap:0.3rem 0.75rem;font-size:var(--font-size-12,12px);">
      ${options.map(t => `<label style="display:flex;align-items:center;gap:0.3rem;cursor:pointer;">${pickInputHTML({ kind: "radio", name: "bf-metamagic-type", value: t, checked: t === picked, style: "margin:0;" })} ${cap(t)}</label>`).join("")}</div>`;
  }
  if ( (row.key === "heightened") && !off && mark?.targets?.length ) {
    const picked = heightenedMark({ contained: mark.targets, casterUuid: mark.casterUuid, casterDisposition: mark.casterDisposition, chosen: mark.chosen })?.uuid ?? null;
    sub = `<div data-bf-metamagic-sub="mark" style="grid-column:2 / -1;display:flex;flex-wrap:wrap;gap:0.3rem 0.75rem;font-size:var(--font-size-12,12px);">
      ${mark.targets.map(t => `<label style="display:flex;align-items:center;gap:0.3rem;cursor:pointer;">${pickInputHTML({ kind: "radio", name: "bf-metamagic-mark", value: t.uuid, data: { name: t.name }, checked: t.uuid === picked, style: "margin:0;" })} ${esc(t.name)}</label>`).join("")}</div>`;
  }
  return `<div data-bf-metamagic-row="${esc(row.key)}" data-bf-off="${off ? 1 : 0}"
      style="display:grid;grid-template-columns:auto 1fr auto;gap:0.2rem 0.6rem;align-items:center;margin:0.3rem 0;padding:0.4rem 0.6rem;border-radius:4px;
             background:rgba(0,0,0,0.25);border:1px solid var(--color-border-dark,rgba(0,0,0,0.4));border-left:3px solid ${off ? "rgb(120,120,120)" : "rgb(222,120,40)"};${off ? "opacity:0.55;" : ""}">
      ${pickInputHTML({ name: row.free ? "bf-metamagic-free" : "bf-metamagic", value: row.key, checked: current === row.key, disabled: !!off, style: "margin:0;" })}
      <label style="font-weight:bold;cursor:pointer;">${esc(row.feature)}</label>
      <span style="font-size:var(--font-size-11,11px);letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;opacity:0.8;">${esc(row.tag)}</span>
      ${sub}
      ${foldedRuleHTML(rule)}
    </div>`;
}

/* --- Transmuted Spell: every damage roll of the cast wears the picked type -------------------- */

/** The metamagic record (or `flag`'s) on the card a roll names as its origin, or on the activity's newest card. */
function recordForRoll(activity, message, flag = METAMAGIC_FLAG) {
  try {
    const data = message?.data ?? {};
    const id = originIdInData(data);
    const card = id ? game.messages.get(id) : null;
    // A roll that names its card reads that card alone: an earlier cast's pick never rides it.
    if ( card ) return readFlag(card, flag) ?? null;
    // No origin named (a roll from the sheet): the activity's newest card of the last minute.
    const recent = game.messages.contents.slice(-40).reverse().find(m => (activityUuidOf(m) === activity?.uuid)
      && readFlag(m, flag) && (Math.abs(Date.now() - (m.timestamp ?? 0)) <= 60_000));
    return readFlag(recent, flag) ?? null;
  } catch { return null; }
}

/** A roll that deals damage (never healing or temporary hit points) — what a `fixed` row retypes. */
const dealsDamage = roll => { const t = lower(roll?.options?.type ?? ""); return !!t && (t !== "healing") && (t !== "temphp"); };

// The roll's `options.type` is what the verdict and the applier read: set it before the dice.
listen("dnd5e.preRollDamage", "metamagic", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.item?.type !== "spell" ) return;
    const record = recordForRoll(activity, message);
    if ( (record?.key !== "transmuted") || !record.type ) return;
    const to = lower(record.type);
    let changed = false;
    for ( const roll of config.rolls ?? [] ) {
      const was = lower(roll.options?.type ?? "");
      if ( !TRANSMUTED_TYPES.includes(was) || (was === to) ) continue;
      roll.options ??= {};
      roll.options.type = to;
      if ( Array.isArray(roll.options.types) ) roll.options.types = [to];
      changed = true;
    }
    if ( changed ) foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.metamagicType`, { type: to, feature: record.feature });
  } catch(err) {
    log.warn(`Transmuted Spell could not set the damage type — the roll wears the spell's own.`, err);
  }
});

// A `fixed` free row (Psychic Spells): every damage roll of the cast takes the row's type.
listen("dnd5e.preRollDamage", "metamagic", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.item?.type !== "spell" ) return;
    const record = recordForRoll(activity, message, FREE_FLAG);
    const last = (Array.isArray(record) ? record : []).filter(r => r?.type).at(-1);
    if ( !last ) return;
    const to = lower(last.type);
    let changed = false;
    for ( const roll of config.rolls ?? [] ) {
      if ( !dealsDamage(roll) || (lower(roll.options.type) === to) ) continue;
      roll.options.type = to;
      if ( Array.isArray(roll.options.types) ) roll.options.types = [to];
      changed = true;
    }
    if ( changed ) foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.metamagicType`, { type: to, feature: last.feature });
  } catch(err) {
    log.warn(`A free damage-type row could not set the type — the roll wears the spell's own.`, err);
  }
});

/* --- The card: born with the pick; the points spent once the cast has landed ------------------ */

// The free rows ride their own birth flag: no cost, no deferral, never the one-per-cast record.
listen("preCreateChatMessage", "metamagic", doc => {
  try {
    const uuid = activityUuidOf(doc);
    if ( !uuid || !freePending.has(uuid) || !isCard(doc, CARD.usage) ) return;
    const free = freePending.get(uuid).filter(r => (Date.now() - (r.at ?? 0)) <= PICK_TTL_MS);
    freePending.delete(uuid);
    if ( free.length ) doc.updateSource({ flags: { [MODULE_ID]: { [FREE_FLAG]: free.map(r => ({ key: r.key, feature: r.feature, type: r.type })) } } });
  } catch(err) { log.warn(`The free row's tick could not be stamped on the card.`, err); }
});

listen("preCreateChatMessage", "metamagic", doc => {
  try {
    const uuid = activityUuidOf(doc);
    if ( !uuid || !pending.has(uuid) ) return;
    if ( !isCard(doc, CARD.usage) ) return;
    const pick = pending.get(uuid);
    if ( (Date.now() - (pick.at ?? 0)) > PICK_TTL_MS ) { pending.delete(uuid); return; }
    pick.born = true;
    const { born, at, ...record } = pick;
    void born; void at;
    const flags = { [MODULE_ID]: { [METAMAGIC_FLAG]: { ...record, spent: false, ...statContext(pick.actorUuid ?? null) } } };
    // THE DEFERRED CARD: a Careful/Heightened cast waiting on its area cancels the birth and keeps
    // the data; the real card (the one animations key on) is posted on the answer.
    const activity = resolveUuid(uuid);
    // B4 — Sculpt Spells' cap: 1 + the slot the card was cast at.
    if ( record.key === "sculpt" ) record.cap = 1 + (Number(doc.system?.spellLevel ?? doc.system?.level) || Number(activity?.item?.system?.level) || 0);
    const areaComing = (carefulKind(record.key) || (record.key === "heightened")) && !record.chosen && !!activity?.target?.template?.type;
    if ( areaComing ) {
      const data = doc.toObject();
      data.flags = foundry.utils.mergeObject(data.flags ?? {}, flags);
      deferredCards.set(uuid, { data, pick: record, actorUuid: pick.actorUuid ?? null });
      openCastHold(uuid);
      return false;
    }
    doc.updateSource({ flags });
  } catch(err) { log.warn(`The metamagic pick could not be stamped on the card.`, err); }
});

/** activity uuid → the usage card held back until the ask at the area is answered. */
const deferredCards = new Map();
const DEFERRED_FLAG = "metamagicDeferred";

// THE CAST HOLD (holds.js): while the ask is up the card does not exist, so card-keyed modules wait.
// ⚠ EVERY path that ends the question must release: answer, clock, empty area, failed or deleted
// carrier, the real card's birth (on preCreate: create hooks fire DURING the create).

/** Slack over the ask's clock before a hold gives up — the answer still has to write. */
const HOLD_SLACK_MS = 30_000;

/** A clockless ask gets a clockless hold (ARCHITECTURE §5 law 11). */
function openCastHold(uuid) {
  const window = decisionWindow();
  raiseHold(uuid, { reason: "metamagic-ask", bound: window ? ((window * 1000) + HOLD_SLACK_MS) : null });
}

// The real card's BIRTH lifts the hold, before any `createChatMessage` handler can observe it...
listen("preCreateChatMessage", "metamagic", doc => {
  const uuid = doc.getFlag?.("dnd5e", "activity")?.uuid ?? null;
  if ( uuid && readFlag(doc, METAMAGIC_FLAG)?.chosen ) releaseHold(uuid, doc);
});
// ...and a card posted from ANOTHER client fires no preCreate here, so its arrival lifts it too.
listen("createChatMessage", "metamagic", message => {
  const uuid = activityUuidOf(message);
  if ( uuid && readFlag(message, METAMAGIC_FLAG)?.chosen ) releaseHold(uuid, message);
});

// A deleted carrier is the ask withdrawn: the points are spent, so post the card as cast.
// ⚠ Only the casting client holds one, so exactly one client does this.
listen("deleteChatMessage", "metamagic", message => {
  try {
    const ask = readFlag(message, AREA_ASK_FLAG);
    const held = readFlag(message, DEFERRED_FLAG);
    if ( !held || (ask?.status !== "pending") ) return;
    const uuid = held.activityUuid ?? held.pick?.activityUuid ?? "";
    if ( !isHeld(uuid) ) return;
    log.warn(`The ask at the area was deleted — posting ${held.pick?.feature ?? "the cast"}'s card as cast.`);
    void postDeferredCard({ data: held.data, pick: held.pick }, held.poolSpend ?? null, null, held.templateIds ?? []);
  } catch(err) { log.error(`The deleted ask's card could not be posted.`, err); }
});

listen("dnd5e.postUseActivity", "metamagic", (activity, _usageConfig, results) => {
  try {
    const pick = pending.get(activity?.uuid);
    if ( !pick ) return;
    pending.delete(activity.uuid);
    const held = deferredCards.get(activity.uuid);
    if ( held ) {
      deferredCards.delete(activity.uuid);
      void carryDeferredCard(activity, held, (results?.templates ?? []).flat().filter(t => t?.parent));
      return;
    }
    const message = (results?.message instanceof ChatMessage) ? results.message : null;
    void spendForPick(activity, pick, message);
  } catch(err) { log.error(`The metamagic spend failed — spend the Sorcery Points by hand.`, err); }
});

/** Spend now; if the area holds anyone a CARRIER whisper asks and its answer posts the real card, else post it now. */
async function carryDeferredCard(activity, held, templates) {
  const actor = activity?.actor;
  const pool = held.pick.poolId ? actor?.items?.get(held.pick.poolId) : null;
  const record = pool ? await spendPoolUses(actor, pool, held.pick.feature, held.pick.cost ?? 1, POOL_NAME) : null;
  if ( !pool ) log.warn(`${held.pick.feature}: no Sorcery Points pool on ${actor?.name} — nothing spent.`);
  const casterTok = tokenOf(actor) ?? null;
  // A chosen area never asks its caster about themself; nor does an Emanation, which leaves its origin out.
  const spell = activity.item?.name ?? "the spell";
  const chooses = chosenAreaListed(activity.item) || selfEmanation(activity);
  const contained = (tokensInRegions(templates) ?? [])
    .filter(c => !chooses || ((c.uuid !== actor?.uuid) && !(casterTok && (c.tokenId === casterTok.id))));
  const templateIds = templates.map(t => t.id);
  if ( !contained.length ) { await postDeferredCard(held, record, null, templateIds); return; }
  const uuid = activity.uuid;
  const carrierMade = await (async () => {
  const casterDisposition = casterTok?.document?.disposition ?? actor?.prototypeToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  const candidates = contained.map(c => ({ uuid: c.uuid, name: c.name, disposition: c.disposition ?? null, tokenId: c.tokenId ?? null, party: isPartyMember(c.uuid) }));
  const option = featureNamed(actor, held.pick.feature);
  const featureRule = held.pick.rule ?? metamagicRuleText(option?.system?.description?.value ?? "");
  // Heightened on a chosen area with a real choice asks ONE question (who, with Heightened's radio);
  // otherwise the stamp writes the default choice.
  const description = activity.item?.system?.description?.value ?? "";
  const cap = chooses ? choiceCapFrom(description) : null;
  const caster = { uuid: actor?.uuid ?? null, disposition: casterDisposition, name: actor?.name ?? null };
  const merged = chooses && (held.pick.key === "heightened") && choiceNeedsAsk({ candidates, casterUuid: caster.uuid, casterDisposition, cap });
  const ask = merged
    ? newAsk({ kind: "choose", feature: spell, spell, cap, rule: choiceRuleFrom(description), itemImg: activity.item?.img ?? null,
      heightened: { feature: held.pick.feature, rule: featureRule }, candidates, caster })
    : newAsk({ kind: held.pick.key, feature: held.pick.feature, cap: held.pick.cap ?? 1, rule: featureRule, candidates, caster });
  const words = askWords(ask);
  await postCard({
    actor, to: ownersAndGmIds(actor),
    card: bfCard({ img: merged ? (activity.item?.img ?? null) : (option?.img ?? null),
      eyebrow: words.eyebrow, tone: "pending", title: words.carrierTitle, subtitle: words.carrierSubtitle }),
    flags: { [MODULE_ID]: {
      [AREA_ASK_FLAG]: ask,
      [DEFERRED_FLAG]: { data: held.data, pick: held.pick, poolSpend: record, templateIds, activityUuid: activity.uuid }
    } }
  }); return true; })().catch(err => { log.error(`The ask's carrier could not be posted — the card posts as cast.`, err); return false; });
  if ( !carrierMade ) await postDeferredCard(held, record, null, templateIds);
  void uuid;
}

/** Post the real card with the spend; `extra` rides the birth flags (saves/demand.js `areaChoiceForDemand`). */
async function postDeferredCard(held, record, answer, templateIds, extra = null) {
  const data = foundry.utils.deepClone(held.data);
  const mm = foundry.utils.getProperty(data, `flags.${MODULE_ID}.${METAMAGIC_FLAG}`) ?? {};
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.${METAMAGIC_FLAG}`, { ...mm, spent: !!record, ...(answer ?? {}) });
  if ( record ) foundry.utils.setProperty(data, `flags.${MODULE_ID}.poolSpend`, record);
  for ( const [key, value] of Object.entries(extra ?? {}) ) foundry.utils.setProperty(data, `flags.${MODULE_ID}.${key}`, value);
  if ( !game.users.get(data.author)?.active || (data.author !== game.user.id && !game.user.isGM) ) data.author = game.user.id;
  const card = await ChatMessage.create(data);
  if ( !card ) { releaseHold(held.pick.activityUuid ?? "", null); return null; }
  releaseHold(held.pick.activityUuid ?? "", card);
  const activity = cardActivity(card, held.pick.activityUuid ?? null);
  const scene = canvas.scene ?? game.scenes.active;
  const templates = (templateIds ?? []).map(id => scene?.regions?.get(id)).filter(Boolean);   // a placed area is a Region
  publish("deferredUsageCard", { activity, message: card, templates });
  return card;
}

async function spendForPick(activity, pick, message) {
  if ( pick?.free || !(Number(pick?.cost) > 0) ) return;   // B4 — a free row (Sculpt Spells) spends nothing
  const actor = activity?.actor;
  const pool = pick.poolId ? actor?.items?.get(pick.poolId) : null;
  if ( !pool ) { log.warn(`${pick.feature}: no Sorcery Points pool on ${actor?.name} — nothing spent.`); return; }
  const record = await spendPoolUses(actor, pool, pick.feature, pick.cost ?? 1, POOL_NAME);
  if ( !message || !record ) return;
  // ⚠ An update, not a birth flag: the flash's `updateChatMessage` reader catches it (resources.js).
  await message.update({ flags: { [MODULE_ID]: { poolSpend: record, [METAMAGIC_FLAG]: { ...(readFlag(message, METAMAGIC_FLAG) ?? pick), spent: true } } } });
}

/* --- The durable record — one line on the spell's card, every render, idempotent (law 6) ------ */

listen("dnd5e.renderChatMessage", "metamagic", (message, html) => {
  try {
    const record = readFlag(message, METAMAGIC_FLAG);
    if ( !record ) return;
    if ( readFlag(message, AREA_ASK_FLAG)?.status === "pending" ) return;   // the ask's own line speaks
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-metamagic-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-metamagic-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-wand-sparkles" data-tooltip="Metamagic"></i> ${esc(metamagicCardLine(record))}`;
    content.appendChild(div);
  } catch(err) { log.warn(`The metamagic line could not render.`, err); }
});

listen("dnd5e.renderChatMessage", "metamagic", (message, html) => {
  try {
    const free = readFlag(message, FREE_FLAG);
    if ( !Array.isArray(free) || !free.length ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-metamagic-free-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-metamagic-free-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = free.map(r => `<i class="fa-solid fa-brain" data-tooltip="${esc(r.feature)}"></i> ${esc(metamagicCardLine(r))}`).join("<br>");
    content.appendChild(div);
  } catch(err) { log.warn(`The free row's line could not render.`, err); }
});

/* --- Empowered Spell: a row of the dice changers' popup (dice-changers.js) --------------------- */

/**
 * Empowered Spell's row for a caster, or null: known, listed and affordable now; cap = CHA mod, min 1.
 * @param {Actor} actor
 * @returns {{cost: number, cap: number, poolId: string, rule: object|string|null}|null}
 */
export function empoweredOffer(actor) {
  const item = knownOptions(actor).get("Empowered Spell");
  if ( !item ) return null;
  const pool = poolFor(actor, item);
  const cost = costOf(item) ?? 1;
  if ( !pool || ((pool.system?.uses?.value ?? 0) < cost) ) return null;
  return { cost, cap: Math.max(1, Number(actor.system?.abilities?.cha?.mod) || 1), poolId: pool.id,
    rule: metamagicRuleText(item.system?.description?.value ?? "") };
}

/* --- The ask at the area: metamagic's answer part (area-ask.js owns the popup and the clock) --- */

registerAskAnswerPart(async (message, ask, outcome) => {
  const mm = readFlag(message, METAMAGIC_FLAG) ?? {};
  const rule = (ask.kind === "choose") ? (ask.heightened?.rule ?? mm.rule ?? "") : (mm.rule ?? ask.rule ?? "");
  // What the answer makes CHOSEN on the cast's metamagic record — none for a chosen area alone.
  const mmAnswer = (ask.kind === "careful") ? { chosen: true, protected: outcome.protectedList }
    : ((ask.kind === "heightened") || ask.heightened) ? { chosen: true, target: outcome.mark, rule } : null;
  const held = readFlag(message, DEFERRED_FLAG);
  if ( held ) {
    await message.setFlag(MODULE_ID, AREA_ASK_FLAG, outcome.done);
    await postDeferredCard({ data: held.data, pick: held.pick }, held.poolSpend ?? null, mmAnswer, held.templateIds ?? [],
      outcome.areaChoice ? { [AREA_CHOICE_FLAG]: { ...outcome.areaChoice, ...statContext(ask.casterUuid ?? null) } } : null);
    await message.delete().catch(() => {});
    return { handled: true };
  }
  return mmAnswer ? { flags: { [METAMAGIC_FLAG]: { ...mm, ...mmAnswer } } } : null;
});
