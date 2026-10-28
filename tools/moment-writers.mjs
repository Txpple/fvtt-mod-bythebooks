// WHO WRITES WHICH RECORD — the flag-write scan and the world-writer pins, shared by the moments
// gate (check-moments.mjs) and the claim proof (tools/claim-proof.mjs) so the two never drift.
// ⚠ Importing this runs the scan (every scripts/ file, pure reading). What it exports:
//   - `files`          every scripts/ file, `{ rel, src }`, comments blanked (indices still line up)
//   - `writes`         flag key → Set of "file:line" — every site that WRITES that key
//   - `WORLD_WRITERS`  file → the record key(s) its world writes resolve into, or the reason none does
//   - `writers`        the files the WRITE_CALL scan says write the world
//   - `keysByFile()`   the `writes` map turned inside out: file → Set of keys it writes
//   - `unresolved`     a write naming a constant the file neither declares nor imports, "file:line NAME"
//   - `unfollowed`     a write through a variable object with no literal declaration in sight, "file:line"
// A `[CONST]` key resolves against the writing file's own constants and the ones it imports, never
// another file's name-alike.
//
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(ROOT, "scripts");

/* --- the files */

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}
/**
 * Comments blanked (a `'` in "the caster's" would open a string the scan never closes). Blanked,
 * not removed, so indices and lines match the source. A trailing `// …` on a code line stays.
 */
const blank = text => text.replace(/[^\n]/g, " ");
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^\s*\/\/.*$/gm, blank);
const files = walk(SCRIPTS).map(p => ({ rel: relative(SCRIPTS, p).split("\\").join("/"), src: stripComments(readFileSync(p, "utf8")) }));

/* --- the constants a key may be written through, per file */

/**
 * A file's constants: its own `const NAME = "…"` declarations, then the names it imports from another
 * scripts/ file (`import { NAME, OTHER as LOCAL } from "./x.js"`), resolved against that file's own.
 * Per file, because two files may give one name different values (`FORM_FLAG` is `"formChip"` in
 * clock-riders.js and `"form"` in transforms.js).
 */
