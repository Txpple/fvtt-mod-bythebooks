/**
 * By the Books — MACHINE layer (ARCHITECTURE.md §2): the post-roll D20 FOLDS, the spends that patch
 * an already-rolled d20 (ARCHITECTURE.md §11, "Adding a FOLD"). The original `Roll` is never
 * touched: the die posts as its own message stamped `respondsTo` and the verdict is recomputed on
 * a module flag. The module offers by itself only where it owns the number (an attack's snapshot
 * AC, a demanded save's DC); a raw check has no DC in dnd5e, so a check's fold is always a
 * button. Depend downward only: core → decide → spine (ui) → here.
 */
import { MODULE_ID, readFlag, TITLE, S, setting, queueFlagWrite, canAnswerFor, isActiveGM, statContext, decisionWindow, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { ruleHTML } from "./rule-text.js";
import { answers, d20FoldEntries, metamagicEntries, listedNames } from "./decide/registry.js";
import { activityNamed, cardActivity, featureNamed, itemNamed, itemsNamed, lower, resolveDie, rerollD20, wieldedNamed, wornNamed } from "./lookup.js";
import { grantingActor, hitTargets, poolSpendsOn, poolOf, spendPoolUses, turnChitStands, writeTurnChit, saveDemandOf } from "./shared.js";
import { bfCard, holdBarHTML, momentBarHTML, ruleLine, spendPhrase, RESCUE_KINDS, rescueLabel, rescueView, rescueSourceFor } from "./decide/present.js";
import { ATTACK_FOLDS, SAVE_FOLDS, foldsFrom, foldedRoll, foldedVerdict } from "./decide/verdict.js";
import { ADVANTAGE_BUYS, D20_FLOORS, REROLLS, SAVE_SUCCEEDS, SUPERIORITY_FOLDS, TACTICAL_FOLDS, d20FloorEntries } from "./decide/registry.js";
import { CHIP_FLAG } from "./decide/chips.js";
import { deathSaveFoldWanted } from "./decide/death-saves.js";
import { foldRise } from "./decide/dice-chips.js";
import { cardRow, armAskTimer, disarmAskTimer, electOwns, openMomentPopup, acknowledgeMoment, momentAcknowledged, registerRescue, syncRescuePopup,
  pendingDemandsFor, registerWithhold, resumeWithheld, dramaticVerdictPause, pendingRow, postCard } from "./ui.js";
import { offerDamageRoll, registerMissWait, rollDamageForAttack } from "./auto-damage.js";
import { activityUuidOf, originData, subKindOf, targetsOf } from "./decide/card.js";
import { listen } from "./dispatch.js";
import { esc } from "./decide/present.js";
import { dieMaxOf, foldCanReach } from "./decide/rescue-hit.js";

/** Per-kind views onto `RESCUE_KINDS`: one copy of each quoted string, shared with the rescue view. */
const kindTable = pick => Object.fromEntries(
  Object.entries(RESCUE_KINDS).map(([kind, spec]) => [kind, spec[pick]]));
const KIND_LABEL = kindTable("label");
const SPEND_COST = kindTable("cost");
const labelOf = rescueLabel;

// THE SPEND RESOLVERS, one per kind (ARCHITECTURE.md §6 rule 3). ⚠ `tests` is each feature's
// own trigger, read off its rules text (Tactical Mind: checks only).

const HEROIC = {
  tests: ["attack", "save", "check"],
  find: actor => ((actor?.type === "character") && (actor.system?.attributes?.inspiration === true))
    ? { kind: "heroic" } : null,
  die: () => null,                                        // a REROLL contributes no die
  /** ⚠ The write IS the spend: a boolean is none of dnd5e's consumption kinds, so there is no
   * activity to `use()` — this is the sheet toggle's own update. */
  spend: async actor => { await actor.update({ "system.attributes.inspiration": false }); return true; }
};

/** Tactical Mind. ⚠ The consumption target is a compendium UUID re-linked only via
 * `actor.sourcedItems`; a hand-copied Second Wind fails that silently, so a pool miss is REPORTED. */
const TACTICAL = {
  tests: ["check"],
  find: (actor, entry, ctx = {}) => {
    const item = itemNamed(actor, entry.name);
    // B4 — a TACTICAL_FOLDS row names its activity and may judge the attack's weapon (Homing Strikes: the Psychic Blades).
    const own = tacticalRowOf(entry);
    if ( own?.weapon && ctx.item && !lower(ctx.item.name ?? "").startsWith(lower(own.weapon)) ) return null;
    const activity = own?.activity ? activityNamed(item, own.activity) : item?.system.activities?.contents?.[0];
    if ( !activity ) return null;
    for ( const c of (activity.consumption?.targets ?? []) ) {
      if ( c.type !== "itemUses" ) continue;
      const pool = c.target ? actor.items.get(c.target) : item;
      if ( !pool ) {
        warnOnce(`${entry.name}|unremapped`, `"${entry.name}" consumes uses of an item `
          + `this actor does not have (target "${c.target}"). If that looks like a compendium `
          + "UUID rather than an id, the actor's copy of the pool item was not imported from the "
          + "pack the feature expects, so dnd5e could not re-link it — the fold stays off.");
        return null;
      }
      if ( (pool.system.uses?.value ?? 0) <= 0 ) return null;   // genuinely spent — stay quiet
    }
    return { kind: "tactical", item, activity };
  },
  die: marker => marker.activity.roll?.formula || null,
  spend: async (_actor, marker, message) => {
    await marker.activity.use({ subsequentActions: false }, { configure: false }, {
      // `foldSpend` marks this use as the rescue's spend, so the sheet-arming hook stands aside.
      data: { ...originData(message.id), flags: { [MODULE_ID]: { foldSpend: message.id } } }
    });
    return true;
  }
};

/** A Bardic Inspiration die somebody gave you. ⚠ The die is the BARD's (see `die`). */
const BARDIC = {
  tests: ["attack", "save", "check"],
  find: (actor, entry) => {
    const effect = actor?.effects?.find(e =>
      !e.disabled && (e.name?.toLowerCase() === entry.name.toLowerCase()));
    return effect ? { kind: "bardic", effect } : null;
  },
  die: marker => {
    const bard = grantingActor(marker.effect);
    if ( !bard ) {
      warnOnce(`bardic|${marker.effect.id}`, `"${marker.effect.name}" does not lead back `
        + `to the actor who granted it (origin "${marker.effect.origin}"), and the die size is `
        + "theirs to know — the fold stays off rather than guessing one.");
      return null;
    }
    // ⚠ Resolved against the BARD: against the recipient `@scale.bard.inspiration` is silently 0.
    // ⚠ `formula`/`die` are getters on `ScaleValueTypeDice`; accept only a plain string.
    const scale = foundry.utils.getProperty(bard.getRollData(), "scale.bard.inspiration");
    const formula = scale?.formula ?? scale?.die ?? null;
    if ( (typeof formula !== "string") || !formula.trim() ) {
      warnOnce(`bardic|scale|${bard.id}`, `${bard.name} has no readable bard inspiration `
        + "scale value, so the die they grant cannot be known — the fold stays off rather than "
        + "guessing a d6.");
      return null;
    }
    return formula;
  },
  spend: async (_actor, marker) => { await marker.effect.delete(); return true; }
};

/** Seeking Spell: a spell attack's miss rerolled, paid from Font of Magic by hand. On the sheet AND
 * on the Metamagic list; the cost is its activity's consumption value, read live. */
const SEEKING = {
  tests: ["attack"],
  find: (actor, entry, ctx = {}) => {
    if ( !ctx.spell ) return null;
    if ( !listedNames(metamagicEntries()).has(lower(entry.name)) ) return null;
    const item = itemNamed(actor, entry.name);
    const activity = item?.system?.activities?.contents?.[0] ?? null;
    if ( !item || !activity ) return null;
    const pool = poolOf(actor, activity);
    const cost = Math.max(1, Number(activity.consumption?.targets?.find(t => t.type === "itemUses")?.value) || 1);
    if ( !pool || ((pool.system?.uses?.value ?? 0) < cost) ) return null;
    return { kind: "seeking", item, pool, cost };
  },
  die: () => null,                                        // a REROLL contributes no die
  spend: async (actor, marker, message) => {
    const record = await spendPoolUses(actor, marker.pool, "Seeking Spell", marker.cost, "Sorcery Points");
    if ( !record ) return false;
    if ( message ) await message.setFlag(MODULE_ID, "poolSpend", record);
    return true;
  }
};

/** Lucky's Advantage on a dialog-less initiative (`Combat#rollInitiative` never pauses): a second
 * d20 after the roll, the HIGHER standing — RULINGS *Where the table bends the rule*. */
const ADVANTAGE = {
  tests: ["initiative"],
  find: (actor, entry) => {
    const key = Object.keys(ADVANTAGE_BUYS).find(k => lower(k) === lower(entry.name));
    const row = key ? ADVANTAGE_BUYS[key] : null;
    if ( !row ) return null;
    const item = itemsNamed(actor, key, { types: ["feat"] })
      .find(i => !row.uses || (Number(i.system?.uses?.max) > 0));
    if ( !item || (row.uses && !(Number(item.system.uses.value ?? 0) > 0)) ) return null;
    return { kind: "advantage", key, row, item };
  },
  die: () => null,                                        // the second d20 is the reroll's rebuild
  spend: async (actor, marker, message) => {
    const record = await spendPoolUses(actor, marker.item, marker.key, 1, `${marker.row.point}s`);
    if ( !record ) return false;
    if ( message ) await message.setFlag(MODULE_ID, "poolSpend", record);
    return true;
  }
};

/** Guarded Mind: a FAILED save of a listed ability made a success (SAVE_SUCCEEDS). Nothing is
 * rolled; the spend is the feature's own activity. */
const SUCCEED = {
  tests: ["save"],
  testsFor: entry => succeedRowOf(entry.name)?.row.tests ?? ["save"],
  find: (actor, entry, ctx = {}) => {
    const found = succeedRowOf(entry.name);
    if ( !found ) return null;
    const { key, row } = found;
    // A save row names its abilities (Guarded Mind); an attack or check row has none to read (D1).
    if ( row.abilities && (!ctx.ability || !row.abilities.includes(ctx.ability)) ) return null;
    if ( row.weapon && ctx.item && (ctx.item.type !== "weapon") ) return null;
    if ( row.whileEffect && !actorWears(actor, row.whileEffect) ) return null;
    if ( row.oncePerTurn && turnChitStands(actor, "rider", `fold:${key}`) ) return null;
    // The DMG — a `worn` row: the magic item equipped (and attuned); `against`: the demand's school or its caster's type.
    const item = row.worn ? wornNamed(actor, row.feature ?? key) : itemNamed(actor, row.feature ?? key);
    if ( !item ) return null;
    if ( row.against && ctx.demand ) {
      const school = lower(ctx.demand.school ?? "");
      const type = lower(ctx.demand.source?.type ?? "");
      if ( !(row.against.schools ?? []).includes(school) && !(row.against.creatureTypes ?? []).includes(type) ) return null;
    }
    // D1 — `activity: null` (Unerring Strike): nothing pays, nothing counts down.
    if ( row.activity === null ) return { kind: "succeed", key, row, item, activity: null, pool: null, left: null };
    const activity = activityNamed(item, row.activity);
    if ( !activity ) return null;
    const pool = poolOf(actor, activity) ?? item;
    const left = Number(pool?.system?.uses?.value ?? 0);
    if ( !(left > 0) ) return null;
    return { kind: "succeed", key, row, item, activity, pool, left };
  },
  die: () => null,                                        // no die: the verdict itself
  spend: async (actor, marker, message) => {
    if ( marker.activity ) {
      const used = await marker.activity.use({ subsequentActions: false }, { configure: false }, {
        data: { ...originData(message.id), flags: { [MODULE_ID]: { foldSpend: message.id } } }
      });
      if ( !used ) return false;                          // a use that did not happen grants nothing
    }
    if ( marker.row.oncePerTurn ) {
      await writeTurnChit(actor, "rider", { name: `${marker.row.label} — used this turn`, img: marker.item?.img ?? null,
        origin: marker.item?.uuid ?? null, riderKey: `fold:${marker.key}` });
    }
    return true;
  }
};

/** The SAVE_SUCCEEDS row a D20_FOLDS `succeed` entry names. */
function succeedRowOf(name) {
  const key = Object.keys(SAVE_SUCCEEDS).find(k => lower(k) === lower(name));
  return key ? { key, row: SAVE_SUCCEEDS[key] } : null;
}

/** The roller wears an enabled effect of this name (D1: Living Legend's 10 minutes). */
const actorWears = (actor, name) => (actor?.appliedEffects ?? actor?.effects?.contents ?? [])
  .some(e => !e.disabled && (lower(e.name) === lower(name)));

/** D1 — what a `succeed` spend records: the twenty (Stroke of Luck), the hit (Unerring Strike), else the saved verdict. */
function succeedEntry(marker, message) {
  if ( marker?.row?.twenty ) {
    const roll = message?.rolls?.[0];
    const face = roll?.dice?.[0]?.results?.find(r => (r.active !== false) && !r.discarded)?.result ?? null;
    if ( Number.isFinite(Number(roll?.total)) && Number.isFinite(face) ) return { twenty: { total: Number(roll.total) - face + 20, face } };
  }
  if ( marker?.row?.hit ) return { verdict: "hit" };
  return { verdict: "saved" };
}

/** The `reroll` kind (REROLLS; the PHB classes, B1): a FAILED save rerolled, the row's bonus added, paid by the row's
 * cost — the item's uses (Indomitable), or once per Rage (Fanatical Focus: the mark sits on the Rage effect and goes
 * with it). ⚠ The bonus is read off the ROLLER; unreadable, the fold stays off (BARDIC's shape). */
const REROLL = {
  tests: ["save"],
  testsFor: entry => rerollRowOf(entry.name)?.row.tests ?? ["save"],
  find: (actor, entry) => {
    const found = rerollRowOf(entry.name);
    if ( !found ) return null;
    const { key, row } = found;
    // THE DMG — `wields` (Luck Blade): the magic item on the roller's person, its `activity`'s own use the pay.
    if ( row.wields ) {
      if ( row.notIncapacitated && actor.statuses?.has?.("incapacitated") ) return null;
      const weapon = wieldedNamed(actor, key);
      const luck = weapon ? activityNamed(weapon, row.activity) : null;
      const left = Number(luck?.uses?.value ?? 0);
      if ( !luck || !(left > 0) ) return null;
      return { kind: "reroll", key, row, item: weapon, rage: null, bonus: 0, pool: null, activity: luck, left };
    }
    const item = featureNamed(actor, key);
    if ( !item ) return null;
    // C1 — `activity` (Disciplined Survivor): the pool is what the feature's own activity consumes (Monk's Focus by uuid).
    const poolActivity = row.activity ? activityNamed(item, row.activity) : null;
    const pool = poolActivity ? poolOf(actor, poolActivity) : null;
    if ( row.activity && !pool ) return null;
    const left = Number((pool ?? item).system?.uses?.value ?? 0);
    if ( (row.uses || pool) && !(left > 0) ) return null;
    if ( row.whileEffect && !actorWears(actor, row.whileEffect) ) return null;
    let rage = null;
    if ( row.while === "raging" ) {
      rage = rageEffectOf(actor);
      if ( !rage ) return null;
      if ( (row.once === "rage") && (readFlag(rage, "rerollUsed") ?? []).includes(key) ) return null;
    }
    // A row with no bonus (Disciplined Survivor) rerolls flat; a bonus the sheet cannot resolve keeps the fold off.
    const bonus = (row.bonus === null) ? 0 : rerollBonus(actor, item, row);
    if ( bonus === null ) {
      warnOnce(`reroll|${key}|${actor.id}`, `${actor.name}'s ${key} bonus (${row.bonus}) could not be read off `
        + "the sheet, so the fold stays off rather than guessing a number.");
      return null;
    }
    return { kind: "reroll", key, row, item, rage, bonus, pool: pool ?? null, left: (row.uses || pool) ? left : null };
  },
  die: () => null,                                        // a REROLL contributes no die; the bonus rides the entry
  spend: async (actor, marker, message) => {
    // THE DMG — the activity's own use (Luck Blade's Luck, once per dawn).
    if ( marker.row.wields && marker.activity ) {
      const spent = (Number(marker.activity.uses?.spent) || 0) + 1;
      await marker.item.update({ [`system.activities.${marker.activity.id}.uses.spent`]: spent });
      return true;
    }
    if ( marker.row.uses || marker.pool ) {
      const record = await spendPoolUses(actor, marker.pool ?? marker.item, marker.key, 1, null);
      if ( !record ) return false;
      if ( message ) await message.setFlag(MODULE_ID, "poolSpend", record);
    }
    if ( (marker.row.once === "rage") && marker.rage ) {
      await queueFlagWrite(marker.rage, "rerollUsed", used => {
        if ( used.includes(marker.key) ) return false;
        used.push(marker.key);
      }, { initial: [] });
    }
    return true;
  }
};

/** The REROLLS row a D20_FOLDS entry names. */
function rerollRowOf(name) {
  const key = Object.keys(REROLLS).find(k => lower(k) === lower(name));
  return key ? { key, row: REROLLS[key] } : null;
}

/** The Rage this actor wears (the pack's effect, by name), else null. */
const rageEffectOf = actor => (actor?.appliedEffects ?? actor?.effects?.contents ?? [])
  .find(e => !e.disabled && (lower(e.name) === "rage")) ?? null;

/** The reroll's bonus as a NUMBER on the roller: the pack's own "Bonus" activity roll first, then the row's formula. */
function rerollBonus(actor, item, row) {
  const own = [...(item?.system?.activities ?? [])].map(a => a.roll?.formula).find(f => (typeof f === "string") && f.trim());
  for ( const raw of [own, row.bonus] ) {
    if ( !raw ) continue;
    const formula = resolveDie(actor, raw);
    if ( !formula ) continue;
    try {
      const n = Number(Roll.safeEval(formula));
      if ( Number.isFinite(n) ) return n;
    } catch { /* the next formula */ }
  }
  return null;
}

const KINDS = { heroic: HEROIC, tactical: TACTICAL, bardic: BARDIC, seeking: SEEKING, advantage: ADVANTAGE, succeed: SUCCEED, reroll: REROLL };
/** The kinds that REPLACE the d20 rather than add to it (Lucky's Advantage keeps the HIGHER — `resolveFold`). */
const REROLL_KINDS = new Set(["heroic", "seeking", "advantage", "reroll"]);
/** The kinds whose contribution is the VERDICT — nothing rolled, nothing added. */
const VERDICT_KINDS = new Set(["succeed"]);

/** The roll's own d20, as it stands. */
const naturalOf = roll => Number(roll?.d20?.total ?? roll?.dice?.[0]?.total ?? Number.NaN);

/** The offers whose best outcome still reaches the target (decide/rescue-hit.js foldCanReach): a die too small for the gap,
 * or a new d20 that cannot get there, is not offered; with no target known every offer stands. */
const reaching = (offers, roll) => offers.filter(o => foldCanReach({
  shape: VERDICT_KINDS.has(o.kind) ? "verdict" : REROLL_KINDS.has(o.kind) ? "reroll" : "die",
  dieMax: dieMaxOf(o.dieFormula), bonus: o.bonus ?? null }, roll));

/** Warn once per distinct cause. */
const warned = new Set();
function warnOnce(key, message) {
  if ( warned.has(key) ) return;
  warned.add(key);
  log.warn(message);
}

/** A `tactical` entry with a SCOPE of its own — the Battle Master's Ambush / Tactical Assessment (decide/registry.js SUPERIORITY_FOLDS). */
const scopeOf = entry => (entry.kind === "tactical")
  ? (Object.entries(SUPERIORITY_FOLDS).find(([k]) => k.toLowerCase() === String(entry.name ?? "").toLowerCase())?.[1] ?? null) : null;
/** B4 — a `tactical` entry that is a feature's OWN fold, not a maneuver (TACTICAL_FOLDS): its tests, activity and weapon. */
const tacticalRowOf = entry => (entry.kind === "tactical")
  ? (Object.entries(TACTICAL_FOLDS).find(([k]) => k.toLowerCase() === String(entry.name ?? "").toLowerCase())?.[1] ?? null) : null;
/** Tactical Mind alone carries the refund clause: a scoped maneuver die and a feature's own fold are spent either way. */
const refundsOf = entry => (entry.kind === "tactical") && !scopeOf(entry) && !tacticalRowOf(entry);

/**
 * EVERY listed fold this actor can spend on this kind of test, never just the first (list order
 * must not choose the resource). `spent` excludes what this roll already used.
 * @param {Actor} actor
 * @param {"attack"|"save"|"check"|"initiative"} testKind
 * @param {string[]} [spent]
 * @param {{skill?: string|null, spell?: boolean, ability?: string|null}} [ctx]
 */
function availableFolds(actor, testKind, spent = [], ctx = {}) {
  const out = [];
  for ( const entry of d20FoldEntries() ) {
    const spec = KINDS[entry.kind];
    if ( !spec ) continue;
    // A SCOPED entry: the feature's text says which checks (and whether Initiative) it reaches.
    const scope = scopeOf(entry);
    const tests = scope ? [...((scope.skills?.length) ? ["check"] : []), ...(scope.initiative ? ["initiative"] : [])]
      : (tacticalRowOf(entry)?.tests ?? spec.testsFor?.(entry) ?? spec.tests);
    if ( !tests.includes(testKind) ) continue;
    if ( scope && (testKind === "check") && !(ctx.skill && scope.skills.includes(ctx.skill)) ) continue;
    if ( spent.includes(entry.kind) || spent.includes(entry.name) ) continue;   // by NAME too: two tactical rows can stand
    const marker = spec.find(actor, entry, ctx);
    if ( !marker ) continue;
    let dieFormula = spec.die(marker);
    if ( scope && dieFormula ) {
      dieFormula = resolveDie(actor, dieFormula);
    } else if ( dieFormula && /@/.test(dieFormula) ) {
      // C1 — a tactical row's die off its activity (Peerless Skill: "@scale.bard.inspiration"): the bearer's number, for the offer's label.
      dieFormula = resolveDie(actor, dieFormula) ?? dieFormula;
    }
    if ( !REROLL_KINDS.has(entry.kind) && !VERDICT_KINDS.has(entry.kind) && !dieFormula ) continue;   // a die-kind with no die is off
    // ⚠ `name` is the LOOKUP KEY, `label` what the table reads; they differ for `bardic`.
    const buy = (entry.kind === "advantage") ? { cost: `1 ${marker.row.point} · ${Number(marker.item.system.uses.value ?? 0)} left`,
      rule: marker.row.rule } : {};
    // D1 — a succeed row's own words: the twenty (Stroke of Luck), the hit (Unerring Strike); nothing paid, its clock.
    const succeed = (entry.kind === "succeed") ? { label: marker.row.label, rule: marker.row.rule,
      says: marker.row.twenty ? "turn the d20 into a 20" : marker.row.hit ? "hit instead" : "succeed instead",
      cost: (marker.left === null) ? (marker.row.oncePerTurn ? "once on each of your turns" : "free") : `${RESCUE_KINDS.succeed.cost} · ${marker.left} left` } : {};
    // A reroll row: the feature's name, its bonus as a number, its cost in its own words (a use, or the Rage's once).
    const reroll = (entry.kind === "reroll") ? { label: marker.key, rule: marker.row.rule, bonus: marker.bonus, advantage: marker.row.advantage === true,
      cost: marker.row.uses ? `1 use · ${marker.left} left, the new roll stands` : (marker.row.once === "rage") ? "once this Rage, the new roll stands"
        : marker.row.reaction ? "your Reaction, the new roll stands" : RESCUE_KINDS.reroll.cost } : {};
    out.push({ kind: entry.kind, name: entry.name, label: (scope || tacticalRowOf(entry)) ? entry.name : (KIND_LABEL[entry.kind] ?? entry.name),
      dieFormula, ...(scope ? { cost: "the superiority die is spent either way it lands", rule: scope.rule } : {}), ...buy, ...succeed, ...reroll });
  }
  return out;
}

// STAMP: on the roller's own client, on the message it authored.

const foldTimers = new Map();
const foldInFlight = new Set();

function baseFlag(actor, offers, testKind, total, window) {
  return {
    status: "pending",
    testKind,
    actorUuid: actor.uuid,
    baseTotal: total,
    offers,                                   // ⚠ every eligible fold, not the first one
    spends: [],                               // what has actually been burned, in order
    answer: null,
    ...statContext(actor.uuid),
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
  };
}

/** The attack stamp's decision, SYNCHRONOUS (the miss wait reads it at the roll): `{ attacker, offers, judged,
 * spell }` for a clean miss the fold will offer on, else null. */
function attackFoldFor(subject, message, roll) {
  if ( !subject || (subject.type !== "attack") ) return null;
  const attacker = subject.actor;
  if ( !attacker || !(message instanceof ChatMessage) || !roll ) return null;
  if ( readFlag(message, "d20fold") ) return null;           // never re-stamp
  const spell = subject.item?.type === "spell";
  let offers = availableFolds(attacker, "attack", [], { spell, item: subject.item ?? null });
  // ⚠ A natural 1 stands against an added die; only a reroll replaces it.
  if ( roll.isFumble ) offers = offers.filter(o => REROLL_KINDS.has(o.kind) || (o.kind === "succeed"));
  if ( !offers.length ) return null;
  const snapshot = targetsOf(message);
  if ( !snapshot.length || hitTargets(message).length ) return null;  // clean misses only
  const judged = snapshot.filter(t => (t.ac !== null) && (t.ac !== undefined));
  if ( !judged.length ) return null;                                  // null AC — humans have it
  // only what could still turn the miss on the easiest target into a hit
  offers = reaching(offers, { total: roll.total, kept: naturalOf(roll), target: Math.min(...judged.map(t => Number(t.ac))) });
  if ( !offers.length ) return null;
  return { attacker, offers, judged, spell };
}
registerMissWait((subject, message, roll) => !!attackFoldFor(subject, message, roll));

/** ATTACKS: the module owns the AC, so a clean miss (every judged target) is offered by itself. */
listen("dnd5e.rollAttack", "d20-folds", async (rolls, { subject }) => {
  try {
    const message = rolls?.[0]?.parent;
    const roll = rolls?.[0];
    const found = attackFoldFor(subject, message, roll);
    if ( !found ) return;
    const { attacker, offers, judged, spell } = found;

    const window = decisionWindow();
    await message.setFlag(MODULE_ID, "d20fold", {
      ...baseFlag(attacker, offers, "attack", roll.total, window),
      ...(spell ? { spell: true } : {}),
      targets: judged.map(t => ({ uuid: t.uuid, name: t.name, ac: t.ac,
        margin: t.ac - roll.total, verdict: null }))
    });
    armFoldTimer(message);
  } catch(err) {
    log.error(`D20 fold stamp (attack) failed.`, err);
  }
});

/**
 * CHECKS AND NATIVE SAVES: no DC exists, so these stamp an OFFER that times out to `pass`.
 * ⚠ The names the system DISPATCHES (`#rollD20Test` fires only non-V2 hooks); a wrong name fails
 * silently — smoke-d20-folds §4 asserts each one fires.
 */
const PLAIN_HOOKS = [
  ["dnd5e.rollAbilityCheck", "check"],
  ["dnd5e.rollSkill", "check"],
  ["dnd5e.rollToolCheck", "check"],
  ["dnd5e.rollSavingThrow", "save"]
];
for ( const [hook, testKind] of PLAIN_HOOKS ) {
  listen(hook, "d20-folds", async (rolls, data) => {
    try {
      const subject = data?.subject;
      if ( !(subject instanceof Actor) ) return;
      const message = rolls?.[0]?.parent;
      if ( !(message instanceof ChatMessage) ) return;
      if ( readFlag(message, "d20fold") ) return;
      // ⚠ A DEMANDED (or module concentration) save is offered by `offerFoldOnSave`, which knows the
      // DC; stamping here too would race the withheld verdict.
      if ( (testKind === "save") && pendingSaveDemandFor(subject) ) return;
      if ( (testKind === "save") && rolls?.[0]?.options?.isConcentration && pendingDemandsFor(subject.uuid, { flagKey: "concentration" }).length ) return;
      const skill = data?.skill ?? null;
      const ability = (testKind === "save") ? (data?.ability ?? null) : null;
      // A maneuver ARMED from the sheet folds in by itself; the other folds are offered after.
      if ( (testKind === "check") && await applyArmedFold(message, subject, testKind, { skill }) ) return;
      // A Death Saving Throw has its target (10): a success is never offered, a failure only what can still reach it,
      // and the system's tally is WITHHELD (the veto below) until the offer is answered.
      const death = (testKind === "save") && (subKindOf(message) === "death");
      const target = death ? (Number(rolls[0].options?.target ?? 10) || 10) : null;
      if ( death && !deathSaveFoldWanted({ total: rolls[0].total, target }) ) return;
      let offers = availableFolds(subject, testKind, [], { skill, ability });
      if ( death ) offers = reaching(offers, { total: rolls[0].total, kept: naturalOf(rolls[0]), target });
      if ( !offers.length ) return;
      // ⚠ SYNCHRONOUS, before the first await: the system's `dnd5e.rollDeathSave` follows this hook at once.
      if ( death ) withheldDeath.add(message.id);
      const window = decisionWindow();
      try {
        await message.setFlag(MODULE_ID, "d20fold",
          { ...baseFlag(subject, offers, testKind, rolls[0].total, window), ...(skill ? { skill } : {}), ...(ability ? { ability } : {}),
            ...(death ? { dc: target, death: true, resume: { by: "death-save", uuid: subject.uuid } } : {}) });
      } catch(err) {
        // ⚠ Fail OPEN: a broken offer must never swallow the Death Saving Throw — the tally lands as rolled.
        if ( death ) await resumeWithheld("death-save", { uuid: subject.uuid }, message).catch(e => log.error(`The Death Saving Throw could not be written — tick it on the sheet.`, e));
        throw err;
      } finally {
        withheldDeath.delete(message.id);
      }
      armFoldTimer(message);
    } catch(err) {
      log.error(`D20 fold stamp (${hook}) failed.`, err);
    }
  });
}

/** The Death Saving Throws whose fold is being stamped on this client: the system's tally waits for the answer. */
const withheldDeath = new Set();

/** WITHHOLD, DO NOT UNDO: a Death Saving Throw offered a fold writes no tally now; `death-saves.js` writes it once the
 * offer is answered (the `death-save` machine), from the roll as it then stands. A stamped flag withholds too (a reload). */
listen("dnd5e.rollDeathSave", "d20-folds", rolls => {
  const message = rolls?.[0]?.parent;
  if ( !message?.id ) return;
  if ( withheldDeath.has(message.id) ) return false;
  const flag = readFlag(message, "d20fold");
  if ( flag?.death && (flag.resume?.by === "death-save") ) return false;
});

/** INITIATIVE: a scoped fold or Lucky's Advantage offered on the roll's message; accepting re-sets
 * the combatant's initiative to the composed total (DESIGN §4). */
const initiativeStamps = new Set();   // same-client latch: the two roads below can meet on one message
async function stampInitiative(actor, combatants, message) {
  if ( !(actor instanceof Actor) ) return;
  if ( !message || readFlag(message, "d20fold") || !message.isAuthor ) return;
  if ( initiativeStamps.has(message.id) ) return;
  initiativeStamps.add(message.id);
  try {
    const total = Number(message.rolls?.[0]?.total ?? combatants?.[0]?.initiative ?? 0);
    if ( await applyArmedFold(message, actor, "initiative", { combatants: combatants ?? [], total }) ) return;
    // Lucky's Advantage only on a PLAIN roll: not already at Advantage, no dialog showed the box.
    const roll = message.rolls?.[0] ?? null;
    const plain = !roll?.options?.bfBuyShown && !(Number(roll?.options?.advantageMode) > 0)
      && !(Number(roll?.options?.advantageMode) < 0);
    const offers = availableFolds(actor, "initiative").filter(o => (o.kind !== "advantage") || plain);
    if ( !offers.length ) return;
    const window = decisionWindow();
    await message.setFlag(MODULE_ID, "d20fold", { ...baseFlag(actor, offers, "initiative", total, window),
      combatId: game.combat?.id ?? null, combatantIds: (combatants ?? []).map(c => c.id) });
    armFoldTimer(message);
  } finally {
    initiativeStamps.delete(message.id);
  }
}

// The actor's own roll (`Actor5e#rollInitiative` — the sheet, a macro): dnd5e's hook.
listen("dnd5e.rollInitiative", "d20-folds", async (actor, combatants) => {
  try {
    if ( !(actor instanceof Actor) ) return;
    const message = game.messages.contents.slice(-30).reverse().find(m => m.getFlag("core", "initiativeRoll")
      && ((m.speaker?.actor === actor.id) || (m.getAssociatedActor?.()?.uuid === actor.uuid)));
    await stampInitiative(actor, combatants, message);
  } catch(err) {
    log.error(`D20 fold stamp (initiative) failed.`, err);
  }
});

// ⚠ The tracker's roll button never fires `dnd5e.rollInitiative` (`Combat#rollInitiative` bypasses
// the actor's); its `initiativeRoll` message is the witness. The latch keeps the two roads to one stamp.
listen("createChatMessage", "d20-folds", async message => {
  try {
    if ( !message.getFlag("core", "initiativeRoll") || !message.isAuthor ) return;
    const actor = message.getAssociatedActor?.() ?? null;
    if ( !(actor instanceof Actor) ) return;
    const combatants = game.combat?.combatants?.filter(c => c.actor?.uuid === actor.uuid) ?? [];
    await stampInitiative(actor, combatants, message);
  } catch(err) {
    log.error(`D20 fold stamp (initiative message) failed.`, err);
  }
});

/** Is this actor mid-answer on a save this module demanded? (the spine's demand registry) */
function pendingSaveDemandFor(actor) {
  return pendingDemandsFor(actor.uuid, { flagKey: "saves" }).length > 0;
}

const armFoldTimer = message =>
  armAskTimer(foldTimers, message, "d20fold", live => answerFold(live, "pass", { timedOut: true }), { owns: electOwns });

// THE DEMANDED-SAVE EDGE. ⚠ WITHHOLD, DO NOT UNDO: the save machine's verdict pauses while this
// offer is live; `offer` returns true when the caller must NOT fold yet. `by` names the machine
// the verdict goes back to, on the resume stamp so a reload knows who is owed.
registerWithhold("d20fold", {
  offer: (rollMessage, { by, card, uuid, total, dc }) => offerFoldOnSave(rollMessage, card, uuid, total, dc, by)
});

async function offerFoldOnSave(rollMessage, card, uuid, total, dc, by = null) {
  try {
    const existing = readFlag(rollMessage, "d20fold");
    if ( existing ) return existing.status === "pending";   // already asked; don't ask twice
    if ( !Number.isFinite(dc) || !Number.isFinite(total) || (total >= dc) ) return false;
    const actor = await resolveUuidAsync(uuid);
    if ( !(actor instanceof Actor) ) return false;
    const ability = rollMessage.system?.ability ?? null;
    // The demand the save answers (the DMG's Scarab reads its school and its caster's type).
    const demand = saveDemandOf(card);
    // only what could still lift the save to the DC
    const offers = reaching(availableFolds(actor, "save", [], { ability, demand }),
      { total, kept: naturalOf(rollMessage.rolls?.[0]), target: dc });
    if ( !offers.length ) return false;

    const window = decisionWindow();
    await rollMessage.setFlag(MODULE_ID, "d20fold", {
      ...baseFlag(actor, offers, "save", total, window),
      ...(ability ? { ability } : {}),
      dc,                                   // ⚠ the ask OWNS it — never re-derived here
      resume: { cardId: card.id, uuid, ...(by ? { by } : {}) }     // how, and by whom, the withheld verdict gets finished
    });
    armFoldTimer(rollMessage);
    return true;
  } catch(err) {
    log.error(`D20 fold offer on save failed.`, err);
    return false;   // ⚠ fail OPEN: a broken offer must never swallow a save's verdict
  }
}

/** Finish a verdict another machine withheld for us — win, lose or pass, the save must resolve.
 * A resume stamped without `by` falls to the one machine registered. */
async function resumeWithheldSave(flag, rollMessage) {
  if ( !flag?.resume ) return;
  try {
    await resumeWithheld(flag.resume.by ?? null, flag.resume, rollMessage);
  } catch(err) {
    log.error(`resuming the withheld save failed.`, err);
  }
}

// ANSWER + RESOLVE

/** `answer` is a KIND to spend, or "pass". First writer wins, then the work is executed. */
async function answerFold(message, answer, { timedOut = false } = {}) {
  let claimed = false;
  let withdrawn = false;
  await queueFlagWrite(message, "d20fold", current => {
    if ( (current.status !== "pending") || current.answer ) return;
    if ( (answer !== "pass") && !(current.offers ?? []).some(o => offerAnswers(o, answer)) ) return;
    // ⚠ THE SPEND-GUARD, inside the lock on purpose: a sibling can have fixed the roll since the
    // window rendered; only the serializer makes "still failing" and "claimed" one decision.
    if ( (answer !== "pass") && !foldPremiseAlive(message, current) ) {
      current.status = "resolved";
      current.outcome = "no longer needed";
      current.offers = [];
      withdrawn = true;
      return;
    }
    current.answer = answer;
    current.answeredAt = Date.now();          // the crash-resume horizon
    if ( timedOut ) current.timedOut = true;
    if ( answer === "pass" ) {
      current.status = "resolved";
      current.outcome = current.spends?.length ? "used" : (timedOut ? "passed (timer)" : "passed");
    }
    claimed = true;
  });
  if ( withdrawn ) {
    disarmAskTimer(foldTimers, message.id);
    return;
  }
  if ( !claimed ) return;
  const live = readFlag(message, "d20fold");
  if ( answer === "pass" ) {
    if ( !live?.spends?.length ) await announceIfNeeded(message, live);
    await resumeWithheldSave(live, message);
    return;
  }
  await resolveFold(message, answer);
}

/** Does this offer answer to this token? A kind, or `tactical:<name>` where two tactical rows stand. */
const offerAnswers = (o, answer) => (o.kind === answer) || (`${o.kind}:${o.name}` === answer);

/** The accept path: spend the marker, roll (or REROLL), stamp, announce, re-offer or finish. */
async function resolveFold(message, answer) {
  if ( foldInFlight.has(message.id) ) return;
  foldInFlight.add(message.id);   // before the first await
  try {
    const flag = readFlag(message, "d20fold");
    if ( !flag || (flag.answer !== answer) || (flag.status !== "pending") ) return;
    const actor = await resolveUuidAsync(flag.actorUuid);
    if ( !(actor instanceof Actor) ) return;
    const offer = (flag.offers ?? []).find(o => offerAnswers(o, answer));
    const kind = offer?.kind;
    const spec = kind ? KINDS[kind] : null;
    if ( !spec || !offer ) return;

    // ⚠ THE RESUME GATE: a spend with `pendingVerdict` means a resolver died after the dice; the
    // crash-resume composes, never spends or rolls again.
    const already = (flag.spends ?? []).some(sp => sp.pendingVerdict && (sp.kind === kind) && ((sp.name ?? sp.kind) === (offer.name ?? kind)));
    let spends;
    let marker = null;   // a resume has none: the spend already took it
    if ( already ) {
      spends = flag.spends ?? [];
    } else {
      // ⚠ RE-FIND AT RESOLVE TIME: the marker can be gone after minutes in the window.
      marker = spec.find(actor, { name: offer.name, kind }, { spell: !!flag.spell, ability: flag.ability ?? null });
      if ( !marker ) {
        await queueFlagWrite(message, "d20fold", current => {
          current.status = "resolved";
          current.outcome = current.spends?.length ? "used" : "gone";
        });
        await resumeWithheldSave(flag, message);
        return;
      }

      // ⚠ Re-check the PREMISE: a crash-resume arrives late, the roll perhaps fixed meanwhile.
      if ( !foldPremiseAlive(message, flag) ) {
        await queueFlagWrite(message, "d20fold", current => {
          if ( current.status !== "pending" ) return false;
          current.status = "resolved";
          current.outcome = "no longer needed";
          current.offers = [];
        });
        await resumeWithheldSave(flag, message);
        return;
      }

      if ( !(await spec.spend(actor, marker, message)) ) return;

      // The new number, public, stamped `respondsTo` so no recognizer claims it. A VERDICT kind rolls nothing.
      let rolled = null;
      let rolledMessage = null;
      if ( !VERDICT_KINDS.has(kind) ) {
        rolled = REROLL_KINDS.has(kind)
          ? await rerollD20(message.rolls?.[0], actor, { advantage: (kind === "reroll") && (marker.row.advantage === true) })
          : await rollDie(spec.die(marker) ?? offer.dieFormula, actor);
        if ( !rolled ) return;
        // Lucky's Advantage: the HIGHER of the two d20s stands, its crit with it.
        if ( kind === "advantage" ) {
          const first = message.rolls?.[0];
          if ( first && (Number(first.total) > Number(rolled.summary.total)) ) {
            rolled.summary = { total: first.total, isCritical: first.isCritical === true, isFumble: first.isFumble === true };
          }
        }
        const faceOf = r => r?.dice?.[0]?.results?.find(x => (x.active !== false) && !x.discarded)?.result ?? null;
        const rise = foldRise({ mode: (kind === "advantage") ? "advantage" : REROLL_KINDS.has(kind) ? "reroll" : "die",
          oldFace: faceOf(message.rolls?.[0]), newFace: faceOf(rolled.roll), total: rolled.summary.total, on: actor.uuid });
        // The reroll's bonus is its own chip beside the new die (Indomitable's "+9").
        if ( rise && (kind === "reroll") && Number.isFinite(marker.bonus) && marker.bonus ) rise.chips.push({ label: `+${marker.bonus}`, flat: true, up: true });
        rolledMessage = await rolled.roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: (kind === "advantage") ? `${labelOf(offer)} — the second d20`
            : REROLL_KINDS.has(kind) ? `${labelOf(offer)} — the reroll` : `${labelOf(offer)} — the die`,
          flags: { [MODULE_ID]: { respondsTo: message.id, ...(rise ? { diceRise: rise } : {}) } }
        });
      }

      // Record the spend; the verdict composes across EVERY fold on the message (Precision too).
      // ⚠ Recorded BEFORE the dice pause, with `pendingVerdict`, so a crash is never spent twice.
      const entry = {
        kind, name: offer.name, label: offer.label, pendingVerdict: true,
        ...(VERDICT_KINDS.has(kind) ? succeedEntry(marker, message)
          : REROLL_KINDS.has(kind) ? { reroll: rolled.summary, ...((kind === "reroll") ? { bonus: marker.bonus } : {}) } : { die: rolled.summary.total })
      };
      await queueFlagWrite(message, "d20fold", current => {
        if ( current.status !== "pending" ) return false;
        current.spends = [...(current.spends ?? []), entry];
      });
      spends = [...(flag.spends ?? []), entry];

      // The dice land BEFORE the verdict (a capped, cosmetic pause).
      if ( rolledMessage ) await dramaticVerdictPause(rolledMessage);
    }
    const pending = { ...flag, status: "resolved", outcome: "used", spends };
    // ⚠ The spec set is picked BY TEST KIND: the attack spec walks `flag.targets`, a save has none.
    const folds = foldFolds(message, pending);
    const baseRoll = foldBase(message, flag);
    // ⚠ ONE TARGET'S SLICE on an attack: `ATTACK_FOLDS` holds a contribution per target × spend;
    // summing them all double-counts a die.
    const composed = (flag.testKind === "attack")
      ? foldedRoll(baseRoll, folds.filter(f => f.uuid === flag.targets?.[0]?.uuid))
      : foldedRoll(baseRoll, folds);

    // The re-offer, excluded by NAME: spending Ambush must not hide Tactical Mind, its kind-mate.
    // only what could still win from where the roll now stands (the easiest target still missed, or the DC)
    const missed = (flag.testKind === "attack") ? (flag.targets ?? []).filter(t => foldedVerdict(t, baseRoll, folds) !== "hit").map(t => Number(t.ac)).filter(Number.isFinite) : [];
    const target = (flag.testKind === "attack") ? (missed.length ? Math.min(...missed) : null) : (Number.isFinite(flag.dc) ? flag.dc : null);
    const remaining = reaching(availableFolds(actor, flag.testKind, spends.map(s => s.name ?? s.kind), { skill: flag.skill ?? null, spell: !!flag.spell, ability: flag.ability ?? null }),
      { total: composed.total, kept: null, target });
    const stillFailing = isStillFailing(flag, composed, baseRoll, folds);
    const reoffer = remaining.length && stillFailing;
    const succeeded = folds.some(f => f.verdict === "saved");

    const lines = [];
    let anyHit = false;
    await queueFlagWrite(message, "d20fold", current => {
      current.spends = spends.map(sp => { const done = { ...sp }; delete done.pendingVerdict; return done; });
      current.foldedTotal = composed.total;
      current.answer = null;                       // ⚠ cleared so a re-offer can be answered
      current.offers = reoffer ? remaining : [];
      current.status = reoffer ? "pending" : "resolved";
      if ( !reoffer ) current.outcome = "used";
      // ⚠ The re-offer keeps the ORIGINAL deadline: a clock any spend could extend has no bound.
      if ( !reoffer ) delete current.deadline;
      if ( current.testKind === "attack" ) {
        for ( const t of current.targets ?? [] ) {
          t.verdict = foldedVerdict(t, baseRoll, folds);
          if ( t.verdict === "hit" ) anyHit = true;
          const ac = folds.filter(f => f.uuid === t.uuid).findLast(f => Number.isFinite(f.ac))?.ac
            ?? t.ac;
          const crit = foldedRoll(baseRoll, folds.filter(f => f.uuid === t.uuid)).isCritical;
          lines.push(`${sumText(flag, composed)} vs AC ${ac} — `
            + (t.verdict === "hit" ? `<strong>now hits ${esc(t.name)}</strong>${crit ? " — a Critical Hit" : ""}` : `still misses ${esc(t.name)}`));
        }
      } else if ( succeeded ) {
        lines.push(Number.isFinite(current.dc)
          ? `${flag.baseTotal} vs DC ${current.dc} — <strong>succeeds instead</strong>.`
          : "<strong>The save succeeds instead.</strong>");
      } else if ( Number.isFinite(current.dc) ) {
        const made = composed.total >= current.dc;
        lines.push(`${sumText(flag, composed)} vs DC ${current.dc} — `
          + (made ? `<strong>${(current.testKind === "save") ? "now saves" : "now passes"}</strong>` : "still fails"));
      } else {
        // ⚠ No verdict without a DC: state the arithmetic and stop.
        lines.push(`${sumText(flag, composed)} — the roll now totals <strong>${composed.total}</strong>.`);
      }
    });

    // Tactical Mind's refund clause is ASKED (DESIGN §8): the module cannot judge the check.
    const refundable = refundsOf({ kind, name: offer.name });
    if ( refundable ) {
      lines.push("If the check still fails, this use of Second Wind isn't expended — "
        + "the next window asks which it was.");
    }
    if ( flag.testKind === "initiative" ) {
      const combat = flag.combatId ? game.combats.get(flag.combatId) : game.combat;
      for ( const id of (flag.combatantIds ?? []) ) {
        const c = combat?.combatants?.get(id);
        if ( c ) await c.update({ initiative: composed.total }).catch(err => log.warn(`Could not move the initiative.`, err));
      }
      lines.push(`Initiative <strong>${flag.baseTotal} → ${composed.total}</strong> — the order is updated.`);
    }
    await announce(message, actor, labelOf(offer), flag.testKind, anyHit, lines, marker);
    // The refund ask is SHOWN only once the fold is resolved, never beside a re-offer window.
    if ( refundable ) await stampRefundAsk(message, actor, offer, marker, {
      baseTotal: flag.baseTotal, total: composed.total, dc: Number.isFinite(flag.dc) ? flag.dc : null,
      die: spends.findLast(s => s.kind === "tactical")?.die ?? null
    });

    if ( reoffer ) {
      // Still failing, something left: the window is REDRAWN, not re-popped.
      syncRescuePopup(message);
      if ( readFlag(message, "d20fold")?.deadline ) armFoldTimer(message);
      return;
    }

    // Finish: re-drive an attack chain, or hand a withheld save back.
    if ( flag.testKind === "save" ) {
      await resumeWithheldSave(flag, message);
      return;
    }
    if ( flag.testKind !== "attack" ) return;
    if ( !anyHit || !hitTargets(message).length ) return;
    const attackActivity = cardActivity(message, activityUuidOf(message));
    if ( !attackActivity ) return;
    if ( setting(S.playerRollDamage) ) return void offerDamageRoll(attackActivity, message);
    await rollDamageForAttack(attackActivity, message);
  } catch(err) {
    log.error(`D20 fold resolution failed.`, err);
  } finally {
    foldInFlight.delete(message.id);
  }
}

