/**
 * By the Books — SERVICE (ARCHITECTURE.md §7): THE SHARED GALLERY — the one creature picker every
 * machine renders through (`openPicker`): a summon's forms and its `cr`-mode pool (Find Familiar, Wild
 * Companion), its questions as pills, and Wild Shape's and the polymorph spells' forms (issues #1, #2).
 * One row everywhere (RULINGS *Summons*): the pick, the token art, the name over size · speeds · attacks
 * and its key abilities, CR · AC · HP on the right. The pool is every visible Actor pack's index, its
 * creatures read once a session for the rows; the filter is decide/gallery.js.
 * The placement lives here too: `pickSpots` is the range ring and the spot the player clicks (Misty
 * Step's way, RULINGS *Summons*), a canvas overlay that needs no permission, so a player places what
 * the elect will create. The table's own art for a summoned creature (`summonArt`, the Summon Art
 * window's table) is read here, so the row, the ghost and the landing show the same picture.
 */
import { S, TITLE, answersHere, setting, resolveUuidAsync } from "./core.js";
import { artTag, bfCard, esc, ruleLine, pickInputHTML } from "./decide/present.js";
import { openMomentPopup, pickInputs, picked, pickedAll } from "./ui.js";
import { galleryRows, crLabel } from "./decide/gallery.js";
import { footprintsOverlap, spotVerdict } from "./decide/summons.js";
import { artFor } from "./decide/summon-art.js";
import { SURFACES } from "./surfaces.js";

const ART = 44;

/** A creature's row summary by uuid, read once per session: a pool opens again without reading its packs again. */
const SUMMARIES = new Map();

/**
 * The pool's rows given the profile row's lines (`summary`): every creature read from its pack, one
 * batched read per pack, so a pool row says what a profile row says (size · speeds · attacks, its senses
 * and traits, CR · AC · HP on the right). A creature that cannot be read keeps a blank summary.
 * @param {Array<{ uuid: string, pack: string }>} rows
 */
async function describePool(rows) {
  const byPack = new Map();
  for ( const r of rows ) {
    if ( SUMMARIES.has(r.uuid) ) continue;
    byPack.set(r.pack, [...(byPack.get(r.pack) ?? []), r.uuid.split(".").pop()]);
  }
  await Promise.all([...byPack].map(async ([packId, ids]) => {
    try {
      const docs = await game.packs.get(packId)?.getDocuments({ _id__in: ids }) ?? [];
      for ( const d of docs ) SUMMARIES.set(d.uuid, summaryOf(d));
    } catch { /* the rows keep a blank summary */ }
  }));
  for ( const r of rows ) r.summary = SUMMARIES.get(r.uuid) ?? summaryOf(null);
  return rows;
}

/**
 * Every visible Actor pack's npc index as pool rows, through the shared filter, each with its summary.
 * @param {{ crMax?: number|null, types?: string[]|null, fly?: boolean|null, sizes?: string[]|null, search?: string }} rule
 */
export async function poolFromPacks(rule = {}) {
  const fields = ["system.details.cr", "system.details.type.value", "system.traits.size", "system.attributes.movement.fly", "img", "type"];
  const rows = [];
  for ( const pack of game.packs.filter(p => (p.documentName === "Actor") && p.visible) ) {
    let index;
    try { index = await pack.getIndex({ fields }); } catch { continue; }
    for ( const e of index ) {
      if ( e.type !== "npc" ) continue;
      rows.push({ name: e.name, cr: Number(e.system?.details?.cr ?? Number.NaN), type: e.system?.details?.type?.value ?? "",
        size: e.system?.traits?.size ?? "", fly: Number(e.system?.attributes?.movement?.fly) > 0, pack: pack.collection, uuid: e.uuid, img: e.img ?? null });
    }
  }
  return describePool(galleryRows(rows, rule));
}

/**
 * The pool a `cr`-mode profile picks from: the cap evaluated, the profile's types.
 * @param {{ cr?: string|number|null, types?: string[]|null }} profile
 */
export function poolRuleOf(profile) {
  const cap = ((profile.cr === null) || (profile.cr === undefined) || (profile.cr === "")) ? null : Number(Roll.safeEval?.(profile.cr) ?? profile.cr);
  return { crMax: Number.isFinite(cap) ? cap : null, types: profile.types?.length ? [...profile.types] : null };
}

/**
 * The table's own art for a creature a spell summons (the Summon Art window), each path null when unset.
 * @param {string|null|undefined} spell
 * @param {string|null|undefined} creature
 * @returns {{ token: string|null, portrait: string|null }}
 */
