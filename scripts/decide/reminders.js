// @ts-check
/**
 * By the Books — DECISION: what bends a d20 roll, and what it nets to. Pure, no imports
 * (ARCHITECTURE.md §2); the tables come in as parameters. The gate lists every source and the net;
 * a human presses the mode (DESIGN R1). A source whose bend is unknown is listed and does not vote.
 */

/** The flag the gate stamps on the attack message it re-issued (`flags.<module>.reminder`). */
export const REMINDER_FLAG = "reminder";

const conditionName = key => key.charAt(0).toUpperCase() + key.slice(1);

/** Does an effect answer to a row's name? Exactly, or as the emanation machine names it
 * ("Aura of Purity — Thomas").
 * @param {string|null|undefined} effectName
 * @param {string} key */
export const effectNamedAs = (effectName, key) => {
  const name = String(effectName ?? "").toLowerCase();
  const k = String(key ?? "").toLowerCase();
  return !!k && ((name === k) || name.startsWith(`${k} — `));
};

/** Does this effect stand for the row? By name, and by ITEM when both name one: two pack effects
 * are "Protected" (Aura of Protection, Protection from Evil and Good).
 * @param {{name?: string, item?: string|null}} effect
 * @param {string} key
 * @param {{item?: string, itemOnly?: boolean}|null} [row] */
export const effectCarriesRow = (effect, key, row = null) => {
  if ( !effectNamedAs(effect?.name, key) ) return false;
  const want = row?.item ? String(row.item).toLowerCase() : "";
  const have = effect?.item ? String(effect.item).toLowerCase() : "";
  // D1 — `itemOnly`: an effect naming no item never carries the row (a plain Frightened is the condition's).
  if ( row?.itemOnly ) return !!want && (want === have);
  return !want || !have || (want === have);
};

/** A "listed — …" caveat rides the label (it is why the row bends nothing); "counted — …" is dropped.
 * @param {{caveat?: string}|undefined} row */
const labelCaveat = row => (row?.caveat && !/^counted — /.test(row.caveat)) ? ` (${row.caveat})` : "";

/** The condition table's sources for one roll; a row with only a note is listed (bend null).
 * ⚠ `enabled` and `table` never default: a caller that forgets the list reads nothing, not everything.
 * @param {{attackerStatuses?: Iterable<string>, targetStatuses?: Iterable<string>,
 *          enabled: Iterable<string>,
 *          table: Readonly<Record<string, Readonly<{attacker: "advantage"|"disadvantage"|null, target: "advantage"|"disadvantage"|null, rule: object|string|null, caveat?: string, note?: string}>>>,
 *          attackerName?: string, targetName?: string,
 *          attackerSeenBy?: {sense: string, range: number, sees: string[]}|null,
 *          targetSeenBy?: {sense: string, range: number, sees: string[]}|null}} facts */
export function conditionSources({ attackerStatuses = [], targetStatuses = [], enabled, table,
  attackerName = "You", targetName = "the target", attackerSeenBy = null, targetSeenBy = null }) {
  const on = new Set(enabled ?? []);
  const mine = new Set(attackerStatuses);
  const theirs = new Set(targetStatuses);
  const out = [];
  for ( const key of Object.keys(table ?? {}) ) {
    if ( !on.has(key) ) continue;
    const row = table[key];
    if ( !row ) continue;
    const name = conditionName(key);
    if ( mine.has(key) ) {
      if ( row.attacker && attackerSeenBy?.sees?.includes(key) ) {
        out.push(reminderSource("condition", null,
          `${attackerName} — ${name}: ${targetName} sees you (${attackerSeenBy.sense} ${attackerSeenBy.range} ft)`, row.rule));
      } else if ( row.attacker ) {
        out.push(reminderSource("condition", row.attacker,
          `${attackerName} — ${name}${labelCaveat(row)}`, row.rule));
      } else if ( row.note ) {
        out.push(reminderSource("condition", null, `${attackerName} — ${name}: ${row.note}`, row.rule));
      }
    }
    if ( theirs.has(key) && row.target && targetSeenBy?.sees?.includes(key) ) {
      out.push(reminderSource("condition", null,
        `${targetName} is ${name} — ${attackerName} sees it (${targetSeenBy.sense} ${targetSeenBy.range} ft)`, row.rule));
    } else if ( theirs.has(key) && row.target ) {
      out.push(reminderSource("condition", row.target,
        `${targetName} is ${name}${labelCaveat(row)}`, row.rule));
    }
  }
  return out;
}

/** Does the observer's Blindsight or Truesight reach? Then Invisible's "if a creature can somehow
 * see you" lists the bend instead. Blindsight finds the hidden too; Truesight answers Invisible only.
 * @param {{blindsight?: number, truesight?: number}} senses  in feet
 * @param {number|null} feet
 * @returns {{sense: string, range: number, sees: string[]}|null} */
export function sightOf(senses, feet) {
  if ( (typeof feet !== "number") || !Number.isFinite(feet) ) return null;
  const blind = Number(senses?.blindsight) || 0, tru = Number(senses?.truesight) || 0;
  if ( blind && (feet <= blind) ) return { sense: "Blindsight", range: blind, sees: ["invisible", "hiding"] };
  if ( tru && (feet <= tru) ) return { sense: "Truesight", range: tru, sees: ["invisible"] };
  return null;
}

/** The save gate's sources for THIS ability. An `autoFail` row is listed and marks the save
 * "cannot succeed" (the dialog's fourth button).
 * @param {{statuses?: Iterable<string>, ability: string, enabled: Iterable<string>,
 *          table: Readonly<Record<string, Readonly<{abilities: readonly string[], bend?: "advantage"|"disadvantage", autoFail?: boolean, rule: object|string|null, caveat?: string}>>>,
 *          name?: string}} facts
 * @returns {{kind: string, bend: "advantage"|"disadvantage"|null, label: string, detail: string, autoFail?: boolean}[]} */
