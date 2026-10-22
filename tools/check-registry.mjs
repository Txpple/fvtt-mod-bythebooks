// STATIC REGISTRY + SETTINGS INTEGRITY CHECK — no Foundry, no world, milliseconds.
//
// What it asserts (ARCHITECTURE.md §6, §8):
//   1. Every key in the `S` map is registered in settings.js (else `setting(S.foo)` throws).
//   2. Every setting registered in settings.js is in `S` (else the code cannot read it).
//   3. Every registry entry declares a `kind` from its closed set and carries no amount (R4).
//   4. Every kind list names only kinds from its closed set.
//   5. The source-file count, pinned, so adding a file is a deliberate one-line change.
//   6. THE R4 TRIPWIRE (DESIGN.md R4): the kinds the code knows are printed and their total
//      PINNED — not a rule against new kinds, a rule against unnoticed ones.
//
//   node tools/check-registry.mjs
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { KIND_LISTS, KIND_SETS, MASTERY_KINDS, VOLLEY_KINDS } from "../scripts/decide/registry.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(ROOT, p), "utf8");

const failures = [];
const passes = [];
const fail = (what, detail) => failures.push(`${what} — ${detail}`);
const pass = what => passes.push(what);

/* --- 1 + 2: the S map and the registrations agree ------------------------------------- */

const coreSrc = read("scripts/core.js");
const settingsSrc = read("scripts/settings.js");

const sBlock = /export const S = \{([\s\S]*?)\n\};/.exec(coreSrc);
if (!sBlock) fail("S map", "could not locate `export const S = {…}` in scripts/core.js");