export function summonArt(spell, creature) {
  try { return artFor(setting(S.summonArt), spell, creature); } catch { return { token: null, portrait: null }; }
}

/** The table's own art for a Wild Shape form, by beast name (the Wild Shape Art window), each null when unset. */
export function formArt(creature) {
  try { return artFor(setting(S.formArt), FORM_ART_KEY, creature); } catch { return { token: null, portrait: null }; }
}

/** The one key the Wild Shape Art table keeps its forms under (every form is a beast by name). */
export const FORM_ART_KEY = "wild shape";

/**
 * A summon's formula at its cast: `@flags.dnd5e.summon.level` and `.mod` (dnd5e's own stamp on the creature,
 * `SummonActivity#getChanges`) filled with the cast's, a bracketed sum worked out, the rest simplified, so
 * "(@flags.dnd5e.summon.level - 1)d8 + @flags.dnd5e.summon.mod" reads "1d8 + 4". Unchanged without a cast.
 * @param {string} formula
 * @param {{ level: number, mod: number }|null} summon
 */
function atCast(formula, summon) {
  if ( !summon || !/@flags\.dnd5e\.summon\.(level|mod)\b/.test(String(formula)) ) return formula;
  try {
    // only the cast's two numbers: the creature's own @mod is already its number (summaryOf); @prof stays as the sheet reads it
    const filled = String(formula).replace(/@flags\.dnd5e\.summon\.(level|mod)\b/g, (_m, k) => String(Number(summon[k]) || 0));
    const summed = filled.replace(/\(([\d\s+\-*/]+)\)/g, (_m, sum) => String(Roll.safeEval(sum)));
    if ( summed.includes("@") ) return summed;
    return globalThis.dnd5e?.dice?.simplifyRollFormula?.(summed, { preserveFlavor: true }) ?? summed;
  } catch { return formula; }
}

/** An attack's line: its name, then each damage part's dice and types, at the cast when one is given. */
const attackLine = ({ name, parts }, summon = null) =>
  `${name}${parts.length ? ` · ${parts.map(p => `${atCast(p.formula, summon)} ${p.types}`.trim()).join(", ")}` : ""}`;

/** A creature's lines for a row: AC, HP, CR, size, speeds, its attacks with their dice, its senses and traits; blank when unknown. */
function summaryOf(actor) {
  if ( !actor?.system ) return { ac: null, hp: null, cr: null, size: "", speed: "", attacks: [], attackParts: [], traits: [] };
  const sys = actor.system;
  const move = sys.attributes?.movement ?? {};
  const units = move.units ?? "ft";
  const speed = ["walk", "fly", "swim", "climb", "burrow"].filter(k => Number(move[k]) > 0)
    .map(k => (k === "walk") ? `${move[k]} ${units}` : `${k} ${move[k]}`).join(", ");
  const attackParts = [];
  // the key abilities: a special sense first (Blindsight 60 ft), then the traits that are not actions
  const senses = sys.attributes?.senses ?? {};
  const ranges = senses.ranges ?? senses;
  const sensesUnits = senses.units ?? "ft";
  const traits = ["blindsight", "darkvision", "tremorsense", "truesight"].filter(k => Number(ranges[k]) > 0)
    .map(k => `${CONFIG.DND5E?.senses?.[k]?.label ?? CONFIG.DND5E?.senses?.[k] ?? k} ${ranges[k]} ${sensesUnits}`);
  for ( const item of actor.items ?? [] ) {
    const acts = [...(item.system?.activities ?? [])];
    const attack = acts.find(a => a.type === "attack");
    if ( attack ) {
      // ⚠ prepared types are a Set
      // a flat part (no die: a Tiny beast's 1 piercing) reads as its bonus alone, never "1d0 + 1"
      // the creature's own modifier read as its number ("1d4 + @mod" is "1d4 + 2"): the attack's ability, on its own sheet
      const mod = Number(sys.abilities?.[attack.ability]?.mod);
      const own = b => Number.isFinite(mod) ? String(b).replace(/@mod\b/g, String(mod)) : String(b);
      const plus = b => { const t = own(b).trim(); return t.startsWith("-") ? ` - ${t.slice(1).trim()}` : ` + ${t}`; };
      const dice = p => (Number(p.denomination) > 0) ? `${Number(p.number) || 1}d${p.denomination}${p.bonus ? plus(p.bonus) : ""}` : own(p.bonus || "0");
      const parts = (attack.damage?.parts ?? []).map(p => ({ formula: p.custom?.enabled ? p.custom.formula : dice(p),
        types: p.custom?.enabled ? "" : [...(p.types ?? [])].join("/") }));
      attackParts.push({ name: item.name, parts });
    } else if ( (item.type === "feat") && !acts.length ) traits.push(item.name);
  }
  const size = CONFIG.DND5E?.actorSizes?.[sys.traits?.size]?.label ?? sys.traits?.size ?? "";
  return { ac: sys.attributes?.ac?.value ?? null, hp: sys.attributes?.hp?.max ?? null, cr: sys.details?.cr ?? null, size, speed,
    attacks: attackParts.slice(0, 3).map(a => attackLine(a)), attackParts: attackParts.slice(0, 3), traits: traits.slice(0, 3) };
}