/** Still a failure after everything spent? ⚠ A check with no DC always answers yes. */
function isStillFailing(flag, composed, baseRoll, folds) {
  if ( flag.testKind === "attack" ) {
    return !(flag.targets ?? []).some(t => foldedVerdict(t, baseRoll, folds) === "hit");
  }
  if ( (folds ?? []).some(f => f.verdict === "saved") ) return false;
  if ( Number.isFinite(flag.dc) ) return composed.total < flag.dc;
  return true;
}

/** The arithmetic sentence — a reroll REPLACES and reads with an arrow; a die ADDS and sums. */
const sumText = (flag, composed) => composed.replaced
  ? (composed.added ? `${flag.baseTotal} → ${composed.total - composed.added} + ${composed.added} = ${composed.total}` : `${flag.baseTotal} → ${composed.total}`)
  : `${flag.baseTotal} + ${composed.added} = ${composed.total}`;

async function announce(_message, actor, name, testKind, anyHit, lines, marker) {
  await postCard({
    actor,
    card: bfCard({
      img: marker?.item?.img ?? marker?.effect?.img ?? null,
      eyebrow: ((marker?.kind === "tactical") && !tacticalRowOf({ kind: "tactical", name })) ? `Maneuver — ${name}` : `D20 Fold — ${name}`,
      tone: (testKind === "attack") ? (anyHit ? "good" : "neutral") : "good",
      title: (testKind === "attack")
        ? (anyHit ? `${name} — the miss becomes a hit` : `${name} — still a miss`)
        : ((marker?.kind === "succeed") && marker.row?.twenty) ? `${name} — the d20 is a 20`
        : (marker?.kind === "succeed") ? `${name} — the failed save succeeds instead`
        : `${name} — the roll is patched`,
      subtitle: ((marker?.kind === "tactical") && !tacticalRowOf({ kind: "tactical", name })) ? "one Superiority Die spent" : `${actor.name} spends ${name}`,
      lines
    })
  });
}