export function saveSources({ statuses = [], ability, enabled, table, name = "You" }) {
  const on = new Set(enabled ?? []);
  const mine = new Set(statuses);
  const out = [];
  for ( const key of Object.keys(table ?? {}) ) {
    if ( !on.has(key) || !mine.has(key) ) continue;
    const row = table[key];
    if ( !row?.abilities?.includes(ability) ) continue;
    const label = `${name} — ${conditionName(key)}${labelCaveat(row)}`;
    if ( row.autoFail ) {
      out.push(Object.assign(reminderSource("condition", null, `${label}: this save cannot succeed`, row.rule),
        { autoFail: true, status: key, statusName: conditionName(key) }));
    } else if ( row.bend ) {
      out.push(Object.assign(reminderSource("condition", row.bend, label, row.rule), { status: key }));
    }
  }
  return out;
}

/** The save gate's net: the attack arithmetic, unless the save cannot succeed (`fails`, which wins)
 * or cannot fail (`succeeds`).
 * @param {{kind: string, bend: "advantage"|"disadvantage"|null, label: string, detail?: string, autoFail?: boolean, autoSucceed?: boolean}[]} sources
 * @returns {{sources: object[], net: "advantage"|"disadvantage"|"normal"|"fails"|"succeeds", autoFail: boolean, autoSucceed: boolean, view: object}} */
export function saveGate(sources) {
  const autoFail = sources.some(s => s.autoFail);
  const autoSucceed = !autoFail && sources.some(s => s.autoSucceed);
  const net = autoFail ? "fails" : autoSucceed ? "succeeds" : netMode(sources);
  const view = reminderView(sources, net);
  if ( autoFail ) view.head.why = "This save cannot succeed — the rules fail it before any die is rolled. Fails records the failure without dice; a mode button still rolls.";
  if ( autoSucceed ) view.head.why = "This save cannot fail — the rules pass it before any die is rolled. Succeeds records the success without dice; a mode button still rolls.";
  return { sources, net, autoFail, autoSucceed, view };
}

/** The check gate's sources against `CHECK_BENDS` (no 2024 rule fails a check automatically).
 * @param {{statuses?: Iterable<string>, enabled: Iterable<string>, table: Readonly<Record<string, any>>, name?: string}} facts */
export function checkSources({ statuses = [], enabled, table, name = "You" }) {
  const on = new Set(enabled ?? []);
  const mine = new Set(statuses);
  const out = [];
  for ( const key of Object.keys(table ?? {}) ) {
    if ( !on.has(key) || !mine.has(key) ) continue;
    const row = table[key];
    if ( !row?.bend ) continue;
    out.push(Object.assign(reminderSource("condition", row.bend, `${name} — ${conditionName(key)}`, row.rule), { status: key }));
  }
  return out;
}

/** The row's carriers: effects named as it, or one id-less carrier for a `match: "feature"` row (Brave).
 * @param {any} row
 * @param {string} key
 * @param {{id?: string|null, name: string, statuses?: string[], sourceUuid?: string|null, sourceHas?: string[], member?: boolean,
 *          lends?: string|null}[]} [effects]
 * @param {string[]} [features]
 * @returns {{id?: string|null, name?: string, sourceUuid?: string|null, sourceHas?: string[], lends?: string|null}[]} */
function rowCarriers(row, key, effects = [], features = []) {
  // `named`: the carrier's own name when the row's key cannot be it (Mantle of Majesty's "Unearthly Appearance").
  const name = String(row?.named ?? key);
  if ( (row?.match === "feature") || (row?.match === "worn") ) {
    return (features ?? []).some(f => String(f).toLowerCase() === name.toLowerCase()) ? [{ id: null }] : [];
  }
  // D1 — `member`: an emanation's member copy alone (Corona of Light's enemies, never the cleric's own copy).
  return (effects ?? []).filter(e => effectNamedAs(e?.name, name) && (!row?.member || !!e?.member));
}

/** Does a lent proficiency answer this check (the Help action's "Assisted — <skill>", `checksWhen.lends`)? The effect's
 * `lends` is "<kind>:<key>": a skill check by its key, a tool check by its key; a raw ability check, or another skill, never.
 * @param {string|null|undefined} lends
 * @param {{skill?: string|null, tool?: string|null}} roll */
const lendAnswers = (lends, { skill = null, tool = null }) => {
  const [kind, key] = String(lends ?? "").split(":");
  if ( !kind || !key ) return false;
  if ( kind === "skill" ) return !!skill && (skill === key);
  if ( kind === "tool" ) return !!tool && (tool === key);
  return false;
};

/** Effect rows whose `checks` facet bends ability checks; `checksWhen` narrows to statuses/skills, or (`lends`) to the
 * skill or tool the CARRIER itself lends — the effect's own `lends` fact against the roll's key. A row with `spend`
 * says so on the source, for the gate's record to use it up.
 * @param {{effects?: {id?: string|null, name: string, lends?: string|null}[], features?: string[],
 *          enabled: Iterable<string>, table: Readonly<Record<string, any>>, name?: string, statuses?: Iterable<string>,
 *          skill?: string|null, tool?: string|null}} facts */
export function effectCheckSources({ effects = [], features = [], enabled, table, name = "You", statuses = [], skill = null, tool = null }) {
  const on = new Set([...(enabled ?? [])].map(n => String(n).toLowerCase()));
  const mine = new Set(statuses ?? []);
  const out = [];
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    if ( !row?.checks || !on.has(key.toLowerCase()) ) continue;
    const when = row.checksWhen;
    if ( when?.statuses?.length && !when.statuses.some(s => mine.has(s)) ) continue;
    if ( when?.skills?.length && !when.skills.includes(skill) ) continue;
    const carriers = rowCarriers(row, key, effects, features).filter(e => !when?.lends || lendAnswers(e?.lends, { skill, tool }));
    for ( const e of carriers ) {
      // An effect named after its lend (Assisted — Stealth) says its own name.
      const label = `${name} — ${(when?.lends && e?.name) ? e.name : key}`;
      out.push(Object.assign(reminderSource("effect", row.checks, label, row.rule), e.id ? { effectId: e.id } : {},
        row.spend ? { spend: row.spend } : {}));
    }
  }
  return out;
}