/**
 * A creature as a row: its art and summary read once (a compendium read, no permission), the name the
 * caller gives or the creature's own. Blank when it cannot be read; the row keeps its name.
 * @param {string|null} uuid
 * @param {{ label?: string, img?: string|null, summon?: { level: number, mod: number }|null }} [fallback]
 *   `summon` the cast's level and modifier: the attack lines read at the cast
 * @returns {Promise<{ label: string, img: string|null, summary: object }>}
 */
export async function describeCreature(uuid, fallback = {}) {
  const out = { label: fallback.label ?? "", img: fallback.img ?? null, summary: summaryOf(null) };
  if ( !uuid ) return out;
  try {
    const actor = await resolveUuidAsync(uuid);
    if ( actor ) {
      out.label ||= actor.name;
      out.img = actor.prototypeToken?.texture?.src ?? actor.img ?? out.img;
      const summary = SUMMARIES.get(uuid) ?? summaryOf(actor);
      SUMMARIES.set(uuid, summary);
      out.summary = fallback.summon ? { ...summary, attacks: (summary.attackParts ?? []).map(a => attackLine(a, fallback.summon)) } : summary;
    }
  } catch { /* the row keeps its name */ }
  return out;
}

/* --- THE PICKER: one presentation every creature pick renders through ---------------------------- *
 * A machine DESCRIBES what it asks (sections of rows, a searchable pool, pills, notes, the rule) and
 * this draws it, checks it on the click and reads the answer back (RULINGS *Summons*, one row
 * everywhere). The row, the pool, the pills and the search are this file's own: no machine draws a
 * creature row or a pick by hand (tools/check-pickers.mjs).
 * ------------------------------------------------------------------------------------------------ */

const PICKED = "rgba(222,120,40,0.15)";
const small = (text, opacity) => `<span style="opacity:${opacity};font-size:var(--font-size-11,11px);">${esc(text)}</span>`;

/** The right column, the same for every row: CR when known, AC, HP, then the caller's tags ("last used"). */
function rightOf(summary, tags = []) {
  return [
    (summary?.cr !== null && summary?.cr !== undefined) ? `CR ${esc(crLabel(summary.cr))}` : null,
    (summary?.ac !== null && summary?.ac !== undefined) ? `AC ${esc(summary.ac)}` : null,
    summary?.hp ? `${esc(summary.hp)} HP` : null,
    ...tags.map(esc)
  ].filter(Boolean).join("<br>");
}

/**
 * One row (ruled C, one row everywhere): the pick, the art, the name over size · speeds · attacks and
 * its key abilities, the right column. No `field` draws the row with no pick (a list shown, not asked).
 */
function rowHTML(row, { field, multi = false }) {
  const s = row.summary ?? {};
  const line = [s.size, s.speed, ...(s.attacks ?? [])].filter(Boolean).join(" · ");
  const art = row.img ? artTag(row.img, `width:${ART}px;height:${ART}px;object-fit:cover;border-radius:3px;border:1px solid var(--color-border-dark,#0006);`)
    : `<span style="display:inline-block;width:${ART}px;height:${ART}px;border-radius:3px;background:rgba(0,0,0,0.15);"></span>`;
  const pick = field ? pickInputHTML({ kind: multi ? "checkbox" : "radio", name: field, value: row.value, checked: !!row.checked, disabled: !!row.locked, style: "margin:0;" }) : "<span></span>";
  return `<label data-bf-form style="display:grid;grid-template-columns:auto ${ART}px minmax(0,1fr) auto;gap:0.5rem;align-items:center;padding:0.3rem 0.45rem;border:1px solid var(--color-border-dark,#0006);border-radius:3px;margin-bottom:0.25rem;${field && !row.locked ? "cursor:pointer;" : ""}${row.checked ? `background:${PICKED};` : ""}${row.locked ? "opacity:0.45;" : ""}">
    ${pick}
    ${art}
    <span style="min-width:0;line-height:1.25;"><b>${esc(row.label)}</b>${line ? `<br>${small(line, 0.8)}` : ""}${(s.traits ?? []).length ? `<br>${small(s.traits.join(" · "), 0.65)}` : ""}</span>
    <span style="text-align:right;font-size:var(--font-size-11,11px);white-space:nowrap;">${rightOf(s, row.tags ?? [])}</span>
  </label>`;
}

