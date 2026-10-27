// Static flag-edge check (no Foundry, milliseconds): a flag key is read by its literal name only by the
// unit that owns it; every other file asks a reader the owner exports (ARCHITECTURE §4 *Who reads a
// record*). `npm run layers` sees the import edges; a machine reading another machine's flag by its key
// is an edge with no import to show it, and a renamed field there breaks a reader nobody can find.
//
//   node tools/check-flag-edges.mjs            # the check (gate: npm run flagedges)
//   node tools/check-flag-edges.mjs --list     # every read outside its owner, and every whole-scope read
//
// What it reads (the repo's TypeScript parser, per file): every read of a module flag in every form —
// `readFlag(doc, k)`, `doc.getFlag(MODULE_ID, k)`, `doc.flags[MODULE_ID].k` (optional chains and `[CONST]`
// included), `getProperty` / `hasProperty` on a `flags.${MODULE_ID}.k` path and `data[`flags.${MODULE_ID}.k`]`
// — with the key a string literal or a constant of the file (its own or one it imports).
//   1. A key's OWNER is every unit that writes it (tools/moment-writers.mjs's scan; `hold/` and `saves/`
//      are one unit each), unless OWNERS narrows it: a record other machines write through the owner's
//      constructors stays the owner's.
//   2. A key's READERS live in one file, named in OWNERS: the owner when it sits below every reader, else
//      the lowest file every reader can import (a shared reader goes down, never sideways — §7). That
//      file may read the key by name.
//   3. Any other read of the key by name fails, unless pinned in ALLOW (`"<file> <key>"`) with its
//      reason; a stale pin fails.
// A read whose key is a variable (a registry's `readFlag(message, flagKey)`, a fold's getter) and a read
// of the whole scope (`flags[MODULE_ID]`) are counted and listed, not judged.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { groupOf, jsFiles, SCRIPTS, toPosix } from "./check-layers.mjs";
import { writes } from "./moment-writers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(join(ROOT, "package.json"))("typescript");

/** The unit a file belongs to: a directory machine's folder, else the file. */
const unitOf = rel => (groupOf(rel) ? `${groupOf(rel)}/` : rel);

/**
 * The keys more than one unit reads: who owns each (when it is not simply every writer) and which file
 * exports its readers, with the reason the readers sit there.
 */