/** Effect rows with a `saves` facet, read against the DEMAND (what the save is against). With no
 * demand (a bare sheet roll) every row is LISTED — never guess what a roll is against. A `side: "caster"`
 * row is read off the demand's caster snapshot (`demand.source`) and is nothing without a demand.
 * @param {{effects?: {id: string, name: string, statuses?: string[], sourceUuid?: string|null, sourceHas?: string[], member?: boolean}[],
 *          features?: string[], enabled: Iterable<string>, table: Readonly<Record<string, any>>,
 *          demand?: {spell?: boolean|null, cast?: boolean|null, statuses?: string[]|null, sleep?: boolean|null, abilities?: string[]|null, item?: string|null,
 *                    types?: string[]|null, channel?: boolean|null,
 *                    source?: {uuid?: string|null, name?: string|null, type?: string|null, effects?: {id?: string|null, name: string}[], features?: string[], statuses?: string[]}|null}|null,
 *          name?: string}} facts */
export function effectSaveSources({ effects = [], features = [], enabled, table, demand = null, name = "You" }) {
  const on = new Set([...(enabled ?? [])].map(n => String(n).toLowerCase()));
  const lower = v => String(v ?? "").toLowerCase();
  const out = [];
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    const facet = row?.saves;
    if ( !facet || !on.has(key.toLowerCase()) ) continue;
    const casterSide = row.side === "caster";
    const source = demand?.source ?? null;
    if ( casterSide && !source ) continue;
    const who = (casterSide && source) ? (source.name ?? "The caster") : name;
    const carriers = (casterSide && source)
      ? rowCarriers(row, key, source.effects ?? [], source.features ?? [])
      : rowCarriers(row, key, effects, features);
    if ( !carriers.length ) continue;
    const scope = facet.statuses?.length
      ? `a save against ${facet.statuses.map(conditionName).join(", ")}`
      : facet.sleep ? "a save against magic that would put you to sleep"
        : (facet.spells === "cast") ? "a save against a spell"
          : facet.spells ? "a save against a spell or other magical effect"
          : facet.abilities?.length ? `a ${facet.abilities.map(abilityName).join(" or ")} save`
            : facet.item ? `a save against ${facet.item}` : "this save";
    let bend = null;
    let caveat = "";
    let succeeds = false;
    let fails = false;
    if ( !demand ) {
      caveat = facet.succeeds ? ` (listed — ${scope}; it cannot fail if this is one)`
        : facet.fails ? ` (listed — ${scope}; it cannot succeed if this is one)`
          : ` (listed — ${scope}; press ${facet.bend === "advantage" ? "Advantage" : "Disadvantage"} if this is one)`;
    } else if ( facet.item && (lower(demand.item) !== lower(facet.item)) ) {
      continue;   // the demand's own item by name (Mantle of Majesty's Command)
    } else if ( facet.sourceStatus && !(source?.statuses ?? []).some(s => lower(s) === lower(facet.sourceStatus)) ) {
      continue;   // the caster's status as it cast (Magical Ambush's Invisible)
    } else if ( (facet.charmedBy === "source")
      && !(source?.uuid && effects.some(e => (e.statuses ?? []).includes("charmed") && (e.sourceUuid === source.uuid))) ) {
      continue;   // the roller Charmed by the demand's caster (Mantle of Majesty)
    } else if ( facet.by ) {
      // D1 — the demand's caster and what it is (Corona of Light, Diminish Defiance, Holy Ward).
      const by = facet.by;
      if ( by.creatureTypes?.length ) {
        if ( !by.creatureTypes.includes(lower(source?.type)) ) continue;
        caveat = ` — a save forced by ${source?.name ?? "a creature"} (${lower(source?.type)})`;
      } else {
        const types = (demand.types ?? []).map(lower);
        const spell = !!by.spells && !!demand.spell && (!by.types?.length || by.types.some(t => types.includes(lower(t))));
        const item = !!by.items?.length && by.items.some(i => lower(i) === lower(demand.item));
        const channel = !!by.channel && !!demand.channel;
        if ( !spell && !item && !channel ) continue;
        caveat = ` — against ${source?.name ?? "its source"}'s ${item ? demand.item : channel ? "Channel Divinity" : "spell"}`;
      }
      bend = facet.bend;
    } else if ( facet.fails ) {
      fails = true;
      caveat = `: this save cannot succeed${facet.item ? ` — ${facet.item}` : ""}${(facet.charmedBy === "source") ? `, ${name} Charmed by ${who}` : ""}`;
    } else if ( facet.sleep ) {
      if ( !demand.spell || !demand.sleep ) continue;
      succeeds = !!facet.succeeds;
      bend = succeeds ? null : (facet.bend ?? null);
      caveat = succeeds ? ": this save cannot fail — magic can't put you to sleep" : " — against magic that would put you to sleep";
    } else if ( facet.statuses?.length ) {
      const hits = (demand.statuses ?? []).filter(s => facet.statuses.includes(String(s).toLowerCase()));
      if ( !hits.length ) continue;
      bend = facet.bend;
      caveat = ` — against ${hits.map(conditionName).join(", ")}`;
    } else if ( facet.spells ) {
      if ( !demand.spell ) continue;
      // `spells: "cast"`: a spell CAST alone (the demand's `cast` mark) — never a magic item's effect.
      if ( (facet.spells === "cast") && !demand.cast ) continue;
      // Greater Magic Resistance: the save against magic cannot fail — the fourth button, Trance's shape.
      succeeds = !!facet.succeeds;
      bend = succeeds ? null : (facet.bend ?? null);
      caveat = succeeds ? ": this save cannot fail — against a spell or other magical effect"
        : (facet.spells === "source") ? ` — against ${source?.name ?? "its source"}'s spell`
          : facet.sourceStatus ? ` — against a spell, ${who} ${conditionName(facet.sourceStatus)} as it cast` : " — against a spell";
    } else if ( facet.abilities?.length ) {
      // The save's own ability (Irresistible Dance's Dexterity); a demand naming none is not this one.
      const hits = (demand.abilities ?? []).filter(a => facet.abilities.includes(String(a).toLowerCase()));
      if ( !hits.length ) continue;
      bend = facet.bend;
      caveat = ` — a ${hits.map(abilityName).join(" or ")} save`;
    } else {
      bend = facet.bend;
    }
    for ( const e of carriers ) {
      // `spells: "source"`: only an effect whose SOURCE is the demand's caster (Struck by this fighter).
      if ( demand && (facet.spells === "source") && !(source?.uuid && (e.sourceUuid === source.uuid)) ) continue;
      // D1 — `by.caster`: the same — the effect's own source cast what is demanded.
      if ( demand && facet.by?.caster && !(source?.uuid && (e.sourceUuid === source.uuid)) ) continue;
      // `sourceFeature`: only an effect whose source holds the feature (Eldritch Hex's Hexed).
      if ( facet.sourceFeature && !(e.sourceHas ?? []).some(f => lower(f) === lower(facet.sourceFeature)) ) continue;
      out.push(Object.assign(reminderSource("effect", bend, `${who} — ${key}${caveat}`, row.rule), e.id ? { effectId: e.id } : {},
        succeeds ? { autoSucceed: true, feature: key } : {},
        fails ? { autoFail: true, status: null, statusName: key } : {},
        row.spend ? { spend: row.spend } : {}));
    }
  }
  return out;
}