/**
 * A creature row shown, not asked (no pick): the Summon Art window's list wears the picker's own row.
 * @param {{ label: string, img?: string|null, summary?: object, tags?: string[] }} row
 */
export const listRowHTML = row => rowHTML({ value: "", ...row }, {});

const headHTML = head => head ? `<div style="margin-top:0.5rem;"><b>${esc(head)}</b></div>` : "";

/** A pool row (`poolFromPacks`) as a picker row. */
const poolRow = r => ({ value: r.uuid, label: r.name, img: r.img ?? null, summary: r.summary ?? summaryOf(null), checked: !!r.checked, locked: !!r.locked, tags: r.tags ?? [] });

/**
 * One section's HTML. The kinds:
 *   { head?, rows, field?, multi?, max?, onlyWhen? }   rows: { value, label, img, summary, checked?, locked?, tags? };
 *                                             `onlyWhen: { field, value }` the rows stand only while that pill field
 *                                             holds that value: else unpicked, greyed and unpickable (a light's
 *                                             object while the light goes on a token)
 *   { head?, pool, field, multi?, max?, locked? }  a searchable pool (poolFromPacks rows); `locked` a line: folded, unpickable
 *   `max` (multi only) caps the ticks: a number, or `picks => number` read again on every change; a tick
 *   past it unticks the field's earlier ones, so the newest pick always stands
 *   { head, pills, field, columns? }          pills: { value, label, checked?, locked? }; nothing pre-picked unless a pill says
 *                                             so; a `locked` pill is greyed and cannot be picked; `columns` lays them out
 *                                             as an even grid of that many, each the same width
 *   { head?, text: { field, value?, placeholder?, max?, follows? } }   a line of text the player may type (a familiar's
 *                                             name), `value` pre-filled; `follows` a pick field whose picked row's
 *                                             name becomes the placeholder as the pick changes (blank says "its own")
 *   { note }                                  a quiet line
 *   { rule }                                  the book's rule line
 *   { tabs: [{ label, sections }] }           a strip of tabs, one panel of sections each, the first shown; a field
 *                                             may run across the panels (one pick from any tab)
 */
