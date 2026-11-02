// @ts-check
/**
 * By the Books — DECISION (ARCHITECTURE.md §2): is a clock rider (registry.js CLOCK_RIDERS) DUE on
 * this hit — its ROUND or TURN condition, read by the EDGE off the combat — and why not.
 */

/** `opportunity`: "driven" (the module drove an Opportunity Attack), "offTurn" (a melee attack off
 * the attacker's combat turn), or null. `targetDamaged` / `fits`: true, false, or null when the target
 * cannot be read (a size the table judges; an unread HP is never "damaged"). `enchanted`: the attack's
 * item carries the row's enchantment, or — none on the sheet — it is the row's `spell`.
 * @param {{when: "oncePerTurn"|"firstRound"|"any", uses?: boolean, requires?: string, judge?: string|readonly string[], weapon?: boolean,
 *          dealt?: string, crit?: boolean, maxSize?: string, enchant?: boolean, inspired?: boolean, melee?: boolean, marked?: string, unarmed?: boolean,
 *          natural?: boolean, targets?: object, charges?: boolean, wields?: boolean, targetStatus?: string, wearing?: string}} row
 * @param {{inCombat?: boolean, round?: number|null, chitStands?: boolean, usesLeft?: number|null,
 *          sneakArmed?: boolean, raging?: boolean, reckless?: boolean, targetDamaged?: boolean|null, weapon?: boolean,
 *          form?: string|null, dealt?: string[], critical?: boolean, opportunity?: "driven"|"offTurn"|null,
 *          fits?: boolean|null, enchanted?: boolean, melee?: boolean, wildShape?: boolean, marked?: boolean|null,
 *          unarmed?: boolean, attuned?: boolean, natural?: boolean, typed?: {fits: boolean|null, why: string}|null,
 *          chargesLeft?: number|null, targetStatus?: boolean|null, wearing?: boolean|null}} facts
 * @returns {{due: boolean, why: string}} */
