// @ts-check
/**
 * By the Books — DECISION layer (ARCHITECTURE.md §2): THE HELP ACTION (RULINGS *The Help action*) as
 * data. The packs ship Help as a glossary page and no item, so the module makes the item, asks which
 * of the two assists the helper lends, and writes the one effect each spends: "Helped" on the enemy
 * (the next attack roll by an ally spends it), "Assisted — <skill>" on the ally (the next check with
 * that skill or tool spends it); both expire at the start of the helper's next turn. ⚠ PURE: no `game`,
 * no imports.
 */

/** The item's name, as the sheet shows it and the machine finds it. */
export const HELP_NAME = "Help";

/** The two facets, each named as the book names its paragraph. */
export const HELP_FACETS = Object.freeze({
  attack: Object.freeze({ key: "attack", name: "Assist an Attack Roll", effect: "Helped", benefit: "Assist an Attack Roll",
    reachFt: 5 }),
  check: Object.freeze({ key: "check", name: "Assist an Ability Check", effect: "Assisted", benefit: "Assist an Ability Check" })
});

/** The glossary page, by dnd5e's CONFIG key (the 2024 text while the Player's Handbook is installed). */
export const HELP_RULE = Object.freeze({ page: "rule", key: "help" });

/** The pointer a facet's fold reads: its own paragraph of the page. */
export const helpRuleFor = facet => Object.freeze({ ...HELP_RULE, benefit: HELP_FACETS[facet]?.benefit ?? undefined });

/** Fixed ids, so a second Help from the same helper refreshes the one copy (the twin floor's fingerprint). */
export const HELP_IDS = Object.freeze({ activity: "bfHelpUtility000", attack: "bfHelpAttack0000", check: "bfHelpCheck00000" });

/** The item's art: a core icon, so the item draws on any host. */
export const HELP_IMG = "icons/skills/social/diplomacy-handshake-yellow.webp";

/**
 * The Help item as document data: a feature with one Utility activity, an Action, one creature targeted.
 * `description` is the page's text (rule-text.js reads it; the data carries no book text of its own).
 * @param {{description?: string}} [facts]
 */
export function helpItemData({ description = "" } = {}) {
  return {
    name: HELP_NAME, type: "feat", img: HELP_IMG,
    system: {
      description: { value: description },
      activities: {
        [HELP_IDS.activity]: {
          _id: HELP_IDS.activity, type: "utility", name: HELP_NAME, img: HELP_IMG,
          activation: { type: "action", value: 1 },
          target: { affects: { type: "creature", count: "1" } }
        }
      }
    },
    flags: { "fvtt-mod-bythebooks": { helpItem: true } }
  };
}

/**
 * The helper's proficiencies the check facet may lend: skills at proficiency 1 or more, every tool on
 * the sheet (a tool listed is a tool known). Labels are the caller's (CONFIG's).
 * @param {{skills?: {key: string, label: string, value: number}[], tools?: {key: string, label: string}[]}} sheet
 * @returns {{kind: "skill"|"tool", key: string, label: string}[]}
 */
export function lendable({ skills = [], tools = [] } = {}) {
  /** @type {{kind: "skill"|"tool", key: string, label: string}[]} */
  const out = [];
  for ( const s of skills ) if ( (Number(s.value) || 0) >= 1 ) out.push({ kind: "skill", key: s.key, label: s.label });
  for ( const t of tools ) out.push({ kind: "tool", key: t.key, label: t.label });
  return out;
}

/** A check row's key names its lend: `check:<kind>:<key>`. */
const checkKey = l => `check:${l.kind}:${l.key}`;

/**
 * The popup's rows (ui.js `choicePopup` draws them as radios, "Pass just this time" after them): the attack facet,
 * then one check row per proficiency the helper may lend, each greyed with its reason when the facts refuse it.
 * The attack facet wants the enemy within 5 feet (a null distance — no token on this scene — counts, the table
 * judges); with nothing to lend the check facet is one greyed row.
 * @param {{targetName: string, feet: number|null, lends: {kind: string, key: string, label: string}[]}} facts
 */