/** A pass with nothing spent says so on a WITHHELD save, where the table is waiting on it. */
async function announceIfNeeded(_message, flag) {
  if ( !flag?.resume ) return;
  const actor = resolveUuid(flag.actorUuid);
  if ( !actor ) return;
  await postCard({
    actor,
    card: bfCard({
      eyebrow: "D20 Fold", tone: "neutral", title: "Passed — the save stands",
      subtitle: actor.name,
      lines: [`${flag.baseTotal} vs DC ${flag.dc} — nothing spent.`]
    })
  });
}

/** A plain added die, from the content's own formula. */
async function rollDie(formula, actor) {
  if ( !formula ) return null;
  const roll = new Roll(String(formula), actor.getRollData());
  await roll.evaluate();
  return { roll, summary: { total: roll.total, isCritical: false, isFumble: false } };
}

// PRESENT. A demanded save's roll is drawn as a SUMMARY inside the usage card, so the block rides
// the `cardRow` seam: the same drawer on the shown card or inside the summary.
listen("dnd5e.renderChatMessage", "d20-folds", cardRow((message, host) => {
  try {
    const flag = readFlag(message, "d20fold");
    if ( !flag ) return;

    const actor = resolveUuid(flag.actorUuid);
    const block = document.createElement("div");
    block.className = "bythebooks-d20fold";
    block.style.margin = "0.4rem 0 0";

    if ( (flag.status === "pending") && flag.answer ) {
      // ANSWERED, NOT YET RESOLVED: the dice are landing.
      const chosen = (flag.offers ?? []).find(o => offerAnswers(o, flag.answer)) ?? null;
      block.innerHTML = bfCard({
        img: foldImg(actor, chosen ? [chosen] : (flag.offers ?? [])),
        eyebrow: "D20 Fold — answered",
        title: chosen ? labelOf(chosen) : "Passed",
        subtitle: chosen ? `${actor?.name ?? ""} · the dice are rolling` : `${actor?.name ?? ""} · ${testKindPhrase(flag)}`,
        tone: "neutral"
      });
      host.append(block);
      syncRescuePopup(message);   // the window closes at the answer, not after the dice
      return;
    }

    if ( flag.status === "pending" ) {
      const offers = flag.offers ?? [];
      // The card only calls the popup BACK; the popup is the one input surface.
      block.innerHTML = bfCard({
        img: foldImg(actor, offers),
        eyebrow: "D20 Fold — offered",
        title: offers.length === 1 ? labelOf(offers[0]) : `${offers.length} ways to patch this roll`,
        subtitle: `${actor?.name ?? ""} · ${testKindPhrase(flag)}`,
        tone: "pending",
        lines: offerLines(flag, offers)
      });
      host.append(block);

      // ⚠ The elect arms HERE too: a player's stamp runs where `armAskTimer` is a no-op, so this
      // render is the clock owner's first sight (and the re-arm after a reload).
      pendingRow(message, block, { bar: holdBarHTML(flag, "to answer"), arm: armFoldTimer });

      if ( !canAnswerFor(actor) ) return;      // spectators get the card, not the controls
      const controls = document.createElement("div");
      Object.assign(controls.style, {
        display: "flex", gap: "0.3rem", marginTop: "0.4rem", justifyContent: "flex-end"
      });
      pendingRow(message, controls, { answer: { show: () => syncRescuePopup(message, { recall: true }),
        style: { flex: "0 0 auto", margin: "0", padding: "0 0.4rem", fontSize: "inherit", lineHeight: "1.4" } } });
      block.append(controls);

      // EVERY offer pops, timed or not; an untimed one has no bar.
      syncRescuePopup(message);
      return;
    }

    // RESOLVED: the durable public record.
    if ( flag.outcome ) {
      const spends = flag.spends ?? [];
      const spent = spends.map(labelOf).join(" + ");
      const used = flag.outcome === "used";
      const maneuver = used && spends.length && spends.every(s => s.kind === "tactical");
      block.innerHTML = bfCard({
        img: foldImg(actor, spends),
        eyebrow: maneuver ? `Maneuver — ${spent}` : used ? "D20 Fold — spent"
          : (flag.outcome === "gone") ? "D20 Fold — gone"
          : flag.timedOut ? "D20 Fold — timed out" : "D20 Fold — passed",
        title: used ? spent : "Nothing spent",
        subtitle: actor?.name ?? "",
        tone: used ? "good" : "neutral",
        lines: resolvedLines(flag, message)
      });
      host.append(block);
    }
  } catch(err) {
    log.error(`D20 fold render failed.`, err);
  }
}));