export function riderDue(row, { inCombat = false, round = null, chitStands = false, usesLeft = null,
  sneakArmed = false, raging = false, reckless = false, targetDamaged = null, weapon = false, form = null, dealt = [],
  critical = false, opportunity = null, fits = null, enchanted = false, melee = false, wildShape = false, marked = null,
  unarmed = false, attuned = false, natural = false, typed = null, chargesLeft = null, targetStatus = null, wearing = null } = {}) {
  // C1 — `judge` may list several (Power of the Wilds' Ram: raging AND the form chip); every one must stand.
  const judges = new Set(/** @type {string[]} */ ([]).concat(row.judge ?? []));
  if ( row.weapon && !weapon ) return { due: false, why: "not a weapon attack" };
  if ( row.melee && !melee ) return { due: false, why: "not a melee attack" };
  if ( row.wearing && (wearing !== true) ) return { due: false, why: `${row.wearing} is not on you` };
  if ( row.unarmed && !unarmed ) return { due: false, why: "not an Unarmed Strike" };
  if ( row.enchant && !enchanted ) return { due: false, why: "not the cantrip it was chosen for" };
  if ( row.maxSize && (fits === false) ) return { due: false, why: "the target is too large" };
  if ( row.dealt && !(dealt ?? []).includes(row.dealt) ) return { due: false, why: `no ${row.dealt} damage` };
  if ( row.crit && !critical ) return { due: false, why: "not a Critical Hit" };
  // THE DMG — `natural`: "roll a 20 on the d20" (the d20's own face, or one a fold turned into a 20).
  if ( row.natural && !natural ) return { due: false, why: "not a 20 on the d20" };
  // THE DMG — `targets`: what the hit creatures must be (a Construct, not an Undead, under 100 Hit Points…).
  if ( row.targets && (typed?.fits !== true) ) return { due: false, why: typed?.why ?? "the target cannot be read" };
  // THE DMG — `charges` (Nine Lives Stealer): the activity's own charges, when the sheet set them; none left, the property is gone.
  if ( row.charges && (chargesLeft === 0) ) return { due: false, why: "no charges left" };
  if ( (row.requires === "sneak") && !sneakArmed ) return { due: false, why: "no Sneak Attack armed on this hit" };
  // C1 — `marked`: the hit target must wear the bearer's mark (Bestial Fury, Superior Hunter's Prey).
  if ( row.marked && (marked !== true) ) return { due: false, why: `the target is not under your ${row.marked}` };
  // RAVENLOFT — `targetStatus` (Ominous Strikes): every hit creature wears the status; an unread one is not due.
  if ( row.targetStatus && (targetStatus !== true) ) return { due: false, why: `the target is not ${row.targetStatus}` };
  if ( (judges.has("raging") || judges.has("reckless")) && !raging ) return { due: false, why: "not raging" };
  if ( judges.has("reckless") && !reckless ) return { due: false, why: "no Reckless Attack this turn" };
  if ( judges.has("targetDamaged") && (targetDamaged !== true) ) {
    return { due: false, why: (targetDamaged === false) ? "the target is at its Hit Point maximum" : "the target's Hit Points cannot be read" };
  }
  if ( judges.has("transformed") && !form ) return { due: false, why: "not transformed" };
  if ( judges.has("wildShape") && !wildShape ) return { due: false, why: "not in Wild Shape" };
  if ( judges.has("attuned") && !attuned ) return { due: false, why: "Elemental Attunement is not active" };
  if ( judges.has("opportunity") ) {
    if ( opportunity === "driven" ) return { due: true, why: "an Opportunity Attack" };
    if ( opportunity === "offTurn" ) return { due: true, why: "a melee attack off your turn" };
    return { due: false, why: "not an Opportunity Attack" };
  }
  if ( row.uses && !((usesLeft ?? 0) > 0) ) return { due: false, why: "no uses left" };
  switch ( row.when ) {
    case "firstRound":
      if ( !inCombat ) return { due: false, why: "not in combat — there is no first round" };
      if ( round !== 1 ) return { due: false, why: `round ${round}, not the first` };
      return { due: true, why: "the first round of the combat" };
    case "oncePerTurn": {
      if ( chitStands ) return { due: false, why: "already used this turn" };
      if ( form ) return { due: true, why: inCombat ? `${form} — once this turn` : `${form} — out of combat, every hit` };
      const why = inCombat ? "once this turn" : "out of combat — every hit";
      if ( judges.has("reckless") ) return { due: true, why: `raging and reckless — ${why}` };
      if ( judges.has("targetDamaged") ) return { due: true, why: `the target is damaged — ${why}` };
      if ( judges.has("wildShape") ) return { due: true, why: `in Wild Shape — ${why}` };
      if ( judges.has("attuned") ) return { due: true, why: `attuned — ${why}` };
      if ( row.marked ) return { due: true, why: `under your ${row.marked} — ${why}` };
      return { due: true, why };
    }
    // Every hit, uses permitting (Fire's Burn): the use is the only clock.
    case "any":
      if ( row.natural ) return { due: true, why: "a 20 on the d20" };
      if ( row.crit && row.wields ) return { due: true, why: "a Critical Hit" };
      if ( row.crit ) return { due: true, why: `a Critical Hit that deals ${row.dealt ?? "damage"}` };
      if ( row.wields ) return { due: true, why: "every hit with it" };
      if ( row.enchant ) return { due: true, why: "every hit with the chosen cantrip" };
      if ( row.inspired ) return { due: true, why: "your Bardic Inspiration die, if you spend it" };
      if ( row.marked ) return { due: true, why: `the target is under your ${row.marked}` };
      if ( row.wearing ) return { due: true, why: `${row.wearing} stands — your choice on each hit` };
      return { due: true, why: "on any hit, while its uses last" };
    default:
      return { due: false, why: `an unknown clock "${row.when}"` };
  }
}

/**
 * THE DMG — a rider's `targets` against every hit creature: `types` (one of them), `notTypes` (none of them), `hpBelow`
 * (current Hit Points under it), `shapeshifted` (a shapechanger, or a creature under a transformation). Every target must
 * answer; an unreadable one is null (never guessed).
 * @param {{types?: readonly string[], notTypes?: readonly string[], hpBelow?: number, shapeshifted?: boolean}} spec
 * @param {Array<{name?: string, type?: string|null, hp?: number|null, shapeshifted?: boolean|null}>} targets
 * @returns {{fits: boolean|null, why: string}}
 */