export function helpRows({ targetName, feet, lends }) {
  const far = (typeof feet === "number") && Number.isFinite(feet) && (feet > HELP_FACETS.attack.reachFt);
  const attack = { key: "attack", name: HELP_FACETS.attack.name, tag: `vs ${targetName}`,
    off: far ? `${targetName} is ${feet} ft away — an enemy within ${HELP_FACETS.attack.reachFt} feet only` : null,
    rule: helpRuleFor("attack") };
  const checks = lends.length
    ? lends.map(l => ({ key: checkKey(l), name: HELP_FACETS.check.name, dice: l.label, tag: `for ${targetName}`, off: null, rule: helpRuleFor("check") }))
    : [{ key: "check", name: HELP_FACETS.check.name, tag: `for ${targetName}`, off: "no skill or tool proficiency to lend", rule: helpRuleFor("check") }];
  return [attack, ...checks];
}

/**
 * The answer a row's key means, against what was offered — `{ facet: "attack" }`, `{ facet: "check", lend }`,
 * `{ facet: "pass" }` — or null: a greyed row, an unknown key, a lend not among the lendable.
 * @param {string|null|undefined} key
 * @param {{rows: {key: string, off?: string|null}[], lends: {kind: string, key: string, label: string}[]}} offered
 */
export function helpAnswer(key, { rows, lends }) {
  if ( key === "pass" ) return { facet: "pass", lend: null };
  const row = rows.find(r => r.key === key);
  if ( !row || row.off ) return null;
  if ( key === "attack" ) return { facet: "attack", lend: null };
  const lend = lends.find(l => checkKey(l) === key) ?? null;
  return lend ? { facet: "check", lend } : null;
}

/**
 * The effect a facet writes, as document data (the machine adds the clock, the origin and the source stamp).
 * The check effect names its skill after the dash, as a use chip names its creature, and carries it as `lends`
 * ("skill:prc", "tool:thief").
 * @param {{facet: "attack"|"check", helperName: string, targetName: string, lend?: {kind: string, key: string, label: string}|null,
 *          img?: string|null, description?: string}} facts
 */
export function helpEffectData({ facet, helperName, targetName, lend = null, img = null, description = "" }) {
  const f = HELP_FACETS[facet];
  const note = (facet === "attack")
    ? `Written by By the Books when ${helperName} took the Help action at ${targetName}: the next attack roll by one of ${helperName}'s allies against ${targetName} has Advantage and spends it; it expires at the start of ${helperName}'s next turn.`
    : `Written by By the Books when ${helperName} took the Help action for ${targetName}: ${targetName}'s next ${lend?.label ?? "ability"} check has Advantage and spends it; it expires at the start of ${helperName}'s next turn.`;
  return {
    _id: HELP_IDS[facet],
    name: (facet === "check") ? `${f.effect} — ${lend?.label ?? "check"}` : f.effect,
    img: img ?? HELP_IMG,
    description: `${description}<p>${note}</p>`,
    disabled: false, transfer: false, changes: [],
    // `lends`: "<kind>:<key>" — the one flat fact the check gate reads against the roll's own key
    flags: { "fvtt-mod-bythebooks": { lends: (facet === "check") ? `${lend?.kind ?? ""}:${lend?.key ?? ""}` : null } }
  };
}

/**
 * The card's words, source then result (ARCHITECTURE §5 law 6); a pass says the Action went and nothing was lent.
 * @param {{facet: "attack"|"check"|"pass", helperName: string, targetName: string, lend?: {label: string}|null}} facts
 */
export function helpWords({ facet, helperName, targetName, lend = null }) {
  if ( facet === "pass" ) return { title: `${HELP_NAME} — passed`, line: `${helperName}'s Action went; nothing was lent to ${targetName}` };
  const f = HELP_FACETS[facet];
  return {
    title: `${HELP_NAME} — ${f.name}`,
    line: (facet === "attack")
      ? `Advantage on the next attack roll by an ally against ${targetName}, until the start of ${helperName}'s next turn`
      : `${targetName} has Advantage on its next ${lend?.label ?? "ability"} check, until the start of ${helperName}'s next turn`
  };
}