const sKeys = new Set([...(sBlock?.[1] ?? "").matchAll(/^\s*(\w+)\s*:/gm)].map(m => m[1]));
const registered = new Set([...settingsSrc.matchAll(/register\(MODULE_ID,\s*S\.(\w+)/g)].map(m => m[1]));

const unregistered = [...sKeys].filter(k => !registered.has(k));
const unnamed = [...registered].filter(k => !sKeys.has(k));

if (unregistered.length) fail("S keys never registered", unregistered.join(", "));
else pass(`all ${sKeys.size} keys in S are registered`);

if (unnamed.length) fail("registered keys missing from S", unnamed.join(", "));
else pass(`all ${registered.size} registrations are named in S`);

// A registration whose key is a bare string rather than `S.foo` bypasses the map entirely.
const literalRegs = [...settingsSrc.matchAll(/register\(MODULE_ID,\s*["'](\w+)["']/g)].map(m => m[1]);
if (literalRegs.length) fail("settings registered by string literal, not through S", literalRegs.join(", "));
else pass("no setting is registered by string literal");

/* --- 3: registry entries are well-formed ---------------------------------------------- */

const volleySrc = read("scripts/volley-registry.js");
// VOLLEY_KINDS is IMPORTED, never re-declared: a lookalike could agree with itself while the
// shipping registry disagrees.

const entries = [...volleySrc.matchAll(/\[\s*"([^"]+)"\s*,\s*\{([^}]*)\}\s*\]/g)];
if (!entries.length) fail("volley registry", "no entries parsed — did the shape change?");
for (const [, name, body] of entries) {
  const kind = /kind:\s*"(\w+)"/.exec(body)?.[1];
  if (!kind) fail(`volley entry "${name}"`, "declares no kind");
  else if (!VOLLEY_KINDS.has(kind)) fail(`volley entry "${name}"`, `unknown kind "${kind}"`);
  // R4: an entry may carry a formula or a resolver, never a transcribed amount.
  if (/\bdamage:\s*["'\d]/.test(body)) fail(`volley entry "${name}"`, "carries a damage amount — amounts live in CONTENT (DESIGN N1)");
}
if (entries.length && !failures.some(f => f.startsWith("volley entry"))) {
  pass(`all ${entries.length} volley registry entries declare a known kind and no amounts`);
}

/* --- 4: the kind lists name only known kinds ------------------------------------------- */

for (const [name, { rows, kinds }] of Object.entries(KIND_LISTS)) {
  const unknown = rows.filter(r => !kinds.has(r.kind)).map(r => `${r.name}:${r.kind}`);
  if (unknown.length) fail(`kind list ${name}`, `kinds outside its set: ${unknown.join(", ")}`);
  else if (!rows.length) fail(`kind list ${name}`, "empty — the machine ships inert");
  else pass(`${name}: ${rows.length} rows, every kind known`);
}

/* --- 5: the R4 tripwire ---------------------------------------------------------------- */

// ⚠ THE PIN. Bump it DELIBERATELY in the commit that adds the kind, saying why the kind is
// genuinely new (ARCHITECTURE.md §11 step 3). A kind names a different SPEND or way of KNOWING that a
// row cannot say; a second customer of an existing shape is a row of its table, not a kind.
// Bumping more than once a pass is the tripwire firing — re-read DESIGN.md R4.
const EXPECTED_KINDS = 40;

// A mastery this module resolves but cannot quote breaks presentation law 8 (ARCHITECTURE.md §5).
const rulesSrc = read("scripts/decide/registry.js");
const rulesBlock = /export const MASTERY_RULES = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(rulesSrc);
const ruleKeys = new Set([...(rulesBlock?.[1] ?? "").matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]));
const unquoted = [...MASTERY_KINDS].filter(k => !ruleKeys.has(k));
const unresolved = [...ruleKeys].filter(k => !MASTERY_KINDS.has(k));
if (unquoted.length) fail("mastery kinds", `resolved but with no rule text to quote: ${unquoted.join(", ")}`);
else if (unresolved.length) fail("mastery kinds", `rule text for a mastery nothing resolves: ${unresolved.join(", ")}`);
else pass(`all ${MASTERY_KINDS.size} mastery kinds carry their own rule text`);

let kindTotal = 0;
const rows = KIND_SETS.map(set => {
  kindTotal += set.kinds.size;
  return [set.name, String(set.kinds.size), set.system ? `of ${set.system} (system)` : "module-owned",
    [...set.kinds].join(" · ")];
});

/* --- the source-file count, pinned ------------------------------------------------------ */

// ⚠ The count of every module under scripts/, recursively, quoted by name in ARCHITECTURE.md and
// check-comments' output. Bump it deliberately when a file is added — the refusal is the feature.
const EXPECTED_SOURCE_FILES = 148;
const walk = (dir, prefix = "") => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? walk(`${dir}/${d.name}`, `${prefix}${d.name}/`)
    : (d.name.endsWith(".js") ? [`${prefix}${d.name}`] : []));
const sourceFiles = walk("scripts");
if (sourceFiles.length !== EXPECTED_SOURCE_FILES) {
  fail("source-file count", `scripts/ holds ${sourceFiles.length} modules, the pin says `
    + `${EXPECTED_SOURCE_FILES} — if a file was added or removed on purpose, move `
    + "EXPECTED_SOURCE_FILES in this file and fix every doc that quotes the old number");
} else {
  pass(`source-file count: ${sourceFiles.length} modules under scripts/, matching the pin`);
}

if (kindTotal !== EXPECTED_KINDS) {
  fail("R4 tripwire", `the code knows ${kindTotal} kinds, the pin says ${EXPECTED_KINDS} — `
    + "if a kind was added on purpose, bump EXPECTED_KINDS in this file and say why in the commit");
} else {
  pass(`R4 tripwire: ${kindTotal} kinds across ${KIND_SETS.length} sets, matching the pin`);
}

/* --- report ---------------------------------------------------------------------------- */

for (const p of passes) console.log(`PASS ${p}`);

// The R4 table itself — printed every run, so the number is in front of whoever changed it.
console.log("\nKINDS THE CODE KNOWS (DESIGN.md R4 — the tripwire)");
const w = Math.max(...rows.map(r => r[0].length));
for (const [name, n, origin, kinds] of rows) {
  console.log(`  ${name.padEnd(w)}  ${n.padStart(2)}  ${origin.padEnd(14)}  ${kinds}`);
}
console.log(`  ${"".padEnd(w)}  ${String(kindTotal).padStart(2)}  total, pinned at ${EXPECTED_KINDS}`);
if (failures.length) {
  console.error("");
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`\n${failures.length} integrity failure(s).`);
  process.exit(1);
}
console.log(`\n${passes.length} checks passed.`);