/** The card's art: the first named fold's document, else the actor's portrait (`heroic` has none). */
function foldImg(actor, named = []) {
  for ( const n of named ) {
    const item = itemNamed(actor, n.name);
    if ( item?.img ) return item.img;
    const effect = actor?.effects?.find(e => e.name?.toLowerCase() === n.name?.toLowerCase());
    if ( effect?.img ) return effect.img;
  }
  return actor?.img ?? null;
}

/** What kind of roll is being patched, in table English — the card's subtitle half. */
function testKindPhrase(flag) {
  if ( flag.testKind === "attack" ) return "the attack missed";
  if ( flag.testKind === "initiative" ) return `initiative · rolled ${flag.baseTotal}`;
  if ( flag.testKind === "save" ) {
    return Number.isFinite(flag.dc) ? `the save failed (${flag.baseTotal} vs DC ${flag.dc})`
      : `saving throw · rolled ${flag.baseTotal}`;
  }
  return `check · rolled ${flag.baseTotal}`;
}

/** The cost the card says for an offer — the kind's sentence; a verdict kind's own (its uses left). */
const costOnCard = o => (VERDICT_KINDS.has(o.kind) ? (o.cost ?? SPEND_COST[o.kind]) : SPEND_COST[o.kind]) ?? null;

/** The offer card's body: what can be spent (each cost on its own line), and under holdReveal what it must beat. */
function offerLines(flag, offers) {
  const lines = offers.map(o => `<strong>${labelOf(o)}</strong>`
    + ((o.kind === "reroll") ? ` — reroll the d20${Number(o.bonus) ? `, +${o.bonus}` : ""}${o.advantage ? " with Advantage" : ""}`
      : REROLL_KINDS.has(o.kind) ? " — reroll the d20" : VERDICT_KINDS.has(o.kind) ? ` — ${o.says ?? "succeed instead"}` : ` — add ${o.dieFormula}`)
    + (costOnCard(o) ? ` <em>(${costOnCard(o)})</em>` : ""));
  if ( setting(S.holdReveal) ) {
    for ( const t of flag.targets ?? [] ) {
      lines.push(`Needs +${t.margin} to reach ${t.name} (AC ${t.ac} vs ${flag.baseTotal}).`);
    }
    if ( Number.isFinite(flag.dc) ) {
      lines.push(`Needs +${flag.dc - flag.baseTotal} to reach DC ${flag.dc}.`);
    }
  }
  if ( flag.spends?.length ) {
    lines.push(`Already spent: <strong>${flag.spends.map(labelOf).join(", ")}</strong> — still short.`);
  }
  return lines;
}