const OWNERS = {
  receipt: { readers: "auto-apply.js", why: "the damage chokepoint writes it; every reader is a machine above it" },
  saves: { owner: ["saves/"], readers: "shared.js", why: "other machines raise a demand through decide/demand.js's constructors; a service (auto-damage.js) reads it, so the readers sit in the spine" },
  hold: { readers: "shared.js", why: "the services (auto-apply.js, auto-damage.js) and the spine read it" },
  attackFor: { readers: "shared.js", why: "the service that stamps it sits above the spine's attack-chain lookup (resolveAttackMessage)" },
  attackHoldPending: { readers: "shared.js", why: "auto-apply.js, a service beside the one that stamps it, reads it" },
  mastery: { readers: "shared.js", why: "the chip's fingerprint, stamped by the spine's chip writers and five machines; the mastery machine's own record on the attack card shares the key" },
  sourceUuid: { readers: "core.js", why: "the data plane's stamp (statContext), read by the spine's geometry.js" },
  effectReceipt: { readers: "effect-riders.js", why: "the effect chokepoint writes it; the cast and the receipt card read it" },
  metamagic: { readers: "shared.js", why: "a service (effect-riders.js) reads the cast's option, and a machine its range and its Extended mark" },
  metamagicAsk: { readers: "area-ask.js", why: "the ask at the area is the service the saves machine routes through" },
  d20fold: { readers: "shared.js", why: "two machines read the fold's spends; a reader in d20-folds.js would be a machine → machine edge" },
  fightingStyle: { readers: "shared.js", why: "a damage card's record and a face's fingerprint, read by another machine and the spine" },
  fightingStyleTakenOver: { readers: "shared.js", why: "the pack effect a face switched off, read by the effect view beside the face's own reader" },
  storedDice: { readers: "shared.js", why: "the spine writes and spends the chip; the bystanders and the hold read its faces" },
  bystanderMute: { readers: "shared.js", why: "the spine writes and judges the mute; the chip tidy sweeps it" },
  chipSpend: { readers: "shared.js", why: "the spine's chipSpentOnRecord reads the spend for every machine's chip; a maneuver reads what the roll used up" },
  poolSpend: { readers: "shared.js", why: "every machine that spends a die by hand stamps the one row shape the spine's poolSpendsOn gathers" },
  notApplied: { readers: "auto-apply.js", why: "the damage chokepoint stamps it; the receipt card draws it" },
  weaponRolls: { readers: "auto-damage.js", why: "the service that rolls the damage stamps it; the dice changers count the activity's own dice by it" },
  leadWindow: { readers: "core.js", why: "the spine claims the leading window on the User; the elect asks it (leadsWindow)" },
  diceRise: { readers: "dice-rise.js", why: "every machine whose rule changes a die stamps the record the one renderer plays" },
  respondsTo: { readers: "ui.js", why: "an envelope's machines write it; the relay's registry folds it" },
  helpItem: { readers: "help.js", why: "the Help item's data is pure (decide/help.js); the elect that keeps the world's copy is its one reader" },
  lends: { readers: "reminders.js", why: "the Assisted effect's data is pure (decide/help.js); the check gate is its one reader, against the roll's own key" },
  saveFor: { readers: "ui.js", why: "the demand registry reads which card a save the module rolled answers" },
  form: { owner: ["transforms.js", "decide/transforms.js"], why: "decide/transforms.js builds the form effect transforms.js lands" },
  migratedFrom: { owner: ["migrate.js", "decide/migrate.js"], why: "decide/migrate.js builds the recreated behaviour migrate.js lands" }
};

/**
 * Reads by name outside the owner that stand, `"<file> <key>"` → what is read and why. A key read this way by
 * three or more units gets readers instead (an OWNERS row): the check fails a pin that crosses the line.
 */