export function targetsAnswer(spec, targets) {
  const lc = v => String(v ?? "").toLowerCase();
  if ( !targets?.length ) return { fits: null, why: "no creature hit" };
  for ( const t of targets ) {
    const who = t.name ?? "the target";
    if ( (spec.types?.length || spec.notTypes?.length) && !t.type ) return { fits: null, why: `${who}'s creature type cannot be read` };
    if ( spec.types?.length && !spec.types.includes(lc(t.type)) ) return { fits: false, why: `${who} is not a ${spec.types.join(" or ")}` };
    if ( spec.notTypes?.includes(lc(t.type)) ) return { fits: false, why: `${who} is a ${lc(t.type)}` };
    const cap = Number(spec.hpBelow);
    if ( Number.isFinite(cap) ) {
      const hp = Number(t.hp);
      if ( (t.hp === null) || (t.hp === undefined) || !Number.isFinite(hp) ) return { fits: null, why: `${who}'s Hit Points cannot be read` };
      if ( !(hp < cap) ) return { fits: false, why: `${who} has ${cap} Hit Points or more` };
    }
    if ( spec.shapeshifted && !t.shapeshifted ) return { fits: false, why: `${who} is not shape-shifted` };
  }
  return { fits: true, why: "" };
}

/** A damage part's formula as written: dice, custom, bonus, or a bonus alone (Assassinate); null = none.
 * @param {{number?: number|null, denomination?: number|null, custom?: {enabled?: boolean, formula?: string}|null, bonus?: string|null}} part
 * @returns {string|null} */
export function riderPartFormula({ number = null, denomination = null, custom = null, bonus = null } = {}) {
  let base = null;
  if ( custom?.enabled && String(custom.formula ?? "").trim() ) base = String(custom.formula).trim();
  else if ( (Number(number) > 0) && (Number(denomination) > 0) ) base = `${Number(number)}d${Number(denomination)}`;
  const extra = String(bonus ?? "").trim();
  if ( base && extra ) return `${base} + ${extra}`;
  return base ?? (extra || null);
}

/** WHERE A RIDER'S USES LIVE: the ACTIVITY's with a max, else for a `uses` row the ITEM's (species packs).
 * @param {{activity?: {max?: unknown, value?: unknown, spent?: unknown}|null,
 *          item?: {max?: unknown, value?: unknown, spent?: unknown}|null, uses?: boolean}} facts
 * @returns {{left: number, max: number, spent: number, on: "activity"|"item"}|null} */
export function riderUsesFrom({ activity = null, item = null, uses = false } = {}) {
  const carries = u => !!u && !((u.max === "") || (u.max === null) || (u.max === undefined));
  const read = (u, on) => ({ left: Number(u.value ?? 0) || 0, max: Number(u.max) || 0, spent: Number(u.spent ?? 0) || 0, on });
  if ( carries(activity) ) return read(activity, "activity");
  if ( uses && carries(item) ) return read(item, "item");
  return null;
}

/** WHICH FORM STANDS (Celestial Revelation): by its effect's name, or by the module's form chip —
 * never by name — for Necrotic Shroud, so one frightened BY a Shroud is not read as wearing one.
 * @param {{forms?: ReadonlyArray<{form: string, effect?: string, chip?: string, type: string}>}} row
 * @param {Array<{name: string, active: boolean, chip: string|null}>} effects
 * @returns {{form: string, effect?: string, chip?: string, type: string}|null} */
export function standingForm(row, effects) {
  const lc = v => String(v ?? "").toLowerCase();
  for ( const f of row?.forms ?? [] ) {
    const marked = (effects ?? []).some(e => e?.active && (f.chip
      ? (e.chip === lc(f.form))
      : (!e.chip && (lc(e.name) === lc(f.effect)))));
    if ( marked ) return f;
  }
  return null;
}