/** The settled card's body: the numbers the verdict was reached with. */
function resolvedLines(flag, message) {
  if ( flag.outcome === "gone" ) return ["The resource was no longer there to spend."];
  if ( flag.outcome === "no longer needed" ) {
    return ["No longer needed — the roll got there without it, and nothing was spent."];
  }
  if ( flag.outcome !== "used" ) {
    return [flag.timedOut
      ? "The window closed with no answer — the roll stands."
      : "Passed — the roll stands."];
  }
  const lines = [];
  if ( (flag.spends ?? []).some(s => VERDICT_KINDS.has(s.kind)) ) {
    lines.push(Number.isFinite(flag.dc)
      ? `<strong>The save succeeds instead</strong> — ${flag.baseTotal} vs DC ${flag.dc}.`
      : "<strong>The save succeeds instead.</strong>");
    return lines;
  }
  if ( Number.isFinite(flag.foldedTotal) ) {
    lines.push(`<strong>${flag.baseTotal}</strong> → <strong>${flag.foldedTotal}</strong>`);
  }
  if ( flag.testKind === "attack" ) {
    for ( const t of flag.targets ?? [] ) {
      if ( t.verdict ) lines.push(t.verdict === "hit"
        ? `<strong>Now hits ${esc(t.name)}</strong> (AC ${t.ac}).`
        : `Still misses ${t.name} (AC ${t.ac}).`);
    }
  } else if ( Number.isFinite(flag.dc) ) {
    lines.push((flag.foldedTotal >= flag.dc)
      ? `<strong>The save succeeds</strong> against DC ${flag.dc}.`
      : `Still fails DC ${flag.dc}.`);
  }
  const refund = readFlag(message, "tacticalRefund");
  if ( refund ) lines.push(refundLine(refund));
  else if ( (flag.spends ?? []).some(s => refundsOf({ kind: s.kind, name: s.name })) ) {   // Tactical Mind, never a scoped die or a feature's own fold
    lines.push("If the check still fails, this use of Second Wind isn't expended.");
  }
  return lines;
}