const ALLOW = new Map([
  ["advantage-buys.js sneak", "Lucky's Advantage buy reads the Cunning Strike picks the attack recorded (sneak.js)"],
  ["auto-apply.js diceChange", "the damage chokepoint's second claim: a dice changer due, pending or answering holds the application (§4); the flag's name and its waiting statuses are decide/dice-changers.js's"],
  ["auto-damage.js precision", "the damage offer's headline says a Precision Attack's die was used (precision.js); a service reads a machine's outcome"],
  ["auto-damage.js riposteFor", "the damage offer's headline says the attack is a driven Riposte (riposte.js)"],
  ["bash-offer.js riposteFor", "a driven attack never chains the bash's offer (riposte.js)"],
  ["bystanders.js saveFor", "the bystander's ask stands aside for a save the module rolled for a demand (saves/)"],
  ["cast-riders.js emanation", "a surge finds its bearer's own aura region by the region's fingerprint (emanations.js)"],
  ["cast.js healPending", "the cast's heal applier reads the birth claim polish.js stamps on a healing roll (the self-aimed target)"],
  ["cast.js healReroll", "the heal applier waits while the Healer's reroll (heal-rerolls.js) is due, pending or answering: the second claim the dice changers put on damage"],
  ["chip-spend.js against", "a use chip's target stamp (use-chips.js, Studied Attacks): the chip is spent only by a roll at the creature it names"],
  ["chip-spend.js reactionEffect", "the tidy owns the hold's reaction effect (hold/) beside the module's chips: an expired Shield must not read as still up"],
  ["chip-spend.js reminder", "the spend honours the net the gate showed (reminders.js's record on the roll) for the kinds it listed"],
  ["clock-riders.js opportunity", "a rider's opportunity gate reads the driven Opportunity Attack's stamp (rebukes.js)"],
  ["clock-riders.js sneak", "a rider's sneakArmed gate reads whether the attack armed Sneak Attack (sneak.js, the gate's arm in reminders.js)"],
  ["clock-riders.js sneakDamage", "the same gate on the damage card: Sneak Attack rode this roll (sneak.js)"],
  ["damage-rules.js poleStrike", "Pole Strike's swing (hew.js) is a Bonus Action, never part of the Attack action, for a style's own-turn gate"],
  ["dice-rise.js fightingStyle", "the dice renderer stands aside when a Fighting Style already raised the faces (damage-rules.js rises its own); a reader in shared.js would be a spine → spine edge"],
  ["effect-riders.js stacks", "the twin-chip dedupe leaves a deliberate stack (use-chips.js) alone"],
  ["heal-rerolls.js formChip", "a heal row's form gate reads the transformation chip a clock rider or a cast stamps (cast.js, clock-riders.js)"],
  ["hew.js option", "an option row reads the feature's kept option on its item (clock-riders.js asks it on the damage offer)"],
  ["hit-menu.js reminder", "a group that requires the forgo (Brutal Strike) opens only on a hit whose roll recorded it (reminders.js)"],
  ["hold/spell-damage.js spellDamage", "the no-attack damage applier's birth claim (polish.js) gates the hold's spell damage"],
  ["hold/spell-hold.js spellDamage", "the hold's bridge finds the spell's damage roll by the same birth claim (polish.js)"],
  ["lookup.js companion", "the spine's companion lookup reads a companion effect's tie to its summon card (summons.js); a reader there would be a spine → machine edge"],
  ["lookup.js summon", "the same lookup reads the summon record the companion effect points at (summons.js)"],
  ["reminders.js against", "the gate's effect facts carry a use chip's target (use-chips.js), so a row scoped to one creature reads true only at it"],
  ["reminders.js concentration", "the save gate reads the concentration ask its roll answers (concentration.js): Mage Slayer's breaker"],
  ["reminders.js emanation", "the gate reads an aura's fingerprint on a member's effect and on the scene's area regions (emanations.js) for the rows an aura carries"],
  ["saves/demand.js failDamage", "a cast's hit-reaction rider (hold/) rides into the demand as the failure's damage"],
  ["saves/demand.js mishap", "a dark gift's save (mishaps.js) is self-aimed by the pack and is still the demand; its stamp tells it apart"],
  ["saves/demand.js riderSave", "a weapon rider's save (clock-riders.js, hit-menu.js) is the save alone: the hit carried the damage"],
  ["shared.js hitManeuver", "poolSpendsOn gathers every hand-spent die into one row list: the hit menu's picks carry theirs"],
  ["summons.js empowerEffect", "the caster's empower effect (transforms.js) ends with the caster's death and asks the revert when deleted"],
  ["ui.js damageOffer", "the spine's render hook draws a live damage offer's bar on every client (auto-damage.js's flag); a reader there would be a spine → service edge"]
]);

/* --- one file ------------------------------------------------------------------------------- */

const files = new Map();
for (const path of jsFiles(SCRIPTS)) {
  const rel = toPosix(relative(SCRIPTS, path));
  const sf = ts.createSourceFile(rel, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const constants = new Map();
  const imports = new Map();
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && ts.isStringLiteral(d.initializer)) constants.set(d.name.text, d.initializer.text);
      }
    }
    if (ts.isImportDeclaration(stmt) && stmt.importClause?.namedBindings && ts.isNamedImports(stmt.importClause.namedBindings)) {
      const spec = stmt.moduleSpecifier.text;
      if (!spec.startsWith(".")) continue;
      const target = toPosix(relative(SCRIPTS, normalize(join(dirname(join(SCRIPTS, rel)), spec))));
      for (const el of stmt.importClause.namedBindings.elements) imports.set(el.name.text, { rel: target, name: (el.propertyName ?? el.name).text });
    }
  }
  files.set(rel, { rel, sf, constants, imports });
}

