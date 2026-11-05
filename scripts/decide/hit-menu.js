// @ts-check
/**
 * By the Books — DECISION: the hit menu — the options a hit offers grouped by paying feature, the
 * legal picks, whether a swept-at creature is hit. Pure (ARCHITECTURE.md §2); RULINGS *The hit menu*
 * and *The hit menu — a pick per group*. The reading and arithmetic are decided here, never the choice.
 */

/**
 * The menu for one hit: each group whose feature stands with a resolved pool, and its listed options
 * in table order. `pool: "option"` pays per OPTION, `"spell"` too (each option a spell, its pool entry 1 left while a
 * cast way stands, its `cost` the row's words), `"free"` pays nothing; `fits` false greys a row, null leaves it open.
 * @param {{groups: Readonly<Record<string, any>>, options: Readonly<Record<string, any>>,
 *          listed: Iterable<string>, features: Iterable<string>, melee?: boolean,
 *          pools: Record<string, {left: number, max?: number, die: string|null, type?: string|null, cost?: string}|null|undefined>,
 *          fits?: Record<string, boolean|null|undefined>, eligible?: Record<string, boolean|undefined>,
 *          used?: Record<string, boolean|undefined>, dice?: Record<string, {die: string|null, type?: string|null}|undefined>}} facts
 *        `pools` keyed by group (by option for an option-pool group); null when unreadable. `eligible` false: the
 *        hit's facts rule the option out (not this weapon, no Flurry) — no row. `used` true: its once-per-turn chit
 *        stands — greyed. `dice` an `ownDice` group's option's own die.
 * @returns {{groups: {key: string, label: string, max: number, die: string|null, left: number|null, rule: object|string|null,
 *            perOption: boolean, free: boolean, ownDice: boolean, spell: boolean, heading: string, per: string, eyebrow: string, dieLabel: string,
 *            rows: {key: string, feature: string, label: string, cost: string, mode: string, save: boolean,
 *                   line: string|null, caveat: string|null, rule: object|string|null, affordable: boolean}[]}[]}}
 */
export function hitMenu({ groups, options, listed, features, melee = true, pools, fits = {}, eligible = {}, used = {}, dice = {} }) {
  const lower = (s) => String(s ?? "").toLowerCase();
  const admits = new Set([...listed].map(lower));
  const have = new Set([...features].map(lower));
  const out = [];
  for ( const [gkey, group] of Object.entries(groups ?? {}) ) {
    if ( group.feature && !have.has(lower(group.feature)) ) continue;
    const spell = group.pool === "spell";
    const perOption = (group.pool === "option") || spell;
    const free = group.pool === "free";
    const ownDice = !!group.ownDice;
    const shared = (perOption || free) ? null : pools?.[gkey];
    if ( !perOption && !free && !shared ) continue;
    const rows = [];
    let left = perOption ? 0 : free ? null : Math.max(0, Number(shared?.left) || 0);
    for ( const [key, row] of Object.entries(options ?? {}) ) {
      if ( row.group !== gkey ) continue;
      if ( !admits.has(lower(row.feature)) || !have.has(lower(row.feature)) ) continue;
      if ( row.melee && !melee ) continue;
      if ( eligible?.[key] === false ) continue;
      const pool = perOption ? pools?.[key] : free ? { left: 1, die: null } : shared;
      if ( !pool ) continue;
      const rowLeft = Math.max(0, Number(pool.left) || 0);
      if ( perOption ) left = (left ?? 0) + rowLeft;
      // The size judge (`maxSize`, Hill's Tumble): only a MEASURED misfit greys the row.
      const tooLarge = !!row.maxSize && (fits?.[key] === false);
      const unknownSize = !!row.maxSize && ((fits?.[key] === null) || (fits?.[key] === undefined));
      const spent = !!row.oncePerTurn && !!used?.[key];
      const own = ownDice ? (dice?.[key] ?? null) : null;
      const count = `${rowLeft}${(Number(pool.max) > 0) ? ` of ${Number(pool.max)}` : ""} ${(Number(pool.max) || rowLeft) === 1 ? group.dieLabel : pluralOf(group.dieLabel)} left`;
      const cost = pool.cost ? pool.cost : perOption
        ? (pool.die ? `${pool.die}${pool.type ? ` ${pool.type}` : ""} · ${count}` : count)
        : free ? (own?.die ? `${own.die}${own.type ? ` ${own.type}` : ""} · free` : "free")
          : ownDice ? `${own?.die ? `${own.die}${own.type ? ` ${own.type}` : ""} · ` : ""}1 ${group.dieLabel}`
            : `${pool.die ?? "1 die"} ${group.dieLabel}`;
      // A die option's die must read; a no-die option (a save, an effect, a press) pays with the pool alone.
      const payable = row.noDie || !!row.press || (ownDice ? !!own?.die : !!pool.die);
      rows.push({
        key, feature: row.feature, label: row.label ?? row.feature,
        cost: tooLarge ? "too large" : spent ? "used this turn" : cost,
        mode: row.mode ?? "ride", save: !!row.save,
        line: row.line ?? null,
        caveat: tooLarge ? "the target is larger than Large" : unknownSize ? "the target's size could not be read" : (row.caveat ?? null),
        rule: row.rule,
        affordable: (rowLeft > 0) && payable && !tooLarge && !spent
      });
    }
    if ( !rows.length ) continue;
    out.push({ key: gkey, label: group.label, max: group.max ?? 1, die: (perOption || ownDice) ? null : (shared?.die ?? null), left, rule: group.rule,
      perOption, free, ownDice, spell, heading: group.heading ?? group.label, per: group.per ?? "one pick per hit",
      eyebrow: group.eyebrow ?? "Maneuver", dieLabel: group.dieLabel, rows });
  }
  return { groups: out };
}