/** The fold contributions this roll carries, one home for the resolver and the window. `flag` may be
 * a pending copy; spec set by test kind, one target's slice on an attack (see `resolveFold`). */
function foldFolds(message, flag) {
  const specs = (flag?.testKind === "attack") ? ATTACK_FOLDS : SAVE_FOLDS;
  const folds = foldsFrom(
    key => ((key === "d20fold") ? flag : readFlag(message, key)), specs);
  return (flag?.testKind === "attack")
    ? folds.filter(f => f.uuid === flag.targets?.[0]?.uuid) : folds;
}

/** The roll the folds compose over — the real d20 where there is one, the stamp's copy otherwise. */
const foldBase = (message, flag) => message.rolls?.[0] ?? { total: flag?.baseTotal };

/** The d20 folds as RESCUE ROWS in the spine's one window (ARCHITECTURE §5); the KIND is the action token. */
registerRescue("d20fold", {
  // ⚠ Answered is not pending: the status stays "pending" until the dice land, but the popup withdraws at the answer.
  isPending: message => { const f = readFlag(message, "d20fold"); return (f?.status === "pending") && !f.answer; },
  subject: message => {
    const uuid = readFlag(message, "d20fold")?.actorUuid;
    return resolveUuid(uuid);
  },
  view: message => {
    const flag = readFlag(message, "d20fold");
    if ( !flag ) return null;
    return rescueView(key => ((key === "d20fold") ? flag : null), {
      composed: foldedRoll(foldBase(message, flag), foldFolds(message, flag)),
      reveal: setting(S.holdReveal),
      sources: rescueSourceFor("d20fold")
    });
  },
  answer: (message, action) => answerFold(message, action)
});

/** THE MOOT: a sibling spend fixed the roll, so this offer withdraws unspent. ⚠ Elect-owned, single writer. */
async function mootFold(message) {
  let mooted = false;
  await queueFlagWrite(message, "d20fold", current => {
    if ( (current.status !== "pending") || current.answer ) return false;
    current.status = "resolved";
    current.outcome = "no longer needed";
    current.offers = [];
    mooted = true;
  });
  disarmAskTimer(foldTimers, message.id);
  // A withheld Death Saving Throw still owes its tally.
  const flag = readFlag(message, "d20fold");
  if ( mooted && flag?.death ) await resumeWithheldSave(flag, message);
}

/** Is this offer's premise still alive, composed across everything already spent? */
function foldPremiseAlive(message, flag) {
  const folds = foldFolds(message, flag);
  const baseRoll = foldBase(message, flag);
  return isStillFailing(flag, foldedRoll(baseRoll, folds), baseRoll, folds);
}

// EXPIRE + RESUME

listen("updateChatMessage", "d20-folds", (message) => {
  const flag = readFlag(message, "d20fold");
  if ( !flag ) return;
  // ⚠ RE-DERIVED EVERY UPDATE from the COMPOSED roll: a sibling's spend usually kills the premise.
  if ( (flag.status === "pending") && !flag.answer && isActiveGM()
    && !foldPremiseAlive(message, flag) ) {
    void mootFold(message);
    return;
  }
  if ( flag.status !== "pending" ) {
    disarmAskTimer(foldTimers, message.id);
    // ⚠ SYNC, DO NOT CLOSE: this machine owns rows in a shared window; a sibling may still be asking.
    syncRescuePopup(message);
    return;
  }
  // Crash-resume past the 20s horizon: whoever is still here picks up an accepted answer.
  if ( flag.answer && (flag.answer !== "pass") && flag.answeredAt
    && (Date.now() - flag.answeredAt > 20_000) ) {
    void resolveFold(message, flag.answer);
  }
});