/** The 2024 ability names, for a row's words. */
const abilityName = key => ({ str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" })[String(key ?? "").toLowerCase()] ?? String(key ?? "");

/** The demand's OWN bend (a repeated save raised by damage has Advantage — Tasha's Hideous Laughter):
 * one counted source, its label the spell's, its rule the row's.
 * @param {{bend?: {mode: "advantage"|"disadvantage", label: string, rule?: object|string|null}|null}|null} demand
 * @param {string} [name] */
export function demandBendSources(demand, name = "You") {
  const b = demand?.bend;
  if ( !b?.mode || !b.label ) return [];
  return [reminderSource("effect", b.mode, `${name} — ${b.label}`, b.rule ?? null)];
}

/** The key of a row that turns a half-on-save SUCCESS into none (`halfToNone`, Circle of Power).
 * @param {{effects?: {name: string}[], features?: string[], enabled: Iterable<string>, table: Readonly<Record<string, any>>,
 *          demand?: {spell?: boolean|null, cast?: boolean|null}|null}} facts
 * @returns {string|null} */
export function saveNoneOnSuccess({ effects = [], features = [], enabled, table, demand = null }) {
  const on = new Set([...(enabled ?? [])].map(n => String(n).toLowerCase()));
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    const facet = row?.saves;
    if ( !facet?.halfToNone || !on.has(key.toLowerCase()) ) continue;
    if ( facet.spells && !demand?.spell ) continue;
    if ( (facet.spells === "cast") && !demand?.cast ) continue;
    if ( rowCarriers(row, key, effects, features).length ) return key;
  }
  return null;
}

/** The check gate's net: the attack arithmetic. */
export function checkGate(sources) {
  const net = netMode(sources);
  return { sources, net, view: reminderView(sources, net) };
}

/** Effects whose CHANGES set the platform's roll mode (keys: `modeKeys`); the value's sign decides.
 * ⚠ dnd5e sums them into one mode and the dialog opens `1d20adv` with no word of who; only the
 * changes can say. The dialog's own default is never re-set.
 * @param {{effects?: {id?: string, name: string, item?: string|null, changes?: {key: string, value: string|number}[]}[],
 *          roll: {kind: "save"|"check", ability?: string|null, skill?: string|null, tool?: string|null, concentration?: boolean},
 *          rollLabel?: string, name?: string}} facts
 * @returns {{kind: string, bend: "advantage"|"disadvantage"|null, label: string, detail: string, effectId?: string, effectName: string, item: string|null}[]} */
export function modeSources({ effects = [], roll, rollLabel = "this roll", name = "You" }) {
  const keys = modeKeys(roll);
  if ( !keys.length ) return [];
  const out = [];
  for ( const e of effects ) {
    let sign = 0;
    for ( const c of (e.changes ?? []) ) {
      if ( !keys.includes(c.key) ) continue;
      const v = Math.sign(Number(c.value));
      if ( v ) sign += v;
    }
    if ( !sign ) continue;
    const bend = (sign > 0) ? "advantage" : "disadvantage";
    const item = e.item ?? null;
    const what = item ? (item === e.name ? item : `${item} (${e.name})`) : e.name;
    const source = reminderSource("effect", bend, `${name} — ${what}`,
      `An effect on the sheet sets ${rollLabel} to roll with ${(bend === "advantage") ? "Advantage" : "Disadvantage"}.`);
    out.push(Object.assign(source, { effectName: e.name, item, ...(e.id ? { effectId: e.id } : {}) }));
  }
  return out;
}

/** The dnd5e AdvantageModeField paths for this roll. A Concentration save adds
 * `concentration.roll.mode` (`rollConcentration` combines that field alone; Mage Slayer nets against it).
 * @param {{kind?: string|null, ability?: string|null, skill?: string|null, tool?: string|null, concentration?: boolean}} [roll]
 * @returns {string[]} */
export function modeKeys({ kind = null, ability = null, skill = null, tool = null, concentration = false } = {}) {
  const keys = [];
  if ( kind === "save" ) {
    if ( ability ) keys.push(`system.abilities.${ability}.save.roll.mode`);
    if ( concentration ) keys.push("system.attributes.concentration.roll.mode");
  } else if ( kind === "check" ) {
    if ( ability ) keys.push(`system.abilities.${ability}.check.roll.mode`);
    if ( skill ) keys.push(`system.skills.${skill}.roll.mode`);
    if ( tool ) keys.push(`system.tools.${tool}.roll.mode`);
  }
  return keys;
}

/** The `EFFECT_BENDS` rows either sheet carries for this roll. Facets: `judge`, `counted: false`,
 * `spend`, `except: "source"` (Goaded), `only: "source"` (Feinting Attack), `sourceWithin`, `member` (the Wolf).
 * `allyNear` is three-valued: only a measured false skips — never guess an exemption.
 * @param {{attacker?: {uuid?: string|null, effects?: {id: string, name: string, sourceUuid?: string|null, member?: boolean}[], features?: string[], bloodied?: boolean, offTurnMelee?: boolean|null},
 *          target?: {uuid?: string|null, effects?: {id: string, name: string, sourceUuid?: string|null, member?: boolean}[], features?: string[], bloodied?: boolean, damaged?: boolean, grappled?: boolean, notActed?: boolean, allyNear?: boolean|null, incapacitated?: boolean, inSpace?: boolean,
 *                    undamaged?: boolean, speedZero?: boolean, displacementOff?: boolean, statuses?: string[]},
 *          enabled: Iterable<string>, table: Readonly<Record<string, any>>,
 *          scope?: {classification?: string|null, type?: string|null, item?: string|null},
 *          attackerName?: string, targetName?: string, pass?: "both"|"attacker"|"target"}} facts */
export function effectSources({ attacker = {}, target = {}, enabled, table, scope = {},
  attackerName = "You", targetName = "the target", pass = "both" }) {
  const on = new Set([...(enabled ?? [])].map(n => String(n).toLowerCase()));
  // The EDGE reads the attacker once, then each target: a row hinging on the TARGET is the target pass's.
  const targetJudges = new Set(["targetBloodied", "targetDamaged", "targetGrappled", "targetNotActed", "allyNearTarget", "notIncapacitated", "targetInSpace", "displaced", "targetStatus"]);
  const hingesOnTarget = row => targetJudges.has(row.judge) || (row.except === "source") || (row.only === "source") || !!row.against || !!row.plus;
  const notOnlyFor = (row, e, otherUuid) => (row.only === "source") && (!e?.sourceUuid || !otherUuid || (e.sourceUuid !== otherUuid));
  const attackerRowHere = row => (pass === "both") || ((pass === "target") === hingesOnTarget(row));
  const exceptedFor = (row, e, otherUuid) => (row.except === "source") && !!e?.sourceUuid && !!otherUuid && (e.sourceUuid === otherUuid);
  const targetRowHere = pass !== "attacker";
  const inScope = row => {
    const s = row.scope ?? "any";
    if ( s === "any" ) return true;
    if ( (s === "spell") || (s === "weapon") ) return (scope.classification ?? null) === s;
    return (scope.type ?? null) === s;
  };
  const judged = row => {
    switch ( row.judge ) {
      case "bloodied": return !!attacker.bloodied;
      case "targetBloodied": return !!target.bloodied;
      case "targetDamaged": return !!target.damaged;
      case "targetGrappled": return !!target.grappled;
      case "targetNotActed": return !!target.notActed;
      case "allyNearTarget": return target.allyNear !== false;
      case "notIncapacitated": return !target.incapacitated;    // Displacement: off while the bearer is Incapacitated
      case "targetStatus": return !!row.status && !!(target.statuses ?? []).includes(row.status);   // RAVENLOFT, Terrorizer: the target wears it
      case "targetInSpace": return !!target.inSpace;             // Object Slam: the target stands inside the attacker's space
      // The DMG's Cloak of Displacement: undamaged since its own last turn start, its Speed not 0, the pack's switch off.
      case "displaced": return (target.undamaged !== false) && !target.speedZero && !target.displacementOff;
      case "opportunity": return attacker.offTurnMelee === true;  // B4, Escape the Horde: an off-turn melee attack in combat
      default: return true;
    }
  };
  // A MEASURED farther source skips the row; an unmeasured one counts.
  const outOfReach = (row, e) => Number.isFinite(row.sourceWithin) && Number.isFinite(e?.sourceFeet) && (e.sourceFeet > row.sourceWithin);
  const carriers = (who, row) => {
    // `attack`: the attack's own item is the carrier (Object Slam) — no sheet is read.
    if ( row.attack ) return (String(scope.item ?? "").toLowerCase() === String(row.attack).toLowerCase()) ? [{ id: null }] : [];
    // `named`: the effect's own name when the row's key cannot be it (a second "Protected")
    const name = String(row.named ?? row.__name).toLowerCase();
    if ( (row.match === "feature") || (row.match === "worn") ) {
      return (who.features ?? []).some(f => String(f).toLowerCase() === name) ? [{ id: null }] : [];
    }
    // `member`: an emanation's member copy alone — the bearer's own effect of the same name never bends.
    return (who.effects ?? []).filter(e => effectCarriesRow(e, name, row) && (!row.member || !!e.member));
  };
  const out = [];
  for ( const [key, base] of Object.entries(table ?? {}) ) {
    if ( !on.has(key.toLowerCase()) ) continue;
    const row = { ...base, __name: key };
    if ( !inScope(row) ) continue;
    const counted = row.counted !== false;
    const say = (who, bend, /** @type {{name?: string}|null} */ e = null) => {
      // A `named` row says the effect's own name; so does an `against` chip (it names its creature after the dash).
      const label = `${who} — ${(row.named || row.against) ? (e?.name ?? row.named ?? key) : key}${labelCaveat(row)}`;
      return Object.assign(reminderSource("effect", counted ? bend : null, label, row.rule),
        row.spend ? { spend: row.spend } : {});
    };
    if ( row.attacker && attackerRowHere(row) && judged(row) ) {
      for ( const e of carriers(attacker, row) ) {
        if ( exceptedFor(row, e, target.uuid) || notOnlyFor(row, e, target.uuid) ) continue;
        if ( outOfReach(row, e) ) continue;
        // `against`: the chip names ONE creature (Studied Attacks) — read at that target alone.
        if ( row.against && (!target?.uuid || (e?.against !== target.uuid)) ) continue;
        out.push(Object.assign(say(attackerName, row.attacker, e), e.id ? { effectId: e.id } : {}));
      }
    }
    // `plus` (Sundered): a flat bonus to attack rolls AT the bearer — a listed source the gate pushes onto the roll.
    // Negative with `against: "attacker"` (Multiattack Defense, B4): the bearer's chip names the ONE attacker it counts against.
    if ( (Number(row.plus) !== 0) && Number.isFinite(Number(row.plus)) && targetRowHere && judged(row) ) {
      for ( const e of carriers(target, row) ) {
        if ( exceptedFor(row, e, attacker.uuid) || notOnlyFor(row, e, attacker.uuid) ) continue;
        if ( (row.against === "attacker") && (!attacker?.uuid || (e?.against !== attacker.uuid)) ) continue;
        const signed = `${Number(row.plus) < 0 ? "−" : "+"}${Math.abs(Number(row.plus))}`;
        out.push(Object.assign(reminderSource("effect", null, `${targetName} is ${(row.named || row.against) ? (e?.name ?? row.named ?? key) : key} — ${signed} to this attack roll`, row.rule),
          { plus: Number(row.plus) }, e.id ? { effectId: e.id } : {}, row.spend ? { spend: row.spend } : {}));
      }
    }
    if ( row.target && targetRowHere && judged(row) ) {
      for ( const e of carriers(target, row) ) {
        if ( exceptedFor(row, e, attacker.uuid) || notOnlyFor(row, e, attacker.uuid) ) continue;
        if ( outOfReach(row, e) ) continue;
        out.push(Object.assign(say(`${targetName} is`, row.target, e), e.id ? { effectId: e.id } : {}));
      }
    }
  }
  return out;
}

/** The automatic Critical Hit from within `critWithinFeet` (Paralyzed, Unconscious) — an outcome,
 * not a reminder. The Condition Sources list is NOT consulted: a rule that changes dice always applies.
 * @param {{targetStatuses?: Iterable<string>, distanceFeet?: number|null, targetName?: string,
 *          table: Readonly<Record<string, Readonly<{rule: object|string|null, critWithinFeet?: number}>>>}} facts
 * @returns {{status: string, label: string, rule: object|string|null}[]} */
export function autoCritSources({ targetStatuses = [], distanceFeet = null, targetName = "the target", table }) {
  // null is "could not measure"; Number(null) is 0 — never a crit.
  if ( (distanceFeet === null) || (distanceFeet === undefined) ) return [];
  const d = Number(distanceFeet);
  if ( !Number.isFinite(d) ) return [];
  const theirs = new Set(targetStatuses);
  const out = [];
  for ( const [key, row] of Object.entries(table ?? {}) ) {
    const feet = Number(row?.critWithinFeet);
    if ( !(feet > 0) || !theirs.has(key) || (d > feet) ) continue;
    out.push({ status: key, label: `${targetName} is ${conditionName(key)} — within ${feet} feet, a hit is a Critical Hit`, rule: row.rule });
  }
  return out;
}

/** One source of Advantage or Disadvantage on a roll.
 * @param {string} kind  a REMINDER_KINDS key
 * @param {"advantage"|"disadvantage"|null} bend  null = listed, not counted
 * @param {string} label
 * @param {string} [detail]  the rule line */
export function reminderSource(kind, bend, label, detail = "") {
  return { kind, bend, label, detail };
}

/** THE NET: any Advantage against any Disadvantage is a normal roll, however many of each.
 * @param {{bend?: string|null}[]} sources
 * @returns {"advantage"|"disadvantage"|"normal"} */
export function netMode(sources) {
  const adv = sources.some(s => s.bend === "advantage");
  const dis = sources.some(s => s.bend === "disadvantage");
  if ( adv && dis ) return "normal";
  if ( adv ) return "advantage";
  if ( dis ) return "disadvantage";
  return "normal";
}

export const modeTitle = mode => (mode === "advantage") ? "Advantage"
  : (mode === "disadvantage") ? "Disadvantage" : (mode === "fails") ? "Fails" : (mode === "succeeds") ? "Succeeds" : "Normal roll";

/** How a roll went out — "with Advantage", "flat"; one vocabulary for every line on the card.
 * @param {"advantage"|"disadvantage"|"normal"|null|undefined} mode */
export const rolledWith = mode => (mode === "advantage") ? "with Advantage"
  : (mode === "disadvantage") ? "with Disadvantage" : "flat";

/** Why the net is what it is, in one line.
 * @param {{bend?: string|null}[]} sources */
export function resolutionLine(sources) {
  const adv = sources.filter(s => s.bend === "advantage").length;
  const dis = sources.filter(s => s.bend === "disadvantage").length;
  const unknown = sources.filter(s => !s.bend).length;
  const tail = unknown ? ` ${unknown === 1 ? "One source" : `${unknown} sources`} could not be judged from here — see below.` : "";
  if ( adv && dis ) {
    return `Advantage (${adv}) and Disadvantage (${dis}) cancel — a normal roll, however many of each.${tail}`;
  }
  if ( adv ) return `${adv > 1 ? `${adv} sources of Advantage — still one Advantage.` : "One source of Advantage."}${tail}`;
  if ( dis ) return `${dis > 1 ? `${dis} sources of Disadvantage — still one Disadvantage.` : "One source of Disadvantage."}${tail}`;
  return unknown ? `Nothing counted.${tail}` : "Nothing bends this roll.";
}

/** Prone, both roles. A null distance lists the target's Prone without counting it. Distances are
 * FEET — the EDGE converts the scene's units.
 * @param {{attackerProne?: boolean, targetProne?: boolean, distanceFeet?: number|null,
 *          attackerName?: string, targetName?: string, targetProneBy?: string|null}} facts */
export function proneSources({ attackerProne = false, targetProne = false, distanceFeet = null,
  attackerName = "You", targetName = "the target", targetProneBy = null } = {}) {
  const out = [];
  // A non-status Prone (a Trip's effect shows no token icon) is named so the reader can find it.
  const by = (targetProneBy && (String(targetProneBy).toLowerCase() !== "prone")) ? ` (${targetProneBy})` : "";
  if ( attackerProne ) {
    out.push(reminderSource("prone", "disadvantage", `${attackerName} — Prone`,
      "A prone creature has Disadvantage on attack rolls."));
  }
  if ( targetProne ) {
    if ( (distanceFeet === null) || (distanceFeet === undefined) || !Number.isFinite(distanceFeet) ) {
      out.push(reminderSource("prone", null, `${targetName} is Prone${by} — distance unknown`,
        "Attacks against a prone creature have Advantage from within 5 feet and Disadvantage from beyond — judge the distance from the map."));
    } else if ( distanceFeet <= 5 ) {
      out.push(reminderSource("prone", "advantage", `${targetName} is Prone${by} — within 5 feet`,
        "Attacks against a prone creature have Advantage from within 5 feet of it."));
    } else {
      out.push(reminderSource("prone", "disadvantage", `${targetName} is Prone${by} — ${distanceFeet} feet away`,
        "Attacks against a prone creature have Disadvantage from more than 5 feet away."));
    }
  }
  return out;
}

/** RANGE for a ranged attack: beyond normal → Disadvantage; beyond long → cannot be made (listed);
 * an enemy within 5 feet → Disadvantage. A cancelling feat or ignored cover is listed, named. FEET.
 * @param {{ranged?: boolean, distanceFeet?: number|null, normalFeet?: number|null, longFeet?: number|null,
 *          closeEnemies?: string[], targetName?: string,
 *          cancels?: {feature: string, rows: string[], rule: object|string|null}[],
 *          coverBonus?: number, coverFeat?: {feature: string, rule: object|string|null}|null,
 *          rules: {long: object|string, single: object|string, close: object|string}}} facts  `rules` = `RANGE_RULES` */
export function rangeSources({ ranged = false, distanceFeet = null, normalFeet = null, longFeet = null,
  closeEnemies = [], targetName = "the target", cancels = [], coverBonus = 0, coverFeat = null, rules }) {
  const out = [];
  if ( !ranged || !rules ) return out;
  const cancelOf = row => (cancels ?? []).find(c => (c.rows ?? []).includes(row)) ?? null;
  const bent = (row, label, rule) => {
    const c = cancelOf(row);
    return c ? reminderSource("range", null, `${label} — ${c.feature}: no Disadvantage`, c.rule)
      : reminderSource("range", "disadvantage", label, rule);
  };
  if ( closeEnemies.length ) out.push(bent("close", `Ranged attack within 5 feet of ${closeEnemies.join(", ")}`, rules.close));
  if ( coverFeat && (Number(coverBonus) > 0) ) {
    out.push(reminderSource("range", null, `${targetName}'s cover (+${Number(coverBonus)} AC) — ${coverFeat.feature} ignores it`, coverFeat.rule));
  }
  const d = Number(distanceFeet), normal = Number(normalFeet), long = Number(longFeet);
  if ( !Number.isFinite(d) || !(normal > 0) ) return out;
  if ( long > normal ) {
    if ( d > long ) {
      out.push(reminderSource("range", null,
        `${targetName} is beyond long range — ${d} feet, long range ${long}: this attack cannot be made`, rules.long));
    } else if ( d > normal ) {
      out.push(bent("long", `${targetName} is beyond normal range — ${d} feet (${normal}/${long})`, rules.long));
    }
  } else if ( d > normal ) {
    out.push(reminderSource("range", null,
      `${targetName} is beyond range — ${d} feet, range ${normal}: this attack cannot be made`, rules.single));
  }
  return out;
}

/** The attacker's RANGE_FEATS rows that fit this attack: what they cancel, cover ignored, spell reach.
 * @param {string[]} features
 * @param {{rangedWeapon?: boolean, spell?: boolean, crossbow?: boolean}} attack
 * @param {Readonly<Record<string, {scope: string, cancels?: readonly string[], cover?: boolean, reach?: number, rule: object|string|null}>>} table
 * @returns {{cancels: {feature: string, rows: string[], rule: object|string|null}[], cover: {feature: string, rule: object|string|null}|null,
 *            reach: {feature: string, feet: number}|null}} */
export function rangeFeatsFor(features, attack, table) {
  const have = new Set((features ?? []).map(n => String(n).toLowerCase()));
  const fits = scope => ((scope === "rangedWeapon") && !!attack?.rangedWeapon) || ((scope === "spell") && !!attack?.spell)
    || ((scope === "crossbow") && !!attack?.crossbow);
  /** @type {{cancels: {feature: string, rows: string[], rule: object|string|null}[], cover: {feature: string, rule: object|string|null}|null, reach: {feature: string, feet: number}|null}} */
  const out = { cancels: [], cover: null, reach: null };
  for ( const [feature, row] of Object.entries(table ?? {}) ) {
    if ( !have.has(feature.toLowerCase()) || !fits(row.scope) ) continue;
    if ( row.cancels?.length ) out.cancels.push({ feature, rows: [...row.cancels], rule: row.rule });
    if ( row.cover && !out.cover ) out.cover = { feature, rule: row.rule };
    if ( row.reach && !out.reach ) out.reach = { feature, feet: Number(row.reach) };
  }
  return out;
}

/** Spell Sniper's reach on a spell range of at least 10 feet; a two-band weapon range stands.
 * @param {{normalFeet?: number|null, longFeet?: number|null}} range
 * @param {{feet: number}|null} reach */
export function reachedRange(range, reach) {
  const normal = Number(range?.normalFeet);
  if ( !reach || !(normal >= 10) || (Number(range?.longFeet) > 0) ) return range;
  return { ...range, normalFeet: normal + reach.feet, reachedBy: reach.feet };
}

/** The AC less the cover bonus dnd5e folded in, for an attacker who ignores cover; null stays null.
 * @param {number|null} ac
 * @param {number} cover
 * @returns {number|null} */
export function acWithoutCover(ac, cover) {
  if ( (ac === null) || (ac === undefined) || !Number.isFinite(Number(ac)) ) return ac ?? null;
  return Number(ac) - Math.max(0, Number(cover) || 0);
}

/** The gate's view (present.js `reminderSectionHTML`): a header with the count and net, the
 * arithmetic as its tooltip, and a box per source.
 * @param {{kind: string, bend: "advantage"|"disadvantage"|null, label: string, detail?: string}[]} sources
 * @param {"advantage"|"disadvantage"|"normal"|"fails"|"succeeds"} net */
export function reminderView(sources, net) {
  const n = sources.length;
  return {
    head: { title: `${n} ${(n === 1) ? "Modifier" : "Modifiers"} — Net`, net, why: resolutionLine(sources) },
    boxes: sources.map(s => ({ label: s.label, bend: s.bend ?? null, rule: s.detail ?? "" }))
  };
}

/** The record on the re-issued attack message: shown, net, pressed, and whether they matched.
 * @param {{sources: {kind: string, bend: string|null, label: string, forgone?: boolean, plus?: number}[],
 *          net: "advantage"|"disadvantage"|"normal", mode: "advantage"|"disadvantage"|"normal",
 *          answeredAt: number}} answer */
export function reminderRecord({ sources, net, mode, answeredAt }) {
  return {
    sources: sources.map(({ kind, bend, label, forgone, plus }) => ({ kind, bend: bend ?? null, label,
      ...(forgone ? { forgone: true } : {}), ...(Number(plus) > 0 ? { plus: Number(plus) } : {}) })),
    net, mode, honoured: mode === net, answeredAt
  };
}

/** The 2024 Sleep's own rule: "Creatures that don't sleep, such as elves, or that have Immunity to the Exhaustion condition
 * automatically succeed on saves against this spell." Trance is the EFFECT_BENDS row; this is the immunity half, read off
 * the sheet's condition immunities against a demand marked `sleep` (decide/demand.js `putsToSleep`). Pure.
 * @param {{name?: string, immunities?: Iterable<string>|null, demand?: {sleep?: boolean}|null}} facts
 * @returns {object|null}  a `succeeds` source, or null */
export function immunitySleepSource({ name = "You", immunities = null, demand = null } = {}) {
  if ( !demand?.sleep || ![...(immunities ?? [])].map(s => String(s).toLowerCase()).includes("exhaustion") ) return null;
  return { ...reminderSource("effect", null, `${name} — Immunity to Exhaustion (cannot be put to sleep)`, /** @type {any} */ (SLEEP_RULE)),
    autoSucceed: true, feature: "Immunity to Exhaustion" };
}
const SLEEP_RULE = Object.freeze({ item: "Sleep", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSleep00000" });

/** THE FORGO (B3, Brutal Strike): every Advantage source struck — listed, no vote — so the net reads Normal; a
 * Disadvantage source stands (the tick is refused before this). Pure.
 * @param {{kind: string, bend: "advantage"|"disadvantage"|null, label: string}[]} sources
 * @param {string} name  the forgoing feature */
export function forgoneSources(sources, name) {
  return (sources ?? []).map(s => (s.bend === "advantage") ? { ...s, bend: null, label: `${s.label} — forgone (${name})`, forgone: true } : s);
}

/**
 * Why a buy box is off, or null: no uses left, or the row's companion (ADVANTAGE_BUYS `near`) not where the rule needs
 * it — in its pocket dimension, on another scene, or further than `feet` away. A row with no `near` reads the pool alone.
 * @param {{near?: {companion: string, feet: number}|null, point?: string|null}} row
 * @param {{left?: number|null, companion?: {state: string, sameScene: boolean, distanceFt: number|null}|null}} facts
 * @returns {string|null}
 */
export function buyOff(row, { left = null, companion = null } = {}) {
  if ( (left !== null) && !(Number(left) > 0) ) return `no ${row?.point ?? "use"}s left`;
  const near = row?.near ?? null;
  if ( !near ) return null;
  const noun = String(near.companion ?? "").toLowerCase().includes("familiar") ? "familiar" : "companion";
  if ( !companion ) return `no ${noun} standing`;
  if ( companion.state === "pocket" ) return `your ${noun} is in its pocket dimension`;
  if ( !companion.sameScene ) return `your ${noun} is not on this scene`;
  const d = (companion.distanceFt === null) || (companion.distanceFt === undefined) ? Number.NaN : Number(companion.distanceFt);
  if ( !Number.isFinite(d) ) return `your ${noun}'s distance could not be read`;
  if ( d > Number(near.feet) ) return `your ${noun} is ${d} ft away — within ${near.feet} feet only`;
  return null;
}

/** Why the forgo box is off, or null: the attack must carry Advantage, no Disadvantage, and the row's ability.
 * @param {{ability?: string|null}} row
 * @param {{sources?: {bend?: string|null}[]}|null} gate
 * @param {string|null} ability  the attack's */
export function forgoOff(row, gate, ability) {
  if ( row?.ability && ability && (String(ability).toLowerCase() !== String(row.ability).toLowerCase()) ) return `a ${abilityName(row.ability)}-based attack only`;
  const sources = gate?.sources ?? [];
  if ( sources.some(s => s.bend === "disadvantage") ) return "the attack has Disadvantage";
  if ( !sources.some(s => s.bend === "advantage") ) return "no Advantage to forgo";
  return null;
}
