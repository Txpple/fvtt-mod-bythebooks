// STATIC CONTENT CHECK — every row of the code tables names content the packs carry. No Foundry.
//
// A row finds its item by dnd5e's identifier (decide/registry.js `identifierOf`), so the row's name
// must slug to an identifier in the snapshot `tools/content/identifiers.json` (from
// probe-identifiers.mjs + compact-identifiers.mjs), or name an effect the packs carry. A row that
// names its content in a field (`item`, `feature`, `named`, `effect`, `spell`) is checked on that field.
// Every `rule` is a pointer to the book whose pack item the snapshot carries.
//
//   node tools/check-identifiers.mjs
import { readFileSync } from "node:fs";
import * as R from "../scripts/decide/registry.js";

const snap = JSON.parse(readFileSync(new URL("./content/identifiers.json", import.meta.url), "utf8"));
const identifiers = new Set(Object.values(snap.identifiers).flat());
const effects = new Set(snap.effects.map(e => e.toLowerCase()));

/** Rows that name no pack content, and why. A new entry is a deliberate edit. */
const NOT_CONTENT = new Map([
  ["Heroic Inspiration", "a boolean on the sheet, no document"],
  ["Absorb Elements", "Xanathar's; not in the installed packs, inert until a book carries it"],
  ["Attack and Save Disadvantage", "Ravenloft's Howl; not in the installed packs"],
  ["Cursed (Path to the Grave)", "Ravenloft's Path to the Grave; not in the installed packs"],
  ["Power of the Wilds: Lion", "the module-MADE member effect of the Lion's ring (EMANATIONS `made`): the pack ships no effect for it"],
  ["Pack Damage", "embedded on the PHB's Conjured Animals actor (Conjure Animals' pack); the snapshot reads Item packs only"],
  ["Grant Save Advantage", "embedded on the PHB's Conjured Animals actor (Conjure Animals' pack); the snapshot reads Item packs only"],
  ["Unerring Strike", "a BENEFIT of Living Legend (SAVE_SUCCEEDS `feature`): the D20_FOLDS entry names the row, the row names the item"],
  ["Helped", "the Help action's effect on the enemy, module-MADE (help.js): the packs ship Help as a glossary page and no item"],
  ["Assisted", "the Help action's effect on the ally, module-MADE (help.js): the packs ship Help as a glossary page and no item"]
]);

/** The fields a row names its content in. */
const FIELDS = ["item", "feature", "named", "effect", "spell"];

const resolves = name => identifiers.has(R.identifierOf(name)) || effects.has(String(name).toLowerCase());

const failures = [];
let checked = 0;
const check = (table, key, row) => {
  if ( NOT_CONTENT.has(key) ) return;
  checked++;
  const fields = (row && typeof row === "object" && !Array.isArray(row))
    ? FIELDS.map(f => row[f]).filter(v => typeof v === "string" && v) : [];
  if ( resolves(key) ) return;
  if ( fields.length && fields.every(resolves) ) return;
  const said = fields.length ? ` (nor its ${fields.map(v => `"${v}"`).join(", ")})` : "";
  failures.push(`${table}["${key}"] — "${R.identifierOf(key)}" is no identifier or effect in the snapshot${said}`);
};

for ( const [table, value] of Object.entries(R) ) {
  if ( !value || (typeof value !== "object") || Array.isArray(value) || (value instanceof Set) ) continue;
  const keys = Object.keys(value);
  if ( !keys.some(k => /^[A-Z][a-z]/.test(k)) ) continue;     // a content table is keyed by names
  if ( ["ALIASES", "KIND_LISTS"].includes(table) ) continue;
  for ( const key of keys ) check(table, key, value[key]);
}
for ( const [list, { rows }] of Object.entries(R.KIND_LISTS) ) for ( const r of rows ) check(list, r.name, null);
for ( const b of R.BLOCKS ) { check("BLOCKS", b.spell, null); check("BLOCKS", b.reaction, null); }
for ( const [name, identifier] of Object.entries(R.ALIASES) ) {
  if ( !identifiers.has(identifier) ) failures.push(`ALIASES["${name}"] — "${identifier}" is not in the snapshot`);
}

// Every rule pointer names a pack item the snapshot carries, or a rules page by its CONFIG key
// (RULINGS *The rule fold reads the book*).
const { RESCUE_KINDS } = await import("../scripts/decide/present.js");
const PAGES = new Set(["condition", "mastery", "rule"]);
let pointers = 0;
const checkPointer = (where, ptr) => {
  if ( ptr === null ) return;
  if ( !ptr || (typeof ptr !== "object") ) { failures.push(`${where} — a rule that is not a pointer: ${JSON.stringify(ptr).slice(0, 60)}`); return; }
  pointers++;
  if ( ptr.page ) {
    if ( !PAGES.has(ptr.page) || !ptr.key ) failures.push(`${where} — a rules page pointer needs a page (${[...PAGES].join("/")}) and a key`);
    return;
  }
  const m = /^Compendium\.(.+)\.Item\.([^.]+)$/.exec(ptr.uuid ?? "");
  if ( !ptr.item ) failures.push(`${where} — a pointer with no item name`);
  else if ( !m || !(snap.items[m[1]] ?? []).includes(m[2]) ) failures.push(`${where} — ${ptr.uuid} is not in the snapshot`);
};
const walkRules = (value, path) => {
  if ( !value || (typeof value !== "object") || (value instanceof Set) ) return;
  for ( const [k, v] of Object.entries(value) ) {
    if ( (k === "rule") && (typeof v !== "string") ) checkPointer(`${path}.rule`, v);
    else if ( v && (typeof v === "object") && !v.item && !v.page ) walkRules(v, `${path}.${k}`);
  }
};
for ( const [name, value] of Object.entries(R) ) {
  if ( (name === "RULE_TEXT") || (name === "MASTERY_RULES") ) {
    for ( const [k, v] of Object.entries(value) ) checkPointer(`${name}.${k}`, v);
  } else walkRules(value, name);
}
walkRules(RESCUE_KINDS, "RESCUE_KINDS");

if ( failures.length ) {
  for ( const f of failures ) console.log(`FAIL ${f}`);
  console.log(`${failures.length} row(s) name nothing the packs carry (dnd5e ${snap.system}). Fix the row's `
    + "name, add an ALIASES entry, or re-measure with probe-identifiers.mjs.");
  process.exit(1);
}
console.log(`PASS all ${checked} content rows resolve against the snapshot (dnd5e ${snap.system}, ${snap.packs.length} packs)`);
console.log(`PASS all ${pointers} rule pointers name a pack item the snapshot carries, or a rules page`);