function sectionHTML(sec) {
  if ( sec.tabs ) return tabsHTML(sec.tabs);
  if ( sec.note ) return `<div style="opacity:0.75;font-size:var(--font-size-11,11px);margin:0.2rem 0;">${esc(sec.note)}</div>`;
  if ( sec.text ) {
    const t = sec.text;
    return `${headHTML(sec.head)}<input type="text" name="${esc(t.field)}" value="${esc(t.value ?? "")}" placeholder="${esc(t.placeholder ?? "")}"${t.max ? ` maxlength="${Number(t.max) || 0}"` : ""}${t.follows ? ` data-bf-follows="${esc(t.follows)}"` : ""} autocomplete="off" style="width:100%;margin:0.3rem 0;">`;
  }
  if ( sec.rule ) return ruleLine(sec.rule);
  if ( sec.pills ) return `${headHTML(sec.head)}<div style="${sec.columns ? `display:grid;grid-template-columns:repeat(${Number(sec.columns) || 1},1fr);` : "display:flex;flex-wrap:wrap;"}gap:0.3rem;margin:0.3rem 0;">${sec.pills.map(o =>
    `<label style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.15rem 0.5rem;${sec.columns ? "justify-content:flex-start;" : ""}border:1px solid var(--color-border-dark,#0006);border-radius:12px;${o.locked ? "opacity:0.45;cursor:not-allowed;" : "cursor:pointer;"}">${pickInputHTML({ kind: "radio", name: sec.field, value: o.value, checked: !!(o.checked && !o.locked), disabled: !!o.locked, style: "margin:0;" })}${esc(o.label)}</label>`).join("")}</div>`;
  if ( sec.pool ) {
    const rows = sec.pool.map(r => rowHTML(poolRow({ ...r, locked: r.locked || !!sec.locked }), { field: sec.field, multi: sec.multi }));
    const list = `<input type="search" name="bf-gallery-search" placeholder="Search by name" style="width:100%;margin:0.3rem 0;">
      <div data-bf-pool style="max-height:320px;overflow:auto;">${rows.join("")}</div>`;
    if ( sec.locked ) return `<details style="margin-top:0.4rem;"><summary style="cursor:pointer;opacity:0.8;">${esc(sec.locked)} · <span style="color:rgb(222,120,40);">show them</span></summary>${headHTML(sec.head)}${list}</details>`;
    return `${headHTML(sec.head)}${list}`;
  }
  if ( sec.rows ) {
    const rows = `${headHTML(sec.head)}${sec.rows.length ? sec.rows.map(r => rowHTML(r, { field: sec.field, multi: sec.multi })).join("") : "<em>none yet</em>"}`;
    return sec.onlyWhen ? `<div data-bf-only-field="${esc(sec.onlyWhen.field)}" data-bf-only-value="${esc(sec.onlyWhen.value)}">${rows}</div>` : rows;
  }
  return "";
}

/** A tab strip and its panels (the `tabs` kind): the first tab shown, the others drawn hidden. */
function tabsHTML(tabs) {
  const strip = tabs.map((t, i) => `<button type="button" data-bf-tab="${i}" style="flex:0 0 auto;width:auto;margin:0;padding:0.2rem 0.7rem;border-radius:3px 3px 0 0;line-height:1.4;${tabStyle(i === 0)}">${esc(t.label)}</button>`).join("");
  const panels = tabs.map((t, i) => `<div data-bf-panel="${i}" style="${i ? "display:none;" : ""}">${(t.sections ?? []).map(sectionHTML).join("")}</div>`).join("");
  return `<div data-bf-tabs><div style="display:flex;gap:0.25rem;margin:0.4rem 0 0.3rem;border-bottom:1px solid var(--color-border-dark,#0006);">${strip}</div>${panels}</div>`;
}

/** A tab's look: the open one tinted as a pick is, the others quiet. */
const tabStyle = open => open ? `background:${PICKED};font-weight:bold;opacity:1;` : "background:transparent;font-weight:normal;opacity:0.7;";

/** The sections a description holds, a `tabs` section's panels opened out. */
const flatSections = sections => sections.flatMap(s => s.tabs ? s.tabs.flatMap(t => flatSections(t.sections ?? [])) : [s]);

/**
 * The answer read off the form: `one(field)` the picked value or null, `all(field)` every ticked value,
 * `text(field)` a text line as typed, or null when the form has no such line.
 * @param {HTMLFormElement|null} form
 */
function readPicks(form) {
  const all = field => pickedAll(form, field);
  const text = field => {
    const el = form?.elements?.namedItem?.(field) ?? null;
    return (typeof el?.value === "string") ? el.value : null;
  };
  return { one: field => all(field)[0] ?? null, all, text, form };
}

/** The name on a picked row: what a text line that follows the pick shows as its placeholder. */
function pickedRowName(root, field) {
  const input = pickInputs(root, field).find(i => i.checked) ?? null;
  return input?.closest?.("[data-bf-form]")?.querySelector?.("b")?.textContent?.trim() || null;
}

/** The live parts once the dialog stands: the search, the caps on the ticks, the picked row's tint. */
function wirePicker(root, sections) {
  if ( !root?.querySelectorAll ) return;
  const capped = flatSections(sections).filter(s => s.multi && s.field && (s.max !== undefined));
  // a tab shows its panel and hides its siblings'; the picks stand whichever panel shows
  for ( const box of root.querySelectorAll("[data-bf-tabs]") ) {
    for ( const tab of box.querySelectorAll("[data-bf-tab]") ) tab.addEventListener("click", event => {
      event.preventDefault();
      for ( const other of box.querySelectorAll("[data-bf-tab]") ) other.setAttribute("style", other.getAttribute("style").replace(/background:[^;]*;font-weight:[^;]*;opacity:[^;]*;/, tabStyle(other === tab)));
      for ( const panel of box.querySelectorAll("[data-bf-panel]") ) panel.style.display = (panel.dataset.bfPanel === tab.dataset.bfTab) ? "" : "none";
    });
  }
  const cap = event => {
    const picks = readPicks(root.querySelector("form") ?? root);
    for ( const s of capped ) {
      const n = Math.max(0, Number((typeof s.max === "function") ? s.max(picks) : s.max) || 0);
      const ticked = pickInputs(root, s.field).filter(i => i.checked);
      for ( const input of ticked.filter(i => i !== event?.target).slice(0, Math.max(0, ticked.length - n)) ) input.checked = false;
      if ( ticked.length > n && ticked.includes(event?.target) && n === 0 ) event.target.checked = false;
    }
  };
  for ( const search of pickInputs(root, "bf-gallery-search") ) {
    const list = search.nextElementSibling;
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      for ( const row of list?.querySelectorAll?.("[data-bf-form]") ?? [] ) {
        // a shown row keeps its grid: "" would drop the inline display and stack the row's cells
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? "grid" : "none";
      }
    });
  }
  const tint = () => {
    for ( const row of root.querySelectorAll("[data-bf-form]") ) {
      const input = row.querySelector("input");
      if ( input && !input.disabled ) row.style.background = input.checked ? PICKED : "";
    }
  };
  // `onlyWhen` rows: standing while their pill holds the value, else unpicked and greyed; picked again (the
  // first, when none is) as they come back
  const gate = () => {
    for ( const box of root.querySelectorAll("[data-bf-only-field]") ) {
      const on = picked(root, box.dataset.bfOnlyField) === box.dataset.bfOnlyValue;
      const inputs = [...box.querySelectorAll("[data-bf-form] input")];
      for ( const input of inputs ) {
        input.disabled = !on;
        if ( !on ) input.checked = false;
        const row = input.closest("[data-bf-form]");
        if ( row ) { row.style.opacity = on ? "" : "0.45"; row.style.cursor = on ? "pointer" : "not-allowed"; if ( !on ) row.style.background = ""; }
      }
      if ( on && inputs.length && !inputs.some(i => i.checked) ) inputs[0].checked = true;
    }
  };
  // a text line following a pick: the picked row's name as its placeholder, the line's own words while none is picked
  const follow = () => {
    for ( const line of root.querySelectorAll("[data-bf-follows]") ) {
      line.dataset.bfPlaceholder ??= line.getAttribute("placeholder") ?? "";
      line.setAttribute("placeholder", pickedRowName(root, line.dataset.bfFollows) ?? line.dataset.bfPlaceholder);
    }
  };
  gate();
  tint();
  follow();
  root.addEventListener("change", event => { cap(event); gate(); tint(); follow(); });
}

