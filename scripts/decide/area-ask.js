// @ts-check
/**
 * By the Books — DECISION: the ask at the area — the caster's question about the creatures in a
 * placed area: defaults, words, outcome, and the spell-text readers (ARCHITECTURE.md §2). Kinds:
 * Careful, Heightened (RULINGS *Metamagic*) and a spell that chooses (RULINGS *Spells that choose
 * their targets*). Drawn by `scripts/area-ask.js`.
 */

/** The pending ask's flag, on the cast's card or a carrier. ⚠ Named "metamagic" but serves every
 * kind; it is read by name (suites, the moment registry), so a rename is a migration. */
export const AREA_ASK_FLAG = "metamagicAsk";

/** Who a choosing spell's area affects, on its card: `{ spell, chosen, left, asked, cap }`. */
export const AREA_CHOICE_FLAG = "areaChoice";

/**
 * @typedef {{uuid: string, name: string, disposition?: number|null, tokenId?: string|null, party?: boolean}} Candidate
 * @typedef {{kind: string, feature: string, spell?: string|null, cap?: number|null, rule?: object|string|null,
 *            itemImg?: string|null, heightened?: {feature: string, rule?: object|string|null}|null,
 *            candidates: Candidate[], casterUuid: string|null, casterDisposition: number|null,
 *            casterName?: string|null, window?: number, deadline?: number}} Ask
 *
 * CAREFUL'S PROTECTED SET: up to `cap`, by default the non-hostiles — caster, party, side, then
 * neutrals, never a secret token; a `chosen` list stands instead. Sight and willingness never judged.
 * @param {{contained: Candidate[], casterUuid: string|null, casterDisposition: number|null, cap: number, chosen?: string[]|null}} args
 * @returns {{uuid: string, name: string}[]} */
export function carefulProtects({ contained, casterUuid = null, casterDisposition = null, cap, chosen = null }) {
  const limit = Math.max(1, Number(cap) || 1);
  const list = Array.isArray(contained) ? contained : [];
  const entry = c => ({ uuid: c.uuid, name: c.name });
  if ( Array.isArray(chosen) ) {
    return chosen.map(uuid => list.find(c => c.uuid === uuid)).filter(Boolean).slice(0, limit).map(entry);
  }
  const hostile = hostileTo(casterDisposition);
  const rank = c => (c.uuid === casterUuid) ? 0 : c.party ? 1 : (c.disposition === casterDisposition) ? 2 : 3;
  const friends = list.filter(c => (c.uuid === casterUuid)
    || ((c.disposition !== undefined) && (c.disposition !== null) && (c.disposition !== -2) && (c.disposition !== hostile)));
  friends.sort((a, b) => rank(a) - rank(b));
  return friends.slice(0, limit).map(entry);
}

/** HEIGHTENED'S MARK: the pick, else the first enemy of the caster's side (a neutral when none).
 * @param {{contained: Candidate[], casterUuid: string|null, casterDisposition: number|null, chosen?: string|null}} args
 * @returns {{uuid: string, name: string}|null} */
export function heightenedMark({ contained, casterUuid = null, casterDisposition = null, chosen = null }) {
  const list = Array.isArray(contained) ? contained : [];
  const entry = c => ({ uuid: c.uuid, name: c.name });
  if ( chosen ) { const c = list.find(x => x.uuid === chosen); return c ? entry(c) : null; }
  const others = list.filter(c => (c.uuid !== casterUuid) && ((casterDisposition === null) || (c.disposition !== casterDisposition)));
  const enemy = others.find(c => (casterDisposition !== null) && (c.disposition === -casterDisposition));
  const pick = enemy ?? others[0] ?? null;
  return pick ? entry(pick) : null;
}

const NUMBER_WORDS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 });

/** A spell's text as the table reads it: markup gone, an enricher reduced to its label.
 * @param {string} html */
export function spellProse(html) {
  return String(html ?? "")
    .replace(/<section class="secret"[\s\S]*?<\/section>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/\[\[[^\]]*\]\](?:\{([^}]*)\})?/g, (_m, label) => label ?? "")
    .replace(/[@&]\w+\[([^\]\s]+)[^\]]*\](?:\{([^}]*)\})?/g, (_m, key, label) => label ?? key)
    .replace(/\s+/g, " ").trim();
}