/** The key an argument names: a literal, a constant of the file or one it imports; null when it is a variable. */
function keyOf(file, arg) {
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (!ts.isIdentifier(arg)) return null;
  if (file.constants.has(arg.text)) return file.constants.get(arg.text);
  const imp = file.imports.get(arg.text);
  return (imp && files.get(imp.rel)?.constants.get(imp.name)) ?? null;
}

/** The key a `flags.${MODULE_ID}.k` path names (`.${K}` resolved); null for any other template. */
function pathKey(file, t) {
  if (!ts.isTemplateExpression(t) || !/(^|\.)flags\.$/.test(t.head.text)) return null;
  const [first, second] = t.templateSpans;
  if (first?.expression.getText() !== "MODULE_ID") return null;
  const rest = first.literal.text;
  if (rest.length > 1 && rest.startsWith(".")) return rest.slice(1).split(".")[0].replace(/^-=/, "");
  return (rest === "." && second) ? keyOf(file, second.expression) : null;
}

const isFlagsBag = n => (ts.isPropertyAccessExpression(n) && (n.name.text === "flags")) || (ts.isIdentifier(n) && (n.text === "flags"));
const isAssigned = n => ts.isBinaryExpression(n.parent) && (n.parent.left === n) && (n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken);

/** Every read in the tree: `{ rel, at, key }`, the key null for a variable key, "*" for the whole scope. */
const reads = [];
for (const file of files.values()) {
  const at = n => `${file.rel}:${file.sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const add = (n, key) => reads.push({ rel: file.rel, at: at(n), key });
  const visit = n => {
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      const name = ts.isIdentifier(c) ? c.text : (ts.isPropertyAccessExpression(c) ? c.name.text : null);
      // core.js's own readFlag body reads its parameter: the reader itself, not a read
      if ((name === "readFlag") && ts.isIdentifier(c)) add(n, keyOf(file, n.arguments[1]));
      else if ((name === "getFlag") && (n.arguments[0]?.getText() === "MODULE_ID") && !(file.rel === "core.js")) add(n, keyOf(file, n.arguments[1]));
      else if (((name === "getProperty") || (name === "hasProperty")) && n.arguments[1]) {
        const key = pathKey(file, n.arguments[1]);
        if (key) add(n, key);
      }
    }
    if (ts.isElementAccessExpression(n) && (n.argumentExpression?.getText() === "MODULE_ID") && isFlagsBag(n.expression) && !isAssigned(n)) {
      const p = n.parent;
      if (ts.isPropertyAccessExpression(p) && (p.expression === n)) { if (!isAssigned(p)) add(n, p.name.text); }
      else if (ts.isElementAccessExpression(p) && (p.expression === n)) { if (!isAssigned(p)) add(n, keyOf(file, p.argumentExpression)); }
      else add(n, "*");
    }
    if (ts.isElementAccessExpression(n) && n.argumentExpression && ts.isTemplateExpression(n.argumentExpression) && !isAssigned(n)) {
      const key = pathKey(file, n.argumentExpression);
      if (key) add(n, key);
    }
    ts.forEachChild(n, visit);
  };
  visit(file.sf);
}

/* --- the owners ----------------------------------------------------------------------------- */

const writerUnits = new Map();
for (const [key, sites] of writes) writerUnits.set(key, new Set([...sites].map(s => unitOf(s.slice(0, s.lastIndexOf(":"))))));

const failures = [];
for (const [key, row] of Object.entries(OWNERS)) {
  if (!writes.has(key)) failures.push(`stale owner: OWNERS.${key} names a key nothing writes — remove the row`);
  if (!row.why || (row.why.length < 20)) failures.push(`OWNERS.${key} needs a reason of a sentence`);
  if (row.readers && !files.has(row.readers)) failures.push(`OWNERS.${key}.readers names scripts/${row.readers}, which does not exist`);
}
/** May `rel` read `key` by name? */
const mayRead = (rel, key) => {
  const row = OWNERS[key];
  const owner = row?.owner ? new Set(row.owner) : writerUnits.get(key);
  return owner.has(unitOf(rel)) || owner.has(rel) || (row?.readers === rel);
};

/* --- the sites ------------------------------------------------------------------------------ */

const list = process.argv.includes("--list");
const outside = [];
const pinned = [];
const seenAllow = new Set();
const unjudged = reads.filter(r => (r.key === null) || (r.key === "*") || !writes.has(r.key));
for (const r of reads) {
  if ((r.key === null) || (r.key === "*") || !writes.has(r.key) || mayRead(r.rel, r.key)) continue;
  const pin = `${r.rel} ${r.key}`;
  if (ALLOW.has(pin)) { seenAllow.add(pin); pinned.push(r); continue; }
  outside.push(r);
  const home = OWNERS[r.key]?.readers;
  failures.push(`${r.at} reads \`${r.key}\` by name outside its owner (${[...(OWNERS[r.key]?.owner ?? writerUnits.get(r.key))].join(", ")}) — `
    + (home ? `ask the reader scripts/${home} exports` : "export a reader from the owner (or the lowest file every reader can import) and name it in OWNERS")
    + ", or pin the read in ALLOW with its reason");
}
for (const pin of ALLOW.keys()) {
  if (!seenAllow.has(pin)) failures.push(`stale pin: ${pin} is in ALLOW and that file no longer reads that key by name — remove the row`);
}
// A key three units read outside its owner gets readers, not a third pin.
const pinnedUnits = new Map();
for (const r of pinned) {
  if (!pinnedUnits.has(r.key)) pinnedUnits.set(r.key, new Set());
  pinnedUnits.get(r.key).add(unitOf(r.rel));
}
for (const [key, units] of pinnedUnits) {
  if (units.size >= 3) failures.push(`\`${key}\` is read by name outside its owner in ${units.size} units (${[...units].join(", ")}) — `
    + "a key three units read gets readers exported by its owner (an OWNERS row), not a pin each");
}