/**
 * THE PICKER. Opens the one popup off a card (`openMomentPopup`, the one answer gate) from a
 * description, and hands each button's `submit` the answer read back. A button with `checks` refuses
 * the click while a `needs` field is unpicked: the popup stays open with the picks made.
 * @param {ChatMessage|{ id: string }} message   the card, or `{ id }` for a popup before any card exists (a
 *   summon's menu, which comes before its cast)
 * @param {string} key            the popup's key on the card (one live popup a key)
 * @param {Actor|null} subject    whose answer it is (null with `gate: false`)
 * @param {object} spec
 * @param {string} spec.title
 * @param {string} [spec.icon]
 * @param {number} [spec.width]
 * @param {boolean} [spec.gate]
 * @param {string|null} [spec.by]         who started it (a User id): their screen answers (core.js answersHere)
 * @param {{ eyebrow: string, tone?: string, title: string, subtitle?: string }} spec.card
 * @param {Array<object>} spec.sections   see `sectionHTML`
 * @param {Array<{ field: string, why: string }>} [spec.needs]   in the order the popup reads
 * @param {(picks: { one: (field: string) => string|null, all: (field: string) => string[], text: (field: string) => string|null, form: HTMLFormElement|null }) => string|null} [spec.validate]
 *   a last word on a `checks` click, after the needs: why the answer cannot stand yet (the popup stays open), or null
 * @param {boolean} [spec.stack]          the buttons stacked one under another, full width (a menu read, not a yes or no)
 * @param {Array<{ action: string, label: string, default?: boolean, disabled?: boolean, tooltip?: string|null, checks?: boolean, submit?: (picks: { one: (field: string) => string|null, all: (field: string) => string[], text: (field: string) => string|null, form: HTMLFormElement|null }) => void }>} spec.buttons
 *   `disabled` greys the button; `tooltip` the hint under the pointer (a greyed button hears no pointer, so none)
 */