/** The number the spell's own text allows ("up to six creatures of your choice"), or null when it sets none
 * (Sleep's "each creature of your choice": every creature in the area). Read, never copied (N1).
 * @param {string} html */
export function choiceCapFrom(html) {
  const word = spellProse(html).match(/\bup to (\w+) (?:creatures?|targets?) of (?:your|its|their) choice/i)?.[1] ?? "";
  if ( !word ) return null;
  const n = Number(/^\d+$/.test(word) ? word : (/** @type {Record<string, number>} */ (NUMBER_WORDS))[word.toLowerCase()]);
  return (Number.isFinite(n) && (n > 0)) ? n : null;
}

/** The sentence that grants the choice — the popup's quote (law 8).
 * @param {string} html
 * @returns {string|null} */
export function choiceRuleFrom(html) {
  const text = spellProse(html);
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const found = sentences.find(s => /\b(?:of (?:your|its|their) choice|you choose)\b/i.test(s));
  return found ? found.trim() : null;
}

/** The disposition hostile to a caster's side — null for a caster with none (neutral, secret). */
const hostileTo = d => (d === 1) ? -1 : (d === -1) ? 1 : null;

/** A choosing spell's default (and the clock's): the caster's hostiles, in area order, up to the cap.
 * @param {{candidates: Candidate[], casterUuid?: string|null, casterDisposition?: number|null, cap?: number|null}} args
 * @returns {{uuid: string, name: string}[]} */
export function chosenByDefault({ candidates, casterUuid = null, casterDisposition = null, cap = null }) {
  const hostile = hostileTo(casterDisposition);
  const list = (Array.isArray(candidates) ? candidates : []).filter(c => c.uuid !== casterUuid);
  const picked = (hostile === null) ? [] : list.filter(c => c.disposition === hostile);
  const limit = (Number(cap) > 0) ? Number(cap) : Infinity;
  return picked.slice(0, limit).map(c => ({ uuid: c.uuid, name: c.name }));
}

/** Is there a real choice — a non-hostile in the area, or more hostiles than the cap? Else no ask.
 * @param {{candidates: {uuid: string, disposition?: number|null}[], casterUuid?: string|null, casterDisposition?: number|null, cap?: number|null}} args */
export function choiceNeedsAsk({ candidates, casterUuid = null, casterDisposition = null, cap = null }) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(c => c.uuid !== casterUuid);
  if ( !list.length ) return false;
  const hostile = hostileTo(casterDisposition);
  const hostiles = (hostile === null) ? [] : list.filter(c => c.disposition === hostile);
  if ( hostiles.length !== list.length ) return true;
  return (Number(cap) > 0) && (hostiles.length > Number(cap));
}

/** The line the spell's card carries once the choice stands — source, then result (law 6).
 * @param {{spell?: string|null, chosen?: {name: string}[], left?: {name: string}[]}} record */
export function areaChoiceLine(record) {
  const spell = record?.spell ?? "The spell";
  const chosen = (record?.chosen ?? []).map(c => c.name).filter(Boolean);
  const left = (record?.left ?? []).map(c => c.name).filter(Boolean);
  const head = chosen.length ? `${spell} — chosen: ${chosen.join(", ")}` : `${spell} — nobody chosen`;
  return left.length ? `${head} · not chosen: ${left.join(", ")}` : head;
}

/** The ask's defaults, per kind.
 * @param {Ask} ask
 * @returns {{uuid: string, name: string}[]} */
export function askDefaults(ask) {
  const facts = { contained: ask?.candidates ?? [], casterUuid: ask?.casterUuid ?? null, casterDisposition: ask?.casterDisposition ?? null };
  if ( ask?.kind === "careful" ) return carefulProtects({ ...facts, cap: ask.cap ?? 1 });
  if ( ask?.kind === "choose" ) return chosenByDefault({ candidates: facts.contained, casterUuid: facts.casterUuid, casterDisposition: facts.casterDisposition, cap: ask.cap ?? null });
  const mark = heightenedMark(facts);
  return mark ? [mark] : [];
}

/** A choosing spell cast Heightened: the radio pick if also chosen, else the default over the chosen.
 * @param {Ask} ask
 * @param {string[]} chosenUuids
 * @param {string|null} [picked] */
export function askMark(ask, chosenUuids, picked = null) {
  const chosen = new Set(chosenUuids ?? []);
  const among = (ask?.candidates ?? []).filter(c => chosen.has(c.uuid));
  return heightenedMark({ contained: among, casterUuid: ask?.casterUuid ?? null, casterDisposition: ask?.casterDisposition ?? null,
    chosen: (picked && chosen.has(picked)) ? picked : null });
}