/* --- the report ----------------------------------------------------------------------------- */

const summary = rs => {
  const keys = new Set(rs.map(r => r.key));
  return `${keys.size} key${keys.size === 1 ? "" : "s"}, ${rs.length} site${rs.length === 1 ? "" : "s"} in ${new Set(rs.map(r => r.rel)).size} files`;
};
if (list) {
  for (const r of [...outside, ...pinned].sort((a, b) => a.at.localeCompare(b.at, "en", { numeric: true }))) {
    console.log(`${ALLOW.has(`${r.rel} ${r.key}`) ? "pinned " : "OUTSIDE"} ${r.at.padEnd(34)} ${r.key}`);
  }
  for (const r of unjudged) console.log(`unjudged ${r.at.padEnd(33)} ${r.key === null ? "<a variable key>" : (r.key === "*" ? "<the whole scope>" : `${r.key} (never written)`)}`);
}
const readKeys = new Set(reads.map(r => r.key));
const neverRead = [...writes.keys()].filter(k => !readKeys.has(k)).sort();
if (list) console.log(`never read by name (a view reading the whole scope, or state nobody reads): ${neverRead.join(", ")}`);
if (failures.length) {
  console.error("");
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`\nreads by name outside their owner: ${summary(outside)} unpinned, ${summary(pinned)} pinned.`);
  console.error(`${failures.length} flag-edge failure(s). Another unit's flag is read through the reader its owner exports (ARCHITECTURE §4), `
    + "or the read stands pinned in ALLOW with its reason.");
  process.exit(1);
}
console.log(`PASS every flag read by name sits with its owner or its readers (${reads.length} reads; outside the owner: ${summary(pinned)}, each pinned; `
  + `${Object.keys(OWNERS).length} keys with readers named; unjudged: ${unjudged.filter(r => r.key === null).length} variable-key and `
  + `${unjudged.filter(r => r.key === "*").length} whole-scope reads, ${unjudged.filter(r => (r.key !== null) && (r.key !== "*")).length} of keys never written; `
  + `${neverRead.length} written keys never read by name — ARCHITECTURE §4).`);