export async function openPicker(message, key, subject, { title, icon = "fa-solid fa-paw", width = 500, gate = true, by = null, card, sections, needs = [], validate = null, stack = false, buttons }) {
  if ( by && !answersHere(by, subject) ) return null;
  const missing = form => {
    const picks = readPicks(form);
    return needs.find(n => !picks.one(n.field))?.why ?? validate?.(picks) ?? null;
  };
  const dialog = await openMomentPopup(message, key, subject, {
    title, icon, width, gate: by ? false : gate,
    content: bfCard({ eyebrow: card.eyebrow, tone: card.tone ?? "pending", title: card.title, subtitle: card.subtitle ?? "", lines: sections.map(sectionHTML) }),
    buttons: buttons.map(b => ({ action: b.action, label: b.label, default: !!b.default, disabled: !!b.disabled, tooltip: b.tooltip || undefined,
      callback: (_event, button) => {
        // the click guard below keeps the popup open; this is the belt for a submit that got past it
        const why = b.checks ? missing(button.form) : null;
        if ( why ) { ui.notifications?.warn(`${TITLE}: ${why}.`); return; }
        b.submit?.(readPicks(button.form));
      } }))
  });
  const root = dialog?.element ?? null;
  wirePicker(root, sections);
  if ( stack ) {
    // the footer's row becomes a column, each button its own line (the platform flexes them in a row)
    const footer = root?.querySelector(SURFACES.dialogFooter);
    if ( footer ) {
      footer.style.flexDirection = "column";
      footer.style.alignItems = "stretch";
      for ( const button of footer.querySelectorAll("button") ) button.style.flex = "0 0 auto";
    }
  }
  for ( const b of buttons.filter(x => x.checks) ) {
    root?.querySelector(`button[data-action="${b.action}"]`)?.addEventListener("click", event => {
      const why = missing(event.currentTarget?.form ?? null);
      if ( !why ) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      ui.notifications?.warn(`${TITLE}: ${why}.`);
    }, { capture: true });
  }
  return dialog;
}

/** A token document's centre at a top-left, by its own footprint. */
const centreOf = (doc, topLeft, w, h) => (typeof doc?.getCenterPoint === "function") ? doc.getCenterPoint(topLeft) : { x: topLeft.x + (w / 2), y: topLeft.y + (h / 2) };

/** The token art as a sprite for the ghost, or null (a missing file: the ghost is the square alone). */
async function ghostSprite(src, w, h) {
  try {
    const load = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
    const texture = src ? await load?.(src) : null;
    if ( !texture ) return null;
    const sprite = new PIXI.Sprite(texture);
    sprite.width = w; sprite.height = h; sprite.alpha = 0.6;
    return sprite;
  } catch { return null; }
}

/**
 * The placement on this client, Misty Step's way (RULINGS *Summons*): a ring of the spell's range
 * around the caster, the creature's footprint following the pointer, green where it may appear and red
 * where it may not; a left click on a good space places one, `count` clicks place them all; a right
 * click or Escape cancels. Judged by `spotVerdict`: within range, no sight-blocking wall between the
 * caster's centre and the space's (the best a canvas can say for "a space you can see"), unoccupied by
 * a token the player can see. No caster on this scene: no ring and no sight check. Nothing is created
 * here; the elect makes the creature at the squares. Empty when cancelled.
 * @param {{ originToken: TokenDocument|null, actorUuid: string, count: number, rangeFt: number|null, label: string, seen?: boolean, img?: string|null }} facts
 *   `seen` false drops the sight check (a familiar called back needs only an unoccupied space in reach);
 *   `img` the ghost's art when the table sets its own (`summonArt`), else the creature's token art; `squares`
 *   the footprint in grid squares when the landing sets its own (a house size), else the creature's
 * @returns {Promise<Array<{ x: number, y: number, elevation: number, rotation: number, level: string|null }>>}
 */