/**
 * A damage part cast at a higher level (the smite through a higher slot): its dice raised by the part's scaling, `delta`
 * levels above the spell's ("whole" adds its number a level, "half" every second level, none adds nothing).
 * @param {{number?: number, denomination?: number, bonus?: string, custom?: object, scaling?: {mode?: string, number?: number}}} part
 * @param {number} delta
 */
export function scaledDice(part, delta) {
  const up = Math.max(0, Number(delta) || 0);
  const step = Number(part?.scaling?.number) || 0;
  const mode = String(part?.scaling?.mode ?? "");
  const more = (mode === "whole") ? up * step : (mode === "half") ? Math.floor(up / 2) * step : 0;
  return { ...part, number: (Number(part?.number) || 0) + more };
}

/** A pool's word counted: "Superiority Die" → "Superiority Dice", "Focus Point" → "Focus Points". */
export function pluralOf(label) {
  const s = String(label ?? "");
  return /die$/i.test(s) ? `${s.slice(0, -3)}${s.endsWith("Die") ? "Dice" : "dice"}` : `${s}s`;
}

/**
 * Is this hit one the option reaches? The facts are read off the sheet and the card by the caller.
 * @param {{row: any, unarmed: boolean, weapon: boolean, monkWeapon: boolean, own: boolean, flurry: boolean|null, ammunition?: boolean}} facts
 *        `flurry` null: no turn to read it in (out of combat) — the option stands, its caveat says so; `ammunition` a ranged
 *        attack with an Ammunition weapon (Arcane Shot)
 */
export function optionReaches({ row, unarmed, weapon, monkWeapon, own, flurry, ammunition = false }) {
  if ( row.unarmed && !unarmed ) return false;
  if ( row.weapon && !weapon ) return false;
  if ( (row.weapons === "monk") && !(unarmed || monkWeapon) ) return false;
  // the smites: a Melee weapon or an Unarmed Strike (`melee` rules out the ranged attack)
  if ( (row.weapons === "melee") && !(weapon || unarmed) ) return false;
  // Arcane Shot: a RANGED attack with a weapon that has the Ammunition property.
  if ( (row.weapons === "ammunition") && !ammunition ) return false;
  if ( (row.only === "own") && !own ) return false;
  if ( row.only === "flurry" ) return unarmed && (flurry !== false);
  return true;
}

/**
 * The PICK: the chosen rows, at most `max` per group, each affordable; an illegal pick is dropped.
 * @param {{menu: ReturnType<typeof hitMenu>, chosen?: Iterable<string>}} facts
 * @returns {{picks: {group: string, row: any}[], dropped: string[]}}
 */
export function hitPick({ menu, chosen = [] }) {
  const want = new Set(chosen);
  const picks = [];
  const dropped = [];
  for ( const group of menu.groups ) {
    const rows = group.rows.filter(r => want.has(r.key));
    if ( rows.length > group.max ) { dropped.push(...rows.map(r => r.key)); continue; }
    for ( const row of rows ) {
      if ( row.affordable ) picks.push({ group: group.key, row });
      else dropped.push(row.key);
    }
  }
  return { picks, dropped };
}

/**
 * The picks a hit-menu record holds; a single-pick record reads as a list of one.
 * @param {any} record
 * @returns {any[]}
 */
export function picksOf(record) {
  if ( Array.isArray(record?.picks) ) return record.picks;
  return record?.key ? [record] : [];
}

/**
 * Would the ORIGINAL attack roll hit a second creature (the `hitsAmong` shape)? Unreadable AC is "unknown", never a guess.
 * @param {{total: number, isCritical?: boolean, isFumble?: boolean, ac: number|null|undefined}} facts
 * @returns {"hit"|"miss"|"unknown"}
 */
export function sweepVerdict({ total, isCritical = false, isFumble = false, ac }) {
  if ( isCritical ) return "hit";
  if ( isFumble ) return "miss";
  if ( (ac === null) || (ac === undefined) || !Number.isFinite(Number(ac)) ) return "unknown";
  return (Number(total) >= Number(ac)) ? "hit" : "miss";
}