listen("deleteChatMessage", "d20-folds", message => {
  disarmAskTimer(foldTimers, message.id);
});

// ARMED FROM THE SHEET: a scoped tactical fold used before the check rolls its die, a chip carries
// the number, and the next check the scope names folds it in. The chip has no clock
// (RULINGS *The rest of the maneuvers*).

const ARMED_KEY = "tactical";

function armedChipFor(actor, testKind, skill = null) {
  return actor?.effects?.find(e => {
    if ( (readFlag(e, CHIP_FLAG) !== "use") || (readFlag(e, "useKey") !== ARMED_KEY) ) return false;
    const a = readFlag(e, "armed");
    if ( !a ) return false;
    if ( testKind === "initiative" ) return !!a.initiative;
    return (testKind === "check") && !!skill && (a.skills ?? []).includes(skill);
  }) ?? null;
}

/** "an Intelligence (History or Investigation) or Wisdom (Insight) check" — off the system's own labels. */
function checkPhrase(skills = [], initiative = false) {
  const byAbility = new Map();
  for ( const k of skills ) {
    const s = CONFIG.DND5E.skills?.[k];
    const ab = CONFIG.DND5E.abilities?.[s?.ability]?.label ?? String(s?.ability ?? "").toUpperCase();
    if ( !byAbility.has(ab) ) byAbility.set(ab, []);
    byAbility.get(ab).push(s?.label ?? k);
  }
  const parts = [...byAbility].map(([ab, names]) => `${ab} (${names.join(" or ")})`);
  const checks = parts.length ? `${parts.join(" or ")} check` : "";
  return [checks, initiative ? "Initiative roll" : ""].filter(Boolean).join(" or ");
}
const article = what => (/^[aeiou]/i.test(what) ? "an" : "a");

listen("dnd5e.postUseActivity", "d20-folds", async (activity, usageConfig, results) => {
  try {
    const actor = activity?.actor;
    if ( !actor?.isOwner || (activity.type !== "utility") ) return;
    const entry = d20FoldEntries().find(e => (e.kind === "tactical") && scopeOf(e) && answers(e.name, activity.item));
    if ( !entry ) return;
    const scope = scopeOf(entry);
    const message = (results?.message instanceof ChatMessage) ? results.message : null;
    if ( readFlag(message, "tacticalArmed") ) return;
    // The rescue's own spend is already folded into the roll: arm nothing.
    if ( readFlag(message, "foldSpend") || usageConfig?.data?.flags?.[MODULE_ID]?.foldSpend ) return;
    const formula = resolveDie(actor, activity.roll?.formula || null);
    const rolled = formula ? await rollDie(formula, actor) : null;
    if ( !rolled ) { log.warn(`${entry.name}'s die could not be read off the sheet — add it by hand.`); return; }
    await rolled.roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${entry.name} — the die` });
    const total = Number(rolled.summary.total) || 0;
    const stale = actor.effects.filter(e => (readFlag(e, CHIP_FLAG) === "use") && (readFlag(e, "useKey") === ARMED_KEY) && (readFlag(e, "armed")?.name === entry.name));
    if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id)).catch(() => {});
    const what = checkPhrase(scope.skills ?? [], !!scope.initiative);
    const chip = await ActiveEffect.implementation.create({
      name: activity.item.name, img: activity.item.img ?? "icons/svg/dice-target.svg",
      description: `${await ruleHTML(scope.rule)}<p>Written by By the Books when ${esc(entry.name)} was used: the die rolled ${total}; the next ${what} adds it.</p>`,
      origin: activity.item.uuid, disabled: false, transfer: false,
      flags: { [MODULE_ID]: { [CHIP_FLAG]: "use", useKey: ARMED_KEY, armed: { name: entry.name, total, skills: [...(scope.skills ?? [])], initiative: !!scope.initiative, cardId: message?.id ?? null } } }
    }, { parent: actor }).catch(err => { log.error(`${entry.name} could not be armed — add the die by hand.`, err); return null; });
    if ( !message ) return;
    const window = decisionWindow();
    await message.setFlag(MODULE_ID, "tacticalArmed", { ...statContext(actor.uuid), name: entry.name, total, what, rule: scope.rule,
      skills: [...(scope.skills ?? [])], initiative: !!scope.initiative,
      itemImg: activity.item.img ?? null, chipId: chip?.id ?? null, spent: null,
      ...(window ? { window, deadline: Date.now() + (window * 1000) } : {}) });
  } catch(err) {
    log.error(`A maneuver's use failed to arm — add the die by hand.`, err);
  }
});

/** Fold the armed die into the check (or Initiative) as a SPENT fold; true when it did. */
async function applyArmedFold(message, actor, testKind, { skill = null, combatants = [], total = null } = {}) {
  const chip = armedChipFor(actor, testKind, skill);
  if ( !chip ) return false;
  const a = readFlag(chip, "armed");
  const base = Number(message.rolls?.[0]?.total ?? total ?? 0);
  const window = decisionWindow();
  const spends = [{ kind: "tactical", name: a.name, label: a.name, die: a.total }];
  const remaining = availableFolds(actor, testKind, [], { skill }).filter(o => o.name.toLowerCase() !== a.name.toLowerCase());
  const flag = { ...baseFlag(actor, remaining, testKind, base, remaining.length ? window : 0), spends, armed: true,
    ...(skill ? { skill } : {}),
    ...(testKind === "initiative" ? { combatId: game.combat?.id ?? null, combatantIds: combatants.map(c => c.id) } : {}) };
  const composed = foldedRoll(foldBase(message, flag), foldFolds(message, { ...flag, status: "resolved", outcome: "used" }));
  flag.foldedTotal = composed.total;
  if ( !remaining.length ) { flag.status = "resolved"; flag.outcome = "used"; }
  await message.setFlag(MODULE_ID, "d20fold", flag);
  await chip.delete().catch(() => {});
  const lines = [`${sumText(flag, composed)} — the roll now totals <strong>${composed.total}</strong>.`];
  if ( testKind === "initiative" ) {
    const combat = flag.combatId ? game.combats.get(flag.combatId) : game.combat;
    for ( const id of (flag.combatantIds ?? []) ) {
      const c = combat?.combatants?.get(id);
      if ( c ) await c.update({ initiative: composed.total }).catch(err => log.warn(`Could not move the initiative.`, err));
    }
    lines.push(`Initiative <strong>${base} → ${composed.total}</strong> — the order is updated.`);
  }
  const item = resolveUuid(chip.origin);
  await announce(message, actor, a.name, testKind, false, lines, { kind: "tactical", item });
  if ( a.cardId ) {
    const card = game.messages.get(a.cardId);
    if ( card ) await queueFlagWrite(card, "tacticalArmed", current => {
      if ( current.spent ) return false;
      current.spent = { total: composed.total, base, testKind, skill: skill ?? null, at: Date.now() };
    }).catch(() => { /* the roll's own card says it */ });
  }
  if ( remaining.length ) armFoldTimer(message);
  return true;
}

async function showArmedNotice(message) {
  const t = readFlag(message, "tacticalArmed");
  if ( !t || t.spent ) return;
  const actor = resolveUuid(t.sourceUuid);
  // The checks ARE the buttons (Initiative too in a combat); a press rolls it and acknowledges.
  const buttons = (t.skills ?? []).map((k, i) => ({
    action: `skill-${k}`, label: CONFIG.DND5E.skills?.[k]?.label ?? k, default: i === 0,
    callback: async () => { await acknowledgeMoment(message, "tacticalArmed"); void actor?.rollSkill?.({ skill: k }); }
  }));
  if ( t.initiative && actor && game.combat?.combatants?.some(c => c.actor?.uuid === actor.uuid) ) {
    buttons.push({ action: "initiative", label: "Initiative",
      callback: async () => { await acknowledgeMoment(message, "tacticalArmed"); void actor.rollInitiative({ createCombatants: false, rerollInitiative: true }); } });
  }
  await openMomentPopup(message, "armed", actor, {
    title: `${t.name} — ${actor?.name ?? ""}`, icon: "fa-solid fa-dice-d20", width: 440,
    content: bfCard({ img: t.itemImg, eyebrow: `Maneuver — ${t.name}`, tone: "pending",
      title: `${t.name} — the die rolled ${t.total}`,
      subtitle: `Which check? ${t.total} is added to it`,
      lines: [ruleLine(t.rule)] }) + (t.deadline ? momentBarHTML(t, "reminder") : ""),
    buttons,
    autoCloseAt: t.deadline || null
  });
}

listen("dnd5e.renderChatMessage", "d20-folds", cardRow((message, host) => {
  const t = readFlag(message, "tacticalArmed");
  if ( !t ) return;
  const live = !t.spent && (!t.deadline || (t.deadline > Date.now())) && !momentAcknowledged(message, "tacticalArmed");
  const line = document.createElement("div");
  line.innerHTML = bfCard({ img: t.itemImg, eyebrow: `Maneuver — ${t.name}`, tone: t.spent ? "good" : "pending",
    title: t.spent ? `${t.name} — +${t.total} added: ${t.spent.base} + ${t.total} = ${t.spent.total}`
      : `${t.name} — the die rolled ${t.total}; pick the check (${article(t.what)} ${t.what})`,
    subtitle: spendPhrase(poolSpendsOn(message)), lines: [ruleLine(t.rule)] });
  host.appendChild(line);
  const may = live && canAnswerFor(resolveUuid(t.sourceUuid));
  pendingRow(message, line, {
    bar: live && momentBarHTML(t, "reminder"),
    latch: may && { sub: "armed", show: () => showArmedNotice(message) },
    answer: may && `Answer — ${t.name}`
  });
}));

// THE REFUND ASK: Tactical Mind's use is not expended if the check still fails. A raw check has no
// DC, so the module ASKS and writes the use back. ⚠ The popup closes at its clock but the card's
// control STAYS until answered: a use the rules hand back must stay claimable.

/** The pool the feature consumes: the activity's `itemUses` target. */
function refundPoolFor(actor, name, marker = null) {
  const item = marker?.item ?? itemNamed(actor, name);
  const activity = marker?.activity ?? item?.system.activities?.contents?.[0];
  if ( !activity ) return null;
  const c = (activity.consumption?.targets ?? []).find(t => t.type === "itemUses");
  if ( !c ) return null;
  return (c.target ? actor.items.get(c.target) : item) ?? null;
}