export async function pickSpots({ originToken, actorUuid, count, rangeFt, label, seen = true, img = null, squares = null }) {
  if ( !canvas?.ready ) throw new Error("the canvas is not ready");
  const actor = await resolveUuidAsync(actorUuid);
  const proto = actor?.prototypeToken;
  if ( !proto ) throw new Error(`no creature at ${actorUuid}`);
  const grid = canvas.grid;
  const cells = (Number(squares) > 0) ? { w: Number(squares), h: Number(squares) }
    : { w: Math.max(Number(proto.width) || 1, 0.5), h: Math.max(Number(proto.height) || 1, 0.5) };
  const w = cells.w * grid.sizeX;
  const h = cells.h * grid.sizeY;
  const want = Math.max(1, Number(count) || 1);
  const caster = (originToken?.parent?.id === canvas.scene?.id) ? originToken : null;
  const from = caster ? centreOf(caster, { x: caster.x, y: caster.y }, caster.width * grid.sizeX, caster.height * grid.sizeY) : null;
  const elevation = Number(caster?.elevation) || 0;
  const level = caster?.level ?? null;

  const ring = new PIXI.Graphics();
  if ( from && (rangeFt !== null) ) {
    const radius = (rangeFt / canvas.dimensions.distance) * grid.size + (Math.max(caster.width, caster.height) * grid.size / 2);
    const tint = Number(game.user.color ?? 0xde7828);
    ring.lineStyle(4, tint, 0.85).beginFill(tint, 0.06).drawCircle(from.x, from.y, radius).endFill();
  }
  const marks = new PIXI.Container();
  const ghost = new PIXI.Container();
  const frame = new PIXI.Graphics();
  ghost.addChild(frame);
  const sprite = await ghostSprite(img ?? proto.texture?.src ?? actor.img ?? null, w, h);
  if ( sprite ) ghost.addChild(sprite);
  ghost.visible = false;
  const layer = canvas.controls;
  layer.addChild(ring, marks, ghost);

  const placed = /** @type {Array<{ x: number, y: number, elevation: number, rotation: number, level: string|null }>} */ ([]);
  const snapCentre = p => {
    if ( grid.isGridless ) return { x: p.x, y: p.y };
    const M = CONST.GRID_SNAPPING_MODES;
    const odd = (cells.w < 1) || (Math.round(cells.w) % 2 === 1);
    return grid.getSnappedPoint({ x: p.x, y: p.y }, { mode: odd ? M.CENTER : M.VERTEX });
  };
  const judge = topLeft => {
    const to = { x: topLeft.x + (w / 2), y: topLeft.y + (h / 2) };
    const distanceFt = from ? grid.measurePath([from, to]).distance : null;
    let blocked = false;
    try { blocked = !!(seen && from && CONFIG.Canvas.polygonBackends.sight.testCollision(from, to, { type: "sight", mode: "any" })); } catch { blocked = false; }
    const mine = { x: topLeft.x, y: topLeft.y, w, h };
    const occupied = canvas.scene.tokens.some(t => (t.id !== caster?.id) && (game.user.isGM || !t.hidden)
        && footprintsOverlap(mine, { x: t.x, y: t.y, w: t.width * grid.sizeX, h: t.height * grid.sizeY }))
      || placed.some(p => footprintsOverlap(mine, { x: p.x, y: p.y, w, h }));
    return spotVerdict({ distanceFt, rangeFt: from ? rangeFt : null, blocked, occupied });
  };
  const paint = (g, ok) => g.clear().lineStyle(3, ok ? 0x3fbf5f : 0xd04040, 0.95).beginFill(ok ? 0x3fbf5f : 0xd04040, 0.2).drawRect(0, 0, w, h).endFill();

  ui.notifications?.info(`${TITLE}: click where ${label} appears${want > 1 ? ` (${want} spaces)` : ""}${(from && rangeFt !== null) ? `, within ${rangeFt} ft` : ""}. Right-click or Esc cancels.`);
  const stage = canvas.stage;
  return await new Promise(resolve => {
    const end = result => {
      stage.off("pointermove", onMove); stage.off("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      layer.removeChild(ring, marks, ghost);
      for ( const d of [ring, marks, ghost] ) d.destroy({ children: true });
      void resolve(result);   // the executor's resolve, not a promise: the lint reads the call as one
    };
    const topLeftAt = event => {
      const c = snapCentre(event.getLocalPosition(stage));
      return { x: c.x - (w / 2), y: c.y - (h / 2) };
    };
    const onMove = event => {
      const tl = topLeftAt(event);
      ghost.position.set(tl.x, tl.y);
      ghost.visible = true;
      paint(frame, judge(tl).ok);
    };
    const onDown = event => {
      if ( canvas.stage !== stage ) { end([]); return; }
      if ( event.button === 2 ) { end([]); return; }
      if ( event.button !== 0 ) return;
      const tl = topLeftAt(event);
      const verdict = judge(tl);
      if ( !verdict.ok ) { ui.notifications?.warn(`${TITLE}: ${verdict.why}. Pick another space.`); return; }
      placed.push({ x: tl.x, y: tl.y, elevation, rotation: 0, level });
      const mark = new PIXI.Graphics();
      paint(mark, true);
      mark.position.set(tl.x, tl.y);
      marks.addChild(mark);
      if ( placed.length >= want ) end(placed);
    };
    const onKey = event => {
      if ( event.key !== "Escape" ) return;
      event.preventDefault(); event.stopPropagation();
      end([]);
    };
    stage.on("pointermove", onMove);
    stage.on("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
  });
}