/** Does this kind tick several creatures (checkboxes) or name one (a radio)? */
export function askTicks(ask) {
  return (ask?.kind === "careful") || (ask?.kind === "choose");
}

/** The words an ask wears, per kind, so the machine knows no kind by name.
 * @param {Ask} ask */
export function askWords(ask) {
  const spell = ask?.spell ?? ask?.feature ?? "the spell";
  const n = (ask?.candidates ?? []).length;
  if ( ask?.kind === "careful" ) return {
    question: "who does the spell spare?", icon: "fa-solid fa-wand-sparkles", iconTip: "Metamagic",
    eyebrow: `Metamagic — ${ask.feature}`, title: `Who does the spell spare? Up to ${ask.cap}.`,
    subtitle: `${n} in the area — a tick pings the token`, carrierTitle: "Who does the spell spare?", carrierSubtitle: `${spell} — the card follows the answer`
  };
  if ( ask?.kind === "choose" ) return {
    question: "who does it affect?", icon: "fa-solid fa-bullseye", iconTip: "Creatures of your choice",
    eyebrow: `${spell} — creatures of your choice`, title: ask.cap ? `Who does ${spell} affect? Up to ${ask.cap}.` : `Who does ${spell} affect?`,
    subtitle: ask.heightened ? `${n} in the area · ${ask.heightened.feature}: one of them saves at Disadvantage` : `${n} in the area — a tick pings the token`,
    carrierTitle: `Who does ${spell} affect?`, carrierSubtitle: ask.heightened ? `${ask.heightened.feature} rides it — the card follows the answer` : `${spell} — the card follows the answer`
  };
  return {
    question: "who saves at Disadvantage?", icon: "fa-solid fa-wand-sparkles", iconTip: "Metamagic",
    eyebrow: `Metamagic — ${ask?.feature}`, title: "Who saves at Disadvantage?",
    subtitle: `${n} in the area — a tick pings the token`, carrierTitle: "Who saves at Disadvantage?", carrierSubtitle: `${spell} — the card follows the answer`
  };
}

/** An answer's records (protected list, area choice, mark) and `stays`: who keeps their save.
 * @param {Ask} ask
 * @param {string[]|null} picked  null for the defaults
 * @param {{mark?: string|null, timedOut?: boolean}} [opts] */
export function askOutcome(ask, picked, { mark: markPick = null, timedOut = false } = {}) {
  const chosen = Array.isArray(picked) ? picked : askDefaults(ask).map(c => c.uuid);
  const named = uuid => (ask.candidates ?? []).find(c => c.uuid === uuid) ?? null;
  const entry = c => ({ uuid: c.uuid, name: c.name });
  /** @type {{uuid: string, name: string}[]} */
  let protectedList = [];
  /** @type {{uuid: string, name: string}|null} */
  let mark = null;
  /** @type {object|null} */
  let areaChoice = null;
  if ( ask.kind === "careful" ) {
    protectedList = chosen.map(named).filter(Boolean).slice(0, Math.max(1, Number(ask.cap) || 1)).map(entry);
  } else if ( ask.kind === "choose" ) {
    const limit = (Number(ask.cap) > 0) ? Number(ask.cap) : Infinity;
    const list = chosen.map(named).filter(Boolean).slice(0, limit).map(entry);
    const ids = new Set(list.map(c => c.uuid));
    areaChoice = { spell: ask.spell ?? ask.feature, chosen: list, left: (ask.candidates ?? []).filter(c => !ids.has(c.uuid)).map(entry),
      asked: true, cap: ask.cap ?? null, ...(timedOut ? { timedOut: true } : {}) };
    if ( ask.heightened ) mark = askMark(ask, [...ids], markPick);
  } else {
    const c = named(chosen[0] ?? null);
    mark = c ? entry(c) : null;
  }
  const protectedUuids = new Set(protectedList.map(p => p.uuid));
  const chosenUuids = new Set((areaChoice?.chosen || []).map(c => c.uuid));
  const stays = uuid => (ask.kind === "choose") ? chosenUuids.has(uuid) : !protectedUuids.has(uuid);
  return { chosen, protectedList, mark, areaChoice, stays, timedOut: !!timedOut };
}