const ownConsts = new Map(files.map(f => [f.rel, new Map([...f.src.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"/g)].map(m => [m[1], m[2]]))]));
const CONSTS = new Map(files.map(f => {
  const own = new Map(ownConsts.get(f.rel));
  for (const m of f.src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g)) {
    const target = join(dirname(join(SCRIPTS, f.rel)), m[2]);
    const from = ownConsts.get(relative(SCRIPTS, target).split("\\").join("/"));
    for (const spec of m[1].split(",").map(s => s.trim()).filter(Boolean)) {
      const [name, local = name] = spec.split(/\s+as\s+/).map(s => s.trim());
      if (!own.has(local) && from?.has(name)) own.set(local, from.get(name));
    }
  }
  return [f.rel, own];
}));
/** Constants a write names and the scan cannot resolve, as "file:line NAME" (the gate fails on one). */
const unresolved = [];
const resolveKey = (raw, f, at) => {
  const k = raw.replace(/^-=/, "");
  if (!/^[A-Z][A-Z0-9_]*$/.test(k)) return k;
  const value = CONSTS.get(f.rel)?.get(k) ?? null;
  if (!value) unresolved.push(`${f.rel}:${at} ${k}`);
  return value;
};

/* --- the scan: every write site, by key */

/** key → Set of "file:line" */
const writes = new Map();
const note = (key, f, at) => {
  if (!key) return;
  if (!writes.has(key)) writes.set(key, new Set());
  writes.get(key).add(`${f.rel}:${at}`);
};
const lineAt = (src, idx) => src.slice(0, idx).split("\n").length;

/**
 * The keys of one `{ … }` literal at the flag level, and the index past its closing brace. A value
 * object's keys are skipped; a spread's literal is transparent (its keys land beside the others).
 */
function literalKeys(src, open) {
  const keys = [];
  let depth = 0;
  let i = open;
  const skipStack = [];           // per depth: true when this brace opened a VALUE object (skip its keys)
  let inStr = null;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i++; continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") { inStr = ch; i++; continue; }
    if (ch === "{") {
      const before = src.slice(Math.max(0, i - 40), i).replace(/\s+$/, "");
      const isValue = /:$/.test(before) && depth > 0;
      skipStack.push(isValue);
      depth++; i++; continue;
    }
    if (ch === "}") {
      depth--; skipStack.pop(); i++;
      if (depth === 0) return { keys, end: i };
      continue;
    }
    if (ch === "(" || ch === "[") {
      // a bracketed key `[CONST]:` — read it; anything else bracketed is skipped as a unit
      if (ch === "[" && /^\[\s*[A-Z][A-Z0-9_]*\s*\]\s*:/.test(src.slice(i))) {
        const m = /^\[\s*([A-Z][A-Z0-9_]*)\s*\]\s*:/.exec(src.slice(i));
        if (!skipStack.some(Boolean)) keys.push({ raw: m[1], at: i });
        i += m[0].length; continue;
      }
      // a SPREAD's group (`...(cond ? { k } : {})`) is transparent — its literals' keys land at our
      // level; any other group (a call's arguments, an index) is a value and is skipped whole
      const spread = ch === "(" && /\.\.\.\s*$/.test(src.slice(Math.max(0, i - 6), i));
      // skip a balanced (…) / […] group, honouring strings
      const close = ch === "(" ? ")" : "]";
      let d = 0; let j = i; let s = null;
      while (j < src.length) {
        const c = src[j];
        if (s) { if (c === "\\") { j += 2; continue; } if (c === s) s = null; j++; continue; }
        if (c === "\"" || c === "'" || c === "`") { s = c; j++; continue; }
        if (c === ch) d++;
        else if (c === close) { d--; if (d === 0) { j++; break; } }
        else if (c === "{") {
          // an object literal INSIDE the group: a spread's keys land at our level; a call's are skipped
          const inner = literalKeys(src, j);
          if (spread && !skipStack.some(Boolean)) keys.push(...inner.keys);
          j = inner.end; continue;
        }
        j++;
      }
      i = j; continue;
    }
    // a plain key at this level: `name:` (not `?.name`, not `a.b:` (a label), not inside a value object)
    const m = /^([A-Za-z_$][\w$]*|"-=[A-Za-z_]\w*"|"[A-Za-z_]\w*")\s*:(?!:)/.exec(src.slice(i));
    const prev = src[i - 1] ?? "";
    if (m && !skipStack.some(Boolean)) {
      if (!/[\w$.?]/.test(prev)) keys.push({ raw: m[1].replace(/"/g, ""), at: i });
      i += m[0].length; continue;
    }
    // a SHORTHAND key at this level: `{ uuid, answer }` — an identifier in key position followed by `,` or `}`
    const sh = /^([A-Za-z_$][\w$]*)\s*(?=[,}])/.exec(src.slice(i));
    if (sh && !skipStack.some(Boolean) && !/[\w$.?]/.test(prev)) {
      const behind = src.slice(Math.max(0, i - 40), i).replace(/\s+$/, "");
      if (/[{,]$/.test(behind)) keys.push({ raw: sh[1], at: i });
      i += sh[0].length; continue;
    }
    i++;
  }
  return { keys, end: i };
}

/**
 * The keys written through a VARIABLE that holds the flag object (`const claim = { spellDamage: true };
 * … { [MODULE_ID]: claim }`): its nearest declaration before the use, a `{ … }` literal, plus every
 * `name.key =` / `name[CONST] =` between the two. Null when no literal declaration is in sight.
 */
function variableKeys(src, name, before) {
  const decls = [...src.slice(0, before).matchAll(new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*\\{`, "g"))];
  const decl = decls.at(-1);
  if (!decl) return null;
  const { keys } = literalKeys(src, decl.index + decl[0].length - 1);
  const body = src.slice(decl.index, before);
  for (const m of body.matchAll(new RegExp(`\\b${name}(?:\\.([A-Za-z_]\\w*)|\\[\\s*([A-Z][A-Z0-9_]*)\\s*\\])\\s*=(?!=)`, "g"))) {
    keys.push({ raw: m[1] ?? m[2], at: decl.index + m.index });
  }
  return keys;
}

/** Writes through a variable object the scan cannot follow, as "file:line" (the gate fails on one). */
const unfollowed = [];

for (const f of files) {
  const src = f.src;
  const key = (raw, idx) => resolveKey(raw, f, lineAt(src, idx));
  for (const m of src.matchAll(/\b(?:setFlag|unsetFlag)\(MODULE_ID,\s*("([^"]+)"|([A-Z][A-Z0-9_]*))/g)) note(key(m[2] ?? m[3], m.index), f, lineAt(src, m.index));
  // core.js `clearFlag(doc, key)`: the unsetFlag of a card that may carry the legacy scope (3.0.0's rename).
  for (const m of src.matchAll(/\bclearFlag\(\s*[\w.?]+\s*,\s*("([^"]+)"|([A-Z][A-Z0-9_]*))/g)) note(key(m[2] ?? m[3], m.index), f, lineAt(src, m.index));
  for (const m of src.matchAll(/\bqueueFlagWrite\(\s*[\w.]+\s*,\s*("([^"]+)"|([A-Z][A-Z0-9_]*))/g)) note(key(m[2] ?? m[3], m.index), f, lineAt(src, m.index));
  for (const m of src.matchAll(/flags\.\$\{MODULE_ID\}\.(?:\$\{([A-Z][A-Z0-9_]*)\}|(-=)?([A-Za-z_]\w*))/g)) note(key(m[1] ?? m[3], m.index), f, lineAt(src, m.index));
  // `[MODULE_ID]: { … }`, or the package id as a string key where the file imports nothing (decide/)
  for (const m of src.matchAll(/(?:\[MODULE_ID\]|"fvtt-mod-bythebooks")\s*:\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const { keys } = literalKeys(src, open);
    for (const k of keys) note(key(k.raw, k.at), f, lineAt(src, k.at));
  }
  // the flag object held in a variable: `{ [MODULE_ID]: claim }`
  for (const m of src.matchAll(/\[MODULE_ID\]\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,}\n])/g)) {
    const keys = variableKeys(src, m[1], m.index);
    if (!keys) { unfollowed.push(`${f.rel}:${lineAt(src, m.index)} [MODULE_ID]: ${m[1]}`); continue; }
    for (const k of keys) note(key(k.raw, k.at), f, lineAt(src, k.at));
  }
  // the scope assigned whole on a flags object: `flags[MODULE_ID] = { … }`, or the migration plan's
  // `flags[ids.to] = { … }` (decide/migrate.js takes the module's own id as `to`: the layer names no package)
  for (const m of src.matchAll(/\bflags\[\s*(?:MODULE_ID|(?:\w+\.)?to)\s*\]\s*=\s*\{/g)) {
    const { keys } = literalKeys(src, m.index + m[0].length - 1);
    for (const k of keys) note(key(k.raw, k.at), f, lineAt(src, k.at));
  }
}

/* --- the world writers */

/**
 * Files that write the WORLD other than through a message flag, and the record key(s) their writes
 * resolve into, or a sentence saying why none does. ⚠ A consequence lands as a receipt (state law
 * 4); a write with no receipt and no record is the class this table catches.
 */
const WORLD_WRITERS = {
  "auto-apply.js": ["receipt"],
  "effect-riders.js": ["effectReceipt"],
  "receipts.js": ["receipt"],
  "mastery.js": ["effectReceipt", "receipt", "mastery", "masteryPick"],
  "topple.js": ["topple", "effectReceipt"],
  "chip-spend.js": ["chipSpend"],
  "use-chips.js": ["useChip"],
  "help.js": ["help", "effectReceipt"],   // effectReceipt: the assist's effect, receipted on the Help card
  "hit-menu.js": ["hitManeuver", "sweepCard", "receipt", "effectReceipt"],   // effectReceipt: Hill's Tumble's no-save press, receipted on the damage card
  "hit-riders.js": "the weapon's own damage parts, folded into the roll config before it rolls — the damage message is the platform's and its receipt the resolve",
  "sneak.js": ["sneakDamage", "effectReceipt"],
  "initiative-swap.js": ["initiativeSwap"],   // Alert's swap, landed by the elect
  "initiative-grants.js": ["initiativeGrant", "receipt"],
  "stored-dice.js": "the chip is state (storedDice) and the rest's and the roll's lines are presentation (storedRolled, storedUsed) — a face spent on another creature's roll is recorded by the hold or the save's bystanderRoll",
  "cast-riders.js": "the surge's line is state (castRider) — the table posts its own card and Tides of Chaos is the sheet's use; Inspiring Smite's hand-out is the rest song's record (restSong)",   // Persistent Rage, Uncanny Metabolism (its heal receipted on the card)
  "heal-rerolls.js": ["healReroll"],   // Healer's 1s rerolled on a healing roll
  "kit-tend.js": ["kitTend"],   // Healer's Battle Medic on the kit's use, landed by the elect
  "summons.js": ["summon", "effectReceipt", "transform"],   // the creature landed by the elect; the shared resistance receipted on the cast card; the familiar empowered (the transform record stamped at the cast, asked to revert when the empower effect goes)
  "transforms.js": ["transform", "formSwap", "summon"],   // the form landed and ended by the elect; the Long Rest's known-form change landed by the elect; the empowered companion's record re-pointed at the revert
  "mastery-record.js": ["masterySwap"],   // the Long Rest's change landed by the elect; the fill's writes are state on the sheet's own list (masteryFill)
  "ward-pools.js": "Arcane Ward's hit points are its feature's own uses: the take lands in the damage receipt the applier writes (its pop rides the bearer's damage update, wardAbsorb), the cast's line is state (wardRefill)",
  "damage-rules.js": ["grappleDamage"],   // Unarmed Fighting's turn-start damage; the faces are bookkeeping, the damage numbers ride the roll's own config (fightingStyle: state)
  "unarmed-dice.js": "the plain Unarmed Strike's damage formula swapped before it rolls — the damage message is the platform's and its receipt the resolve (unarmedDice: presentation)",
  "drop-to-one.js": ["dropToOne"],   // Relentless Endurance asked, Death Ward automatic
  "rest-grants.js": ["restSong"],   // Resourceful's own grant rides dnd5e's rest update (restGrant: presentation); Musician's song to allies is landed by the elect
  "advantage-buys.js": ["poolSpend"],   // Lucky's Advantage bought at the gate: the use spent by hand, recorded on the roll's message
  "clock-riders.js": ["clockRiders", "poolSpend", "spellRiderCard", "receipt"],
  "token-lights.js": ["effectReceipt"],
  "gear-lights.js": ["effectReceipt"],
  "command.js": ["commandRide"],
  "superiority-uses.js": ["superiorityUse", "superiorityRide", "baitSwitch", "effectReceipt"],
  "precision.js": ["precision"],
  "riposte.js": ["riposte"],
  "rebukes.js": ["rebuke"],
  "mishaps.js": "the dark gift's save is the pack's activity used at the bearer: the demand card and its verdict are the saves machine's record (saves); `mishap` on that card is provenance",
  "damage-shares.js": ["receipt"],   // the caster's share of the bond's damage, receipted on the share's card; the bond's end deletes the effect
  "heal-on-hit.js": ["receipt"],     // the caster's heal, receipted on the heal's card
  "drains.js": ["effectReceipt"],    // the target's fall — an effect on it, receipted on the drain's card; the prior copy deleted
  "prismatic.js": ["saves", "effectReceipt"],   // the ray demand cards it raises; a condition ray's effect, receipted; the spent cone's region deleted
  "damage-holds.js": ["damageHold", "receipt"],
  "bash-offer.js": ["bashOffer"],
  "hew.js": "a reminder's card and its notice latch — presentation; the extra attack is a real roll with its own card",
  "d20-folds.js": ["d20fold", "tacticalRefund", "poolSpend"],
  "bystanders.js": ["bystanderRoll", "poolSpend"],   // a bystander's bend on a save or a check; its use is the poolSpend record
  "metamagic.js": ["metamagic", "poolSpend"],
  "dice-changers.js": ["diceChange", "poolSpend"],   // the dice changers (Savage's and Empowered's rows): the patched rolls land with the record; Empowered's point is the poolSpend record; a damage already applied moves through auto-apply.js's receipt
  "area-ask.js": ["metamagic", "areaChoice", "saves"],   // the ask at the area: its answer writes the metamagic record, a chosen area's choice and the demand it fills
  "concentration.js": ["concentration", "effectReceipt"],
  "saves/areas.js": ["saves"],
  "saves/choices.js": ["saves"],
  "saves/consequences.js": ["saves", "effectReceipt"],
  "hold/answer.js": ["hold", "effectReceipt"],
  "hold/continue.js": ["hold", "effectReceipt", "receipt"],
  "hold/spell-hold.js": ["hold"],
  "hold/trigger.js": ["hold"],
  "hold/views.js": "the hold's popup and row — presentation; the answer it collects lands on the hold record through hold/answer.js",
  "auto-damage.js": "the offer rolls the platform's damage — the damage message's own records (hitManeuver, clockRiders, sneakDamage, superiorityRide, receipt) are the resolves",
  "hold/spell-damage.js": ["receipt"],
  "hold/lookup.js": ["effectReceipt"],
  "damage-shields.js": ["damageShield", "shieldMark", "receipt"],
  "damage-casts.js": ["damageCast", "saves"],
  "emanations.js": ["emanationCard", "effectReceipt", "saves", "receipt"],
  "repeat-saves.js": ["saves", "effectReceipt"],   // the demand card it raises; a success's removal marks the cast card's receipt
  "turn-grants.js": ["receipt", "conditionEnd"],   // Heroism's temp HP at the turn start, landed by the elect; B4's condition-end offer
  "death-saves.js": ["deathSave"],   // the ask at the turn start, folded from the system's roll card by its keeper; damage at 0 Hit Points, resolved at birth on the applying client
  "wards.js": ["saves"],   // the demand card it raises of the attacker; the ward's end deletes the effect on the bearer's own act
  "volleys.js": ["volley", "receipt"],
  "cast.js": ["castApply", "effectReceipt", "receipt"],
  "reminders.js": "the gate before the roll — a dialog's default and a Fails press; the roll's verdict is the saves record's resolve",
  "stats.js": "the data plane's stamps and roster — stats, never a moment",
  "effect-view.js": "the bar's fold on the user's own click: an effect deleted or disabled, temp HP or inspiration zeroed — the platform's own edits under the owner's permission, no module record and no moment (DESIGN §6, 2026-09-15)",
  "shared.js": "spine plumbing: turn chits written for the machines (their resolve is the record the machine writes), the pool spend helper (its record is poolSpend)",
  "ui.js": "spine plumbing: an envelope's cleanup delete, a popup's lifecycle — presentation",
  "core.js": "spine plumbing: the flag-write serializer every record goes through — the record is the resolve",
  "holds.js": "the hold registry — client-local memory, no world write; listed because its release deletes nothing",
  "events.js": "the gate itself — publishes, never writes",
  "migrate.js": "the rename's migration (3.0.0): a document's legacy flag scope moved under the new id, the old emanation behaviours retyped, the old world settings copied — no record and no moment; its writes carry the migration mark and the dispatcher drops their hooks",
  "settings.js": "the settings' own housekeeping: dnd5e's Visibility keys set, and the retired goingDownCosts world Setting document deleted once on the first active-GM load after the rule moved to House Rules — no record and no moment"
};

/**
 * A world write: a document's update/create/use, an embedded create or delete, a document's own
 * `.delete()` (a Map's `.delete(key)` takes an argument and is not one), a roll or a card posted (ui.js
 * `postCard`, `postAnswer`), and every house service that performs one (the receipt appliers, the status
 * forcer, the pool and reaction spenders, the turn chit writer).
 */
const WRITE_CALL = /\.(?:update|create|use|createEmbeddedDocuments|deleteEmbeddedDocuments|applyDamage|toggleStatusEffect|rollDamage|rollAttack|toMessage)\(|\.delete\(\)|\bChatMessage\.create\(|\bpost(?:Card|Answer)\(|ActiveEffect\.implementation\.create\(|\b(?:applyDamagesWithReceipt|applyEffectsWithReceipt|applyEffectsTo|forceStatus|spendPoolUses|writeTurnChit|spendReaction|spendSuperiorityDie)\(/;
const writers = files.filter(f => WRITE_CALL.test(f.src)).map(f => f.rel);

/**
 * The scan turned inside out — file (scripts/-relative) → the flag keys it writes.
 * @returns {Map<string, Set<string>>}
 */
export function keysByFile() {
  const out = new Map();
  for (const [key, sites] of writes) {
    for (const site of sites) {
      const file = site.slice(0, site.lastIndexOf(":"));
      if (!out.has(file)) out.set(file, new Set());
      out.get(file).add(key);
    }
  }
  return out;
}

export { files, unfollowed, unresolved, WORLD_WRITERS, writers, writes };