/** @param {{baseTotal?: number|null, total?: number|null, dc?: number|null, die?: number|null}} [numbers] */
async function stampRefundAsk(message, actor, offer, marker, numbers = {}) {
  try {
    const pool = refundPoolFor(actor, offer.name, marker);
    if ( !pool ) return;
    const window = decisionWindow();
    const num = v => (Number.isFinite(Number(v)) && (v !== null) && (v !== "")) ? Number(v) : null;
    await queueFlagWrite(message, "tacticalRefund", current => {
      if ( current.status ) return false;                 // one ask per roll
      delete current.targets;
      Object.assign(current, {
        status: "pending", name: offer.name, label: labelOf(offer), actorUuid: actor.uuid,
        poolUuid: pool.uuid, poolName: pool.name,
        itemImg: marker?.item?.img ?? itemNamed(actor, offer.name)?.img ?? null,
        rule: RESCUE_KINDS.tactical.rule,
        baseTotal: num(numbers.baseTotal), total: num(numbers.total), dc: num(numbers.dc), die: num(numbers.die),
        ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
      });
    });
  } catch(err) {
    log.error(`The ${offer.name} refund ask failed to stamp.`, err);
  }
}

/** The check's arithmetic in words, or null on an ask that carries no numbers. */
function refundArithmetic(r) {
  if ( !Number.isFinite(r?.baseTotal) || !Number.isFinite(r?.total) ) return null;
  const die = Number.isFinite(r.die) ? `${r.label}'s d10 rolled ${r.die}, so ` : "";
  return `The check was ${r.baseTotal}; ${die}it is now <strong>${r.total}</strong>${Number.isFinite(r.dc) ? ` vs DC ${r.dc}` : ""}.`;
}

/** The question itself, with the number the GM rules on. */
function refundQuestion(r) {
  if ( !Number.isFinite(r?.total) ) return "Did the check succeed?";
  return Number.isFinite(r.dc) ? `Does ${r.total} pass DC ${r.dc}?` : `Does ${r.total} pass? Ask your GM.`;
}

/** The state sentence on the settled card. */
function refundLine(r) {
  const total = Number.isFinite(r.total) ? ` (${r.total})` : "";
  if ( r.status === "refunded" ) return `The check still failed${total} — the use of ${esc(r.poolName)} was <strong>refunded</strong>.`;
  if ( r.status === "kept" ) return `The check succeeded${total} — the use of ${r.poolName} stays spent.`;
  const math = refundArithmetic(r);
  return `${math ? `${math} ` : ""}${refundQuestion(r)} If it still failed, this use of ${r.poolName} isn't expended — answer to refund it.`;
}

/** First writer wins; a refund then writes the pool back and posts the receipt. */
async function answerRefund(message, choice) {
  let claimed = false;
  await queueFlagWrite(message, "tacticalRefund", current => {
    if ( current.status !== "pending" ) return false;
    current.status = choice;                              // "kept" | "refunded"
    current.answeredAt = Date.now();
    claimed = true;
  });
  if ( !claimed || (choice !== "refunded") ) return;
  const r = readFlag(message, "tacticalRefund");
  const actor = resolveUuid(r.actorUuid);
  try {
    const pool = await resolveUuidAsync(r.poolUuid);
    if ( !pool ) throw new Error(`the pool ${r.poolUuid} is gone`);
    const spent = Number(pool.system?.uses?.spent ?? 0);
    if ( spent > 0 ) await pool.update({ "system.uses.spent": spent - 1 });
    const uses = pool.system?.uses ?? {};
    await postCard({
      actor,
      card: bfCard({
        img: r.itemImg, eyebrow: `D20 Fold — ${r.label}`, tone: "good",
        title: `${r.label} — the use is refunded`,
        subtitle: `${actor?.name ?? ""} · the check still failed`,
        lines: [`${esc(r.poolName)}: <strong>${uses.value ?? 0} of ${uses.max ?? 0}</strong> remaining.`, ruleLine(r.rule)]
      })
    });
  } catch(err) {
    log.error(`The ${r.poolName} refund failed to write.`, err);
    ui.notifications?.warn(`${TITLE} | The refund could not be written — restore the use of ${r.poolName} by hand.`);
  }
}

async function showRefundNotice(message) {
  const r = readFlag(message, "tacticalRefund");
  if ( !r || (r.status !== "pending") ) return;
  const actor = resolveUuid(r.actorUuid);
  await openMomentPopup(message, "refund", actor, {
    title: `${r.label} — ${actor?.name ?? ""}`, icon: RESCUE_KINDS.tactical.icon, width: 440,
    content: bfCard({
      img: r.itemImg, eyebrow: `D20 Fold — ${r.label}`, tone: "pending",
      title: refundQuestion(r),
      subtitle: `If it still failed, this use of ${r.poolName} comes back`,
      lines: [refundArithmetic(r), ruleLine(r.rule)]
    }) + (r.deadline ? momentBarHTML(r, "to answer") : ""),
    buttons: [
      { action: "keep", label: "It succeeded — keep the spend", callback: () => answerRefund(message, "kept") },
      { action: "refund", label: `It still failed — refund the use`, callback: () => answerRefund(message, "refunded") }
    ],
    autoCloseAt: r.deadline || null
  });
}

// The ask shows once the fold is settled: the bar while the clock runs, the recall button until answered.
listen("dnd5e.renderChatMessage", "d20-folds", cardRow((message, host) => {
  try {
    const r = readFlag(message, "tacticalRefund");
    if ( !r || (r.status !== "pending") ) return;
    if ( readFlag(message, "d20fold")?.status === "pending" ) return;
    // Both names: a card posted before 3.0.0 (formerly Battle Flow) may carry the old class in its stored HTML.
    const block = host.querySelector(".bythebooks-d20fold, .battleflow-d20fold") ?? host;
    const line = document.createElement("div");
    block.appendChild(line);
    const may = canAnswerFor(resolveUuid(r.actorUuid));
    pendingRow(message, line, {
      bar: momentBarHTML(r, "to answer"),
      latch: may && { sub: "refund", show: () => showRefundNotice(message) },
      answer: may && `Answer — ${r.label}`
    });
  } catch(err) {
    log.error(`The refund ask failed to render.`, err);
  }
}));

/* --- THE D20 FLOORS (C1; D20_FLOORS): a d20 face below the floor reads as the floor ------------------------ */

/** The listed floor rows standing on this roller for this test: `{ key, row }[]`. */
function floorsFor(actor, { test, ability = null, concentration = false } = {}) {
  if ( !(actor instanceof Actor) ) return [];
  const on = listedNames(d20FloorEntries());
  const out = [];
  for ( const [key, row] of Object.entries(D20_FLOORS) ) {
    if ( !on.has(lower(key)) || !row.tests.includes(test) ) continue;
    // D1 — a `feature` row stands while the roller holds it (Survivor); the DMG — a `worn` row while the item is worn;
    // else the row's effect must stand.
    if ( row.feature ? !(row.worn ? wornNamed(actor, row.feature) : featureNamed(actor, row.feature))
      : !actor.effects.some(e => !e.disabled && !e.isSuppressed && (lower(e.name) === lower(row.effect))) ) continue;
    const abilities = row.abilities?.[test] ?? null;
    if ( abilities && ability && !abilities.includes(lower(ability)) ) continue;
    if ( (test === "save") && row.concentration && !concentration ) continue;
    out.push({ key, row });
  }
  return out;
}

/** The platform's own knob: `options.minimum` on the roll configuration — a d20 below it counts as it. */
function floorRolls(config, actor, facts) {
  const rows = floorsFor(actor, facts);
  if ( !rows.length || !Array.isArray(config?.rolls) ) return;
  const floors = rows.filter(r => Number(r.row.minimum) > 0);
  const crits = rows.filter(r => Number(r.row.critical) > 0);
  const minimum = floors.length ? Math.max(...floors.map(r => Number(r.row.minimum))) : 0;
  // D1 — the critical knob (Survivor): the lowest face that counts as a 20.
  const critical = crits.length ? Math.min(...crits.map(r => Number(r.row.critical))) : 0;
  for ( const roll of config.rolls ) {
    roll.options ??= {};
    if ( minimum ) {
      if ( !(Number(roll.options.minimum) >= minimum) ) roll.options.minimum = minimum;
      roll.options.bfFloor = floors.map(r => r.key);
    }
    if ( critical ) {
      if ( !(Number(roll.options.criticalSuccess) <= critical) ) roll.options.criticalSuccess = critical;
      roll.options.bfCritical = crits.map(r => r.key);
    }
  }
}

listen("dnd5e.preRollAttack", "d20-folds", config => {
  try { floorRolls(config, config?.subject?.item?.actor ?? config?.subject?.actor ?? null, { test: "attack" }); }
  catch(err) { log.error(`The d20 floor could not be set on the attack.`, err); }
});
listen("dnd5e.preRollSavingThrow", "d20-folds", config => {
  try {
    // D1 — a Death Saving Throw is its own test (the system rolls it as a save with the "deathSave" hook name).
    const death = (config?.hookNames ?? []).includes("deathSave");
    floorRolls(config, config?.subject ?? null, death ? { test: "death" }
      : { test: "save", ability: config?.ability ?? null, concentration: !!config?.isConcentration });
  }
  catch(err) { log.error(`The d20 floor could not be set on the save.`, err); }
});
listen("dnd5e.preRollAbilityCheck", "d20-folds", config => {
  try { floorRolls(config, config?.subject ?? null, { test: "check", ability: config?.ability ?? null }); }
  catch(err) { log.error(`The d20 floor could not be set on the check.`, err); }
});

// The card says it (R5): the floor that stood on the roll, when the d20 was lifted by it.
listen("dnd5e.renderChatMessage", "d20-folds", cardRow((message, host) => {
  const roll = message.rolls?.[0];
  const keys = roll?.options?.bfFloor;
  const critKeys = roll?.options?.bfCritical;
  if ( !keys?.length && !critKeys?.length ) return;
  const d20 = roll.dice?.[0];
  const face = d20?.results?.find(r => r.active)?.result ?? d20?.total ?? null;
  const minimum = Number(roll.options.minimum) || 0;
  const critical = Number(roll.options.criticalSuccess) || 0;
  const say = text => {
    const line = document.createElement("div");
    line.style.cssText = "font-size:var(--font-size-11,11px);opacity:0.85;margin-top:0.25rem;";
    line.innerHTML = `<i class="fa-solid fa-arrow-up-from-bracket"></i> ${text}`;
    host.appendChild(line);
  };
  if ( keys?.length && (face !== null) && (face < minimum) ) say(`${esc(keys.join(", "))} — the d20's ${face} counts as ${minimum}`);
  // D1 — the critical knob: a face below 20 that counts as one.
  if ( critKeys?.length && (face !== null) && (face >= critical) && (face < 20) ) say(`${esc(critKeys.join(", "))} — the d20's ${face} counts as a 20`);
}));
